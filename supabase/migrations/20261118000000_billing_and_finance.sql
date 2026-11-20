-- Facturación y finanzas del panel de administración.
--
-- 1. Configuración fiscal en `restaurant_settings` (prefijo, resolución, rango,
--    impuesto incluido en los precios y ancho de tirilla).
-- 2. Facturas / documentos equivalentes POS con consecutivo atómico por prefijo.
-- 3. Pagos mixtos por pedido (`order_payments`) y cuentas por cobrar derivadas
--    del saldo pendiente.
-- 4. Categoría en `cash_movements` para controlar gastos operativos diarios.
--
-- Nota importante: este esquema genera el documento y permite exportar su JSON
-- para un proveedor tecnológico. NO transmite a la DIAN: la transmisión real
-- requiere un proveedor habilitado, certificado digital y resolución propia.

-- ============================================================================
-- 1. CONFIGURACIÓN FISCAL
-- ============================================================================

alter table public.restaurant_settings
  add column if not exists invoice_prefix text not null default 'POS',
  add column if not exists invoice_tax_rate numeric(5,4) not null default 0.08,
  add column if not exists invoice_resolution text,
  add column if not exists invoice_range_from bigint,
  add column if not exists invoice_range_to bigint,
  add column if not exists invoice_business_name text,
  add column if not exists invoice_tax_id text,
  add column if not exists invoice_address text,
  add column if not exists invoice_phone text,
  add column if not exists ticket_width integer not null default 80,
  add column if not exists auto_invoice_on_complete boolean not null default true;

alter table public.restaurant_settings
  drop constraint if exists restaurant_settings_invoice_tax_rate_check;
alter table public.restaurant_settings
  add constraint restaurant_settings_invoice_tax_rate_check
  check (invoice_tax_rate >= 0 and invoice_tax_rate < 1);

alter table public.restaurant_settings
  drop constraint if exists restaurant_settings_ticket_width_check;
alter table public.restaurant_settings
  add constraint restaurant_settings_ticket_width_check
  check (ticket_width in (58, 80));

alter table public.restaurant_settings
  drop constraint if exists restaurant_settings_invoice_range_check;
alter table public.restaurant_settings
  add constraint restaurant_settings_invoice_range_check
  check (
    invoice_range_from is null
    or invoice_range_to is null
    or invoice_range_from <= invoice_range_to
  );

comment on column public.restaurant_settings.invoice_prefix is 'Prefijo del consecutivo de facturación (ej. POS, FE).';
comment on column public.restaurant_settings.invoice_tax_rate is 'Impuesto incluido en los precios, como fracción (0.08 = 8%).';
comment on column public.restaurant_settings.invoice_resolution is 'Número de resolución o autorización de facturación.';
comment on column public.restaurant_settings.invoice_range_from is 'Primer número autorizado del rango de facturación.';
comment on column public.restaurant_settings.invoice_range_to is 'Último número autorizado del rango de facturación.';
comment on column public.restaurant_settings.invoice_business_name is 'Razón social que aparece en la factura.';
comment on column public.restaurant_settings.invoice_tax_id is 'NIT del restaurante para la factura.';
comment on column public.restaurant_settings.invoice_address is 'Dirección fiscal del restaurante.';
comment on column public.restaurant_settings.invoice_phone is 'Teléfono fiscal del restaurante.';
comment on column public.restaurant_settings.ticket_width is 'Ancho de impresión por defecto en milímetros (58 u 80).';
comment on column public.restaurant_settings.auto_invoice_on_complete is 'Emite el documento automáticamente al completar un pedido.';

