-- =============================================================================
-- Sysora Stack — 0004_views.sql
--
-- Reporting views. Every one is security_invoker = on, so the RLS policies of
-- the *querying* user apply to the underlying tables. Without that flag a view
-- would run with its owner's privileges and quietly become a hole straight
-- through the policies in 0003.
--
-- A leave request is attributed to the calendar year/month of its start_date.
-- A request that straddles a boundary counts entirely in the earlier period.
-- =============================================================================

-- Approved leave per person per year, against the org allowance.
drop view if exists public.v_leave_usage;
create view public.v_leave_usage
with (security_invoker = on) as
select
  lr.org_id,
  lr.profile_id,
  extract(year from lr.start_date)::int                                        as year,
  coalesce(sum(lr.days_count) filter (where lr.leave_type = 'paid'), 0)::int   as paid_days_used,
  coalesce(sum(lr.days_count) filter (where lr.leave_type = 'unpaid'), 0)::int as unpaid_days_used,
  count(*)::int                                                                as request_count
from public.leave_requests lr
where lr.status = 'approved'
group by lr.org_id, lr.profile_id, extract(year from lr.start_date);

-- Month-by-month approved leave. This is the "how many leaves did each person
-- take each month" view the Owner reads.
drop view if exists public.v_leave_monthly;
create view public.v_leave_monthly
with (security_invoker = on) as
select
  lr.org_id,
  lr.profile_id,
  extract(year from lr.start_date)::int                                        as year,
  extract(month from lr.start_date)::int                                       as month,
  coalesce(sum(lr.days_count) filter (where lr.leave_type = 'paid'), 0)::int   as paid_days,
  coalesce(sum(lr.days_count) filter (where lr.leave_type = 'unpaid'), 0)::int as unpaid_days,
  coalesce(sum(lr.days_count), 0)::int                                         as total_days
from public.leave_requests lr
where lr.status = 'approved'
group by lr.org_id, lr.profile_id,
         extract(year from lr.start_date), extract(month from lr.start_date);

-- Attendance rolled up per person per month, with the payable-days figure the
-- payroll CSV is built from:
--
--   payable = Present (1.0) + Half Day (0.5) + approved PAID leave (1.0)
--
-- Absent means unpaid absence. Unpaid leave and unmarked days are not payable.
drop view if exists public.v_attendance_monthly;
create view public.v_attendance_monthly
with (security_invoker = on) as
select
  a.org_id,
  a.profile_id,
  extract(year from a.work_date)::int                                    as year,
  extract(month from a.work_date)::int                                   as month,
  count(*) filter (where a.status = 'present')::int                      as present_days,
  count(*) filter (where a.status = 'half_day')::int                     as half_days,
  count(*) filter (where a.status = 'absent')::int                       as absent_days,
  (count(*) filter (where a.status = 'present')
    + 0.5 * count(*) filter (where a.status = 'half_day'))::numeric(6,1) as marked_payable_days
from public.attendance a
group by a.org_id, a.profile_id,
         extract(year from a.work_date), extract(month from a.work_date);

grant select on public.v_leave_usage        to authenticated;
grant select on public.v_leave_monthly      to authenticated;
grant select on public.v_attendance_monthly to authenticated;
