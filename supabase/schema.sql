-- Admin Pap & Sjanet — database schema
-- Run this in the Supabase SQL Editor (Project → SQL Editor → New query → paste → Run).

-- =========================================================================
-- 1. Tables
-- =========================================================================

create table if not exists public.locations (
  id          smallserial primary key,
  name        text not null unique,
  sort_order  smallint not null default 0
);

create table if not exists public.ledger_accounts (
  id          serial primary key,
  code        text not null unique,
  name        text not null,
  sort_order  smallint not null default 0
);

create table if not exists public.btw_codes (
  id          serial primary key,
  label       text not null unique,
  rate        numeric(5,4),
  kind        text check (kind in ('inkoop','verkoop','beide')),
  sort_order  smallint not null default 0
);

create table if not exists public.transactions (
  id                  bigserial primary key,
  location_id         smallint not null references public.locations(id),
  boekstuk            integer,
  datum               date not null,
  bedrag_inkomsten    numeric(12,2) not null default 0,
  btw_inkomsten       numeric(12,2) not null default 0,
  bedrag_uitgaven     numeric(12,2) not null default 0,
  btw_uitgaven        numeric(12,2) not null default 0,
  btw_code_id         integer references public.btw_codes(id),
  ledger_account_id   integer references public.ledger_accounts(id),
  omschrijving        text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references auth.users(id),
  -- year and quarter are derived from datum for views, not stored
  constraint amounts_non_negative check (
    bedrag_inkomsten >= 0 and btw_inkomsten >= 0
    and bedrag_uitgaven >= 0 and btw_uitgaven >= 0
  )
);

create index if not exists transactions_datum_idx       on public.transactions (datum);
create index if not exists transactions_location_idx    on public.transactions (location_id);
create index if not exists transactions_ledger_idx      on public.transactions (ledger_account_id);
create index if not exists transactions_year_loc_idx    on public.transactions ((extract(year from datum)), location_id);

-- Keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_transactions_updated_at on public.transactions;
create trigger trg_transactions_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

-- =========================================================================
-- 2. Convenience views
-- =========================================================================

-- Per transaction with derived year + quarter
create or replace view public.v_transactions as
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

-- BTW per quarter, per year, per location
create or replace view public.v_btw_quarterly as
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

-- Grootboek totals: per year, per location, per ledger account (excl. BTW)
create or replace view public.v_grootboek as
select
  jaar,
  location_id,
  location_name,
  ledger_account_id,
  ledger_code,
  ledger_name,
  sum(bedrag_inkomsten - btw_inkomsten)       as inkomsten,
  sum(bedrag_uitgaven  - btw_uitgaven)        as uitgaven,
  sum((bedrag_inkomsten - btw_inkomsten) - (bedrag_uitgaven - btw_uitgaven)) as netto
from public.v_transactions
where ledger_account_id is not null
group by jaar, location_id, location_name, ledger_account_id, ledger_code, ledger_name;

-- =========================================================================
-- 3. Row-Level Security
-- Single-tenant: any authenticated user can read/write everything.
-- (Tighten later with org/role columns if multi-household needed.)
-- =========================================================================

alter table public.locations         enable row level security;
alter table public.ledger_accounts   enable row level security;
alter table public.btw_codes         enable row level security;
alter table public.transactions      enable row level security;

drop policy if exists "auth read locations"        on public.locations;
drop policy if exists "auth write locations"       on public.locations;
drop policy if exists "auth read ledger"           on public.ledger_accounts;
drop policy if exists "auth write ledger"          on public.ledger_accounts;
drop policy if exists "auth read btw"              on public.btw_codes;
drop policy if exists "auth write btw"             on public.btw_codes;
drop policy if exists "auth read transactions"     on public.transactions;
drop policy if exists "auth write transactions"    on public.transactions;

create policy "auth read locations"     on public.locations       for select to authenticated using (true);
create policy "auth write locations"    on public.locations       for all    to authenticated using (true) with check (true);

create policy "auth read ledger"        on public.ledger_accounts for select to authenticated using (true);
create policy "auth write ledger"       on public.ledger_accounts for all    to authenticated using (true) with check (true);

create policy "auth read btw"           on public.btw_codes       for select to authenticated using (true);
create policy "auth write btw"          on public.btw_codes       for all    to authenticated using (true) with check (true);

create policy "auth read transactions"  on public.transactions    for select to authenticated using (true);
create policy "auth write transactions" on public.transactions    for all    to authenticated using (true) with check (true);

-- =========================================================================
-- 4. Seed: master data
-- =========================================================================

insert into public.locations (name, sort_order) values
  ('Boshut', 1),
  ('Auf der Platte', 2),
  ('Privé', 3)
on conflict (name) do nothing;

insert into public.btw_codes (label, rate, kind, sort_order) values
  ('Hoog (21%) - inkoop',    0.21, 'inkoop',  1),
  ('Hoog (21%) - verkoop',   0.21, 'verkoop', 2),
  ('Laag - inkoop (9%)',     0.09, 'inkoop',  3),
  ('Laag - verkoop (9%)',    0.09, 'verkoop', 4),
  ('Laag - inkoop (6%)',     0.06, 'inkoop',  5),
  ('Hoog - inkoop (19%)',    0.19, 'inkoop',  6),
  ('Hoog - verkoop (19%)',   0.19, 'verkoop', 7),
  ('Verlegd (0%)',           0.00, 'beide',   8)
on conflict (label) do nothing;

-- Ledger accounts (from Input sheet)
insert into public.ledger_accounts (code, name, sort_order) values
  ('8000', 'huurinkomsten',              1),
  ('4010', 'Inventaris',                 2),
  ('2000', 'Reiskosten',                 3),
  ('1000', 'uitgaven',                   4),
  ('1001', 'Rabo bank',                  5),
  ('1002', 'Triodos bank',               6),
  ('1003', 'Sparkasse Winterberg',       7),
  ('1004', 'overige inkomsten',          8),
  ('1005', 'verkopen',                   9),
  ('1006', 'belasting soc. premies',     10),
  ('1007', 'autokosten',                 11),
  ('1008', 'betaalde rente',             12),
  ('1009', 'ontvangen rente',            13),
  ('1010', 'huisvestingkosten',          14),
  ('1011', 'vaste lasten huisvesting',   15),
  ('420',  'energie water',              16),
  ('1012', 'verzekeringen',              17),
  ('1013', 'accountant',                 18),
  ('1014', 'drukwerk kantoor',           19),
  ('1015', 'telefoon',                   20),
  ('1016', 'medicamenten',               21),
  ('1017', 'verbruiksartikelen',         22),
  ('1018', 'overige uitgaven',           23),
  ('1019', 'beveiliging',                24),
  ('1020', 'schenkingen',                25),
  ('1021', 'onderhoud',                  26),
  ('1022', 'reclame advertentie',        27),
  ('1023', 'kosten bank',                28),
  ('1024', 'computer',                   29),
  ('1025', 'reparaties',                 30),
  ('1026', 'internet',                   31),
  ('1027', 'uitgaven Ossenberg bemiddeling', 32),
  ('1028', 'uitgaven Sauerland bookings',    33),
  ('1029', 'hypotheekrente',             34),
  ('1030', 'tv, internet, rundfunk',     35),
  ('1031', 'prive',                      36)
on conflict (code) do nothing;
