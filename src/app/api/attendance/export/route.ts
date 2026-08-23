import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSession, isStaff } from "@/lib/auth";
import { buildDays, summarise } from "@/lib/attendance";
import { eachDayOfMonth, localDateISO, monthEnd, monthName, monthStart } from "@/lib/dates";
import type { Attendance, LeaveRequest, Profile } from "@/lib/types";

/** Blocks CSV/formula injection when the file is opened in Excel or Sheets. */
function csvCell(value: string | number): string {
  const text = String(value ?? "");
  const escaped = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${escaped.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (!isStaff(session.profile)) {
    return NextResponse.json({ error: "Managers and the Owner only" }, { status: 403 });
  }

  const todayISO = localDateISO(session.profile.timezone);
  const raw = request.nextUrl.searchParams.get("month");
  const [year, month] = /^\d{4}-\d{2}$/.test(raw ?? "")
    ? raw!.split("-").map(Number)
    : todayISO.split("-").slice(0, 2).map(Number);

  const rangeStart = monthStart(year, month);
  const rangeEnd = monthEnd(year, month);
  const days = eachDayOfMonth(year, month);

  const supabase = await createClient();

  const [{ data: peopleRows }, { data: attendanceRows }, { data: leaveRows }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, joined_on, is_active")
      .order("full_name"),
    supabase
      .from("attendance")
      .select("profile_id, work_date, status, note")
      .gte("work_date", rangeStart)
      .lte("work_date", rangeEnd),
    supabase
      .from("leave_requests")
      .select("profile_id, start_date, end_date, leave_type, status")
      .eq("status", "approved")
      .lte("start_date", rangeEnd)
      .gte("end_date", rangeStart),
  ]);

  const people = (peopleRows ?? []) as Pick<
    Profile,
    "id" | "full_name" | "email" | "joined_on" | "is_active"
  >[];
  const attendance = (attendanceRows ?? []) as (Pick<Attendance, "work_date" | "status" | "note"> & {
    profile_id: string;
  })[];
  const leaves = (leaveRows ?? []) as (Pick<
    LeaveRequest,
    "start_date" | "end_date" | "leave_type" | "status"
  > & { profile_id: string })[];

  const header = [
    "Name",
    "Email",
    "Month",
    "Present",
    "Half Day",
    "Absent",
    "Paid Leave",
    "Unpaid Leave",
    "Not Marked",
    "Payable Days",
  ];

  const lines = [header.map(csvCell).join(",")];

  for (const person of people.filter((p) => p.is_active)) {
    const dayMap = buildDays({
      days,
      attendance: attendance.filter((a) => a.profile_id === person.id),
      leaves: leaves.filter((l) => l.profile_id === person.id),
      joinedOn: person.joined_on,
      todayISO,
    });
    const s = summarise(dayMap.values());

    lines.push(
      [
        person.full_name,
        person.email,
        `${monthName(month)} ${year}`,
        s.present,
        s.halfDay,
        s.absent,
        s.paidLeave,
        s.unpaidLeave,
        s.unmarked,
        s.payableDays,
      ]
        .map(csvCell)
        .join(","),
    );
  }

  // Payable Days = Present + 0.5 x Half Day + approved paid leave.
  const filename = `sysora-attendance-${year}-${String(month).padStart(2, "0")}.csv`;

  return new NextResponse(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
