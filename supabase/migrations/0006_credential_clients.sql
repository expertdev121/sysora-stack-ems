-- =============================================================================
-- Sysora Stack — 0006_credential_clients.sql
--
-- Segregate stored credentials by the client they belong to.
--
-- client_key is free text rather than an enum or a foreign key, matching the
-- decision made for asset_id: the client list lives in src/lib/clients.ts, and
-- a credential whose client is renamed or removed should surface as unassigned
-- rather than disappear or block the write.
--
-- NULL means "not yet assigned" and the UI groups those separately, so nothing
-- goes quietly missing.
-- =============================================================================

alter table public.credentials
  add column if not exists client_key text;

create index if not exists credentials_client_idx
  on public.credentials (org_id, client_key);

comment on column public.credentials.client_key is
  'Client this login belongs to. Matches a key in src/lib/clients.ts; NULL = unassigned.';
