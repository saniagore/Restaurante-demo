/**
 * Datos legales y operativos del restaurante.
 *
 * Los valores escritos en mayúsculas son marcadores pendientes: no se debe
 * inventar información. Al completar los datos reales hay que actualizar
 * también LEGAL_VERSION con la fecha del cambio, porque esa versión queda
 * registrada en cada pedido como prueba del consentimiento aceptado.
 *
 * Referencias: Ley 1480 de 2011 (arts. 23, 26 y 50) y Ley 1581 de 2012.
 */
export const LEGAL_VERSION = '2026-11-15'
export const LEGAL_LAST_UPDATED = '15 de noviembre de 2026'

export const business = {
  brand: 'mesa abierta',
  tagline: 'cocina para compartir',
  legalName: 'RAZON SOCIAL O NOMBRE DEL TITULAR',
  taxId: 'NUMERO DE IDENTIFICACION TRIBUTARIA (NIT)',
  legalAddress: 'DIRECCION DE NOTIFICACION JUDICIAL',
  city: 'CIUDAD Y DEPARTAMENTO',
  phone: 'TELEFONO DE ATENCION AL CLIENTE',
  whatsapp: 'NUMERO DE WHATSAPP DE ATENCION',
  email: 'CORREO ELECTRONICO DE ATENCION',
  pqrsEmail: 'CORREO PARA PETICIONES, QUEJAS Y RECLAMOS',
  privacyEmail: 'CORREO PARA DERECHOS DE DATOS PERSONALES',
  hours: 'HORARIO DE ATENCION AL PUBLICO',
  coverageZones: 'ZONAS O BARRIOS DE COBERTURA DE DOMICILIO',
  deliveryEstimate: '25 - 35 minutos',
  deliveryEstimateNote: 'Tiempo estimado. Puede variar por clima, tráfico y volumen de pedidos.',
  retention: {
    ordersMonths: 12,
    rateLimitHours: 1,
    pqrsMonths: 24,
  },
} as const

export const priceNotice =
  'Precios en pesos colombianos (COP). Los precios publicados son precios finales al consumidor e incluyen todos los impuestos y costos aplicables. El valor del domicilio se informa antes de confirmar el pedido.'

export const allergensNotice =
  'El ingreso de datos sobre alergias es opcional y se utilizará únicamente para la preparación de tu pedido.'

export const looksLikeEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
export const looksLikePhone = (value: string): boolean => /^\+?[\d][\d\s().-]{5,}$/.test(value)
