import type { ReactNode } from 'react'
import { business, LEGAL_LAST_UPDATED, LEGAL_VERSION, looksLikeEmail, priceNotice } from '../config/business'

export type LegalDocSlug = 'terminos' | 'privacidad' | 'cookies' | 'pqrs'

export type LegalSection = { id: string; title: string; body: ReactNode }

export type LegalDoc = {
  slug: LegalDocSlug
  title: string
  shortTitle: string
  summary: string
  sections: LegalSection[]
}

const sicLink = (
  <a href="https://www.sic.gov.co" target="_blank" rel="noreferrer noopener">Superintendencia de Industria y Comercio (SIC)</a>
)

export function ContactEmail({ address }: { address: string }) {
  return looksLikeEmail(address)
    ? <a href={`mailto:${address}`}>{address}</a>
    : <span>{address}</span>
}

export function ContactPhone({ number }: { number: string }) {
  return /^\+?[\d][\d\s().-]{5,}$/.test(number)
    ? <a href={`tel:${number.replace(/[^\d+]/g, '')}`}>{number}</a>
    : <span>{number}</span>
}

export function ProviderIdentification() {
  return <dl className="legal-data">
    <div><dt>Razón social</dt><dd>{business.legalName}</dd></div>
    <div><dt>NIT</dt><dd>{business.taxId}</dd></div>
    <div><dt>Dirección de notificación judicial</dt><dd>{business.legalAddress}, {business.city}</dd></div>
    <div><dt>Teléfono</dt><dd><ContactPhone number={business.phone} /></dd></div>
    <div><dt>Correo electrónico</dt><dd><ContactEmail address={business.email} /></dd></div>
    <div><dt>Atención al consumidor</dt><dd><ContactEmail address={business.pqrsEmail} /></dd></div>
    <div><dt>Protección de datos</dt><dd><ContactEmail address={business.privacyEmail} /></dd></div>
    <div><dt>Horario de atención</dt><dd>{business.hours}</dd></div>
  </dl>
}

