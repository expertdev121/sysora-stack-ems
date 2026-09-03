"use server";

import { revalidatePath } from "next/cache";
import { createSalesClient } from "@/lib/supabase/sales";
import { getSession } from "@/lib/auth";
import { localDateISO } from "@/lib/dates";
import type { ActionResult } from "@/lib/types";

/**
 * Logging a bid.
 *
 * Written through the anon-key client on purpose: proposals_insert_own is the
 * real gate, not this function. It insists submitted_by is your own id, so a
 * bidder cannot file work under a colleague's name however this action is
 * called.
 *
 * The date comes from the person's own timezone rather than the server's, the
 * same way the end-of-day report does — an 11:50pm bid in Pune belongs to the
 * day the person thinks it does.
 */

const MAX_TITLE = 300;

/**
 * Room for a whole proposal, not a note.
 *
 * Upwork caps a cover letter at 5,000 characters, and a bidder may paste the
 * screening answers under it, so the old 2,000 would have silently rejected
 * real work. The column is unbounded text; this is only here to stop a
 * runaway paste.
 */
const MAX_NOTE = 20_000;

const OUTCOMES = [
  "sent",
  "viewed",
  "replied",
  "interviewing",
  "hired",
  "declined",
  "expired",
] as const;

type Outcome = (typeof OUTCOMES)[number];

function parseOutcome(raw: FormDataEntryValue | null): Outcome | null {
  const value = String(raw ?? "sent");
  return (OUTCOMES as readonly string[]).includes(value) ? (value as Outcome) : null;
}

export async function logBid(formData: FormData): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Your session expired. Sign in again." };

  const jobTitle = String(formData.get("job_title") ?? "").trim();
  const jobUrl = String(formData.get("job_url") ?? "").trim();
  const clientName = String(formData.get("client_name") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const connectsRaw = String(formData.get("connects_spent") ?? "").trim();
  const account = String(formData.get("account") ?? "").trim();

  if (!jobTitle) return { ok: false, error: "What was the job?" };
  // Without this the connects come off nowhere, and the balance goes negative
  // against an "Unassigned" account that does not exist.
  if (!account) return { ok: false, error: "Which Upwork account did the connects come from?" };
  if (jobTitle.length > MAX_TITLE) return { ok: false, error: "That title is very long." };
  if (notes.length > MAX_NOTE) return { ok: false, error: "That proposal is too long to store — trim it a little." };

  const connects = Number(connectsRaw || 0);
  if (!Number.isInteger(connects) || connects < 0) {
    return { ok: false, error: "Connects must be a whole number." };
  }

  // A bid dated by the bidder's own day, not the server's.
  const submittedOn = localDateISO(session.profile.timezone);

  const supabase = await createSalesClient();
  const { error } = await supabase.from("proposals").insert({
    submitted_on: submittedOn,
    account,
    job_title: jobTitle,
    job_url: jobUrl || null,
    client_name: clientName || null,
    connects_spent: connects,
    outcome: "sent",
    submitted_by: session.userId,
    notes: notes || null,
  });

  if (error) return { ok: false, error: humanise(error.message) };

  await syncDayReport(session, submittedOn);

  revalidatePath("/bids");
  revalidatePath("/dashboard");
  return { ok: true, message: "Logged." };
}

/** Moving a bid along — sent, replied, won. The common edit. */
export async function setBidOutcome(formData: FormData): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Your session expired. Sign in again." };

  const id = String(formData.get("id") ?? "");
  const outcome = parseOutcome(formData.get("outcome"));
  if (!id) return { ok: false, error: "Missing bid." };
  if (!outcome) return { ok: false, error: "Unknown outcome." };

  // Upwork returns the connects when a job expires unhired, so marking it
  // expired hands them back rather than leaving them counted as spent.
  const refundOnExpiry = formData.get("connects_spent");
  const patch: Record<string, unknown> = {
    outcome,
    outcome_on: outcome === "sent" ? null : localDateISO(session.profile.timezone),
  };
  if (outcome === "expired" && refundOnExpiry !== null) {
    patch.connects_refunded = Number(refundOnExpiry) || 0;
  }
  if (outcome !== "expired") patch.connects_refunded = 0;

  const supabase = await createSalesClient();
  const { error } = await supabase.from("proposals").update(patch).eq("id", id);

  if (error) return { ok: false, error: humanise(error.message) };

  revalidatePath("/bids");
  return { ok: true, message: "Updated." };
}

export async function deleteBid(formData: FormData): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Your session expired. Sign in again." };

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing bid." };

  const supabase = await createSalesClient();

  // Read the day before it goes, so the report for that day can be rebuilt.
  const { data: doomed } = await supabase
    .from("proposals")
    .select("submitted_on")
    .eq("id", id)
    .maybeSingle<{ submitted_on: string }>();

  const { error } = await supabase.from("proposals").delete().eq("id", id);

  if (error) return { ok: false, error: humanise(error.message) };

  if (doomed) await syncDayReport(session, doomed.submitted_on);

  revalidatePath("/bids");
  revalidatePath("/dashboard");
  return { ok: true, message: "Removed." };
}

function humanise(message: string): string {
  if (message.includes("row-level security")) {
    return "You can only change your own bids.";
  }
  if (message.includes("proposal_refund_within_spend")) {
    return "You can't get back more connects than the bid used.";
  }
  return message;
}

/**
 * Keep the day's end-of-day report in step with the bids logged.
 *
 * A BDE has no end-of-day form: logging bids is the report. But the row still
 * has to exist, because staff dashboards ask who has filed today and a bidder
 * who never files would read as permanently missing rather than as someone
 * whose work is recorded elsewhere.
 *
 * So it is written from the bids themselves and rewritten whenever they
 * change. Nobody types a summary of a list that is sitting right there.
 *
 * Blockers and mood are not collected from a bidder any more. That is a real
 * loss — "waiting on a connects top-up" has nowhere to go — and worth
 * revisiting if it starts to bite.
 */
async function syncDayReport(
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>,
  day: string,
): Promise<void> {
  const sales = await createSalesClient();

  const { data: bids } = await sales
    .from("proposals")
    .select("job_title, connects_spent, client_name")
    .eq("submitted_on", day)
    .eq("submitted_by", session.userId)
    .order("created_at", { ascending: true });

  const rows = bids ?? [];
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const connects = rows.reduce((sum, b) => sum + (b.connects_spent ?? 0), 0);

  // Removing the last bid rewrites the day rather than deleting it. There is
  // deliberately no delete policy on eod_reports — a filed day is a record,
  // which is the whole reason yesterday's is read-only — so the honest move is
  // to say the day ended with nothing rather than to make it disappear.
  const summary =
    rows.length === 0
      ? "No bids logged today."
      : `Bid on ${rows.length} ${rows.length === 1 ? "job" : "jobs"} using ${connects} connects.`;

  await supabase.from("eod_reports").upsert(
    {
      profile_id: session.userId,
      org_id: session.org.id,
      report_date: day,
      summary,
      payload: {
        work_done: [
          summary,
          ...rows.map(
            (b) =>
              `• ${b.job_title}${b.client_name ? ` (${b.client_name})` : ""} — ${b.connects_spent} connects`,
          ),
        ].join("\n"),
        blockers: "None",
        name: session.profile.full_name,
        email: session.email,
        date: day,
        bids: rows.length,
        connects,
      },
      submitted_at: new Date().toISOString(),
      source: "bids",
    },
    { onConflict: "profile_id,report_date" },
  );
}
