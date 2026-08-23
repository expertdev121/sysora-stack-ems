-- =============================================================================
-- Sysora Stack — 0003_rls.sql
--
-- Row Level Security. The rules this file has to enforce:
--
--   1. An Employee can read their OWN attendance, leave and EOD rows, and
--      nothing belonging to anyone else. Not one row, not one column.
--   2. An Employee can read their own profile only. They cannot enumerate the
--      team.
--   3. NOBODY except the Owner can read public.compensation — not Managers.
--   4. An Employee can only mark attendance for themselves, only for today in
--      THEIR OWN timezone, and can only amend it until their local midnight.
--   5. Nobody approves their own leave, and a Manager cannot decide leave for
--      another Manager or for the Owner. (Enforced in 0002 triggers; the
--      policies here only decide who may attempt an UPDATE at all.)
--   6. EOD rows are written exclusively by the webhook via the service role.
--      No authenticated client can insert, amend or delete one.
--
-- Anything with no matching policy is denied: RLS defaults to deny.
--
-- Note: the service role bypasses RLS entirely. That key must never reach the
-- browser. It is used only in server actions and the webhook route.
-- =============================================================================

alter table public.orgs                enable row level security;
alter table public.profiles            enable row level security;
alter table public.compensation        enable row level security;
alter table public.attendance          enable row level security;
alter table public.attendance_audit    enable row level security;
alter table public.leave_requests      enable row level security;
alter table public.eod_reports         enable row level security;
alter table public.webhook_deliveries  enable row level security;

-- ----------------------------------------------------------------------------
-- orgs
-- ----------------------------------------------------------------------------
drop policy if exists orgs_select_member on public.orgs;
create policy orgs_select_member on public.orgs
  for select to authenticated
  using (id = public.auth_org_id());

drop policy if exists orgs_update_owner on public.orgs;
create policy orgs_update_owner on public.orgs
  for update to authenticated
  using (id = public.auth_org_id() and public.auth_is_owner())
  with check (id = public.auth_org_id() and public.auth_is_owner());

-- No insert/delete policy: creating an org is a service-role operation.

-- ----------------------------------------------------------------------------
-- profiles
--
-- An Employee sees exactly one row: their own. Staff see their whole org.
-- Multiple permissive SELECT policies are OR-ed together by Postgres.
-- ----------------------------------------------------------------------------
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists profiles_select_staff on public.profiles;
create policy profiles_select_staff on public.profiles
  for select to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_staff());

-- Self-update is allowed so a person can fix their own name or timezone.
-- public.tg_profiles_guard() blocks role/org/manager/email/active changes,
-- which RLS cannot express because RLS is row-level, not column-level.
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists profiles_update_owner on public.profiles;
create policy profiles_update_owner on public.profiles
  for update to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_owner())
  with check (org_id = public.auth_org_id() and public.auth_is_owner());

-- No insert/delete policy: people are created and deactivated by the Owner
-- through a server action running on the service role, because creating the
-- auth.users row requires admin privileges anyway.

-- ----------------------------------------------------------------------------
-- compensation — Owner only. This is the whole point of the separate table.
--
-- There is deliberately no Manager policy and no self-read policy. An Employee
-- cannot see their own salary row here; the only pay information they receive
-- is the salary DATE, which lives on public.orgs.
-- ----------------------------------------------------------------------------
drop policy if exists compensation_owner_all on public.compensation;
create policy compensation_owner_all on public.compensation
  for all to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_owner())
  with check (org_id = public.auth_org_id() and public.auth_is_owner());

-- ----------------------------------------------------------------------------
-- attendance
-- ----------------------------------------------------------------------------
drop policy if exists attendance_select_self on public.attendance;
create policy attendance_select_self on public.attendance
  for select to authenticated
  using (profile_id = (select auth.uid()));

drop policy if exists attendance_select_staff on public.attendance;
create policy attendance_select_staff on public.attendance
  for select to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_staff());

-- A person marks only themselves, only for their own local today.
drop policy if exists attendance_insert_self on public.attendance;
create policy attendance_insert_self on public.attendance
  for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and work_date = public.auth_today()
  );

-- ...and may amend it only until their own local midnight. After that the day
-- is frozen and only staff can touch it.
drop policy if exists attendance_update_self_today on public.attendance;
create policy attendance_update_self_today on public.attendance
  for update to authenticated
  using (profile_id = (select auth.uid()) and work_date = public.auth_today())
  with check (profile_id = (select auth.uid()) and work_date = public.auth_today());