const terminos: LegalDoc = {
  slug: 'terminos',
  title: 'Términos y Condiciones del Servicio',
  shortTitle: 'Términos y Condiciones',
  summary: 'Condiciones aplicables a los pedidos que se realizan a través de este sitio.',
  sections: [
    {
      id: 'proveedor',
      title: '1. Identificación del proveedor',
      body: <>
        <p>Este sitio es operado por {business.legalName}, identificado con {business.taxId}, con dirección de notificación judicial en {business.legalAddress}, {business.city}.</p>
        <ProviderIdentification />
        <p>Estos datos se publican en cumplimiento del artículo 50, literal a), de la Ley 1480 de 2011 y del Decreto 1074 de 2015, que exigen informar de forma cierta, suficiente y accesible la identificación del proveedor que ofrece productos por medios electrónicos.</p>
      </>,
    },
    {
      id: 'aceptacion',
      title: '2. Aceptación y formación del contrato',
      body: <>
        <p>Para confirmar un pedido debes marcar la casilla de aceptación de estos Términos y de la Política de Privacidad y Tratamiento de Datos Personales. La aceptación es previa, expresa e informada, y queda registrada junto con el pedido con la versión de los documentos y la fecha de aceptación.</p>
        <p>La versión vigente es la {LEGAL_VERSION}, actualizada el {LEGAL_LAST_UPDATED}. El pedido queda sujeto a la aceptación del restaurante: el código de seguimiento informa su estado. Si el restaurante no puede atenderlo, te lo informaremos y no se generará cobro alguno.</p>
        <p>El sitio está dirigido a personas mayores de edad. Si eres menor, el pedido debe realizarlo un adulto responsable.</p>
      </>,
    },
    {
      id: 'productos',
      title: '3. Productos, disponibilidad e información',
      body: <>
        <p>Los productos, ingredientes y precios del menú pueden variar sin aviso previo. La disponibilidad se confirma al momento en que el restaurante acepta el pedido; si un producto no está disponible, te contactaremos para ofrecer un reemplazo o cancelar el pedido.</p>
        <p>Las fotografías son ilustrativas y pueden presentar variaciones en la presentación del producto. La información de cada plato se publica en castellano, de forma clara y suficiente, conforme al artículo 23 de la Ley 1480 de 2011.</p>
        <p>Si tienes alergias o restricciones alimentarias, indícalas en el campo de notas del pedido o confírmalas por teléfono antes de que el pedido entre en preparación. La información sobre alérgenos se refiere a los ingredientes declarados por los proveedores y no permite garantizar la ausencia total de trazas.</p>
      </>,
    },
    {
      id: 'precios',
      title: '4. Precios, impuestos y pagos',
      body: <>
        <p>{priceNotice}</p>
        <p>El valor del domicilio se muestra en el resumen antes de confirmar el pedido y se suma al total. El consumidor solo está obligado a pagar el precio anunciado, conforme al artículo 26 de la Ley 1480 de 2011.</p>
        <p>El pago se realiza en efectivo al momento de la entrega o de la recogida, según el medio habilitado en el sitio. No solicitamos ni almacenamos números de tarjetas, claves ni datos financieros.</p>
      </>,
    },
    {
      id: 'pedidos',
      title: '5. Realización y confirmación del pedido',
      body: <>
        <p>Para hacer un pedido debes elegir los productos, indicar tu nombre, un teléfono de contacto y, si aplica, la dirección de entrega, y confirmar el total. Al finalizar recibirás un código de seguimiento para consultar el estado. No enviamos códigos de verificación al teléfono.</p>
        <p>Eres responsable de la exactitud de los datos que proporcionas, especialmente el teléfono, la dirección y las referencias de entrega. Si los datos son incorrectos o incompletos, el pedido puede retrasarse o no poder entregarse.</p>
        <p>Mientras tengas un pedido activo (pendiente, aceptado, en preparación o en camino), no podrás crear otro con el mismo teléfono o desde el mismo navegador. Si el pedido se completa o se cancela, podrás volver a pedir.</p>
        <p>El restaurante puede rechazar un pedido por falta de cobertura, por imposibilidad de contacto o por indicios razonables de uso fraudulento. En esos casos no se cobrará el pedido.</p>
      </>,
    },
    {
      id: 'entrega',
      title: '6. Entrega, cobertura y tiempos',
      body: <>
        <p>La cobertura de domicilio comprende: {business.coverageZones}. Los pedidos por fuera de esas zonas pueden rechazarse o coordinarse por un canal de atención.</p>
        <p>El tiempo estimado de entrega es de {business.deliveryEstimate}. {business.deliveryEstimateNote} Por tratarse de una estimación, no constituye una garantía de entrega en un momento exacto.</p>
        <p>Protocolo si el cliente no está en el lugar: el repartidor intentará contacto telefónico y esperará un máximo de diez (10) minutos. Al tratarse de alimentos preparados, el producto no puede revenderse: en ese caso no procede la devolución del valor del producto ni del domicilio, y una nueva entrega podrá generar un cobro adicional.</p>
        <p>Al recibir, verifica que el pedido corresponda a lo solicitado. Las observaciones sobre faltantes o estado del producto deben reportarse por los canales de atención dentro de las veinticuatro (24) horas siguientes.</p>
      </>,
    },
    {
      id: 'cancelaciones',
      title: '7. Cancelaciones, devoluciones y retracto',
      body: <>
        <p><strong>Antes de la aceptación:</strong> puedes cancelar sin costo, por los canales de atención, mientras el restaurante no haya aceptado el pedido.</p>
        <p><strong>Después de la aceptación y antes de la preparación:</strong> puedes solicitar la cancelación por los canales de atención. Si ya se generó el desplazamiento del domiciliario, se cobrará el valor del domicilio.</p>
        <p><strong>Una vez iniciada la preparación:</strong> no procede la cancelación, porque se trata de alimentos perecederos elaborados a tu medida. Por la misma razón, el derecho de retracto de las ventas a distancia (artículo 47 de la Ley 1480 de 2011) no aplica a productos perecederos o elaborados a pedido una vez iniciada su preparación.</p>
        <p><strong>Producto en mal estado, incompleto o diferente:</strong> repórtalo dentro de las veinticuatro (24) horas siguientes con el código de pedido y, si es posible, evidencia fotográfica. Ofreceremos reposición, bonificación o devolución del valor pagado, a tu elección. Las devoluciones en efectivo se coordinan en un plazo máximo de setenta y dos (72) horas.</p>
        <p>Para cancelar o reclamar utiliza los canales indicados en la sección de PQRS e incluye siempre el código de seguimiento del pedido.</p>
      </>,
    },
    {
      id: 'alergias',
      title: '8. Alergias y datos sensibles',
      body: <>
        <p>El campo de notas es opcional. La información sobre alergias o condiciones de salud es un dato sensible en los términos de los artículos 5 y 6 de la Ley 1581 de 2012: su suministro es voluntario, no condiciona la compra y se utiliza únicamente para preparar el pedido.</p>
        <p>Al escribir esa información autorizas expresamente su tratamiento para esa finalidad. Si prefieres no hacerlo, puedes omitirla y confirmar las indicaciones por teléfono antes de la preparación.</p>
        <p>Aun con la información suministrada, el restaurante no puede garantizar la ausencia total de alérgenos o trazas en la cocina. En caso de alergias severas, te recomendamos contactarnos antes de ordenar.</p>
      </>,
    },
    {
      id: 'pqrs',
      title: '9. Peticiones, quejas, reclamos y sugerencias (PQRS)',
      body: <>
        <p>Puedes presentar PQRS por correo electrónico a <ContactEmail address={business.pqrsEmail} />, por teléfono al <ContactPhone number={business.phone} />, por WhatsApp al {business.whatsapp} o de forma presencial en {business.legalAddress}, {business.city}, en el horario {business.hours}.</p>
        <p>Incluye tu nombre, documento de identificación, código del pedido (si existe), la descripción de los hechos y lo que solicitas.</p>
        <p>Confirmaremos el recibo dentro de los tres (3) días hábiles siguientes y responderemos de fondo en un plazo máximo de quince (15) días hábiles, conforme a las normas de protección al consumidor. Si necesitamos más información, el plazo podrá prorrogarse hasta por ocho (8) días hábiles adicionales, informándote las razones.</p>
        <p>Si la respuesta no te satisface, puedes acudir a la {sicLink}.</p>
      </>,
    },
    {
      id: 'responsabilidad',
      title: '10. Responsabilidad y garantías legales',
      body: <>
        <p>Estos Términos no limitan ni excluyen los derechos que la ley reconoce al consumidor, en particular la garantía legal por calidad, idoneidad y seguridad de los productos (Ley 1480 de 2011). Cualquier cláusula en contrario se entenderá ineficaz.</p>
        <p>El sitio puede presentar interrupciones técnicas, mantenimiento o errores. Haremos lo razonable para restablecer el servicio, sin que ello afecte los pedidos ya aceptados.</p>
      </>,
    },
    {
      id: 'propiedad',
      title: '11. Propiedad intelectual y uso del sitio',
      body: <>
        <p>La marca, los textos, las fotografías, el diseño y el código de este sitio son de titularidad del restaurante o de sus licenciantes. No se autoriza su reproducción, distribución o uso comercial sin autorización previa y escrita.</p>
        <p>El uso del sitio debe ser personal y lícito. No está permitido intentar acceder a información de otros usuarios, alterar el funcionamiento del servicio ni realizar pedidos automatizados abusivos.</p>
      </>,
    },
    {
      id: 'vigencia',
      title: '12. Vigencia, modificaciones y ley aplicable',
      body: <>
        <p>Estos Términos rigen desde el {LEGAL_LAST_UPDATED}. Podemos actualizarlos por cambios operativos o normativos; la versión aplicable a tu pedido es la vigente al momento de la aceptación y queda registrada con el pedido.</p>
        <p>Este contrato se rige por las leyes de la República de Colombia. Cualquier controversia podrá presentarse ante la {sicLink} o ante los jueces competentes.</p>
      </>,
    },
  ],
}

