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
