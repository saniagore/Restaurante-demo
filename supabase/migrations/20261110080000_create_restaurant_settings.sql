create table if not exists public.restaurant_settings (
  id boolean primary key default true check (id),
  delivery_fee numeric(12,2) not null default 0 check (delivery_fee >= 0)
);

insert into public.restaurant_settings (id, delivery_fee)
values (true, 0)
on conflict (id) do nothing;

alter table public.restaurant_settings enable row level security;

drop policy if exists "public can read restaurant settings" on public.restaurant_settings;
create policy "public can read restaurant settings"
  on public.restaurant_settings for select to anon, authenticated
  using (true);

drop policy if exists "admins manage restaurant settings" on public.restaurant_settings;
create policy "admins manage restaurant settings"
  on public.restaurant_settings for update to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
