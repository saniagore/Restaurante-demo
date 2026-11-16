-- Ventas por transferencia en la caja.
--
-- Separa las ventas del turno entre efectivo y transferencia. El cierre sigue
-- calculando el efectivo físico; las transferencias se guardan aparte para el
-- arqueo total.

alter table public.cash_sessions
  add column if not exists cash_sales_total numeric(12,2) not null default 0,
  add column if not exists transfer_sales_total numeric(12,2) not null default 0,
  add column if not exists cash_sales_count integer not null default 0,
  add column if not exists transfer_sales_count integer not null default 0;

alter table public.orders
  drop constraint if exists orders_payment_method_check;

alter table public.orders
  add constraint orders_payment_method_check
  check (payment_method in ('cash', 'transfer'));

comment on column public.cash_sessions.cash_sales_total is 'Ventas cobradas en efectivo durante el turno.';
comment on column public.cash_sessions.transfer_sales_total is 'Ventas cobradas por transferencia durante el turno.';
comment on column public.cash_sessions.cash_sales_count is 'Pedidos cobrados en efectivo.';
comment on column public.cash_sessions.transfer_sales_count is 'Pedidos cobrados por transferencia.';
