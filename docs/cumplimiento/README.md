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
3. Haz commit y despliega.

`LEGAL_VERSION` se envía en cada pedido y se guarda en `orders.legal_version`; también controla cuándo reaparece el aviso de almacenamiento. No cambies la versión sin cambiar el texto, ni al contrario.

## 4. Migraciones

Aplícalas en este orden. Requieren acceso al proyecto de Supabase (no se ejecutan desde el frontend):

```bash
npx supabase link --project-ref <REF_DEL_PROYECTO>
npx supabase db push
```

Alternativa: copiar el contenido de cada archivo en el SQL Editor del panel de Supabase, respetando el orden.

**Atajo:** [migraciones-completas.sql](migraciones-completas.sql) reúne en un solo archivo el esquema base mínimo, las 11 migraciones anteriores y estas 2, en orden y de forma idempotente. Es la opción recomendada si prefieres pegar una sola vez en el SQL Editor.

1. `20261115000000_order_consent.sql`: agrega columnas y actualiza `create_order_secure`.
2. `20261115010000_data_retention.sql`: agrega `anonymized_at`, crea las funciones de limpieza y programa `pg_cron`.

Notas:

- El pedido se rechaza con el código `22023` si no incluye `legal_version` válida.
- `pg_cron` se intenta habilitar en la migración. Si no está disponible, actívalo en *Database → Extensions* y vuelve a ejecutar el bloque de programación, o usa el runbook manual de la sección 6.
- Las funciones de limpieza no son ejecutables por `anon` ni por `authenticated`: solo por el rol propietario y por `pg_cron`.

## 5. Verificación después de aplicar

```sql
-- 1) Sin consentimiento debe fallar (esperado: error 22023)
select * from public.create_order_secure(
  '{"customer_name":"Prueba","order_type":"pickup","items":[]}'::jsonb
);

-- 2) Con consentimiento debe crear el pedido y sellar la fecha
select * from public.create_order_secure(jsonb_build_object(
  'customer_name', 'Prueba',
  'order_type', 'pickup',
  'notes', '',
  'legal_version', '2026-11-15',
  'items', jsonb_build_array(jsonb_build_object('dish_id', '<UUID_DE_UN_PLATO>', 'quantity', 1))
));

select id, legal_version, terms_accepted_at
from public.orders
order by created_at desc
limit 1;

-- 3) Limpieza de IP (devuelve filas eliminadas)
select public.purge_order_rate_limits();

-- 4) Anonimización de pedidos completados antiguos (devuelve filas afectadas)
select public.anonymize_completed_orders(interval '12 months');
```

El pedido de prueba consume el límite de 5 por minuto por IP; bórralo después:

```sql
delete from public.order_items where order_id = '<ID_DEL_PEDIDO_DE_PRUEBA>';
delete from public.orders where id = '<ID_DEL_PEDIDO_DE_PRUEBA>';
```

## 6. Retención de datos

- **Pedidos:** 12 meses desde su creación; después se anonimizan (nombre, dirección y notas). Los valores, fechas y estados se conservan para estadística y contabilidad.
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

La anonimización solo toca pedidos con estado `completed`; un pedido en curso o con reclamo abierto nunca se anonimiza.

## 7. Privacidad por diseño: terceros eliminados

- El hero ya no descarga la imagen desde Unsplash: usa `src/assets/hero.png`.
- Se eliminó la importación de Google Fonts (`src/index.css`); ahora se usan tipografías del sistema. Si quieres recuperar la identidad visual, autoaloja los archivos `.woff2` en `public/fonts` y declara `@font-face` (así no se envía la IP del visitante a Google).
- Las imágenes del menú se sirven desde `/dmonkey-*.png`; si el administrador pega una URL externa en el gestor de menú, la imagen se carga con `referrerPolicy="no-referrer"`. Documenta ese caso si empiezas a usar un CDN externo.
- `vercel.json` agrega `Referrer-Policy`, `X-Content-Type-Options` y `X-Frame-Options`.

## 8. Pendientes y decisiones abiertas

- **Estado `cancelled`:** el enum `order_status` no lo tiene y el tablero solo avanza estados. La política de cancelación describe el proceso por canales de atención, pero conviene agregar el estado y un botón de cancelación en `/admin`. Queda como fase 8.
- **Consentimiento específico de datos sensibles:** la Política indica que escribir alergias constituye autorización expresa y que es opcional. Si el abogado lo exige, agrega una segunda casilla independiente en el checkout.
- **Régimen tributario:** los textos declaran precios finales al consumidor con "todos los impuestos y costos aplicables", sin especificar INC ni IVA. Si el contador confirma el INC del 8 %, actualiza `priceNotice` en `src/config/business.ts` para nombrarlo.
- **Registro Nacional de Bases de Datos (RNBD):** aplica a responsables con activos superiores a 100.000 UVT; verifica si tu caso está obligado.
- **Facturación electrónica:** fuera de alcance.
- **Datos legales editables desde `/admin`:** hoy viven en el código. La tabla `restaurant_settings` ya existe y podría almacenarlos para editarlos sin despliegue.

## 9. Checklist antes de publicar

- [ ] Completar los datos de la sección 2 y actualizar `LEGAL_VERSION` si cambia el texto.
- [ ] Revisión de los cuatro documentos por un abogado.
- [ ] Revisión de precios e impuestos por el contador (hoy se declaran como precios finales con impuestos incluidos).
- [ ] Aplicar las dos migraciones y ejecutar la verificación de la sección 5.
- [ ] Confirmar que los buzones `pqrsEmail` y `privacyEmail` existen y tienen responsable asignado.
- [ ] Probar en producción: carrito → consentimiento sin marcar (debe bloquear) → pedido → seguimiento.
- [ ] Probar `/terminos`, `/privacidad`, `/cookies`, `/pqrs` en escritorio y móvil.
- [ ] Verificar el flujo de cancelación y reembolso descrito en los Términos.
- [ ] Programar una revisión semestral de los documentos y de los plazos de retención.
