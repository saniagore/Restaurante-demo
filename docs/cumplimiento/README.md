# Cumplimiento legal y de protección al consumidor

Esta guía explica qué se implementó, qué datos faltan por completar y cómo poner los cambios en producción. No sustituye la revisión de un abogado ni de un contador.

## 1. Qué incluye esta implementación

| Pieza | Archivo | Función |
| --- | --- | --- |
| Datos del negocio y versión legal | `src/config/business.ts` | Fuente única de razón social, NIT, dirección, contactos, horarios, cobertura, tiempo estimado y retención. |
| Términos y Condiciones | `src/legal/content.tsx` | Identificación del proveedor, precios, entrega, cancelaciones, PQRS y ley aplicable. |
| Política de Privacidad | `src/legal/content.tsx` | Responsable, finalidades, datos sensibles, encargados, retención y derechos ARCO. |
| Cookies y almacenamiento | `src/legal/content.tsx` | Tabla de claves, finalidades y cómo borrarlas. |
| PQRS | `src/legal/content.tsx` | Canales, plazos y contenido de las solicitudes. |
| Páginas legales | `src/legal/LegalPage.tsx` | Rutas `/terminos`, `/privacidad`, `/cookies` y `/pqrs`. |
| Modal legal | `src/legal/LegalModal.tsx` | Lectura dentro del checkout sin perder el formulario. |
| Footer legal | `src/components/SiteFooter.tsx` | Datos del proveedor, enlaces y aviso de precios. |
| Aviso de navegador | `src/components/StorageNotice.tsx` | Aviso no bloqueante con acuse versionado y borrado de datos. |
| Consentimiento | `src/App.tsx`, `src/lib/orders.ts` | Casilla obligatoria, aviso de datos sensibles y `legal_version` en el payload. |
| Evidencia en base de datos | `supabase/migrations/20261115000000_order_consent.sql` | Columnas `legal_version` y `terms_accepted_at`; la RPC rechaza pedidos sin versión. |
| Retención | `supabase/migrations/20261115010000_data_retention.sql` | Purga de IP cada hora y anonimización de pedidos completados. |
| Aviso de privacidad corto | `src/App.tsx` (checkout) | Responsable, finalidad, derechos y canal, junto al campo de nombre. |
| Pedido único y teléfono | `src/App.tsx`, `src/lib/customer-session.ts`, `supabase/migrations/20261116000000_add_phone_single_active_order.sql` | Teléfono obligatorio en recogida y domicilio; un solo pedido activo por teléfono y por navegador. |
| Cancelación e historial | `src/components/OrdersBoard.jsx`, `supabase/migrations/20261116010000_cancel_orders_and_history.sql` | Estado `cancelled`, botón de cancelación, historial de estados y vencimiento de pedidos pendientes. |
| Flujo de recogida | `src/components/OrdersBoard.jsx`, `src/App.tsx` | Para recoger, `preparing` pasa directo a `completed` y el cliente ve "Listo para recoger". |
| Categorías del menú | `src/components/MenuManager.jsx`, `src/App.tsx`, `supabase/migrations/20261116040000_create_categories.sql` | El admin crea, renombra, reordena y elimina categorías y asigna cada plato; el menú público las muestra como filtros. |
| Imágenes de platos | `src/components/MenuManager.jsx`, `supabase/migrations/20261116050000_create_dish_images_bucket.sql` | El admin sube la imagen desde el formulario a Supabase Storage; ya no necesita pegar una URL. |
| Flujo de caja | `src/components/CashRegister.jsx`, `supabase/migrations/20261117000000_cash_register.sql`, `20261117020000_cash_transfers.sql` | Apertura, ventas en efectivo y transferencia, ingresos, gastos, retiros y cierre con diferencia. |
| Estadísticas de productos | `src/components/Statistics.jsx`, `supabase/migrations/20261117010000_dish_costs_statistics.sql` | Ventas, unidades, costo, ganancia y margen por producto; ranking de más vendido y más rentable. |

## 2. Datos pendientes (marcadores en mayúsculas)

Todos están en `src/config/business.ts`. Al reemplazarlos se actualizan automáticamente el footer, las cuatro páginas legales, el checkout y los modales.