const privacidad: LegalDoc = {
  slug: 'privacidad',
  title: 'Política de Privacidad y Tratamiento de Datos Personales',
  shortTitle: 'Política de Privacidad',
  summary: 'Cómo tratamos los datos de quienes hacen pedidos y cómo puedes ejercer tus derechos.',
  sections: [
    {
      id: 'responsable',
      title: '1. Responsable del tratamiento',
      body: <>
        <p>El responsable del tratamiento es {business.legalName}, identificado con {business.taxId}, con dirección de notificación judicial en {business.legalAddress}, {business.city}.</p>
        <p>Canales para asuntos de datos personales: <ContactEmail address={business.privacyEmail} /> y teléfono <ContactPhone number={business.phone} />, en el horario {business.hours}.</p>
        <p>Esta política aplica a los datos que tratamos a través de este sitio web, del panel administrativo del restaurante y de los pedidos realizados por cualquier canal habilitado.</p>
      </>,
    },
    {
      id: 'marco',
      title: '2. Marco normativo',
      body: <>
        <p>Tratamos los datos personales conforme a la Ley 1581 de 2012, el Decreto 1377 de 2013 (compilado en el Decreto 1074 de 2015), la Ley 1480 de 2011 y las demás normas que las modifiquen o sustituyan.</p>
      </>,
    },
    {
      id: 'datos',
      title: '3. Datos que tratamos',
      body: <>
        <ul>
          <li><strong>Identificación y contacto del cliente:</strong> nombre y teléfono. El teléfono es obligatorio para coordinar la entrega; no enviamos códigos de verificación.</li>
          <li><strong>Identificador del navegador:</strong> un número aleatorio que se guarda en tu navegador para evitar que se creen pedidos duplicados.</li>
          <li><strong>Datos de entrega:</strong> dirección física, barrio y referencias, únicamente cuando el pedido es a domicilio.</li>
          <li><strong>Notas del pedido:</strong> indicaciones de preparación, incluidas alergias o condiciones de salud. Son datos sensibles y su suministro es opcional.</li>
          <li><strong>Datos del pedido:</strong> productos, cantidades, valores, tipo de entrega y estado.</li>
          <li><strong>Dirección IP:</strong> se registra de forma temporal y exclusiva para limitar pedidos abusivos. Se elimina automáticamente después de {business.retention.rateLimitHours} hora(s).</li>
          <li><strong>Panel administrativo:</strong> correo electrónico y credenciales de las personas autorizadas por el restaurante. No corresponde a datos de clientes.</li>
        </ul>
        <p>No solicitamos ni almacenamos datos financieros, números de tarjetas ni claves bancarias. En el checkout no pedimos documento de identidad; cuando atiendas una PQRS podemos solicitar tu documento como soporte de la reclamación.</p>
      </>,
    },
    {
      id: 'finalidades',
      title: '4. Finalidades del tratamiento',
      body: <>
        <ul>
          <li>Recibir, preparar, cobrar y entregar el pedido.</li>
          <li>Contactarte para confirmar o coordinar la entrega y atender novedades.</li>
          <li>Atender PQRS, devoluciones y garantías.</li>
          <li>Prevenir fraudes y pedidos abusivos mediante el control temporal de solicitudes.</li>
          <li>Cumplir obligaciones legales, contables y de protección al consumidor.</li>
          <li>Generar estadísticas internas agregadas después de anonimizar los datos.</li>
        </ul>
        <p>No utilizamos tus datos para publicidad de terceros, no elaboramos perfiles comerciales y no vendemos ni cedemos bases de datos.</p>
      </>,
    },
    {
      id: 'autorizacion',
      title: '5. Autorización, prueba y revocatoria',
      body: <>
        <p>La autorización se otorga de forma previa, expresa e informada al marcar la casilla de aceptación en el checkout. Registramos la versión de los documentos aceptados y la fecha de aceptación junto con el pedido, como evidencia del consentimiento.</p>
        <p>Solo tratamos los datos necesarios para gestionar el pedido. Si no autorizas el tratamiento, no podremos completar la compra, porque necesitamos al menos tu nombre y, en domicilio, la dirección de entrega.</p>
        <p>Puedes revocar la autorización en cualquier momento escribiendo a <ContactEmail address={business.privacyEmail} />. La revocatoria no tiene efectos retroactivos y puede impedir la prestación de servicios pendientes.</p>
      </>,
    },
    {
      id: 'sensibles',
      title: '6. Datos sensibles: alergias y condiciones de salud',
      body: <>
        <p>La información sobre alergias o condiciones de salud es un dato sensible. De acuerdo con el artículo 6 de la Ley 1581 de 2012, su suministro es facultativo: no estás obligado a proporcionarla y su omisión no impide realizar el pedido.</p>
        <p>Cuando decides escribirla en las notas, otorgas una autorización explícita para tratarla con la única finalidad de preparar tu pedido. No la usamos para otros fines, no la compartimos con terceros ajenos a la preparación y no la utilizamos en comunicaciones comerciales.</p>
        <p>Si tienes alergias severas, te recomendamos confirmar las indicaciones por teléfono antes de la preparación y considerar que la cocina manipula múltiples ingredientes.</p>
      </>,
    },
    {
      id: 'encargados',
      title: '7. Encargados, terceros y transferencias internacionales',
      body: <>
        <p>Para operar el servicio contamos con proveedores tecnológicos que tratan datos por nuestra cuenta y bajo obligaciones contractuales de confidencialidad y seguridad:</p>
        <ul>
          <li><strong>Supabase Inc.</strong> (base de datos PostgreSQL alojada en Amazon Web Services) para almacenar pedidos y el menú.</li>
          <li><strong>Vercel Inc.</strong> para el alojamiento del sitio web.</li>
          <li><strong>Personal de cocina y repartidores:</strong> reciben nombre, teléfono, dirección, indicaciones del pedido y valor a cobrar, exclusivamente para preparar y entregar.</li>
        </ul>
        <p>Estos proveedores pueden almacenar y procesar datos fuera de Colombia, principalmente en Estados Unidos. Al aceptar esta política autorizas esa transferencia internacional en los términos de la Ley 1581 de 2012 y del Decreto 1377 de 2013.</p>
        <p>No compartimos datos con terceros para fines publicitarios ni cedemos bases de datos a otras empresas.</p>
      </>,
    },
    {
      id: 'conservacion',
      title: '8. Conservación y anonimización',
      body: <>
        <p>Conservamos los datos de los pedidos durante {business.retention.ordersMonths} meses desde su entrega. Después de ese plazo, el nombre, el teléfono, la dirección, las notas y el identificador del navegador se eliminan de forma automática (anonimización); se conservan únicamente valores, fechas y estado, con fines estadísticos y de cumplimiento contable.</p>
        <p>La dirección IP asociada al control de pedidos se elimina después de {business.retention.rateLimitHours} hora(s). Los datos de PQRS se conservan hasta por {business.retention.pqrsMonths} meses.</p>
        <p>Puedes solicitar la supresión anticipada de tus datos; atenderemos la solicitud salvo que exista un deber legal o contractual de conservarlos.</p>
      </>,
    },
    {
      id: 'seguridad',
      title: '9. Medidas de seguridad',
      body: <>
        <p>Aplicamos medidas técnicas y organizativas razonables: conexión cifrada (HTTPS), acceso al panel administrativo mediante autenticación y roles, reglas de acceso a nivel de fila en la base de datos, validación de los pedidos en el servidor y minimización de datos.</p>
        <p>Ningún sistema es completamente invulnerable. Si se presenta un incidente que afecte datos personales, lo gestionaremos y lo reportaremos a la autoridad competente cuando corresponda.</p>
      </>,
    },
    {
      id: 'derechos',
      title: '10. Tus derechos y cómo ejercerlos',
      body: <>
        <p>Como titular de los datos puedes conocer, actualizar, rectificar y suprimir tu información, revocar la autorización y presentar quejas, conforme a los artículos 8, 14 y 15 de la Ley 1581 de 2012.</p>
        <p>Para ejercer estos derechos escribe a <ContactEmail address={business.privacyEmail} /> o acude a {business.legalAddress}, {business.city}. Incluye tu nombre completo, documento de identificación, la descripción de tu solicitud, el código del pedido si existe y un medio de contacto.</p>
        <p>Las consultas se responden dentro de los diez (10) días hábiles siguientes, prorrogables por cinco (5) días hábiles más. Los reclamos se responden dentro de los quince (15) días hábiles siguientes, prorrogables por ocho (8) días hábiles más. Si la solicitud está incompleta, te pediremos completarla.</p>
        <p>Si consideras que no atendimos correctamente tu solicitud, puedes presentar una queja ante la {sicLink}.</p>
      </>,
    },
    {
      id: 'menores',
      title: '11. Menores de edad',
      body: <>
        <p>El servicio está dirigido a personas mayores de edad. No recolectamos conscientemente datos de menores de edad; si un menor necesita hacer un pedido, debe realizarlo un adulto responsable. Si detectamos datos de un menor sin autorización, procederemos a su eliminación.</p>
      </>,
    },
    {
      id: 'cambios',
      title: '12. Cambios y vigencia',
      body: <>
        <p>Esta política corresponde a la versión {LEGAL_VERSION}, actualizada el {LEGAL_LAST_UPDATED}. Los cambios sustanciales se informarán en el sitio antes de su entrada en vigencia; la versión aceptada queda registrada en cada pedido.</p>
        <p>El aviso de privacidad que se muestra antes de recolectar los datos resume esta política y se complementa con su texto completo.</p>
      </>,
    },
  ],
}

