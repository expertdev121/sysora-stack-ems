-- Let a BDE log their own Upwork bids from this app.
--
-- The bids themselves live in sales.proposals, written by the sales work.
-- Every other table in that schema is deny-all and reached with a service
-- role, because the sales app checks the session itself before every query.
-- This app works the other way round — anon key, RLS in the loop, so a bug in
-- a page cannot leak somebody else's row. Bid logging happens here, so it
-- follows this app's rule rather than importing the other one's.
--
-- The service role still bypasses all of it, so the sales dashboard's
-- aggregates are unaffected.

grant usage on schema sales to authenticated;
grant select, insert, update, delete on sales.proposals to authenticated;

-- Read your own. Staff read everyone's, because a manager reviewing the
-- week's bidding is the point of the aggregate.
drop policy if exists proposals_select_own_or_staff on sales.proposals;
create policy proposals_select_own_or_staff on sales.proposals
  for select to authenticated
  using (submitted_by = (select auth.uid()) or public.auth_is_staff());

-- You may record a bid as yourself and not as anyone else. Without the
-- with-check a bidder could file work under a colleague's name and inflate
-- someone else's numbers.
drop policy if exists proposals_insert_own on sales.proposals;
create policy proposals_insert_own on sales.proposals
  for insert to authenticated
  with check (submitted_by = (select auth.uid()));

drop policy if exists proposals_update_own_or_staff on sales.proposals;
create policy proposals_update_own_or_staff on sales.proposals
  for update to authenticated
  using (submitted_by = (select auth.uid()) or public.auth_is_staff())
  with check (submitted_by = (select auth.uid()) or public.auth_is_staff());

drop policy if exists proposals_delete_own_or_staff on sales.proposals;
create policy proposals_delete_own_or_staff on sales.proposals
  for delete to authenticated
  using (submitted_by = (select auth.uid()) or public.auth_is_staff());

-- Deliberately NOT granted: connect_purchases, and every view that prices a
-- connect. A bidder records how many connects a job took; what they cost the
-- business is not their screen.
revoke all on sales.connect_purchases from authenticated;

-- ---------------------------------------------------------------------------
-- What a bidder may know about their own target.
--
-- "100 bids between the 1st and the 15th" is something a BDE needs; the
-- revenue goal on the same row is not. Granting read on sales.revenue_targets
-- would hand over both, so this is a narrow projection instead.
--
-- security_invoker is OFF here, unlike every other view in this schema. That
-- is the point: the view exists to expose a safe subset of a table the caller
-- cannot read, and there is nothing sensitive left in the columns it selects.
-- ---------------------------------------------------------------------------
drop view if exists sales.bidder_targets;

create view sales.bidder_targets
with (security_invoker = false) as
select
  a.id               as activity_target_id,
  t.id               as revenue_target_id,
  t.name             as window_name,
  t.starts_on,
  t.ends_on,
  m.slug             as metric_slug,
  m.label            as metric_label,
  m.unit,
  a.target_count,
  (current_date between t.starts_on and t.ends_on) as is_current
from sales.activity_targets a
join sales.revenue_targets t on t.id = a.revenue_target_id
join public.work_metrics m   on m.id = a.activity_type_id;

comment on view sales.bidder_targets is
  'Activity targets without the money. Readable by any signed-in employee so a bidder can see what they are aiming at; deliberately omits every revenue column on sales.revenue_targets.';

grant select on sales.bidder_targets to authenticated, service_role;
