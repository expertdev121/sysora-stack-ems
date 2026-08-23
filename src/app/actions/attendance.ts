"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession, isStaff } from "@/lib/auth";
import { localDateISO } from "@/lib/dates";
import type { ActionResult, AttendanceStatus } from "@/lib/types";

const VALID: AttendanceStatus[] = ["present", "half_day", "absent"];

function parseStatus(raw: unknown): AttendanceStatus | null {
  return VALID.includes(raw as AttendanceStatus) ? (raw as AttendanceStatus) : null;
}

/**
 * Mark (or re-mark) your own day.
 *
 * work_date is computed here from the caller's stored timezone, never sent by
 * the client, and RLS re-derives the same value with public.auth_today() before
 * accepting the row. So a tampered request cannot write to a different day, and
 * a submission at 23:40 IST lands on the day the person meant.
 */
export async function markMyDay(formData: FormData): Promise<ActionResult> {
  const status = parseStatus(formData.get("status"));
  if (!status) return { ok: false, error: "Pick Present, Half Day or Absent." };

  const session = await getSession();
  if (!session) return { ok: false, error: "Your session expired. Sign in again." };

  const note = String(formData.get("note") ?? "").trim() || null;
  const workDate = localDateISO(session.profile.timezone);

  const supabase = await createClient();
  const { error } = await supabase
    .from("attendance")
    .upsert(
      { profile_id: session.userId, work_date: workDate, status, note },
      { onConflict: "profile_id,work_date" },
    );

  if (error) {
    return { ok: false, error: humanise(error.message) };
  }

  revalidatePath("/dashboard");
  revalidatePath("/attendance");
  return { ok: true, message: "Marked." };
}

/**
 * Staff amendment of anyone's day, including past dates.
 * The audit trigger records who changed what.
 */
export async function setAttendanceFor(formData: FormData): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !isStaff(session.profile)) {
    return { ok: false, error: "Only a Manager or the Owner can amend someone else's day." };
  }

  const profileId = String(formData.get("profile_id") ?? "");
  const workDate = String(formData.get("work_date") ?? "");
  const rawStatus = formData.get("status");

  if (!profileId || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
    return { ok: false, error: "Missing person or date." };
  }

  const supabase = await createClient();

  // An empty status means "clear this day back to Not marked".
  if (rawStatus === "" || rawStatus === null) {
    const { error } = await supabase
      .from("attendance")
      .delete()
      .eq("profile_id", profileId)
      .eq("work_date", workDate);
    if (error) return { ok: false, error: humanise(error.message) };
    revalidatePath("/attendance");
    return { ok: true, message: "Cleared." };
  }

  const status = parseStatus(rawStatus);
  if (!status) return { ok: false, error: "Unknown status." };

  const { error } = await supabase
    .from("attendance")
    .upsert(
      { profile_id: profileId, work_date: workDate, status },
      { onConflict: "profile_id,work_date" },
    );

  if (error) return { ok: false, error: humanise(error.message) };

  revalidatePath("/attendance");
  revalidatePath("/dashboard");
  return { ok: true, message: "Updated." };
}

function humanise(message: string): string {
  if (message.includes("row-level security")) {
    return "That day is locked. Only a Manager or the Owner can change it now.";
  }
  return message;
}
