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
const MAX_NOTE = 2_000;

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

  if (!jobTitle) return { ok: false, error: "What was the job?" };
  if (jobTitle.length > MAX_TITLE) return { ok: false, error: "That title is very long." };
  if (notes.length > MAX_NOTE) return { ok: false, error: "That note is very long." };

  const connects = Number(connectsRaw || 0);
  if (!Number.isInteger(connects) || connects < 0) {
    return { ok: false, error: "Connects must be a whole number." };
  }

  // A bid dated by the bidder's own day, not the server's.
  const submittedOn = localDateISO(session.profile.timezone);

  const supabase = await createSalesClient();
  const { error } = await supabase.from("proposals").insert({
    submitted_on: submittedOn,
    job_title: jobTitle,
    job_url: jobUrl || null,
    client_name: clientName || null,
    connects_spent: connects,
    outcome: "sent",
    submitted_by: session.userId,
    notes: notes || null,
  });

  if (error) return { ok: false, error: humanise(error.message) };

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
  const { error } = await supabase.from("proposals").delete().eq("id", id);

  if (error) return { ok: false, error: humanise(error.message) };

  revalidatePath("/bids");
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
 * File the day from the bids page.
 *
 * A BDE does not see the EOD form — logging bids *is* their report. But the
 * end-of-day row still has to exist: staff dashboards ask who has filed today,
 * and a bidder who never files would read as permanently missing rather than
 * as someone whose work is recorded elsewhere.
 *
 * So the summary is composed from the day's bids rather than retyped, and the
 * two fields a bid log cannot capture — what is blocking them, how they are
 * doing — are asked for directly. Same table, same upsert, same one-row-per-
 * day rule as everyone else's report.
 */
export async function fileBidderDay(formData: FormData): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Your session expired. Sign in again." };

  const blockers = String(formData.get("blockers") ?? "").trim();
  const rawMood = String(formData.get("mood") ?? "").trim();

  let mood: number | null = null;
  if (rawMood) {
    const parsed = Number(rawMood);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10) {
      return { ok: false, error: "Pick a number from 1 to 10, or leave it blank." };
    }
    mood = parsed;
  }

  const today = localDateISO(session.profile.timezone);
  const sales = await createSalesClient();

  const { data: bids, error: readError } = await sales
    .from("proposals")
    .select("job_title, connects_spent, client_name")
    .eq("submitted_on", today)
    .eq("submitted_by", session.userId)
    .order("created_at", { ascending: true });

  if (readError) return { ok: false, error: humanise(readError.message) };

  const rows = bids ?? [];
  if (rows.length === 0 && !blockers) {
    return {
      ok: false,
      error: "Log at least one bid, or say what's blocking you — otherwise there's nothing to file.",
    };
  }

  const connects = rows.reduce((sum, b) => sum + (b.connects_spent ?? 0), 0);
  const summary =
    rows.length === 0
      ? "No bids today."
      : `Bid on ${rows.length} ${rows.length === 1 ? "job" : "jobs"} using ${connects} connects.`;

  const workDone = [
    summary,
    ...rows.map(
      (b) =>
        `• ${b.job_title}${b.client_name ? ` (${b.client_name})` : ""} — ${b.connects_spent} connects`,
    ),
  ].join("\n");

  // The EOD table lives in `public`, so this goes through the ordinary client.
  // eod_insert_self is the gate, exactly as it is for everyone else's report.
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const { error } = await supabase.from("eod_reports").upsert(
    {
      profile_id: session.userId,
      org_id: session.org.id,
      report_date: today,
      summary: summary.slice(0, 500),
      mood,
      payload: {
        work_done: workDone,
        blockers: blockers || "None",
        name: session.profile.full_name,
        email: session.email,
        date: today,
        bids: rows.length,
        connects,
      },
      submitted_at: new Date().toISOString(),
      source: "bids",
    },
    { onConflict: "profile_id,report_date" },
  );

  if (error) return { ok: false, error: humanise(error.message) };

  revalidatePath("/bids");
  revalidatePath("/dashboard");
  return { ok: true, message: rows.length > 0 ? "Day filed." : "Blocker recorded." };
}
