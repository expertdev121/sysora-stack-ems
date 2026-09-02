-- An opening balance may have a price, and the rate keys off knowing one.
--
-- The first version refused a price on an opening balance and excluded it
-- from the rate outright. That was too strict, and it showed: with 458
-- connects on hand and nothing bought yet, a bid spending 34 of them cost ₹0
-- — so the acquisition budget could not move however much bidding happened.
-- Every figure downstream of the rate was silently zero.
--
-- The honest rule is not "opening balances have no price", it is "some rows
-- have a known price and some do not". A free grant knows its price: zero. A
-- purchase knows its price. An opening balance may or may not.
--
-- So is_opening_balance now records only where the connects came from, and
-- the rate is computed from every row whose cost is known.

alter table sales.connect_purchases drop constraint if exists connect_purchase_amounts;

alter table sales.connect_purchases add constraint connect_purchase_amounts check (
  (is_free and coalesce(amount_usd, 0) = 0 and coalesce(amount_inr, 0) = 0)
  or (is_opening_balance and not is_free)
  or (not is_free and not is_opening_balance
      and (coalesce(amount_usd, 0) > 0 or coalesce(amount_inr, 0) > 0))
);

comment on column sales.connect_purchases.is_opening_balance is
  'Connects already held when tracking started, as opposed to bought since. Priced or not — an unpriced row counts toward the balance but stays out of the cost-per-connect rate.';

-- The rate now filters on a known cost rather than on the flag.
create or replace view sales.connect_position_by_account
with (security_invoker = true) as
with acquired as (
  select
    coalesce(account, 'Unassigned')                            as account,
    sum(connects)                                              as connects_acquired,
    sum(connects) filter (where is_free)                       as connects_free,
    sum(connects) filter (where is_opening_balance)            as connects_opening,
    sum(connects) filter (
      where is_free or amount_inr is not null or amount_usd is not null
    )                                                          as connects_rated,
    coalesce(sum(amount_inr), 0)                               as paid_inr,
    coalesce(sum(amount_usd), 0) + coalesce(sum(tax_usd), 0)   as paid_usd,
    coalesce(sum(tax_usd), 0)                                  as tax_usd
  from sales.connect_purchases
  group by 1
),
used as (
  select
    coalesce(account, 'Unassigned')     as account,
    sum(connects_spent)                 as connects_spent,
    sum(connects_refunded)              as connects_refunded,
    count(*)                            as proposals
  from sales.proposals
  group by 1
),
accounts as (
  select account from acquired union select account from used
)
select
  a.account,
  coalesce(q.connects_acquired, 0)  as connects_acquired,
  coalesce(q.connects_free, 0)      as connects_free,
  coalesce(q.connects_opening, 0)   as connects_opening,
  coalesce(q.connects_acquired, 0) - coalesce(q.connects_free, 0)
    - coalesce(q.connects_opening, 0) as connects_bought,
  coalesce(q.paid_inr, 0)           as paid_inr,
  coalesce(q.paid_usd, 0)           as paid_usd,
  coalesce(q.tax_usd, 0)            as tax_usd,
  coalesce(u.connects_spent, 0)     as connects_spent,
  coalesce(u.connects_refunded, 0)  as connects_refunded,
  coalesce(u.proposals, 0)          as proposals,
  coalesce(q.connects_acquired, 0) - coalesce(u.connects_spent, 0)
    + coalesce(u.connects_refunded, 0) as connects_left,
  case when coalesce(q.connects_rated, 0) > 0
       then coalesce(q.paid_inr, 0)::numeric / q.connects_rated end as rate_inr,
  case when coalesce(q.connects_rated, 0) > 0
       then coalesce(q.paid_usd, 0)::numeric / q.connects_rated end as rate_usd
from accounts a
left join acquired q on q.account = a.account
left join used     u on u.account = a.account;

create or replace view sales.connect_position
with (security_invoker = true) as
with bought as (
  select
    coalesce(sum(connects), 0)                                     as connects_acquired,
    coalesce(sum(connects) filter (where is_free), 0)              as connects_free,
    coalesce(sum(connects) filter (where is_opening_balance), 0)   as connects_opening,
    coalesce(sum(connects) filter (
      where is_free or amount_inr is not null or amount_usd is not null
    ), 0)                                                          as connects_rated,
    coalesce(sum(amount_inr), 0)                                   as paid_inr,
    coalesce(sum(amount_usd), 0) + coalesce(sum(tax_usd), 0)       as paid_usd,
    coalesce(sum(tax_usd), 0)                                      as tax_usd
  from sales.connect_purchases
),
used as (
  select
    coalesce(sum(connects_spent), 0)    as connects_spent,
    coalesce(sum(connects_refunded), 0) as connects_refunded,
    count(*)                            as proposals
  from sales.proposals
)
select
  b.connects_acquired,
  b.connects_free,
  b.connects_acquired - b.connects_free - b.connects_opening as connects_bought,
  b.paid_inr, b.paid_usd, b.tax_usd,
  u.connects_spent, u.connects_refunded, u.proposals,
  b.connects_acquired - u.connects_spent + u.connects_refunded as connects_left,
  case when b.connects_rated > 0 then b.paid_inr::numeric / b.connects_rated end as rate_inr,
  case when b.connects_rated > 0 then b.paid_usd::numeric / b.connects_rated end as rate_usd,
  b.connects_opening
from bought b cross join used u;

-- The Upwork account names a bidder may choose from, and nothing else.
--
-- Logging a bid without saying which account the connects came off produced
-- an "Unassigned" balance sitting at minus thirty-four. The EMS form has to
-- ask, which means it has to know the options — but a bidder cannot read
-- sales.connect_purchases, because that table carries what every batch cost.
drop view if exists sales.bidder_accounts;

create view sales.bidder_accounts
with (security_invoker = false) as
select distinct coalesce(account, 'Unassigned') as account
from sales.connect_purchases
where account is not null;

comment on view sales.bidder_accounts is
  'Upwork account names only. Readable by any signed-in employee so a bidder can say which account a bid spent from; deliberately carries no prices or balances.';

grant select on sales.bidder_accounts to authenticated, service_role;
