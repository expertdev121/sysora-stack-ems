-- =============================================================================
-- Sysora Stack — 0005_credentials.sql
--
-- Shared logins for the tools in Team assets, so a four-person team doesn't
-- need a separate password manager.
--
-- The secret is stored ENCRYPTED, never in plaintext. Encryption happens in the
-- application (AES-256-GCM, src/lib/crypto.ts) with a key held in
-- CREDENTIALS_ENCRYPTION_KEY — an environment variable, deliberately not in the
-- database.
--
-- Why app-side and not supabase_vault (which is installed): Vault's key lives
-- with the database, so anyone holding the service role key can read
-- vault.decrypted_secrets. Keeping the key in the environment means a database
-- dump, a backup, or a stray `select *` in the SQL editor yields ciphertext and
-- nothing else. Someone would need BOTH the database and the deployment's env
-- to get a password out.
--
-- What this does NOT protect against: a person who legitimately reveals a
-- credential and writes it down. That is what credential_reveals is for — when
-- someone leaves, it tells you exactly which shared logins to rotate.
-- =============================================================================

create table if not exists public.credentials (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.orgs(id) on delete cascade,

  -- Matches TeamAsset.id in src/lib/team-assets.ts ('jira', 'n8n', 'ghl').
  -- Intentionally a free-text key rather than a foreign key: the asset list is
  -- code, not a table, and an orphaned credential should stay visible rather
  -- than vanish because someone renamed a link.
  asset_id           text not null check (length(btrim(asset_id)) > 0),

  label              text not null check (length(btrim(label)) > 0),
  username           text,

  -- "v1.<iv>.<authTag>.<ciphertext>", all base64url. Never plaintext.
  secret_ciphertext  text not null,

  url                text,
  notes              text,

  -- Who may see this entry at all. The secret still only decrypts server-side.
  visible_to_roles   public.app_role[] not null default array['owner']::public.app_role[],

  rotated_at         timestamptz,
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  unique (org_id, asset_id, label)
);

create index if not exists credentials_org_asset_idx on public.credentials (org_id, asset_id);

-- Every time a secret is decrypted for someone. This is the offboarding
-- checklist: when a person leaves, this says which shared logins they saw.
create table if not exists public.credential_reveals (
  id             bigint generated always as identity primary key,
  org_id         uuid not null references public.orgs(id) on delete cascade,
  credential_id  uuid not null references public.credentials(id) on delete cascade,
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  revealed_at    timestamptz not null default now()
);

create index if not exists credential_reveals_recent_idx
  on public.credential_reveals (org_id, revealed_at desc);
create index if not exists credential_reveals_profile_idx
  on public.credential_reveals (profile_id, revealed_at desc);

-- ----------------------------------------------------------------------------
-- Derived columns and integrity
-- ----------------------------------------------------------------------------
create or replace function public.tg_credentials_prepare()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.org_id := coalesce(public.auth_org_id(), new.org_id);
  if new.org_id is null then
    raise exception 'Could not determine the organisation for this credential';
  end if;

  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
  else
    new.updated_at := now();
    new.created_by := old.created_by;
    -- Changing the secret is a rotation; stamp it.
    if new.secret_ciphertext is distinct from old.secret_ciphertext then
      new.rotated_at := now();
    end if;
  end if;

  -- An empty visibility list would silently hide the row from everyone.
  if new.visible_to_roles is null or array_length(new.visible_to_roles, 1) is null then
    new.visible_to_roles := array['owner']::public.app_role[];
  end if;

  return new;
end;
$$;

drop trigger if exists credentials_prepare on public.credentials;
create trigger credentials_prepare
  before insert or update on public.credentials
  for each row execute function public.tg_credentials_prepare();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.credentials        enable row level security;
alter table public.credential_reveals enable row level security;

-- Read the ENTRY (label, username, url — and the ciphertext, which is useless
-- without the key) if your role is on its visibility list.
drop policy if exists credentials_select_visible on public.credentials;
create policy credentials_select_visible on public.credentials
  for select to authenticated
  using (
    org_id = public.auth_org_id()
    and public.auth_role() = any (visible_to_roles)
  );

-- Only the Owner creates, edits, rotates or deletes.
drop policy if exists credentials_write_owner on public.credentials;
create policy credentials_write_owner on public.credentials
  for all to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_owner())
  with check (org_id = public.auth_org_id() and public.auth_is_owner());

-- You may record your own reveal; you may not record anyone else's.
drop policy if exists credential_reveals_insert_self on public.credential_reveals;
create policy credential_reveals_insert_self on public.credential_reveals
  for insert to authenticated
  with check (profile_id = (select auth.uid()) and org_id = public.auth_org_id());

-- Only the Owner reads the trail. Nobody can edit or delete it.
drop policy if exists credential_reveals_select_owner on public.credential_reveals;
create policy credential_reveals_select_owner on public.credential_reveals
  for select to authenticated
  using (org_id = public.auth_org_id() and public.auth_is_owner());

grant select, insert, update, delete on public.credentials        to authenticated;
grant select, insert                 on public.credential_reveals to authenticated;

revoke all on public.credentials        from anon;
revoke all on public.credential_reveals from anon;
