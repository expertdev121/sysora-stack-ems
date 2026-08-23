"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession, isStaff } from "@/lib/auth";
import type { ActionResult, LeaveType } from "@/lib/types";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function requestLeave(formData: FormData): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Your session expired. Sign in again." };

  const startDate = String(formData.get("start_date") ?? "");
  const endDate = String(formData.get("end_date") ?? "");
  const leaveType = String(formData.get("leave_type") ?? "paid") as LeaveType;
  const reason = String(formData.get("reason") ?? "").trim();

  if (!ISO.test(startDate) || !ISO.test(endDate)) {
    return { ok: false, error: "Pick a start and end date." };
  }
  if (endDate < startDate) {
    return { ok: false, error: "The end date can't be before the start date." };
  }
  if (!reason) {
    return { ok: false, error: "Add a short reason — it's what your Manager approves against." };
  }
  if (leaveType !== "paid" && leaveType !== "unpaid") {
    return { ok: false, error: "Unknown leave type." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("leave_requests").insert({
    profile_id: session.userId,
    leave_type: leaveType,
    start_date: startDate,
    end_date: endDate,
    reason,
    status: "pending",
  });

  if (error) return { ok: false, error: humanise(error.message) };

  revalidatePath("/leave");
  revalidatePath("/dashboard");
  return { ok: true, message: "Request sent." };
}

/**
 * Approve or reject. Who is allowed to decide WHOSE request is enforced in
 * public.tg_leave_decision_guard(): nobody decides their own, and a Manager
 * cannot decide for another Manager or the Owner. The annual paid-leave
 * ceiling is enforced in public.tg_leave_balance_guard().
 */
export async function decideLeave(formData: FormData): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isStaff(session.profile)) {
    return { ok: false, error: "Only a Manager or the Owner can decide a request." };
  }

  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("decision_note") ?? "").trim() || null;

  if (!id) return { ok: false, error: "Missing request." };
  if (decision !== "approved" && decision !== "rejected") {
    return { ok: false, error: "A decision must be approve or reject." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("leave_requests")
    .update({ status: decision, decision_note: note })
    .eq("id", id);

  if (error) return { ok: false, error: humanise(error.message) };

  revalidatePath("/leave");
  revalidatePath("/dashboard");
  return { ok: true, message: decision === "approved" ? "Approved." : "Rejected." };
}

export async function cancelLeave(formData: FormData): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Your session expired. Sign in again." };

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing request." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("leave_requests")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("profile_id", session.userId);

  if (error) return { ok: false, error: humanise(error.message) };

  revalidatePath("/leave");
  revalidatePath("/dashboard");
  return { ok: true, message: "Withdrawn." };
}

function humanise(message: string): string {
  if (message.includes("overlapping")) {
    return "You already have a pending or approved request covering those dates.";
  }
  if (message.includes("annual allowance")) {
    return message.replace(/^.*?:\s*/, "");
  }
  if (message.includes("row-level security")) {
    return "You're not allowed to change that request.";
  }
  return message;
}
