alter type public.order_status add value if not exists 'accepted';
alter type public.order_status add value if not exists 'preparing';
alter type public.order_status add value if not exists 'on_the_way';
