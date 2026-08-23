-- =============================================================================
-- Sysora Stack — 0008_eod_self_service.sql
--
-- Let people file their EOD directly in the app.
--
-- Until now public.eod_reports was written only by the n8n webhook on the
-- service role, so authenticated users had no INSERT or UPDATE policy at all.
-- A native form needs both — scoped exactly like attendance: your own row,
-- your own local date, editable until your local midnight and frozen after.
--
-- The webhook keeps working unchanged; the service role bypasses RLS.
-- =============================================================================

drop policy if exists eod_insert_self on public.eod_reports;
create policy eod_insert_self on public.eod_reports
  for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and report_date = public.auth_today()
  );

-- Amend today's report until midnight where you are. Yesterday's is final,
-- which is the point of a daily report.
drop policy if exists eod_update_self_today on public.eod_reports;
create policy eod_update_self_today on public.eod_reports
  for update to authenticated
  using (
    profile_id = (select auth.uid())
    and report_date = public.auth_today()
  )
  with check (
    profile_id = (select auth.uid())
    and report_date = public.auth_today()
  );

grant insert, update on public.eod_reports to authenticated;
