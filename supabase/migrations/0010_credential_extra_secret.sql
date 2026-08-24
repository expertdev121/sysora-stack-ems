-- =============================================================================
-- Sysora Stack — 0010_credential_extra_secret.sql
--
-- A second encrypted value per credential.
--
-- Security-question answers, 2FA backup codes and app passwords are credentials
-- in their own right. Putting them in `notes` — which is plaintext — would
-- defeat the encryption for exactly the accounts that need it most: a database
-- dump would hand over the password recovery answer even though the password
-- itself is ciphertext.
--
-- extra_label is deliberately plaintext. Knowing that a row has a "Security
-- answer" attached is not sensitive; the answer is.
-- =============================================================================

alter table public.credentials
  add column if not exists extra_ciphertext text,
  add column if not exists extra_label text;

comment on column public.credentials.extra_ciphertext is
  'Optional second secret (security answer, backup code, app password), AES-256-GCM like secret_ciphertext.';
comment on column public.credentials.extra_label is
  'Plaintext name for the second secret, e.g. "Security answer". Never the value itself.';
