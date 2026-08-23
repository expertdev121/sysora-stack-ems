-- =============================================================================
-- Sysora Stack — 0007_credential_grants.sql
--
-- Per-person access on top of per-role access.
--
-- Role visibility alone cannot express either of the two things asked for:
--   "everyone sees everything, but revoke this one from that one person"
--   "the Upwork login goes to the BDE only"
-- Both need an exception list keyed on the person, not the role.
--
-- Effective access to a credential, in order:
--   1. Owner            -> always
--   2. explicit 'deny'  -> never, even if their role would allow it
--   3. explicit 'allow' -> yes, even if their role would not
--   4. otherwise        -> role is in credentials.visible_to_roles
--
-- deny beats allow deliberately: revoking access is the operation you cannot
-- afford to get wrong.
-- =============================================================================

do $$ begin
  create type public.grant_mode as enum ('allow', 'deny');
exception when duplicate_object then null; end $$;

create table if not exists public.credential_grants (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.orgs(id) on delete cascade,
  credential_id  uuid not null references public.credentials(id) on delete cascade,
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  mode           public.grant_mode not null,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (credential_id, profile_id)
);

create index if not exists credential_grants_credential_idx
  on public.credential_grants (credential_id);
create index if not exists credential_grants_profile_idx
  on public.credential_grants (profile_id);

-- ----------------------------------------------------------------------------
-- New default: shared with everyone.
-- ----------------------------------------------------------------------------
alter table public.credentials
  alter column visible_to_roles
  set default array['owner', 'manager', 'employee']::public.app_role[];

-- Open up everything stored so far, per the instruction to give the whole team
-- access from now on. Individual exceptions are made with credential_grants.
update public.credentials
set visible_to_roles = array['owner', 'manager', 'employee']::public.app_role[];

-- ----------------------------------------------------------------------------
-- The access decision, in one place.
--
-- SECURITY DEFINER because it reads credential_grants from inside the policy on
-- public.credentials; an invoker-rights function would need its own readable
-- policy on the grants table and would recurse awkwardly.
-- ----------------------------------------------------------------------------
create or replace function public.auth_can_see_credential(
  p_credential_id uuid,
  p_visible_to_roles public.app_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when public.auth_is_owner() then true
    when exists (
      select 1 from public.credential_grants g
      where g.credential_id = p_credential_id
        and g.profile_id = auth.uid()
        and g.mode = 'deny'
    ) then false
    when exists (
      select 1 from public.credential_grants g
      where g.credential_id = p_credential_id
        and g.profile_id = auth.uid()
        and g.mode = 'allow'
    ) then true
    else coalesce(public.auth_role() = any (p_visible_to_roles), false)
  end
$$;

revoke execute on function public.auth_can_see_credential(uuid, public.app_role[]) from public;
grant execute on function public.auth_can_see_credential(uuid, public.app_role[])
  to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
drop policy if exists credentials_select_visible on public.credentials;
create policy credentials_select_visible on public.credentials
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and public.auth_can_see_credential(id, visible_to_roles)
  );

alter table public.credential_grants enable row level security;

-- Only the Owner manages grants.
drop policy if exists credential_grants_owner_all on public.credential_grants;
create policy credential_grants_owner_all on public.credential_grants
  for all to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_owner())
  with check (org_id = public.auth_org_id() and public.auth_is_owner());

-- Anyone may see the fact that a credential was granted to them personally.
drop policy if exists credential_grants_select_self on public.credential_grants;
create policy credential_grants_select_self on public.credential_grants
  for select to authenticated
  using (profile_id = (select auth.uid()));

grant select, insert, update, delete on public.credential_grants to authenticated;
revoke all on public.credential_grants from anon;
