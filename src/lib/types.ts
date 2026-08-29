/**
 * Row shapes for the tables in supabase/migrations.
 *
 * These are hand-written rather than generated so the repo has no build-time
 * dependency on the Supabase CLI. Once you're running migrations regularly,
 *   npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts
 * is strictly better — see README.
 */

export type AppRole = "owner" | "manager" | "employee" | "bde";
export type AttendanceStatus = "present" | "half_day" | "absent";
export type LeaveType = "paid" | "unpaid";
export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

/** What a day can look like in the grid, including states with no row. */
export type DayState = AttendanceStatus | "leave" | "unmarked" | "pre_joining";

export interface Org {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  salary_day: number;
  annual_paid_leave: number;
}

export interface Profile {
  id: string;
  org_id: string;
  full_name: string;
  email: string;
  role: AppRole;
  manager_id: string | null;
  timezone: string;
  joined_on: string;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
}

export interface Attendance {
  id: string;
  org_id: string;
  profile_id: string;
  work_date: string;
  status: AttendanceStatus;
  note: string | null;
  marked_by: string;
  marked_at: string;
  updated_by: string | null;
  updated_at: string;
}

export interface LeaveRequest {
  id: string;
  org_id: string;
  profile_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  days_count: number;
  reason: string;
  status: LeaveStatus;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
}

export interface EodReport {
  id: string;
  org_id: string;
  profile_id: string;
  report_date: string;
  submission_id: string | null;
  summary: string | null;
  /** Optional 1–10 self-rating. 1 = rough, 10 = flying. null = not answered. */
  mood: number | null;
  payload: Record<string, unknown>;
  submitted_at: string;
  source: string;
}

export type Engagement = "full_time" | "freelance";

export interface Compensation {
  id: string;
  org_id: string;
  profile_id: string;
  engagement: Engagement;
  /** Set for full_time, null for freelance — a check constraint enforces it. */
  monthly_amount: string | null;
  /** Set for freelance, null for full_time. */
  hourly_amount: string | null;
  currency: string;
  effective_from: string;
  note: string | null;
}

export interface LeaveUsage {
  org_id: string;
  profile_id: string;
  year: number;
  paid_days_used: number;
  unpaid_days_used: number;
  request_count: number;
}

export interface LeaveMonthly {
  org_id: string;
  profile_id: string;
  year: number;
  month: number;
  paid_days: number;
  unpaid_days: number;
  total_days: number;
}

export interface Credential {
  id: string;
  org_id: string;
  asset_id: string;
  /** Client this login belongs to. Matches a key in src/lib/clients.ts. */
  client_key: string | null;
  label: string;
  username: string | null;
  /** Encrypted. Never render this, never send it to the browser. */
  secret_ciphertext: string;
  url: string | null;
  notes: string | null;
  visible_to_roles: AppRole[];
  rotated_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type GrantMode = "allow" | "deny";

/**
 * A per-person exception to the role-based visibility on a credential.
 * 'deny' wins over 'allow'; both win over the role list.
 */
export interface CredentialGrant {
  credential_id: string;
  profile_id: string;
  mode: GrantMode;
}

/** What the client is allowed to know about a credential before revealing it. */
export interface CredentialSummary {
  id: string;
  /** Human-readable and stable: "CRD-0042". What you quote to a person. */
  ref: string;
  asset_id: string;
  client_key: string | null;
  label: string;
  username: string | null;
  url: string | null;
  notes: string | null;
  visible_to_roles: AppRole[];
  rotated_at: string | null;
  /** Name of the second secret, if any. The value itself is never sent here. */
  extra_label?: string | null;
}

/** Result shape returned by every server action in src/app/actions. */
export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };
