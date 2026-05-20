-- Migration: add 'deeluitgaven' (partial expense) tracking.
-- Run this in the Supabase SQL Editor.

-- Postgres won't reorder columns in CREATE OR REPLACE VIEW, so drop and recreate.
-- v_btw_quarterly depends on v_transactions; drop it first and recreate at the end
-- (its definition is unchanged — deeluitgaven intentionally excluded from BTW totals).
drop view if exists public.v_btw_quarterly;
drop view if exists public.v_grootboek;
drop view if exists public.v_transactions;

alter table public.transactions
  add column if not exists bedrag_deeluitgaven numeric(12,2) not null default 0,
  add column if not exists btw_deeluitgaven    numeric(12,2) not null default 0;

alter table public.transactions drop constraint if exists amounts_non_negative;
alter table public.transactions add constraint amounts_non_negative check (
  bedrag_inkomsten     >= 0 and btw_inkomsten      >= 0
  and bedrag_uitgaven  >= 0 and btw_uitgaven       >= 0
  and bedrag_deeluitgaven >= 0 and btw_deeluitgaven >= 0
);

create view public.v_transactions as
select
  t.*,
  extract(year from t.datum)::int                 as jaar,
  'Q' || extract(quarter from t.datum)::text      as kwartaal,
  l.name                                          as location_name,
  la.code                                         as ledger_code,
  la.name                                         as ledger_name,
  bc.label                                        as btw_label,
  bc.rate                                         as btw_rate
from public.transactions t
left join public.locations l        on l.id  = t.location_id
left join public.ledger_accounts la on la.id = t.ledger_account_id
left join public.btw_codes bc       on bc.id = t.btw_code_id;

create view public.v_grootboek as
select
  jaar,
  location_id,
  location_name,
  ledger_account_id,
  ledger_code,
  ledger_name,
  sum(bedrag_inkomsten   - btw_inkomsten)                                        as inkomsten,
  sum(bedrag_uitgaven    - btw_uitgaven)                                         as uitgaven,
  sum(bedrag_deeluitgaven - btw_deeluitgaven)                                    as deeluitgaven,
  sum((bedrag_inkomsten - btw_inkomsten) - (bedrag_uitgaven - btw_uitgaven))     as netto
from public.v_transactions
where ledger_account_id is not null
group by jaar, location_id, location_name, ledger_account_id, ledger_code, ledger_name;

-- Recreate v_btw_quarterly with its original definition (unchanged: deeluitgaven
-- is excluded from BTW totals because the boekhouder splits at year-end).
create view public.v_btw_quarterly as
select
  location_id,
  location_name,
  jaar,
  kwartaal,
  sum(btw_inkomsten)                          as btw_inkomsten,
  sum(btw_uitgaven)                           as btw_uitgaven,
  sum(btw_inkomsten - btw_uitgaven)           as btw_netto
from public.v_transactions
group by location_id, location_name, jaar, kwartaal;
