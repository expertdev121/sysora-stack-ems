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
