-- Production hardening: clients may only invoke the validated order functions.
create table if not exists public.order_rate_limits (
  rate_key text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0
);

alter table public.orders
  add column if not exists total numeric(12,2);

alter table public.order_rate_limits enable row level security;
revoke all on public.order_rate_limits from anon, authenticated;

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
begin
  if jsonb_typeof(p_order) <> 'object'
     or jsonb_typeof(p_order->'items') <> 'array'
     or jsonb_array_length(p_order->'items') = 0
     or length(coalesce(p_order->>'customer_name', '')) not between 1 and 100
     or p_order->>'order_type' not in ('pickup', 'delivery')
     or length(coalesce(p_order->>'notes', '')) > 500 then
    raise exception 'Invalid order payload' using errcode = '22023';
  end if;

  -- PostgREST forwards the client address in this setting. Unknown addresses
  -- share the conservative bucket instead of bypassing the limit.
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

  insert into public.orders(customer_name, order_type, notes, payment_method, total)
  values (
    left(trim(p_order->>'customer_name'), 100),
    p_order->>'order_type',
    nullif(left(trim(coalesce(p_order->>'notes', '')), 500), ''),
    'cash',
    calculated_total
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

revoke all on function public.create_order_secure(jsonb) from public;
grant execute on function public.create_order_secure(jsonb) to anon, authenticated;
revoke all on function public.get_order_by_token(text) from public;
grant execute on function public.get_order_by_token(text) to anon, authenticated;

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
