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
     or (p_order->>'order_type' = 'delivery' and length(trim(coalesce(p_order->>'delivery_address', ''))) not between 1 and 300)
     or length(coalesce(p_order->>'notes', '')) > 500 then
    raise exception 'Invalid order payload' using errcode = '22023';
  end if;

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

  insert into public.orders(customer_name, order_type, delivery_address, notes, payment_method, total)
  values (
    left(trim(p_order->>'customer_name'), 100),
    (p_order->>'order_type')::public.order_type,
    case when p_order->>'order_type' = 'delivery' then left(trim(p_order->>'delivery_address'), 300) end,
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
