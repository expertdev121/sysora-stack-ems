-- =============================================================================
-- Sysora Stack — 0009_eod_mood.sql
--
-- A daily 1-10 self-rating on the EOD: 1 = rough day, 10 = flying.
--
-- A real column rather than another key in payload jsonb, for two reasons:
-- the CHECK constraint makes an out-of-range value impossible to store, and a
-- morale trend is the kind of thing you will want to average and chart, which
-- is awkward and unindexable through jsonb.
--
-- Nullable on purpose. Answering is optional — a mood score people feel
-- obliged to give every day stops meaning anything.
-- =============================================================================

alter table public.eod_reports
  add column if not exists mood smallint;

do $$ begin
  alter table public.eod_reports
    add constraint eod_reports_mood_range check (mood is null or mood between 1 and 10);
exception when duplicate_object then null; end $$;

comment on column public.eod_reports.mood is
  'Optional 1-10 self-rating for the day. 1 = rough, 10 = flying. NULL = not answered.';
