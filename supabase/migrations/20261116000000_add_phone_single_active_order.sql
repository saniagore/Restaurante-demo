-- Pedido único activo, teléfono obligatorio y endurecimiento de la creación de pedidos.
--
-- 1. Guarda el teléfono normalizado, el identificador del navegador y un token
--    de idempotencia en cada pedido.
-- 2. Impide que un teléfono o un navegador tengan más de un pedido activo a la
--    vez (pending, accepted, preparing, on_the_way).
-- 3. Valida cantidades, número de ítems, platos duplicados y versión legal
--    dentro del servidor, sin confiar en el cliente.
-- 4. Normaliza la IP del límite de pedidos y agrega un tope global por minuto.
--
-- Nota: el teléfono se guarda sin verificación (no se envían códigos). La
-- unicidad es una barrera operativa, no una prueba de identidad.

alter table public.orders
  add column if not exists customer_phone text,
  add column if not exists client_id uuid,
  add column if not exists client_token uuid;

create unique index if not exists orders_client_token_idx
  on public.orders (client_token)
  where client_token is not null;

create unique index if not exists orders_one_active_per_phone_idx
  on public.orders (customer_phone)
  where status in ('pending', 'accepted', 'preparing', 'on_the_way')
    and customer_phone is not null;

create unique index if not exists orders_one_active_per_client_idx
  on public.orders (client_id)
  where status in ('pending', 'accepted', 'preparing', 'on_the_way')
    and client_id is not null;

alter table public.order_rate_limits
  drop constraint if exists order_rate_limits_key_length;

delete from public.order_rate_limits
where length(rate_key) > 64;

alter table public.order_rate_limits
  add constraint order_rate_limits_key_length
  check (length(rate_key) <= 64);

alter table public.order_items
  drop constraint if exists order_items_quantity_range_check;

alter table public.order_items
  add constraint order_items_quantity_range_check
  check (quantity between 1 and 99) not valid;

comment on constraint order_items_quantity_range_check on public.order_items
  is 'Las filas nuevas deben tener entre 1 y 99 unidades; las históricas se revisan aparte.';

create table if not exists public.legal_versions (
  version text primary key check (version ~ '^\d{4}-\d{2}-\d{2}$'),
  is_current boolean not null default false,
  published_at timestamptz not null default now()
);

insert into public.legal_versions (version, is_current)
values ('2026-11-15', true)
on conflict (version) do nothing;

alter table public.legal_versions enable row level security;

drop policy if exists "public can read legal versions" on public.legal_versions;
create policy "public can read legal versions"
  on public.legal_versions for select to anon, authenticated
  using (true);

grant select on public.legal_versions to anon, authenticated;