const cookies: LegalDoc = {
  slug: 'cookies',
  title: 'Aviso de Cookies y Almacenamiento Local',
  shortTitle: 'Cookies y almacenamiento',
  summary: 'Qué guardamos en tu navegador, para qué sirve y cómo eliminarlo.',
  sections: [
    {
      id: 'que-usamos',
      title: '1. Qué utilizamos y qué no',
      body: <>
        <p>Este sitio utiliza el almacenamiento local del navegador (<em>localStorage</em>) para recordar datos técnicos necesarios para el servicio. No utilizamos cookies de publicidad, ni herramientas de analítica de terceros, ni píxeles de seguimiento.</p>
        <p>No creamos perfiles publicitarios, no rastreamos tu navegación en otros sitios y no compartimos identificadores con redes publicitarias.</p>
      </>,
    },
    {
      id: 'claves',
      title: '2. Datos que guardamos en tu navegador',
      body: <>
        <table className="legal-table">
          <thead><tr><th>Clave</th><th>Finalidad</th><th>Duración</th></tr></thead>
          <tbody>
            <tr><td><code>restaurant-cart</code></td><td>Guarda el carrito de compras (productos y cantidades) para que no se pierda al recargar la página.</td><td>Hasta confirmar el pedido o borrar los datos del navegador.</td></tr>
            <tr><td><code>storage-notice-ack</code></td><td>Recuerda que ya viste este aviso para no mostrarlo nuevamente.</td><td>Hasta que cambie la versión de este aviso o borres los datos.</td></tr>
            <tr><td><code>restaurant-client-id</code></td><td>Identificador aleatorio del navegador para evitar que se creen pedidos duplicados.</td><td>Hasta que borres los datos del navegador.</td></tr>
            <tr><td><code>restaurant-last-order</code></td><td>Código del último pedido para mostrarte el acceso al seguimiento.</td><td>Hasta completar o cancelar el pedido, o borrar los datos.</td></tr>
            <tr><td><code>sb-&lt;proyecto&gt;-auth-token</code></td><td>Sesión del panel administrativo. Solo aplica al personal autorizado del restaurante, no a los clientes.</td><td>Hasta cerrar sesión o hasta que expire la sesión.</td></tr>
          </tbody>
        </table>
        <p>El carrito contiene únicamente identificadores de platos y cantidades; no incluye tu nombre ni tu dirección. El identificador del navegador es un número aleatorio que no revela datos personales. Los datos personales se envían al restaurante solo cuando confirmas el pedido.</p>
      </>,
    },
    {
      id: 'terceros',
      title: '3. Recursos de terceros',
      body: <>
        <p>El menú y las imágenes se cargan desde el dominio de este sitio. No cargamos tipografías, mapas, videos, botones sociales ni scripts de terceros.</p>
        <p>La base de datos y el alojamiento son prestados por Supabase y Vercel, que reciben las solicitudes técnicas necesarias para responder a tu visita; su tratamiento se describe en la Política de Privacidad.</p>
        <p>Si en el futuro se incorpora un recurso externo (por ejemplo, imágenes alojadas en otro dominio), actualizaremos este aviso antes de activarlo y, cuando no sea estrictamente necesario, solicitaremos tu consentimiento.</p>
      </>,
    },
    {
      id: 'base',
      title: '4. Base legal',
      body: <>
        <p>El almacenamiento descrito es estrictamente necesario para prestar el servicio solicitado (carrito de compras y sesión del personal), por lo que no requiere consentimiento previo. Aun así, informamos su existencia, finalidad y duración, y ofrecemos un mecanismo para eliminarlo.</p>
        <p>No utilizamos cookies o almacenamiento no esenciales.</p>
      </>,
    },
    {
      id: 'gestion',
      title: '5. Cómo eliminar estos datos',
      body: <>
        <p>En el aviso que aparece en el sitio puedes usar el botón <strong>Borrar datos guardados</strong>. También puedes eliminar los datos del sitio desde la configuración de tu navegador (privacidad y seguridad, cookies y datos de sitios).</p>
        <p>Si borras el carrito, perderás los productos que habías seleccionado. La eliminación de la sesión del panel administrativo cerrará la sesión del personal.</p>
      </>,
    },
    {
      id: 'cambios-cookies',
      title: '6. Cambios en este aviso',
      body: <>
        <p>Este aviso corresponde a la versión {LEGAL_VERSION}, actualizada el {LEGAL_LAST_UPDATED}. Si cambiamos las claves almacenadas o su finalidad, publicaremos una nueva versión y volveremos a mostrarte el aviso.</p>
      </>,
    },
  ],
}

