-- =============================================================================
-- Sysora Stack — 0002_functions.sql
--
-- Auth helpers used by the RLS policies, plus the integrity triggers that give
-- us column-level protection that RLS alone cannot express.
--
-- Every auth_* helper is SECURITY DEFINER on purpose: the policies on
-- public.profiles need to read public.profiles, and a SECURITY INVOKER function
-- would recurse infinitely. SECURITY DEFINER runs as the function owner, which
-- bypasses RLS, breaking the cycle. search_path is pinned on all of them so a
-- caller cannot shadow `public` with a malicious schema.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- Auth helpers
-- ----------------------------------------------------------------------------

create or replace function public.auth_org_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select org_id from public.profiles where id = auth.uid()
$$;

create or replace function public.auth_role()
returns public.app_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.auth_is_owner()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.auth_role() = 'owner', false)
$$;

-- "Staff" = Owner or Manager. Both see the whole team at this size.
create or replace function public.auth_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.auth_role() in ('owner', 'manager'), false)
$$;

create or replace function public.auth_timezone()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select timezone from public.profiles where id = auth.uid()), 'UTC')
$$;

-- The current calendar date IN THE CALLER'S OWN TIMEZONE.
-- This is what locks a submission to the right day and what freezes editing
-- at the caller's local midnight rather than UTC midnight.
create or replace function public.auth_today()
returns date
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (now() at time zone public.auth_timezone())::date
$$;