create or replace function public.create_order_secure(p_order jsonb)
returns table (id uuid, track_token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_key text;
  request_count integer;
  order_id uuid;
  calculated_total numeric(12,2);
  delivery_fee numeric(12,2) := 0;
  normalized_phone text;
  header_value text;
  candidate text;
begin
  if jsonb_typeof(p_order) <> 'object'
     or jsonb_typeof(p_order->'items') <> 'array'
     or jsonb_array_length(p_order->'items') = 0
     or jsonb_array_length(p_order->'items') > 50
     or length(coalesce(p_order->>'customer_name', '')) not between 1 and 100
     or p_order->>'order_type' not in ('pickup', 'delivery')
     or (p_order->>'order_type' = 'delivery' and length(trim(coalesce(p_order->>'delivery_address', ''))) not between 1 and 300)
     or length(coalesce(p_order->>'notes', '')) > 500
     or nullif(p_order->>'legal_version', '') is null
     or (p_order->>'legal_version') !~ '^\d{4}-\d{2}-\d{2}$'
     or not exists (
       select 1 from public.legal_versions lv
       where lv.version = p_order->>'legal_version' and lv.is_current
     )
     or (nullif(p_order->>'client_id', '') is not null and (p_order->>'client_id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
     or (nullif(p_order->>'client_token', '') is not null and (p_order->>'client_token') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
     or (select count(distinct item->>'dish_id') from jsonb_array_elements(p_order->'items') item) <>
        (select count(*) from jsonb_array_elements(p_order->'items')) then
    raise exception 'Invalid order payload' using errcode = '22023';
  end if;

  normalized_phone := regexp_replace(coalesce(p_order->>'customer_phone', ''), '\D', '', 'g');
  -- Normaliza el prefijo de Colombia para que +57 300... y 300... sean el mismo número.
  if length(normalized_phone) = 12 and left(normalized_phone, 2) = '57' then
    normalized_phone := substr(normalized_phone, 3);
  end if;
  if normalized_phone !~ '^[0-9]{7,15}$' then
    raise exception 'Invalid phone' using errcode = '22023';
  end if;

  -- Idempotencia: el mismo token devuelve el pedido ya creado.
  if nullif(p_order->>'client_token', '') is not null then
    select o.id, o.track_token
      into order_id, track_token
    from public.orders o
    where o.client_token = (p_order->>'client_token')::uuid;

    if found then
      id := order_id;
      return next;
      return;
    end if;
  end if;

  -- Límite por IP: se toma el último valor del encabezado, que es el que
  -- agrega el proxy; el primer valor lo puede inventar el cliente.
  header_value := coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', '');
  candidate := (regexp_match(header_value, '([^,]+)\s*$'))[1];

  if candidate is null or btrim(candidate) = '' then
    request_key := 'unknown';
  elsif candidate ~ '^[0-9a-fA-F:.]+$' and length(candidate) <= 64 then
    request_key := candidate;
  else
    request_key := 'ip-' || md5(candidate);
  end if;

  insert into public.order_rate_limits as limits (rate_key, window_started_at, request_count)
  values (request_key, now(), 1)
  on conflict (rate_key) do update
    set request_count = case
      when limits.window_started_at < now() - interval '1 minute' then 1
      else limits.request_count + 1
    end,
    window_started_at = case
      when limits.window_started_at < now() - interval '1 minute' then now()
      else limits.window_started_at
    end
  returning limits.request_count into request_count;

  if request_count > 5 then
    raise exception 'Too many orders' using errcode = '42900';
  end if;

  -- Tope global: frena una avalancha distribuida sin bloquear la operación normal.
  insert into public.order_rate_limits as limits (rate_key, window_started_at, request_count)
  values ('__global__', now(), 1)
  on conflict (rate_key) do update
    set request_count = case
      when limits.window_started_at < now() - interval '1 minute' then 1
      else limits.request_count + 1
    end,
    window_started_at = case
      when limits.window_started_at < now() - interval '1 minute' then now()
      else limits.window_started_at
    end
  returning limits.request_count into request_count;

  if request_count > 60 then
    raise exception 'Too many orders' using errcode = '42900';
  end if;

  select coalesce(sum(d.precio * (item->>'quantity')::integer), 0)::numeric(12,2)
    into calculated_total
  from jsonb_array_elements(p_order->'items') item
  join public.dishes d on d.id = (item->>'dish_id')::uuid and d.is_available = true
  where (item->>'quantity')::integer between 1 and 99;

  if calculated_total = 0
     or (select count(*) from jsonb_array_elements(p_order->'items')) <>
        (select count(*)
         from jsonb_array_elements(p_order->'items') item
         join public.dishes d on d.id = (item->>'dish_id')::uuid and d.is_available = true
         where (item->>'quantity')::integer between 1 and 99) then
    raise exception 'Invalid dishes or quantities' using errcode = '22023';
  end if;

  if p_order->>'order_type' = 'delivery' then
    select rs.delivery_fee
      into delivery_fee
    from public.restaurant_settings rs
    where rs.id = true;
  end if;

  calculated_total := calculated_total + coalesce(delivery_fee, 0);

  begin
    insert into public.orders as o (
      customer_name, customer_phone, order_type, delivery_address, notes,
      payment_method, total, legal_version, terms_accepted_at, client_id, client_token
    )
    values (
      left(trim(p_order->>'customer_name'), 100),
      normalized_phone,
      (p_order->>'order_type')::public.order_type,
      case when p_order->>'order_type' = 'delivery' then left(trim(p_order->>'delivery_address'), 300) end,
      nullif(left(trim(coalesce(p_order->>'notes', '')), 500), ''),
      'cash',
      calculated_total,
      p_order->>'legal_version',
      now(),
      nullif(p_order->>'client_id', '')::uuid,
      nullif(p_order->>'client_token', '')::uuid
    )
    returning o.id, o.track_token into order_id, track_token;
  exception
    when unique_violation then
      raise exception 'Ya tienes un pedido activo' using errcode = 'P0001';
  end;

  insert into public.order_items (order_id, dish_id, quantity, unit_price)
  select order_id, (item->>'dish_id')::uuid, (item->>'quantity')::integer, d.precio
  from jsonb_array_elements(p_order->'items') item
  join public.dishes d on d.id = (item->>'dish_id')::uuid
  where (item->>'quantity')::integer between 1 and 99;

  id := order_id;
  return next;
end;
$$;

create or replace function public.get_order_by_token(p_token text)
returns table (id uuid, track_token text, status text, customer_name text, order_type text, total numeric)
language sql
security definer
set search_path = ''
as $$
  select o.id, o.track_token, o.status::text, o.customer_name, o.order_type::text, o.total
  from public.orders o
  where o.track_token = left(p_token, 100);
$$;

revoke all on function public.create_order_secure(jsonb) from public;
grant execute on function public.create_order_secure(jsonb) to anon, authenticated;
revoke all on function public.get_order_by_token(text) from public;
grant execute on function public.get_order_by_token(text) to anon, authenticated;

comment on column public.orders.customer_phone is 'Teléfono normalizado (solo dígitos) para coordinar el pedido.';
comment on column public.orders.client_id is 'Identificador aleatorio del navegador para evitar pedidos simultáneos.';
comment on column public.orders.client_token is 'Token de idempotencia generado por el checkout.';