- `legalName`: razón social o nombre del titular.
- `taxId`: NIT.
- `legalAddress`: dirección de notificación judicial.
- `city`: ciudad y departamento.
- `phone`: teléfono de atención.
- `whatsapp`: número de WhatsApp.
- `email`: correo de atención general.
- `pqrsEmail`: buzón de PQRS.
- `privacyEmail`: buzón para derechos de datos personales.
- `hours`: horario de atención.
- `coverageZones`: zonas o barrios de cobertura.
- `deliveryEstimate`: tiempo estimado real (hoy `25 - 35 minutos`).

Mientras un correo o teléfono empiece por mayúsculas y no tenga formato válido, se muestra como texto sin enlace (`mailto:`/`tel:` solo se genera con un dato real).

## 3. Cómo cambiar los documentos legales

1. Edita el texto en `src/legal/content.tsx`.
2. Actualiza `LEGAL_VERSION` (formato `AAAA-MM-DD`) y `LEGAL_LAST_UPDATED` en `src/config/business.ts`.
3. Registra la versión en Supabase y marca la anterior como no vigente:

```sql
insert into public.legal_versions (version, is_current)
values ('2026-11-15', true)
on conflict (version) do update set is_current = true;

update public.legal_versions
set is_current = false
where version <> '2026-11-15';
```

4. Haz commit y despliega.

`LEGAL_VERSION` se envía en cada pedido y se guarda en `orders.legal_version`; también controla cuándo reaparece el aviso de almacenamiento. La RPC solo acepta versiones que existan en `legal_versions` con `is_current = true`: si cambias el texto sin registrar la versión, los pedidos fallarán con `Invalid order payload`. No cambies la versión sin cambiar el texto, ni al contrario.

## 4. Migraciones

Aplícalas en este orden. Requieren acceso al proyecto de Supabase (no se ejecutan desde el frontend):

```bash
npx supabase link --project-ref <REF_DEL_PROYECTO>
npx supabase db push
```

Alternativa: copiar el contenido de cada archivo en el SQL Editor del panel de Supabase, respetando el orden.

**Atajo:** [migraciones-completas.sql](migraciones-completas.sql) reúne en un solo archivo el esquema base mínimo, las 11 migraciones anteriores y estas 10, en orden y de forma idempotente. Es la opción recomendada si prefieres pegar una sola vez en el SQL Editor.

1. `20261115000000_order_consent.sql`: agrega columnas y actualiza `create_order_secure`.
2. `20261115010000_data_retention.sql`: agrega `anonymized_at`, crea las funciones de limpieza y programa `pg_cron`.
3. `20261116000000_add_phone_single_active_order.sql`: agrega teléfono, identificador de navegador, token de idempotencia, tope de ítems, validación de cantidades, versión legal y límite global.
4. `20261116010000_cancel_orders_and_history.sql`: agrega el estado `cancelled`, el historial de estados y el vencimiento automático de pedidos pendientes.
5. `20261116030000_add_pickup_order_type.sql`: agrega el valor `pickup` al enum `order_type` en las bases donde falte (necesario para pedidos para recoger).
6. `20261116040000_create_categories.sql`: crea `categories`, agrega `dishes.category_id`, define RLS y siembra las categorías iniciales del menú.
7. `20261116050000_create_dish_images_bucket.sql`: crea el bucket público `dish-images` (5 MB, JPG/PNG/WebP) y sus políticas de lectura y administración.
8. `20261117000000_cash_register.sql`: crea las sesiones y movimientos de caja con acceso solo para admin.
9. `20261117010000_dish_costs_statistics.sql`: agrega `dishes.costo`, guarda `order_items.unit_cost` y rellena los ítems existentes.
10. `20261117020000_cash_transfers.sql`: separa ventas en efectivo y transferencia en las sesiones de caja y restringe el método de pago.

Notas:

