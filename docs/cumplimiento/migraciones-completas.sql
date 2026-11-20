-- ============================================================================
-- Restaurante-demo · Migraciones consolidadas
-- ============================================================================
-- Reúne en un solo archivo el esquema base mínimo, las 11 migraciones que ya
-- existían en el repositorio, las 2 de cumplimiento legal, las 2 de pedido
-- único, teléfono y cancelación, la de `pickup`, la de categorías, la del
-- bucket de imágenes, la de caja, la de costos y la de transferencias
-- (21 en total). Está pensado para pegarse completo en Supabase:
--
--   Supabase → SQL Editor → New query → pegar → Run
--
-- Es idempotente: se puede ejecutar varias veces sin duplicar datos ni romper
-- nada. Si tu proyecto ya tiene el esquema base, la sección 1 no hace nada y
-- solo se aplican columnas, funciones, políticas y datos que falten.
--
-- Requisitos: PostgreSQL 13 o superior (Supabase). pg_cron es opcional: si no
-- está disponible, el archivo lo omite y deja la limpieza manual documentada
-- en docs/cumplimiento/README.md.
-- ============================================================================


-- ============================================================================
-- 1. ESQUEMA BASE (solo crea lo que no exista)
-- ============================================================================

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'order_type'
  ) then
    create type public.order_type as enum ('pickup', 'delivery');
  end if;

  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'order_status'
  ) then
    create type public.order_status as enum ('pending', 'accepted', 'preparing', 'on_the_way', 'completed');
  end if;
end;
$$;

create table if not exists public.dishes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  precio numeric(12,2) not null check (precio >= 0),
  imagen_url text,
  is_available boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  track_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  customer_name text not null,
  order_type public.order_type not null default 'pickup',
  status public.order_status not null default 'pending',
  notes text,
  total numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  payment_method text not null default 'cash',
  delivery_address text,
  legal_version text,
  terms_accepted_at timestamptz,
  anonymized_at timestamptz
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  dish_id uuid not null references public.dishes(id),
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null
);

create index if not exists orders_track_token_idx on public.orders (track_token);
create index if not exists orders_created_at_idx on public.orders (created_at);
create index if not exists order_items_order_id_idx on public.order_items (order_id);


-- ============================================================================
-- 2. VALORES DE ENUM AGREGADOS POR LAS MIGRACIONES
-- ============================================================================

alter type public.order_type add value if not exists 'delivery';
alter type public.order_status add value if not exists 'accepted';
alter type public.order_status add value if not exists 'preparing';
alter type public.order_status add value if not exists 'on_the_way';
alter type public.order_status add value if not exists 'completed';


-- ============================================================================
-- 3. COLUMNAS AGREGADAS POR LAS MIGRACIONES
-- ============================================================================

alter table public.orders
  add column if not exists payment_method text not null default 'cash',
  add column if not exists delivery_address text,
  add column if not exists legal_version text,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists anonymized_at timestamptz;

alter table public.orders
  drop constraint if exists orders_legal_version_format;

alter table public.orders
  add constraint orders_legal_version_format
  check (legal_version is null or legal_version ~ '^\d{4}-\d{2}-\d{2}$');

comment on column public.orders.legal_version is 'Versión de los Términos y la Política de Privacidad aceptada por el cliente.';
comment on column public.orders.terms_accepted_at is 'Fecha y hora del servidor en que se recibió la aceptación.';
comment on column public.orders.anonymized_at is 'Fecha en que se anonimizaron nombre, dirección y notas del pedido.';


-- ============================================================================
-- 4. CONTROL DE PEDIDOS ABUSIVOS Y CONFIGURACIÓN DEL RESTAURANTE
-- ============================================================================

create table if not exists public.order_rate_limits (
  rate_key text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0
);

alter table public.order_rate_limits enable row level security;
revoke all on public.order_rate_limits from anon, authenticated;

create table if not exists public.restaurant_settings (
  id boolean primary key default true check (id),
  delivery_fee numeric(12,2) not null default 0 check (delivery_fee >= 0)
);

insert into public.restaurant_settings (id, delivery_fee)
values (true, 0)
on conflict (id) do nothing;

alter table public.restaurant_settings enable row level security;


-- ============================================================================
-- 5. FUNCIONES DEL SERVIDOR
-- ============================================================================

