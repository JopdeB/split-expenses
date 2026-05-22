-- Migration: audit log for transactions.
-- Captures every insert/update/delete on the transactions table with the
-- acting user (from auth.uid()) and a JSONB diff of the row.

create table if not exists public.audit_log (
  id          bigserial primary key,
  ts          timestamptz  not null default now(),
  user_id     uuid,
  user_email  text,
  action      text         not null check (action in ('insert', 'update', 'delete')),
  entity_type text         not null,
  entity_id   bigint,
  before      jsonb,
  after       jsonb
);

create index if not exists audit_log_ts_idx          on public.audit_log (ts desc);
create index if not exists audit_log_entity_idx      on public.audit_log (entity_type, entity_id);
create index if not exists audit_log_user_idx        on public.audit_log (user_id, ts desc);

-- RLS: same model as the rest of the app — any authenticated user can read.
alter table public.audit_log enable row level security;

drop policy if exists audit_log_read on public.audit_log;
create policy audit_log_read on public.audit_log
  for select using (auth.role() = 'authenticated');

-- Inserts only come from the trigger (security definer), so we don't grant
-- INSERT to authenticated. No update/delete policies → nobody can mutate.

create or replace function public.log_transaction_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  email text;
begin
  if uid is not null then
    select u.email into email from auth.users u where u.id = uid;
  end if;

  if (TG_OP = 'INSERT') then
    insert into public.audit_log (user_id, user_email, action, entity_type, entity_id, after)
    values (uid, email, 'insert', 'transaction', NEW.id, to_jsonb(NEW));
    return NEW;
  elsif (TG_OP = 'UPDATE') then
    -- skip no-op updates (same row content)
    if to_jsonb(OLD) = to_jsonb(NEW) then
      return NEW;
    end if;
    insert into public.audit_log (user_id, user_email, action, entity_type, entity_id, before, after)
    values (uid, email, 'update', 'transaction', NEW.id, to_jsonb(OLD), to_jsonb(NEW));
    return NEW;
  elsif (TG_OP = 'DELETE') then
    insert into public.audit_log (user_id, user_email, action, entity_type, entity_id, before)
    values (uid, email, 'delete', 'transaction', OLD.id, to_jsonb(OLD));
    return OLD;
  end if;
  return null;
end;
$$;

drop trigger if exists transactions_audit on public.transactions;
create trigger transactions_audit
  after insert or update or delete on public.transactions
  for each row execute function public.log_transaction_change();