- La regla de pedido único **no depende del nombre del estado inicial**: `is_active` se calcula comparando el estado como texto, así que funciona igual si tu enum usa `pending`, `received` u otro valor.
- Para **recoger**, el flujo del panel es Pendientes → Aceptado → Preparando → Completadas (sin pasar por “En camino”); el seguimiento del cliente muestra “Listo para recoger”.
- Las **categorías** se leen públicamente y solo el admin las gestiona. Al eliminar una categoría, sus platos quedan sin categoría (no se borran) y aparecen en el filtro “Otros” del menú público.
- Las **imágenes** se suben al bucket público `dish-images`; el bucket acepta JPG, PNG y WebP de hasta 5 MB. Solo un usuario con rol admin puede subir, reemplazar o borrar archivos.
- La **caja** calcula las ventas en efectivo desde los pedidos completados durante el turno. Solo puede existir una caja abierta; los ingresos, gastos y retiros se registran como movimientos. El cierre guarda efectivo, transferencias, esperado, contado y diferencia.
- Las **transferencias** se toman de los pedidos marcados con método de pago “Transferencia” en Órdenes. La caja permite alternar entre Total, Efectivo y Transferencias; el cierre físico siempre usa solo el efectivo.
- Las **estadísticas** usan los pedidos completados y el costo guardado en cada ítem. Si un plato no tiene costo, su ganancia se muestra como ingreso y el panel avisa cuáles completar.
- El pedido se rechaza con el código `22023` si no incluye teléfono válido, versión legal vigente, más de 50 ítems, platos duplicados o cantidades fuera de 1-99.
- Si el teléfono o el navegador ya tienen un pedido activo, la RPC responde `Ya tienes un pedido activo` (código `P0001`) y no crea una fila.
- El mismo `client_token` devuelve el pedido ya creado: reintentar no duplica.
- `pg_cron` se intenta habilitar en la migración. Si no está disponible, actívalo en *Database → Extensions* y vuelve a ejecutar el bloque de programación, o usa el runbook manual de la sección 6.
- Las funciones de limpieza no son ejecutables por `anon` ni por `authenticated`: solo por el rol propietario y por `pg_cron`.

## 5. Verificación después de aplicar

```sql
-- 1) Sin consentimiento debe fallar (esperado: error 22023)
select * from public.create_order_secure(
  '{"customer_name":"Prueba","order_type":"pickup","items":[]}'::jsonb
);

-- 2) Pedido válido: reemplaza <UUID_DE_UN_PLATO> por un id real de dishes
select * from public.create_order_secure(jsonb_build_object(
  'customer_name', 'Prueba',
  'customer_phone', '3001234567',
  'order_type', 'pickup',
  'notes', '',
  'legal_version', '2026-11-15',
  'client_id', '11111111-1111-4111-8111-111111111111',
  'client_token', '22222222-2222-4222-8222-222222222222',
  'items', jsonb_build_array(jsonb_build_object('dish_id', '<UUID_DE_UN_PLATO>', 'quantity', 1))
));

-- 3) Repetir el mismo client_token devuelve el mismo pedido (idempotencia)
-- 4) Otro pedido con el mismo teléfono o client_id debe fallar:
--    "Ya tienes un pedido activo"

select id, customer_phone, legal_version, terms_accepted_at
from public.orders
order by created_at desc
limit 1;

-- 5) Cancelar el pedido de prueba libera el teléfono
update public.orders set status = 'cancelled' where id = '<ID_DEL_PEDIDO_DE_PRUEBA>';
select from_status, to_status, changed_at from public.order_status_history
where order_id = '<ID_DEL_PEDIDO_DE_PRUEBA>';

-- 6) Limpieza de IP y vencimiento de pendientes
select public.purge_order_rate_limits();
select public.expire_stale_orders();

-- 7) Anonimización de pedidos completados o cancelados antiguos
select public.anonymize_completed_orders(interval '12 months');
```

El pedido de prueba consume el límite de 5 por minuto por IP; bórralo después (el historial se borra en cascada):

```sql
delete from public.order_items where order_id = '<ID_DEL_PEDIDO_DE_PRUEBA>';
delete from public.orders where id = '<ID_DEL_PEDIDO_DE_PRUEBA>';
```

## 6. Retención de datos

- **Pedidos:** 12 meses desde su creación; después se anonimizan (nombre, teléfono, dirección, notas e identificador del navegador). Los valores, fechas y estados se conservan para estadística y contabilidad.
- **IP de control de pedidos:** máximo 1 hora.
- **PQRS:** 24 meses.

`business.retention` alimenta los textos visibles; la migración usa valores propios. Si cambias el plazo, actualiza ambos lugares:

```sql
select cron.unschedule('anonymize-completed-orders');
select cron.schedule(
  'anonymize-completed-orders',
  '30 3 * * *',
  $$select public.anonymize_completed_orders(interval '6 months');$$
);
```