-- ============================================================================
-- 2. FACTURAS Y CONSECUTIVO
-- ============================================================================

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete restrict,
  prefix text not null,
  number bigint not null check (number > 0),
  status text not null default 'issued' check (status in ('issued', 'void')),
  document_type text not null default 'pos' check (document_type in ('pos', 'electronic')),
  customer_name text not null,
  customer_tax_id text,
  customer_email text,
  base_amount numeric(12,2) not null check (base_amount >= 0),
  tax_rate numeric(5,4) not null check (tax_rate >= 0 and tax_rate < 1),
  tax_amount numeric(12,2) not null check (tax_amount >= 0),
  total numeric(12,2) not null check (total >= 0),
  dian_status text not null default 'not_sent' check (dian_status in ('not_sent', 'exported')),
  dian_reference text,
  notes text,
  void_reason text,
  issued_at timestamptz not null default now(),
  issued_by uuid default auth.uid(),
  voided_at timestamptz,
  voided_by uuid,
  unique (prefix, number)
);

create index if not exists invoices_issued_at_idx on public.invoices (issued_at desc);
create index if not exists invoices_status_idx on public.invoices (status, issued_at desc);

-- Contador por prefijo. Solo lo toca la función `create_invoice`, que corre con
-- privilegios del dueño y bloquea la fila para evitar números repetidos.
create table if not exists public.invoice_counters (
  prefix text primary key,
  last_number bigint not null default 0
);

alter table public.invoices enable row level security;
alter table public.invoice_counters enable row level security;

drop policy if exists "admins manage invoices" on public.invoices;
create policy "admins manage invoices"
  on public.invoices for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

grant select, insert, update, delete on public.invoices to authenticated;
revoke all on public.invoice_counters from anon, authenticated;

create or replace function public.create_invoice(
  p_order_id uuid,
  p_customer_name text default null,
  p_customer_tax_id text default null,
  p_customer_email text default null,
  p_document_type text default 'pos',
  p_notes text default null
)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_settings public.restaurant_settings%rowtype;
  v_prefix text;
  v_number bigint;
  v_start bigint;
  v_last bigint;
  v_rate numeric(5,4);
  v_total numeric(12,2);
  v_base numeric(12,2);
  v_tax numeric(12,2);
  v_invoice public.invoices%rowtype;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'Solo administradores pueden emitir facturas' using errcode = '42501';
  end if;
  if coalesce(p_document_type, 'pos') not in ('pos', 'electronic') then
    raise exception 'Tipo de documento inválido' using errcode = '22023';
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'Pedido no encontrado' using errcode = 'P0002';
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'No se puede facturar un pedido cancelado' using errcode = '22023';
  end if;
  if v_order.status <> 'completed' then
    raise exception 'Solo se facturan pedidos completados' using errcode = '22023';
  end if;
  if exists (select 1 from public.invoices where order_id = p_order_id) then
    raise exception 'Este pedido ya tiene un documento emitido' using errcode = '23505';
  end if;

  select * into v_settings from public.restaurant_settings where id = true;
  if not found then
    insert into public.restaurant_settings (id) values (true) returning * into v_settings;
  end if;

  v_prefix := coalesce(nullif(trim(v_settings.invoice_prefix), ''), 'POS');
  v_start := greatest(coalesce(v_settings.invoice_range_from, 1), 1);
  v_rate := coalesce(v_settings.invoice_tax_rate, 0);
  v_total := round(coalesce(v_order.total, 0), 2);
  v_base := round(v_total / (1 + v_rate), 2);
  v_tax := round(v_total - v_base, 2);

  select last_number into v_last
  from public.invoice_counters
  where prefix = v_prefix;

  if v_settings.invoice_range_to is not null
     and coalesce(v_last, v_start - 1) >= v_settings.invoice_range_to then
    raise exception 'Se agotó el rango de numeración autorizado' using errcode = '22023';
  end if;

  insert into public.invoice_counters (prefix, last_number)
  values (v_prefix, v_start)
  on conflict (prefix) do update
    set last_number = public.invoice_counters.last_number + 1
  returning last_number into v_number;

  insert into public.invoices (
    order_id, prefix, number, status, document_type,
    customer_name, customer_tax_id, customer_email,
    base_amount, tax_rate, tax_amount, total, notes
  ) values (
    p_order_id, v_prefix, v_number, 'issued', coalesce(p_document_type, 'pos'),
    coalesce(nullif(trim(p_customer_name), ''), nullif(trim(v_order.customer_name), ''), 'Consumidor final'),
    nullif(trim(p_customer_tax_id), ''),
    nullif(trim(p_customer_email), ''),
    v_base, v_rate, v_tax, v_total,
    nullif(trim(p_notes), '')
  )
  returning * into v_invoice;

  return v_invoice;