const pqrs: LegalDoc = {
  slug: 'pqrs',
  title: 'Peticiones, Quejas, Reclamos y Sugerencias',
  shortTitle: 'PQRS',
  summary: 'Canales, plazos y datos que necesitamos para atender tu solicitud.',
  sections: [
    {
      id: 'canales',
      title: '1. Canales de atención',
      body: <>
        <ul>
          <li><strong>Correo electrónico:</strong> <ContactEmail address={business.pqrsEmail} /></li>
          <li><strong>Teléfono:</strong> <ContactPhone number={business.phone} /></li>
          <li><strong>WhatsApp:</strong> {business.whatsapp}</li>
          <li><strong>Presencial:</strong> {business.legalAddress}, {business.city}</li>
        </ul>
        <p>Horario de atención: {business.hours}. Las solicitudes recibidas fuera de ese horario se entienden presentadas el siguiente día hábil.</p>
      </>,
    },
    {
      id: 'contenido',
      title: '2. Qué debe incluir tu solicitud',
      body: <>
        <ul>
          <li>Nombre completo y documento de identificación.</li>
          <li>Medio de contacto (teléfono o correo electrónico).</li>
          <li>Código del pedido o de seguimiento, si la solicitud se relaciona con una compra.</li>
          <li>Descripción clara de los hechos y de lo que solicitas.</li>
          <li>Pruebas o soportes, si los tienes (fotografías, comprobantes).</li>
        </ul>
      </>,
    },
    {
      id: 'tipos',
      title: '3. Tipos de solicitud',
      body: <>
        <ul>
          <li><strong>Petición:</strong> solicitud de información o de una actuación.</li>
          <li><strong>Queja:</strong> inconformidad con la atención recibida.</li>
          <li><strong>Reclamo:</strong> inconformidad con el producto, el precio, la entrega o la garantía.</li>
          <li><strong>Sugerencia o felicitación:</strong> aportes para mejorar el servicio.</li>
        </ul>
      </>,
    },
    {
      id: 'plazos',
      title: '4. Plazos de respuesta',
      body: <>
        <p>Confirmaremos el recibo de tu solicitud dentro de los tres (3) días hábiles siguientes y responderemos de fondo en un plazo máximo de quince (15) días hábiles, conforme a las normas de protección al consumidor.</p>
        <p>Si necesitamos información adicional o pruebas, el plazo podrá prorrogarse hasta por ocho (8) días hábiles más, informándote las razones de la prórroga.</p>
        <p>Los plazos anteriores no aplican a las solicitudes de datos personales, que se rigen por los términos de la Política de Privacidad (10 días hábiles para consultas y 15 para reclamos).</p>
      </>,
    },
    {
      id: 'datos-pqrs',
      title: '5. Tratamiento de los datos de tu solicitud',
      body: <>
        <p>Los datos que proporciones para una PQRS se utilizan exclusivamente para atenderla y para llevar el registro de la respuesta. Se conservan hasta por {business.retention.pqrsMonths} meses y se tratan conforme a la Política de Privacidad y a la Ley 1581 de 2012.</p>
        <p>Si la solicitud involucra datos sensibles, solo los tratarremos para resolver el caso y con tu autorización.</p>
      </>,
    },
    {
      id: 'escalamiento',
      title: '6. Si no estás conforme con la respuesta',
      body: <>
        <p>Si consideras que tu solicitud no fue atendida correctamente, puedes acudir a la {sicLink}, entidad competente para vigilar la protección al consumidor en Colombia.</p>
        <p>También puedes presentar la solicitud ante los jueces competentes, sin perjuicio de los demás mecanismos legales disponibles.</p>
      </>,
    },
    {
      id: 'recordatorio',
      title: '7. Recordatorio sobre precios y entrega',
      body: <>
        <p>{priceNotice}</p>
        <p>El tiempo de entrega informado en el sitio es estimado y puede variar por clima, tráfico y volumen de pedidos. Para consultar el estado de un pedido, utiliza el código de seguimiento entregado al confirmar la compra.</p>
      </>,
    },
  ],
}

export const LEGAL_DOCS: LegalDoc[] = [terminos, privacidad, cookies, pqrs]

export function isLegalSlug(value: string): value is LegalDocSlug {
  return LEGAL_DOCS.some((doc) => doc.slug === value)
}

export function getLegalDoc(slug: string): LegalDoc {
  return LEGAL_DOCS.find((doc) => doc.slug === slug) ?? LEGAL_DOCS[0]
}