y en `src/config/business.ts`:

```ts
retention: { ordersMonths: 6, rateLimitHours: 1, pqrsMonths: 24 }
```

La anonimización solo toca pedidos `completed` o `cancelled`; un pedido en curso o con reclamo abierto nunca se anonimiza. Los pedidos pendientes con más de 2 horas se cancelan automáticamente cada 15 minutos para no bloquear el teléfono del cliente.

## 7. Privacidad por diseño: terceros eliminados

- El hero ya no descarga la imagen desde Unsplash: usa `src/assets/hero.png`.
- Se eliminó la importación de Google Fonts (`src/index.css`); ahora se usan tipografías del sistema. Si quieres recuperar la identidad visual, autoaloja los archivos `.woff2` en `public/fonts` y declara `@font-face` (así no se envía la IP del visitante a Google).
- Las imágenes del menú se sirven desde `/dmonkey-*.png`; si el administrador pega una URL externa en el gestor de menú, la imagen se carga con `referrerPolicy="no-referrer"`. Documenta ese caso si empiezas a usar un CDN externo.
- `vercel.json` agrega `Referrer-Policy`, `X-Content-Type-Options`, `X-Frame-Options` y una `Content-Security-Policy` que solo permite scripts propios y conexiones a Supabase.

## 8. Pendientes y decisiones abiertas

- **Teléfono sin verificación:** se pide el número en recogida y domicilio, pero no se envían códigos. La regla de un pedido activo por teléfono y por navegador es una barrera operativa: alguien puede evadirla con otro número u otro navegador. Si más adelante se necesita garantía de identidad, habría que agregar verificación por SMS (hoy fuera de alcance).
- **Consentimiento específico de datos sensibles:** la Política indica que escribir alergias constituye autorización expresa y que es opcional. Si el abogado lo exige, agrega una segunda casilla independiente en el checkout.
- **Régimen tributario:** los textos declaran precios finales al consumidor con "todos los impuestos y costos aplicables", sin especificar INC ni IVA. Si el contador confirma el INC del 8 %, actualiza `priceNotice` en `src/config/business.ts` para nombrarlo.
- **Registro Nacional de Bases de Datos (RNBD):** aplica a responsables con activos superiores a 100.000 UVT; verifica si tu caso está obligado.
- **Facturación electrónica:** fuera de alcance.
- **Datos legales editables desde `/admin`:** hoy viven en el código. La tabla `restaurant_settings` ya existe y podría almacenarlos para editarlos sin despliegue.

## 9. Checklist antes de publicar

- [ ] Completar los datos de la sección 2 y actualizar `LEGAL_VERSION` si cambia el texto.
- [ ] Revisión de los cuatro documentos por un abogado.
- [ ] Revisión de precios e impuestos por el contador (hoy se declaran como precios finales con impuestos incluidos).
- [ ] Aplicar las cuatro migraciones (o el archivo único) y ejecutar la verificación de la sección 5.
- [ ] Probar que un segundo pedido con el mismo teléfono o navegador se rechace y que cancelar lo libere.
- [ ] Probar un pedido para recoger de punta a punta: debe poder pasar de Preparando a Completadas y el cliente debe ver "Listo para recoger".
- [ ] Crear una categoría, mover un plato y comprobar el filtro en el menú público.
- [ ] Subir una imagen desde el formulario de plato y comprobar que se ve en el menú público.
- [ ] Abrir caja, registrar un gasto, completar un pedido y cerrar la caja verificando el efectivo esperado.
- [ ] Marcar un pedido como transferencia y comprobar el cambio Total / Efectivo / Transferencias en Caja.
- [ ] Cargar el costo de los platos y revisar el ranking de ganancia en Estadísticas.
- [ ] Confirmar que los buzones `pqrsEmail` y `privacyEmail` existen y tienen responsable asignado.
- [ ] Probar en producción: carrito → consentimiento sin marcar (debe bloquear) → pedido → seguimiento.
- [ ] Verificar que la CSP no bloquee Supabase (REST, Realtime del panel) ni las imágenes del menú.
- [ ] Probar `/terminos`, `/privacidad`, `/cookies`, `/pqrs` en escritorio y móvil.
- [ ] Verificar el flujo de cancelación y reembolso descrito en los Términos.
- [ ] Programar una revisión semestral de los documentos y de los plazos de retención.
