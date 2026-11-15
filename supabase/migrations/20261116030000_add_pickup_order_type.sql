-- El enum order_type de algunas bases se creó sin el valor 'pickup'.
-- La app envía 'pickup' para recoger, así que se agrega para que el insert
-- de create_order_secure no falle con 22P02.

alter type public.order_type add value if not exists 'pickup';