create or replace function public.profile_org(p_profile_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select org_id from public.profiles where id = p_profile_id
$$;

revoke execute on function
  public.auth_org_id(), public.auth_role(), public.auth_is_owner(),
  public.auth_is_staff(), public.auth_timezone(), public.auth_today(),
  public.profile_org(uuid)
from public;

grant execute on function
  public.auth_org_id(), public.auth_role(), public.auth_is_owner(),
  public.auth_is_staff(), public.auth_timezone(), public.auth_today(),
  public.profile_org(uuid)
to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Generic updated_at
-- ----------------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Timezone validation
--
-- Cannot be a CHECK constraint: pg_timezone_names is a view and is not
-- IMMUTABLE, so a trigger is the correct place for this.
-- ----------------------------------------------------------------------------
create or replace function public.tg_validate_timezone()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown IANA timezone: %', new.timezone
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- profiles: column-level guard
--
-- RLS lets a user UPDATE their own profile row (so they can fix their name or
-- timezone). It cannot stop them from also setting role = 'owner' in the same
-- statement. This trigger does.
--
-- auth.uid() IS NULL means the call came from the service role (server actions,
-- seed script, webhook) — those are already trusted and pre-authorised in app
-- code, so they pass through.
-- ----------------------------------------------------------------------------
create or replace function public.tg_profiles_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_is_owner boolean;
begin
  if v_caller is null then
    return new; -- service role / migration
  end if;

  select coalesce(p.role = 'owner', false) into v_is_owner
  from public.profiles p where p.id = v_caller;

  if not coalesce(v_is_owner, false) then
    if new.org_id     is distinct from old.org_id
       or new.role    is distinct from old.role
       or new.manager_id is distinct from old.manager_id
       or new.is_active  is distinct from old.is_active
       or new.email      is distinct from old.email
       or new.joined_on  is distinct from old.joined_on then
      raise exception 'Only an Owner can change role, org, manager, email, join date or active status'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- Never let the org end up with zero active owners.
  if old.role = 'owner'
     and (new.role <> 'owner' or new.is_active = false) then
    if not exists (
      select 1 from public.profiles p
      where p.org_id = old.org_id
        and p.id <> old.id
        and p.role = 'owner'
        and p.is_active
    ) then
      raise exception 'Cannot remove the last active Owner of this organisation'
        using errcode = 'integrity_constraint_violation';
    end if;
  end if;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- attendance: stamping, org integrity, audit trail
-- ----------------------------------------------------------------------------
create or replace function public.tg_attendance_prepare()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
begin
  -- org_id is always derived, never trusted from the client.
  new.org_id := public.profile_org(new.profile_id);
  if new.org_id is null then
    raise exception 'Unknown profile %', new.profile_id;
  end if;

  if tg_op = 'INSERT' then
    new.marked_by := coalesce(v_caller, new.marked_by, new.profile_id);
    new.marked_at := coalesce(new.marked_at, now());
  else
    new.updated_by := coalesce(v_caller, new.updated_by);
    new.updated_at := now();
    -- These are immutable once written.
    new.profile_id := old.profile_id;
    new.work_date  := old.work_date;
    new.marked_by  := old.marked_by;
    new.marked_at  := old.marked_at;
  end if;

  return new;
end;
$$;

create or replace function public.tg_attendance_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.attendance_audit
      (org_id, attendance_id, profile_id, work_date, old_status, new_status, changed_by)
    values
      (new.org_id, new.id, new.profile_id, new.work_date, null, new.status,
       coalesce(auth.uid(), new.marked_by));
  elsif new.status is distinct from old.status then
    insert into public.attendance_audit
      (org_id, attendance_id, profile_id, work_date, old_status, new_status, changed_by)
    values
      (new.org_id, new.id, new.profile_id, new.work_date, old.status, new.status,
       coalesce(auth.uid(), new.updated_by));
  end if;
  return null;
end;
$$;

-- ----------------------------------------------------------------------------
-- leave_requests: derived fields, overlap, decision rules, balance ceiling
-- ----------------------------------------------------------------------------
create or replace function public.tg_leave_prepare()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.org_id := public.profile_org(new.profile_id);
  if new.org_id is null then
    raise exception 'Unknown profile %', new.profile_id;
  end if;

  -- Every calendar day counts: this team has no fixed weekend.
  new.days_count := (new.end_date - new.start_date) + 1;

  if tg_op = 'UPDATE' then
    new.updated_at := now();
    new.profile_id := old.profile_id;
  end if;

  return new;
end;
$$;

create or replace function public.tg_leave_no_overlap()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status not in ('pending', 'approved') then
    return new;
  end if;

  if exists (
    select 1 from public.leave_requests lr
    where lr.profile_id = new.profile_id
      and lr.id <> new.id
      and lr.status in ('pending', 'approved')
      and daterange(lr.start_date, lr.end_date, '[]')
          && daterange(new.start_date, new.end_date, '[]')
  ) then
    raise exception 'You already have a pending or approved leave request overlapping these dates'
      using errcode = 'exclusion_violation';
  end if;

  return new;
end;
$$;

create or replace function public.tg_leave_decision_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller       uuid := auth.uid();
  v_caller_role  public.app_role;
  v_subject_role public.app_role;
begin
  if new.status = old.status then
    return new;
  end if;

  if v_caller is null then
    return new; -- service role
  end if;

  select role into v_caller_role  from public.profiles where id = v_caller;
  select role into v_subject_role from public.profiles where id = new.profile_id;

  -- The requester themselves may only ever withdraw a pending request.
  if v_caller = new.profile_id then
    if not (old.status = 'pending' and new.status = 'cancelled') then
      raise exception 'You can only cancel your own pending request — nobody approves their own leave'
        using errcode = 'insufficient_privilege';
    end if;
    new.decided_by := null;
    new.decided_at := null;
    return new;
  end if;

  -- Anyone else deciding must be staff, and must be acting on a pending request.
  if v_caller_role not in ('owner', 'manager') then
    raise exception 'Only a Manager or the Owner can decide a leave request'
      using errcode = 'insufficient_privilege';
  end if;

  if old.status <> 'pending' then
    raise exception 'This request has already been decided'
      using errcode = 'insufficient_privilege';
  end if;

  if new.status not in ('approved', 'rejected') then
    raise exception 'A decision must be approve or reject'
      using errcode = 'insufficient_privilege';
  end if;

  -- A Manager cannot decide leave for another Manager or for the Owner.
  if v_caller_role = 'manager' and v_subject_role in ('manager', 'owner') then
    raise exception 'Only the Owner can decide leave for a Manager or Owner'
      using errcode = 'insufficient_privilege';
  end if;

  new.decided_by := v_caller;
  new.decided_at := now();

  return new;
end;
$$;

-- Hard ceiling on the annual paid-leave allowance, enforced at the moment of
-- approval (the authoritative moment) rather than at request time.
-- A request is attributed to the calendar year of its start_date.
create or replace function public.tg_leave_balance_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_allowance int;
  v_used      int;
begin
  if new.status <> 'approved' or new.leave_type <> 'paid' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'approved' then
    return new;
  end if;

  select o.annual_paid_leave into v_allowance
  from public.orgs o where o.id = new.org_id;

  select coalesce(sum(lr.days_count), 0) into v_used
  from public.leave_requests lr
  where lr.profile_id = new.profile_id
    and lr.status = 'approved'
    and lr.leave_type = 'paid'
    and lr.id <> new.id
    and extract(year from lr.start_date) = extract(year from new.start_date);

  if v_used + new.days_count > v_allowance then
    raise exception
      'Approving this would use % paid days against an annual allowance of % (% already used). Approve it as unpaid instead.',
      v_used + new.days_count, v_allowance, v_used
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- eod_reports: org integrity
-- ----------------------------------------------------------------------------
create or replace function public.tg_eod_prepare()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.org_id := public.profile_org(new.profile_id);
  if new.org_id is null then
    raise exception 'Unknown profile %', new.profile_id;
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Wire the triggers
-- ----------------------------------------------------------------------------
drop trigger if exists orgs_set_updated_at on public.orgs;
create trigger orgs_set_updated_at
  before update on public.orgs
  for each row execute function public.tg_set_updated_at();

drop trigger if exists orgs_validate_timezone on public.orgs;
create trigger orgs_validate_timezone
  before insert or update of timezone on public.orgs
  for each row execute function public.tg_validate_timezone();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.tg_set_updated_at();

drop trigger if exists profiles_validate_timezone on public.profiles;
create trigger profiles_validate_timezone
  before insert or update of timezone on public.profiles
  for each row execute function public.tg_validate_timezone();

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.tg_profiles_guard();

drop trigger if exists compensation_set_updated_at on public.compensation;
create trigger compensation_set_updated_at
  before update on public.compensation
  for each row execute function public.tg_set_updated_at();

drop trigger if exists attendance_prepare on public.attendance;
create trigger attendance_prepare
  before insert or update on public.attendance
  for each row execute function public.tg_attendance_prepare();

drop trigger if exists attendance_audit_trail on public.attendance;
create trigger attendance_audit_trail
  after insert or update on public.attendance
  for each row execute function public.tg_attendance_audit();

-- Postgres fires same-timing triggers in ALPHABETICAL name order, and these
-- four are order-dependent: prepare computes days_count, the decision guard
-- validates the status transition, the balance guard reads both. Hence the
-- a_/b_/c_/d_ prefixes — do not rename them.
drop trigger if exists leave_prepare on public.leave_requests;
drop trigger if exists a_leave_prepare on public.leave_requests;
create trigger a_leave_prepare
  before insert or update on public.leave_requests
  for each row execute function public.tg_leave_prepare();

drop trigger if exists leave_decision_guard on public.leave_requests;
drop trigger if exists b_leave_decision_guard on public.leave_requests;
create trigger b_leave_decision_guard
  before update on public.leave_requests
  for each row execute function public.tg_leave_decision_guard();

drop trigger if exists leave_balance_guard on public.leave_requests;
drop trigger if exists c_leave_balance_guard on public.leave_requests;
create trigger c_leave_balance_guard
  before insert or update on public.leave_requests
  for each row execute function public.tg_leave_balance_guard();

drop trigger if exists leave_no_overlap on public.leave_requests;
drop trigger if exists d_leave_no_overlap on public.leave_requests;
create trigger d_leave_no_overlap
  before insert or update on public.leave_requests
  for each row execute function public.tg_leave_no_overlap();

drop trigger if exists eod_prepare on public.eod_reports;
create trigger eod_prepare
  before insert or update on public.eod_reports
  for each row execute function public.tg_eod_prepare();