-- Crea el pedido con precios calculados en el servidor, límite de 5 pedidos por
-- minuto por IP, consentimiento legal obligatorio y tarifa de domicilio.
create or replace function public.create_order_secure(p_order jsonb)
returns table (id uuid, track_token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  request_key text;
  request_count integer;
  order_id uuid;
  calculated_total numeric(12,2);
  delivery_fee numeric(12,2) := 0;
begin
  if jsonb_typeof(p_order) <> 'object'
     or jsonb_typeof(p_order->'items') <> 'array'
     or jsonb_array_length(p_order->'items') = 0
     or length(coalesce(p_order->>'customer_name', '')) not between 1 and 100
     or p_order->>'order_type' not in ('pickup', 'delivery')
     or (p_order->>'order_type' = 'delivery' and length(trim(coalesce(p_order->>'delivery_address', ''))) not between 1 and 300)
     or length(coalesce(p_order->>'notes', '')) > 500
     or nullif(p_order->>'legal_version', '') is null
     or (p_order->>'legal_version') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Invalid order payload' using errcode = '22023';
  end if;

  -- PostgREST reenvía la dirección del cliente en este ajuste. Las direcciones
  -- desconocidas comparten el mismo cubo para no saltarse el límite.
  request_key := coalesce(
    nullif((current_setting('request.headers', true)::json ->> 'x-forwarded-for'), ''),
    'unknown'
  );
  insert into public.order_rate_limits(rate_key, window_started_at, request_count)
  values (request_key, now(), 1)
  on conflict (rate_key) do update
    set request_count = case
      when public.order_rate_limits.window_started_at < now() - interval '1 minute' then 1
      else public.order_rate_limits.request_count + 1
    end,
    window_started_at = case
      when public.order_rate_limits.window_started_at < now() - interval '1 minute' then now()
      else public.order_rate_limits.window_started_at
    end
  returning order_rate_limits.request_count into request_count;
  if request_count > 5 then
    raise exception 'Too many orders' using errcode = '42900';
  end if;

  select coalesce(sum(d.precio * (item->>'quantity')::integer), 0)::numeric(12,2)
    into calculated_total
  from jsonb_array_elements(p_order->'items') item
  join public.dishes d on d.id = (item->>'dish_id')::uuid and d.is_available = true
  where (item->>'quantity')::integer between 1 and 99;

  if calculated_total = 0
     or (select count(*) from jsonb_array_elements(p_order->'items')) <>
        (select count(*) from jsonb_array_elements(p_order->'items') item
         join public.dishes d on d.id = (item->>'dish_id')::uuid and d.is_available = true) then
    raise exception 'Invalid dishes or quantities' using errcode = '22023';
  end if;

  if p_order->>'order_type' = 'delivery' then
    select rs.delivery_fee into delivery_fee
    from public.restaurant_settings rs
    where rs.id = true;
  end if;

  calculated_total := calculated_total + coalesce(delivery_fee, 0);

  insert into public.orders(customer_name, order_type, delivery_address, notes, payment_method, total, legal_version, terms_accepted_at)
  values (
    left(trim(p_order->>'customer_name'), 100),
    (p_order->>'order_type')::public.order_type,
    case when p_order->>'order_type' = 'delivery' then left(trim(p_order->>'delivery_address'), 300) end,
    nullif(left(trim(coalesce(p_order->>'notes', '')), 500), ''),
    'cash',
    calculated_total,
    p_order->>'legal_version',
    now()
  )
  returning orders.id, orders.track_token into order_id, track_token;

  insert into public.order_items(order_id, dish_id, quantity, unit_price)
  select order_id, (item->>'dish_id')::uuid, (item->>'quantity')::integer, d.precio
  from jsonb_array_elements(p_order->'items') item
  join public.dishes d on d.id = (item->>'dish_id')::uuid;

  id := order_id;
  return next;
end;
$$;

-- Consulta pública del seguimiento: solo devuelve datos no sensibles.
create or replace function public.get_order_by_token(p_token text)
returns table (id uuid, track_token text, status text, customer_name text, order_type text, total numeric)
language sql
security definer
set search_path = public
as $$
  select o.id, o.track_token, o.status::text, o.customer_name, o.order_type::text, o.total
  from public.orders o
  where o.track_token = left(p_token, 100);
$$;

-- Retención: borra las IP de control de pedidos con más de una hora.
create or replace function public.purge_order_rate_limits()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.order_rate_limits
  where window_started_at < now() - interval '1 hour';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- Retención: anonimiza pedidos completados después del plazo indicado.
create or replace function public.anonymize_completed_orders(p_retention interval default '12 months')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_count integer;
begin
  if p_retention < interval '1 day' then
    raise exception 'La retención mínima es de un día' using errcode = '22023';
  end if;

  update public.orders
     set customer_name = 'Cliente',
         delivery_address = null,
         notes = null,
         anonymized_at = now()
   where status = 'completed'
     and created_at < now() - p_retention
     and anonymized_at is null;

  get diagnostics affected_count = row_count;
  return affected_count;
end;
$$;


-- ============================================================================
-- 6. SEGURIDAD A NIVEL DE FILA (RLS)
-- ============================================================================

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.dishes enable row level security;

drop policy if exists "public can read available dishes" on public.dishes;
create policy "public can read available dishes" on public.dishes for select to anon, authenticated
  using (is_available = true);

drop policy if exists "admins manage dishes" on public.dishes;
create policy "admins manage dishes" on public.dishes for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "admins read orders" on public.orders;
create policy "admins read orders" on public.orders for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "admins update orders" on public.orders;
create policy "admins update orders" on public.orders for update to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "admins read order items" on public.order_items;
create policy "admins read order items" on public.order_items for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "public can read restaurant settings" on public.restaurant_settings;
create policy "public can read restaurant settings"
  on public.restaurant_settings for select to anon, authenticated
  using (true);

drop policy if exists "admins manage restaurant settings" on public.restaurant_settings;
create policy "admins manage restaurant settings"
  on public.restaurant_settings for update to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');


-- ============================================================================
-- 7. PERMISOS
-- ============================================================================

grant usage on schema public to anon, authenticated;

grant select on public.dishes to anon, authenticated;
grant select, insert, update, delete on public.dishes to authenticated;

grant select on public.restaurant_settings to anon, authenticated;
grant update on public.restaurant_settings to authenticated;

grant select, update on public.orders to authenticated;
grant select on public.order_items to authenticated;

revoke all on function public.create_order_secure(jsonb) from public;
grant execute on function public.create_order_secure(jsonb) to anon, authenticated;
revoke all on function public.get_order_by_token(text) from public;
grant execute on function public.get_order_by_token(text) to anon, authenticated;
revoke all on function public.purge_order_rate_limits() from public, anon, authenticated;
revoke all on function public.anonymize_completed_orders(interval) from public, anon, authenticated;


-- ============================================================================
-- 8. MENÚ INICIAL
-- ============================================================================

insert into public.dishes (id, nombre, descripcion, precio, imagen_url, is_available)
values
  ('00000000-0000-4000-8000-000000000001', 'Tri-Mini Monkeys', 'Tres mini burgers DMonkey para compartir y probar un poco de todo.', 39900, '/dmonkey-tri-mini-monkeys.png', true),
  ('00000000-0000-4000-8000-000000000002', 'Monkshake Stacker', 'Cheeseburger sencilla o doble, papitas y tu thick-shake favorito.', 43700, '/dmonkey-monkshake-stacker.png', true),
  ('00000000-0000-4000-8000-000000000003', 'Chees Maniatic', 'Combo para compartir con cheeseburgers, papas y bebidas bien frías.', 73900, '/dmonkey-combos.png', true),
  ('00000000-0000-4000-8000-000000000004', 'Monk Box', 'Cheeseburger, gringo fries y un thick shake del sabor que elijas.', 59900, '/dmonkey-combos.png', true),
  ('00000000-0000-4000-8000-000000000005', 'Cheddar Fries', 'Papas super crocantes por fuera y suaves por dentro, cubiertas con cheddar.', 14900, '/dmonkey-cheddar-fries.png', true),
  ('00000000-0000-4000-8000-000000000006', 'Gringo Fries', 'Papas doradas al estilo americano con queso cheddar y tocineta crujiente.', 21900, '/dmonkey-gringo-fries.png', true),
  ('00000000-0000-4000-8000-000000000007', 'Garlic-Gringo Fries', 'Papas doradas con cheddar, drip de ajo y tocineta jugosa.', 23900, '/dmonkey-garlic-gringo-fries.png', true),
  ('00000000-0000-4000-8000-000000000008', 'Garlic / Cheddar Fries', 'Papas crujientes bañadas en cheddar derretido y emulsión cremosa de ajo.', 16500, '/dmonkey-garlic-cheddar-fries.png', true),
  ('00000000-0000-4000-8000-000000000009', 'Bacon Jam!', 'Brioche artesanal, 180 g de angus beef, mermelada de bacon y vegetales frescos.', 27900, '/dmonkey-bacon-jam.png', true),
  ('00000000-0000-4000-8000-000000000010', 'Cheeseburger', 'Angus beef, queso, tocineta premium, vegetales frescos y salsa de la casa.', 29500, '/dmonkey-cheeseburger.png', true),
  ('00000000-0000-4000-8000-000000000011', 'Caribbean', 'Angus beef, piña caramelizada, queso artesanal y tocineta premium.', 27700, '/dmonkey-garibbean.png', true),
  ('00000000-0000-4000-8000-000000000012', 'Sweet Relish', 'Angus beef, pepinillos crushed, tocineta premium y salsa de la casa.', 29900, '/dmonkey-sweet-relish.png', true),
  ('00000000-0000-4000-8000-000000000013', 'Phili!', 'Angus beef, queso philadelphia, piña caramelizada, vegetales frescos y salsa de la casa.', 31500, '/dmonkey-phila.png', true),
  ('00000000-0000-4000-8000-000000000014', 'Golden Velvet', 'Angus beef, doble crema apanada, parmesano, tocineta premium y vegetales frescos.', 32700, '/dmonkey-golden-velvet.png', true),
  ('00000000-0000-4000-8000-000000000015', 'Big Cheese', 'Angus beef, queso americano, queso azul, mermelada de bacon y vegetales frescos.', 36600, '/dmonkey-big-cheese.png', true),
  ('00000000-0000-4000-8000-000000000016', 'King Kong', '300 g de angus beef, doble queso, doble tocineta y vegetales frescos.', 39900, '/dmonkey-king-kong.png', true),
  ('00000000-0000-4000-8000-000000000017', 'Chips & Cream', 'Shake de brownie, migas de Oreo y porción de papas a la francesa.', 21500, '/dmonkey-brownie-crushed.png', true),
  ('00000000-0000-4000-8000-000000000018', 'Brownie Crushed', 'Shake de brownie, salsa Hershey’s, trozos de brownie y chantilly.', 24700, '/dmonkey-brownie-crushed.png', true),
  ('00000000-0000-4000-8000-000000000019', 'Milo Blash', 'Shake mitad vainilla y mitad chocolate, brownie, nuggets, galleta y Milo.', 24700, '/dmonkey-milo-blast.png', true),
  ('00000000-0000-4000-8000-000000000020', 'Oreo Hit', 'Shake de Oreo, salsa de Hershey’s, migas y trozos de galleta Oreo.', 24700, '/dmonkey-oreo-hit.png', true),
  ('00000000-0000-4000-8000-000000000021', 'Baileys Babe', 'Thick shake de vainilla y Baileys, crema de avellanas y chips de chocolate.', 27500, '/dmonkey-baileys-babe.png', true),
  ('00000000-0000-4000-8000-000000000022', 'Choco Monkshake', 'Shake de chocolate, crema chantilly y trozos de pizza de chocolate.', 19000, '/dmonkey-choco-monkshake.png', true),
  ('00000000-0000-4000-8000-000000000023', 'Berry Monkshake', 'Shake de fresa, crema chantilly y trozos de pizza fresa.', 19000, '/dmonkey-berry-monkshake.png', true),
  ('00000000-0000-4000-8000-000000000024', 'Cookie Monkshake', 'Shake de brownie, crema chantilly y migas de galleta Oreo.', 19000, '/dmonkey-cookie-monkshake.png', true),
  ('00000000-0000-4000-8000-000000000025', 'Vanilla Monkshake', 'Shake de vainilla, crema chantilly y migas de Mini Chips.', 19000, '/dmonkey-vanilla-monkshake.png', true)
on conflict (id) do update set
  nombre = excluded.nombre,
  descripcion = excluded.descripcion,
  precio = excluded.precio,
  imagen_url = excluded.imagen_url,
  is_available = excluded.is_available;


-- ============================================================================
-- 9. PROGRAMACIÓN DE LA LIMPIEZA (pg_cron opcional)
-- ============================================================================

do $$
begin
  create extension if not exists pg_cron;
exception
  when others then
    raise notice 'pg_cron no está disponible; programa la limpieza manualmente (ver runbook).';
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('purge-order-rate-limits');
    exception when others then
      null;
    end;
    begin
      perform cron.unschedule('anonymize-completed-orders');
    exception when others then
      null;
    end;
    perform cron.schedule('purge-order-rate-limits', '15 * * * *', $job$select public.purge_order_rate_limits();$job$);
    perform cron.schedule('anonymize-completed-orders', '30 3 * * *', $job$select public.anonymize_completed_orders();$job$);
  end if;
end;
$$;


-- ============================================================================
-- 10. VERIFICACIÓN (opcional, ejecutar a mano después)
-- ============================================================================
-- Sin consentimiento debe fallar con el código 22023:
--   select * from public.create_order_secure(
--     '{"customer_name":"Prueba","order_type":"pickup","items":[]}'::jsonb
--   );
--
-- Con consentimiento debe crear el pedido y sellar la fecha:
--   select * from public.create_order_secure(jsonb_build_object(
--     'customer_name', 'Prueba',
--     'order_type', 'pickup',
--     'notes', '',
--     'legal_version', '2026-11-15',
--     'items', jsonb_build_array(
--       jsonb_build_object('dish_id', '00000000-0000-4000-8000-000000000005', 'quantity', 1)
--     )
--   ));
--
--   select id, legal_version, terms_accepted_at
--   from public.orders
--   order by created_at desc
--   limit 1;
-- ============================================================================

-- ============================================================================
-- 11. PEDIDO ÚNICO, TELÉFONO, CANCELACIÓN E HISTORIAL
-- ============================================================================

-- Pedido único activo, teléfono obligatorio y endurecimiento de la creación de pedidos.
--
-- 1. Guarda el teléfono normalizado, el identificador del navegador y un token
--    de idempotencia en cada pedido.
-- 2. Impide que un teléfono o un navegador tengan más de un pedido activo a la
--    vez, sin asumir etiquetas concretas del enum `order_status`.
-- 3. Valida cantidades, número de ítems, platos duplicados y versión legal
--    dentro del servidor, sin confiar en el cliente.
-- 4. Normaliza la IP del límite de pedidos y agrega un tope global por minuto.
--
-- Nota: el teléfono se guarda sin verificación (no se envían códigos). La
-- unicidad es una barrera operativa, no una prueba de identidad.

alter table public.orders
  add column if not exists customer_phone text,
  add column if not exists client_id uuid,
  add column if not exists client_token uuid,
  add column if not exists is_active boolean not null default true;

-- `is_active` se deriva del estado comparando texto: así no se asume ningún
-- valor del enum (hay bases donde el estado inicial no se llama 'pending').
create or replace function public.sync_order_active()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.is_active := new.status::text not in ('completed', 'cancelled');
  return new;
end;
$$;

drop trigger if exists orders_sync_active on public.orders;
create trigger orders_sync_active
  before insert or update of status on public.orders
  for each row execute function public.sync_order_active();

update public.orders
set is_active = (status::text not in ('completed', 'cancelled'));

drop index if exists public.orders_one_active_per_phone_idx;
drop index if exists public.orders_one_active_per_client_idx;

create unique index if not exists orders_client_token_idx
  on public.orders (client_token)
  where client_token is not null;

create unique index if not exists orders_one_active_per_phone_idx
  on public.orders (customer_phone)
  where is_active and customer_phone is not null;

create unique index if not exists orders_one_active_per_client_idx
  on public.orders (client_id)
  where is_active and client_id is not null;

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


-- Cancelación de pedidos, historial de estados y liberación de pedidos vencidos.
--
-- 1. Agrega el estado `cancelled`, necesario para liberar el pedido único
--    cuando el restaurante rechaza o el cliente cancela.
-- 2. Registra cada cambio de estado en `order_status_history` para auditoría.
-- 3. Marca como cancelados los pedidos pendientes con más de 2 horas, de modo
--    que un pedido abandonado no bloquee al cliente para siempre.
-- 4. Amplía la anonimización a pedidos cancelados y al teléfono/dispositivo.

alter type public.order_status add value if not exists 'cancelled';

create table if not exists public.order_status_history (
  id bigint generated by default as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create index if not exists order_status_history_order_idx
  on public.order_status_history (order_id, changed_at);

alter table public.order_status_history enable row level security;

drop policy if exists "admins read order history" on public.order_status_history;
create policy "admins read order history"
  on public.order_status_history for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

revoke insert, update, delete on public.order_status_history from anon, authenticated;
grant select on public.order_status_history to authenticated;

create or replace function public.log_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    insert into public.order_status_history (order_id, from_status, to_status, changed_by)
    values (new.id, old.status::text, new.status::text, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists orders_status_history on public.orders;
create trigger orders_status_history
  after update of status on public.orders
  for each row execute function public.log_order_status_change();

create or replace function public.expire_stale_orders(p_age interval default '2 hours')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_count integer;
begin
  if p_age < interval '10 minutes' then
    raise exception 'El vencimiento mínimo es de 10 minutos' using errcode = '22023';
  end if;

  update public.orders
     set status = 'cancelled'
   where status::text not in ('accepted', 'preparing', 'on_the_way', 'completed', 'cancelled')
     and created_at < now() - p_age;

  get diagnostics affected_count = row_count;
  return affected_count;
end;
$$;

revoke all on function public.expire_stale_orders(interval) from public, anon, authenticated;

create or replace function public.anonymize_completed_orders(p_retention interval default '12 months')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_count integer;
begin
  if p_retention < interval '1 day' then
    raise exception 'La retención mínima es de un día' using errcode = '22023';
  end if;

  update public.orders
     set customer_name = 'Cliente',
         customer_phone = null,
         delivery_address = null,
         notes = null,
         client_id = null,
         anonymized_at = now()
   where status::text in ('completed', 'cancelled')
     and created_at < now() - p_retention
     and anonymized_at is null;

  get diagnostics affected_count = row_count;
  return affected_count;
end;
$$;

revoke all on function public.anonymize_completed_orders(interval) from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_cron;
exception
  when others then
    raise notice 'pg_cron no está disponible; programa la limpieza manualmente (ver runbook).';
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('expire-stale-orders');
    exception when others then
      null;
    end;
    perform cron.schedule('expire-stale-orders', '*/15 * * * *', $job$select public.expire_stale_orders();$job$);
  end if;
end;
$$;

-- ============================================================================
-- 12. VALOR 'pickup' DEL ENUM order_type
-- ============================================================================

-- El enum order_type de algunas bases se creó sin el valor 'pickup'.
-- La app envía 'pickup' para recoger, así que se agrega para que el insert
-- de create_order_secure no falle con 22P02.

alter type public.order_type add value if not exists 'pickup';

-- ============================================================================
-- 14. CATEGORIAS DE PLATOS
-- ============================================================================

-- Categorías de platos.
--
-- 1. Crea la tabla `categories` con nombre y orden de visualización.
-- 2. Agrega `dishes.category_id`; si se elimina una categoría, los platos
--    quedan sin categoría (no se borran).
-- 3. Permite lectura pública de las categorías y gestión solo al admin.
-- 4. Siembra categorías para el menú actual y asigna los platos existentes
--    que aún no tengan categoría.

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (length(trim(nombre)) between 1 and 60),
  orden integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.dishes
  add column if not exists category_id uuid references public.categories(id) on delete set null;

create index if not exists dishes_category_id_idx on public.dishes (category_id);
create index if not exists categories_orden_idx on public.categories (orden);

alter table public.categories enable row level security;

drop policy if exists "public can read categories" on public.categories;
create policy "public can read categories"
  on public.categories for select to anon, authenticated
  using (true);

drop policy if exists "admins manage categories" on public.categories;
create policy "admins manage categories"
  on public.categories for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

grant select on public.categories to anon, authenticated;
grant insert, update, delete on public.categories to authenticated;

comment on table public.categories is 'Categorías visibles en el menú público.';
comment on column public.dishes.category_id is 'Categoría del plato; null = sin categoría.';

-- Categorías iniciales (se pueden renombrar, reordenar o eliminar desde el panel).
insert into public.categories (nombre, orden) values
  ('Burgers', 10),
  ('Papas', 20),
  ('Shakes', 30),
  ('Combos', 40)
on conflict (nombre) do nothing;

update public.dishes d
set category_id = c.id
from public.categories c
where c.nombre = 'Burgers'
  and d.category_id is null
  and d.nombre in (
    'Tri-Mini Monkeys', 'Bacon Jam!', 'Cheeseburger', 'Caribbean',
    'Sweet Relish', 'Phili!', 'Golden Velvet', 'Big Cheese', 'King Kong'
  );

update public.dishes d
set category_id = c.id
from public.categories c
where c.nombre = 'Papas'
  and d.category_id is null
  and d.nombre in (
    'Cheddar Fries', 'Gringo Fries', 'Garlic-Gringo Fries', 'Garlic / Cheddar Fries'
  );

update public.dishes d
set category_id = c.id
from public.categories c
where c.nombre = 'Shakes'
  and d.category_id is null
  and d.nombre in (
    'Chips & Cream', 'Brownie Crushed', 'Milo Blash', 'Oreo Hit', 'Baileys Babe',
    'Choco Monkshake', 'Berry Monkshake', 'Cookie Monkshake', 'Vanilla Monkshake'
  );

update public.dishes d
set category_id = c.id
from public.categories c
where c.nombre = 'Combos'
  and d.category_id is null
  and d.nombre in (
    'Monkshake Stacker', 'Chees Maniatic', 'Monk Box'
  );

-- ============================================================================
-- 15. BUCKET DE IMAGENES DE PLATOS
-- ============================================================================

-- Bucket público para las imágenes de los platos.
--
-- 1. Crea el bucket `dish-images` (lectura pública, 5 MB, JPG/PNG/WebP).
-- 2. Permite subir, reemplazar y borrar solo a usuarios con rol admin.
-- 3. El bloque se omite si el esquema `storage` no existe (por ejemplo en
--    PostgreSQL local sin Supabase).

do $do$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('dish-images', 'dish-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update
      set public = excluded.public,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;

    execute $sql$drop policy if exists "dish images public read" on storage.objects$sql$;
    execute $sql$create policy "dish images public read" on storage.objects for select to anon, authenticated using (bucket_id = 'dish-images')$sql$;

    execute $sql$drop policy if exists "dish images admin upload" on storage.objects$sql$;
    execute $sql$create policy "dish images admin upload" on storage.objects for insert to authenticated with check (bucket_id = 'dish-images' and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')$sql$;

    execute $sql$drop policy if exists "dish images admin update" on storage.objects$sql$;
    execute $sql$create policy "dish images admin update" on storage.objects for update to authenticated using (bucket_id = 'dish-images' and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check (bucket_id = 'dish-images' and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')$sql$;

    execute $sql$drop policy if exists "dish images admin delete" on storage.objects$sql$;
    execute $sql$create policy "dish images admin delete" on storage.objects for delete to authenticated using (bucket_id = 'dish-images' and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')$sql$;
  end if;
end
$do$;

-- ============================================================================
-- 16. FLUJO Y CIERRE DE CAJA
-- ============================================================================

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

-- ============================================================================
-- 17. COSTOS DE PLATOS Y ESTADISTICAS
-- ============================================================================

-- Costos de platos y ganancia por producto.
--
-- 1. Agrega `dishes.costo` (costo estimado por plato) y lo usa para calcular
--    la ganancia en el panel de estadísticas.
-- 2. Guarda el costo en `order_items.unit_cost` al crear el pedido, para que
--    los cambios futuros de costo no alteren la historia.
-- 3. Rellena el costo de los ítems existentes con el costo actual del plato.

alter table public.dishes
  add column if not exists costo numeric(12,2)
  check (costo is null or costo >= 0);

alter table public.order_items
  add column if not exists unit_cost numeric(12,2)
  check (unit_cost is null or unit_cost >= 0);

update public.order_items oi
set unit_cost = d.costo
from public.dishes d
where oi.dish_id = d.id
  and oi.unit_cost is null
  and d.costo is not null;

create or replace function public.fill_order_item_cost()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.unit_cost is null then
    select d.costo into new.unit_cost
    from public.dishes d
    where d.id = new.dish_id;
  end if;
  return new;
end;
$$;

drop trigger if exists order_items_fill_cost on public.order_items;
create trigger order_items_fill_cost
  before insert on public.order_items
  for each row execute function public.fill_order_item_cost();

comment on column public.dishes.costo is 'Costo estimado del plato para calcular ganancia.';
comment on column public.order_items.unit_cost is 'Costo del plato al momento del pedido.';

-- ============================================================================
-- 18. TRANSFERENCIAS EN LA CAJA
-- ============================================================================

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


-- ============================================================================
-- 19. FACTURACION Y FINANZAS
-- ============================================================================

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
  v_start := coalesce(v_settings.invoice_range_from, 1);
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
