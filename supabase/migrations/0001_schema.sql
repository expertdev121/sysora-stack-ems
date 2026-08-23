-- =============================================================================
-- Sysora Stack — 0001_schema.sql
--
-- Core schema. Every business table carries org_id from day one so a second
-- org can be added later without a data migration.
--
-- All instants are timestamptz (stored UTC).
-- All calendar dates are resolved in the acting user's OWN timezone at write
-- time, so a 23:40 IST submission lands on the day the person meant.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.app_role as enum ('owner', 'manager', 'employee');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.attendance_status as enum ('present', 'half_day', 'absent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.leave_type as enum ('paid', 'unpaid');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.leave_status as enum ('pending', 'approved', 'rejected', 'cancelled');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- orgs
-- ----------------------------------------------------------------------------
create table if not exists public.orgs (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (length(btrim(name)) > 0),
  slug               text not null unique check (slug ~ '^[a-z0-9-]+$'),
  timezone           text not null default 'Asia/Kolkata',
  -- Day of month salary is paid. Shown to every employee.
  -- Capped at 28 so the date exists in February.
  salary_day         smallint not null default 5 check (salary_day between 1 and 28),
  -- Paid leave days available per calendar year.
  annual_paid_leave  smallint not null default 12 check (annual_paid_leave >= 0),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- profiles  (1:1 with auth.users)
--
-- Deliberately contains NO compensation data. Postgres RLS is row-level, not
-- column-level: any role that can read a row can read every column on it.
-- Salary therefore lives in public.compensation behind an owner-only policy.
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  org_id                uuid not null references public.orgs(id) on delete restrict,
  full_name             text not null check (length(btrim(full_name)) > 0),
  email                 text not null check (position('@' in email) > 1),
  role                  public.app_role not null default 'employee',
  manager_id            uuid references public.profiles(id) on delete set null,
  -- IANA timezone. Drives this person's "today" for attendance and EOD.
  timezone              text not null default 'Asia/Kolkata',
  joined_on             date not null default current_date,
  is_active             boolean not null default true,
  -- Owner creates the account with a temporary password; the user is hard-gated
  -- to /change-password until they clear this flag.
  must_change_password  boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint profiles_email_unique_per_org unique (org_id, email)
);

create index if not exists profiles_org_idx     on public.profiles (org_id);
create index if not exists profiles_manager_idx on public.profiles (manager_id);

-- ----------------------------------------------------------------------------
-- compensation  (owner-only, enforced by RLS in 0003_rls.sql)
-- ----------------------------------------------------------------------------
create table if not exists public.compensation (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  monthly_amount  numeric(12,2) not null check (monthly_amount >= 0),
  currency        text not null default 'INR' check (length(currency) = 3),
  effective_from  date not null default current_date,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (profile_id, effective_from)
);

create index if not exists compensation_profile_idx
  on public.compensation (profile_id, effective_from desc);

-- ----------------------------------------------------------------------------
-- attendance — one row per person per calendar day. No clock-in, no hours.
--
-- Every calendar day is markable. This team sometimes works weekends, so there
-- is no hardcoded non-working day anywhere in the schema.
-- ----------------------------------------------------------------------------
create table if not exists public.attendance (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  work_date   date not null,
  status      public.attendance_status not null,
  note        text,
  marked_by   uuid not null references public.profiles(id),
  marked_at   timestamptz not null default now(),
  updated_by  uuid references public.profiles(id),
  updated_at  timestamptz not null default now(),
  unique (profile_id, work_date)
);

create index if not exists attendance_org_date_idx     on public.attendance (org_id, work_date);
create index if not exists attendance_profile_date_idx on public.attendance (profile_id, work_date desc);

-- Immutable trail of who changed whose day. Written by trigger, never by hand.
create table if not exists public.attendance_audit (
  id             bigint generated always as identity primary key,
  org_id         uuid not null,
  attendance_id  uuid,
  profile_id     uuid not null,
  work_date      date not null,
  old_status     public.attendance_status,
  new_status     public.attendance_status,
  changed_by     uuid,
  changed_at     timestamptz not null default now()
);

create index if not exists attendance_audit_org_idx
  on public.attendance_audit (org_id, changed_at desc);

-- ----------------------------------------------------------------------------
-- leave_requests
--
-- Phase 1: request -> approve/reject, plus a fixed annual paid-leave allowance
-- (orgs.annual_paid_leave, default 12). No accrual, no carry-forward.
-- days_count counts every calendar day in the range, because this team has no
-- fixed weekend.
-- ----------------------------------------------------------------------------
create table if not exists public.leave_requests (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.orgs(id) on delete cascade,
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  leave_type     public.leave_type not null default 'paid',
  start_date     date not null,
  end_date       date not null,
  days_count     integer not null default 0 check (days_count >= 0),
  reason         text not null check (length(btrim(reason)) > 0),
  status         public.leave_status not null default 'pending',
  decided_by     uuid references public.profiles(id),
  decided_at     timestamptz,
  decision_note  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint leave_dates_ordered check (end_date >= start_date)
);

create index if not exists leave_org_status_idx on public.leave_requests (org_id, status);
create index if not exists leave_profile_idx    on public.leave_requests (profile_id, start_date desc);
create index if not exists leave_range_idx      on public.leave_requests (org_id, start_date, end_date)
  where status in ('pending', 'approved');

-- ----------------------------------------------------------------------------
-- eod_reports — landing table for submissions POSTed back by n8n.
--
-- payload holds the full raw form body as jsonb, so changing a field in the
-- n8n form can never break ingestion. Named columns are conveniences derived
-- from it at write time.
-- ----------------------------------------------------------------------------
create table if not exists public.eod_reports (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.orgs(id) on delete cascade,
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  report_date    date not null,
  submission_id  text,
  summary        text,
  payload        jsonb not null default '{}'::jsonb,
  submitted_at   timestamptz not null default now(),
  source         text not null default 'n8n',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (profile_id, report_date)
);

create index if not exists eod_org_date_idx     on public.eod_reports (org_id, report_date desc);
create index if not exists eod_profile_date_idx on public.eod_reports (profile_id, report_date desc);

-- Idempotency: an n8n retry carrying the same submission id must not duplicate.
create unique index if not exists eod_submission_uidx
  on public.eod_reports (org_id, submission_id) where submission_id is not null;

-- ----------------------------------------------------------------------------
-- webhook_deliveries — every inbound webhook hit, accepted or rejected.
--
-- This is the debugging surface for the n8n integration. When a form field
-- label changes and submissions stop matching a user, the raw body is here.
-- ----------------------------------------------------------------------------
create table if not exists public.webhook_deliveries (
  id                 bigint generated always as identity primary key,
  org_id             uuid references public.orgs(id) on delete set null,
  endpoint           text not null,
  ok                 boolean not null,
  status_code        integer,
  error              text,
  matched_profile_id uuid references public.profiles(id) on delete set null,
  raw_body           jsonb,
  received_at        timestamptz not null default now()
);

create index if not exists webhook_deliveries_recent_idx
  on public.webhook_deliveries (received_at desc);
