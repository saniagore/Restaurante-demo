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
