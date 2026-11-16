-- Flujo y cierre de caja.
--
-- Una sola sesión de caja abierta a la vez. Las ventas en efectivo se calculan
-- desde el historial de pedidos completados; los ingresos, gastos y retiros se
-- registran como movimientos manuales.

create table if not exists public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'open' check (status in ('open', 'closed')),
  opening_amount numeric(12,2) not null default 0 check (opening_amount >= 0),
  sales_total numeric(12,2) not null default 0,
  sales_count integer not null default 0,
  expected_amount numeric(12,2),
  counted_amount numeric(12,2),
  difference numeric(12,2),
  opening_notes text,
  closing_notes text,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opened_by uuid default auth.uid(),
  closed_by uuid default auth.uid()
);

create unique index if not exists cash_sessions_one_open_idx
  on public.cash_sessions (status)
  where status = 'open';

create index if not exists cash_sessions_closed_at_idx
  on public.cash_sessions (closed_at desc);

create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.cash_sessions(id) on delete cascade,
  type text not null check (type in ('income', 'expense', 'withdrawal')),
  amount numeric(12,2) not null check (amount > 0),
  description text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create index if not exists cash_movements_session_idx
  on public.cash_movements (session_id, created_at);

alter table public.cash_sessions enable row level security;
alter table public.cash_movements enable row level security;

drop policy if exists "admins manage cash sessions" on public.cash_sessions;
create policy "admins manage cash sessions"
  on public.cash_sessions for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "admins manage cash movements" on public.cash_movements;
create policy "admins manage cash movements"
  on public.cash_movements for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

grant select, insert, update, delete on public.cash_sessions to authenticated;
grant select, insert, update, delete on public.cash_movements to authenticated;

comment on table public.cash_sessions is 'Turnos de caja: apertura, cierre y diferencias.';
comment on table public.cash_movements is 'Ingresos, gastos y retiros de una sesión de caja.';
