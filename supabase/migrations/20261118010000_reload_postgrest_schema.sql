-- Recarga la caché de PostgREST después de aplicar la migración de facturación.
--
-- Si el panel muestra "Aplica la migración 20261118000000_billing_and_finance.sql"
-- pero las tablas y funciones ya existen, la API suele conservar la caché
-- anterior y responde PGRST202 (función no encontrada). Ejecutar este archivo
-- (o solo la sentencia NOTIFY) refresca el esquema sin reiniciar el proyecto.

notify pgrst, 'reload schema';
