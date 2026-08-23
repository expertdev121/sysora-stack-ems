"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { localDateISO } from "@/lib/dates";
import type { ActionResult } from "@/lib/types";

const MAX_FIELD = 5_000;

/**
 * File (or amend) your own end-of-day report.
 *
 * report_date is derived here from the caller's stored timezone and never sent
 * by the client — and RLS re-derives the same value with public.auth_today()
 * before accepting the row. So an 11:50pm IST submission lands on the day the
 * person meant, and nobody can back-date one.
 *
 * Written through the anon-key client on purpose: eod_insert_self and
 * eod_update_self_today are the real gate, not this function.
 */
export async function submitEod(formData: FormData): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Your session expired. Sign in again." };

  const workDone = String(formData.get("work_done") ?? "").trim();
  const blockers = String(formData.get("blockers") ?? "").trim();

  if (!workDone) {
    return { ok: false, error: "Write what you worked on today — that's the whole report." };
  }
  if (workDone.length > MAX_FIELD || blockers.length > MAX_FIELD) {
    return { ok: false, error: `Keep each answer under ${MAX_FIELD.toLocaleString()} characters.` };
  }

  const reportDate = localDateISO(session.profile.timezone);
  const supabase = await createClient();

  const { error } = await supabase.from("eod_reports").upsert(
    {
      profile_id: session.userId,
      org_id: session.org.id,
      report_date: reportDate,
      summary: workDone.slice(0, 500),
      payload: {
        work_done: workDone,
        blockers: blockers || "None",
        name: session.profile.full_name,
        email: session.email,
        date: reportDate,
      },
      submitted_at: new Date().toISOString(),
      source: "app",
    },
    { onConflict: "profile_id,report_date" },
  );

  if (error) {
    if (error.message.includes("row-level security")) {
      return {
        ok: false,
        error: "Today's report is locked. It can only be filed or changed on the day itself.",
      };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/eod");
  revalidatePath("/dashboard");
  return { ok: true, message: "EOD filed." };
}