drop policy if exists attendance_insert_staff on public.attendance;
create policy attendance_insert_staff on public.attendance
  for insert to authenticated
  with check (public.auth_is_staff() and public.profile_org(profile_id) = public.auth_org_id());

drop policy if exists attendance_update_staff on public.attendance;
create policy attendance_update_staff on public.attendance
  for update to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_staff())
  with check (org_id = public.auth_org_id() and public.auth_is_staff());

drop policy if exists attendance_delete_staff on public.attendance;
create policy attendance_delete_staff on public.attendance
  for delete to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_staff());

-- ----------------------------------------------------------------------------
-- attendance_audit — read-only, staff only. Written by trigger.
-- ----------------------------------------------------------------------------
drop policy if exists attendance_audit_select_staff on public.attendance_audit;
create policy attendance_audit_select_staff on public.attendance_audit
  for select to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_staff());

-- ----------------------------------------------------------------------------
-- leave_requests
-- ----------------------------------------------------------------------------
drop policy if exists leave_select_self on public.leave_requests;
create policy leave_select_self on public.leave_requests
  for select to authenticated
  using (profile_id = (select auth.uid()));

drop policy if exists leave_select_staff on public.leave_requests;
create policy leave_select_staff on public.leave_requests
  for select to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_staff());

drop policy if exists leave_insert_self on public.leave_requests;
create policy leave_insert_self on public.leave_requests
  for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and status = 'pending'
    and decided_by is null
  );

-- The requester may touch their own pending row (to withdraw it).
-- tg_leave_decision_guard() restricts that to status = 'cancelled'.
drop policy if exists leave_update_self on public.leave_requests;
create policy leave_update_self on public.leave_requests
  for update to authenticated
  using (profile_id = (select auth.uid()) and status = 'pending')
  with check (profile_id = (select auth.uid()));

-- Staff may decide. Who may decide WHOSE request is enforced by the trigger.
drop policy if exists leave_update_staff on public.leave_requests;
create policy leave_update_staff on public.leave_requests
  for update to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_staff())
  with check (org_id = public.auth_org_id() and public.auth_is_staff());

-- No delete policy: leave history is a payroll record.

-- ----------------------------------------------------------------------------
-- eod_reports — read-only for everyone. Writes come from the n8n webhook,
-- which runs on the service role and bypasses RLS.
-- ----------------------------------------------------------------------------
drop policy if exists eod_select_self on public.eod_reports;
create policy eod_select_self on public.eod_reports
  for select to authenticated
  using (profile_id = (select auth.uid()));

drop policy if exists eod_select_staff on public.eod_reports;
create policy eod_select_staff on public.eod_reports
  for select to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_staff());

-- ----------------------------------------------------------------------------
-- webhook_deliveries — Owner only. It contains raw inbound payloads.
-- ----------------------------------------------------------------------------
drop policy if exists webhook_deliveries_select_owner on public.webhook_deliveries;
create policy webhook_deliveries_select_owner on public.webhook_deliveries
  for select to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_owner());

-- ----------------------------------------------------------------------------
-- Table grants. RLS filters rows; grants decide whether the role may issue the
-- statement at all. Both have to line up.
-- ----------------------------------------------------------------------------
grant usage on schema public to authenticated;

grant select                         on public.orgs               to authenticated;
grant update                         on public.orgs               to authenticated;
grant select, update                 on public.profiles           to authenticated;
grant select, insert, update, delete on public.compensation       to authenticated;
grant select, insert, update, delete on public.attendance         to authenticated;
grant select                         on public.attendance_audit   to authenticated;
grant select, insert, update         on public.leave_requests     to authenticated;
grant select                         on public.eod_reports        to authenticated;
grant select                         on public.webhook_deliveries to authenticated;

-- The anon role gets nothing on THESE tables. There is no public signup and no
-- public data here.
--
-- Deliberately table-by-table rather than `revoke all on all tables in schema
-- public from anon`: if this schema is ever shared with another application,
-- a blanket revoke would silently strip that application's grants too.
revoke all on public.orgs               from anon;
revoke all on public.profiles           from anon;
revoke all on public.compensation       from anon;
revoke all on public.attendance         from anon;
revoke all on public.attendance_audit   from anon;
revoke all on public.leave_requests     from anon;
revoke all on public.eod_reports        from anon;
revoke all on public.webhook_deliveries from anon;
