-- Retención y minimización de datos (Ley 1581 de 2012, arts. 4 y 5).
--
-- 1. Las IP usadas para limitar pedidos abusivos se conservan máximo una hora.
-- 2. Los pedidos completados se anonimizan después del plazo configurado:
--    nombre, dirección y notas se eliminan; se conservan valores y fechas.
--
-- Ambos procesos se programan con pg_cron cuando la extensión está disponible.
-- Si no lo está, el runbook de docs/cumplimiento explica cómo ejecutarlos.

alter table public.orders
  add column if not exists anonymized_at timestamptz;

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

revoke all on function public.purge_order_rate_limits() from public, anon, authenticated;
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