end;
$$;

revoke all on function public.create_invoice(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.create_invoice(uuid, text, text, text, text, text) to authenticated;

comment on table public.invoices is 'Facturas y documentos equivalentes POS emitidos por pedido.';
comment on table public.invoice_counters is 'Consecutivo por prefijo; se incrementa dentro de create_invoice.';

-- ============================================================================
-- 3. PAGOS MIXTOS Y CUENTAS POR COBRAR
-- ============================================================================

create table if not exists public.order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  method text not null check (method in ('cash', 'nequi', 'daviplata', 'card', 'transfer')),
  amount numeric(12,2) not null check (amount > 0),
  reference text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create index if not exists order_payments_order_idx on public.order_payments (order_id, created_at);
create index if not exists order_payments_created_at_idx on public.order_payments (created_at desc);

alter table public.order_payments enable row level security;

drop policy if exists "admins manage order payments" on public.order_payments;
create policy "admins manage order payments"
  on public.order_payments for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

grant select, insert, update, delete on public.order_payments to authenticated;

create or replace function public.register_order_payment(
  p_order_id uuid,
  p_method text,
  p_amount numeric,
  p_reference text default null
)
returns public.order_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_paid numeric(12,2);
  v_payment public.order_payments%rowtype;
  v_all_cash boolean;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'Solo administradores pueden registrar pagos' using errcode = '42501';
  end if;
  if p_method not in ('cash', 'nequi', 'daviplata', 'card', 'transfer') then
    raise exception 'Método de pago inválido' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto del pago debe ser mayor que cero' using errcode = '22023';
  end if;

  -- Bloquea el pedido para que dos cobros simultáneos no superen el total.
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Pedido no encontrado' using errcode = 'P0002';
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'No se puede cobrar un pedido cancelado' using errcode = '22023';
  end if;

  select coalesce(sum(amount), 0) into v_paid
  from public.order_payments
  where order_id = p_order_id;

  if v_paid + p_amount > v_order.total + 0.01 then
    raise exception 'El pago supera el saldo pendiente del pedido' using errcode = '22023';
  end if;

  insert into public.order_payments (order_id, method, amount, reference)
  values (p_order_id, p_method, round(p_amount, 2), nullif(trim(p_reference), ''))
  returning * into v_payment;

  -- Mantiene el campo histórico `payment_method` coherente para caja y reportes.
  select bool_and(method = 'cash') into v_all_cash
  from public.order_payments
  where order_id = p_order_id;

  update public.orders
  set payment_method = case when coalesce(v_all_cash, false) then 'cash' else 'transfer' end
  where id = p_order_id;

  return v_payment;
end;
$$;

revoke all on function public.register_order_payment(uuid, text, numeric, text) from public, anon;
grant execute on function public.register_order_payment(uuid, text, numeric, text) to authenticated;

comment on table public.order_payments is 'Pagos por pedido: permite efectivo, Nequi/Daviplata, tarjeta y transferencias en un mismo cobro.';
comment on column public.order_payments.method is 'Medio de pago usado en esta parte del cobro.';
comment on function public.register_order_payment(uuid, text, numeric, text) is 'Registra un pago parcial validando que no supere el total del pedido.';

-- ============================================================================
-- 4. GASTOS OPERATIVOS
-- ============================================================================

alter table public.cash_movements
  add column if not exists category text;

alter table public.cash_movements
  drop constraint if exists cash_movements_category_check;
alter table public.cash_movements
  add constraint cash_movements_category_check
  check (
    category is null
    or category in ('hielo', 'insumos', 'propinas', 'servicios', 'transporte', 'mantenimiento', 'otros')
  );

comment on column public.cash_movements.category is 'Categoría del gasto operativo para el resumen diario.';
