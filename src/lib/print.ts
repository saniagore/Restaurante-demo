import { formatInvoiceNumber, paymentMethodLabel } from './billing'

export type TicketWidth = 58 | 80

export function normalizeTicketWidth(value: unknown): TicketWidth {
  return Number(value) === 58 ? 58 : 80
}

export type TicketLine = {
  name: string
  quantity: number
  unitPrice?: number
  total?: number
  note?: string
}

export type TicketOptions = {
  width: TicketWidth
  businessName: string
  title: string
  subtitle?: string
  code?: string
  meta?: [string, string][]
  items: TicketLine[]
  totals?: [string, string][]
  payments?: [string, string][]
  footer?: string
  note?: string
  showPrices?: boolean
  legal?: string
}

export type TicketOrder = {
  id?: string
  track_token?: string | null
  customer_name?: string | null
  customer_phone?: string | null
  order_type?: string | null
  status?: string | null
  notes?: string | null
  total?: number | string | null
  created_at?: string | null
  order_items?: {
    id?: string
    quantity?: number | null
    unit_price?: number | string | null
    dishes?: { nombre?: string | null; descripcion?: string | null } | null
    name?: string | null
    dish_name?: string | null
  }[] | null
  order_payments?: { method?: string | null; amount?: number | string | null }[] | null
}

export type TicketBusiness = {
  name: string
  taxId?: string | null
  address?: string | null
  phone?: string | null
}

export type TicketInvoice = {
  prefix?: string | null
  number?: number | null
  document_type?: string | null
  customer_name?: string | null
  customer_tax_id?: string | null
  base_amount?: number | string | null
  tax_rate?: number | string | null
  tax_amount?: number | string | null
  total?: number | string | null
  issued_at?: string | null
  status?: string | null
  invoice_resolution?: string | null
}

const MONEY = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })

export function formatTicketMoney(value: number | string | null | undefined): string {
  return `$ ${MONEY.format(Math.round(Number(value) || 0))}`
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const formatDateTime = (value?: string | null) => value
  ? new Date(value).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
  : ''

const orderCode = (order: TicketOrder) => String(order.track_token || order.id || '').slice(-6).toUpperCase()

const orderTypeLabel = (order: TicketOrder) => order.order_type === 'delivery' ? 'Domicilio' : 'Recoger en local'

function row(label: string, value: string, className = '') {
  return `<div class="row ${className}"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`
}

export function buildTicketHtml(options: TicketOptions): string {
  const width = options.width === 58 ? 58 : 80
  const fontSize = width === 58 ? 9.5 : 11
  const showPrices = options.showPrices !== false

  const items = options.items.map((item) => {
    const quantity = Number(item.quantity) || 1
    const amount = Number(item.total ?? (Number(item.unitPrice) || 0) * quantity) || 0
    return `<div class="item">
      <div class="item-main"><span class="qty">${quantity}×</span><span class="item-name">${escapeHtml(item.name)}</span>${showPrices ? `<span class="item-amount">${escapeHtml(formatTicketMoney(amount))}</span>` : ''}</div>
      ${item.note ? `<div class="item-note">${escapeHtml(item.note)}</div>` : ''}
    </div>`
  }).join('')

  const meta = (options.meta ?? []).map(([label, value]) => row(label, value)).join('')
  const totals = (options.totals ?? []).map(([label, value], index, all) => row(label, value, index === all.length - 1 ? 'total' : '')).join('')
  const payments = (options.payments ?? []).map(([label, value]) => row(label, value)).join('')

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(options.title)} ${escapeHtml(options.code ?? '')}</title>
<style>
  @page { size: ${width}mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body { width: ${width}mm; padding: 4mm 3mm 8mm; font-family: 'Courier New', ui-monospace, monospace; font-size: ${fontSize}px; line-height: 1.35; }
  .header { text-align: center; padding-bottom: 2mm; border-bottom: 1px dashed #000; }
  .business { font-size: ${fontSize + 1}px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
  .business small { display: block; margin-top: .6mm; font-size: ${fontSize - 0.5}px; font-weight: 400; letter-spacing: 0; text-transform: none; }
  .title { margin-top: 2mm; font-size: ${fontSize + 2}px; font-weight: 700; letter-spacing: .08em; }
  .subtitle { font-size: ${fontSize - 0.5}px; }
  .code { margin-top: 1mm; font-size: ${fontSize + 1}px; font-weight: 700; }
  .block { margin-top: 2mm; padding-top: 1.5mm; border-top: 1px dashed #000; }
  .row { display: flex; justify-content: space-between; gap: 2mm; padding: .4mm 0; }
  .row span:first-child { flex: 0 0 auto; }
  .row span:last-child { text-align: right; }
  .row.total { margin-top: 1mm; padding-top: 1mm; border-top: 1px solid #000; font-size: ${fontSize + 2}px; font-weight: 700; }
  .item { padding: .8mm 0; border-bottom: 1px dotted #999; }
  .item-main { display: flex; gap: 1.5mm; align-items: baseline; }
  .qty { flex: 0 0 auto; font-weight: 700; }
  .item-name { flex: 1 1 auto; }
  .item-amount { flex: 0 0 auto; white-space: nowrap; }
  .item-note { padding-left: 6mm; font-size: ${fontSize - 0.5}px; font-style: italic; }
  .items { margin-top: 2mm; }
  .note { margin-top: 2.5mm; padding: 1.5mm; border: 1px solid #000; font-size: ${fontSize - 0.5}px; white-space: pre-wrap; }
  .footer { margin-top: 3mm; padding-top: 2mm; border-top: 1px dashed #000; text-align: center; font-size: ${fontSize - 0.5}px; white-space: pre-wrap; }
  .legal { margin-top: 1.5mm; font-size: ${fontSize - 1}px; text-align: center; }
  .muted { font-size: ${fontSize - 1}px; }
</style>
</head>
<body>
  <header class="header">
    <div class="business">${escapeHtml(options.businessName)}${options.subtitle ? `<small>${escapeHtml(options.subtitle)}</small>` : ''}</div>
    <div class="title">${escapeHtml(options.title)}</div>
    ${options.code ? `<div class="code">${escapeHtml(options.code)}</div>` : ''}
  </header>
  ${meta ? `<section class="block">${meta}</section>` : ''}
  <section class="items">${items || '<div class="muted">Sin productos</div>'}</section>
  ${totals ? `<section class="block">${totals}</section>` : ''}
  ${payments ? `<section class="block">${payments}</section>` : ''}
  ${options.note ? `<div class="note">${escapeHtml(options.note)}</div>` : ''}
  ${options.footer || options.legal ? `<footer class="footer">${options.footer ? escapeHtml(options.footer) : ''}${options.legal ? `<div class="legal">${escapeHtml(options.legal)}</div>` : ''}</footer>` : ''}
</body>
</html>`
}

export function buildKitchenTicket(order: TicketOrder, business: TicketBusiness, width: TicketWidth): string {
  const meta: [string, string][] = [
    ['Hora', formatDateTime(order.created_at)],
    ['Tipo', orderTypeLabel(order)],
  ]
  if (order.customer_name) meta.push(['Cliente', order.customer_name])

  return buildTicketHtml({
    width,
    businessName: business.name,
    title: 'COMANDA COCINA',
    code: `Pedido #${orderCode(order)}`,
    showPrices: false,
    meta,
    items: (order.order_items ?? []).map((item) => ({
      name: item.dishes?.nombre || item.name || item.dish_name || 'Producto',
      quantity: Number(item.quantity) || 1,
    })),
    note: order.notes || '',
    footer: 'Preparar y despachar según el pedido.',
  })
}

export function buildCustomerTicket(order: TicketOrder, business: TicketBusiness, width: TicketWidth, options?: { title?: string; note?: string }): string {
  const items = order.order_items ?? []
  const itemsTotal = items.reduce((sum, item) => sum + (Number(item.unit_price) || 0) * (Number(item.quantity) || 0), 0)
  const total = Number(order.total) || itemsTotal
  const payments = order.order_payments ?? []
  const totals: [string, string][] = []
  if (Math.round(itemsTotal) !== Math.round(total)) totals.push(['Productos', formatTicketMoney(itemsTotal)])
  totals.push(['TOTAL', formatTicketMoney(total)])

  return buildTicketHtml({
    width,
    businessName: business.name,
    subtitle: business.phone || '',
    title: options?.title ?? 'CUENTA',
    code: `Pedido #${orderCode(order)}`,
    meta: [
      ['Fecha', formatDateTime(order.created_at)],
      ['Cliente', order.customer_name || 'Consumidor final'],
      ['Tipo', orderTypeLabel(order)],
    ],
    items: items.map((item) => ({
      name: item.dishes?.nombre || item.name || item.dish_name || 'Producto',
      quantity: Number(item.quantity) || 1,
      unitPrice: Number(item.unit_price) || 0,
    })),
    totals,
    payments: summarizePaymentRows(payments),
    note: options?.note || '',
    footer: 'Gracias por tu visita.',
    legal: 'Documento no fiscal. No es factura electrónica.',
  })
}

function summarizePaymentRows(payments: { method?: string | null; amount?: number | string | null }[]): [string, string][] {
  const grouped = new Map<string, number>()
  for (const payment of payments) {
    const method = payment.method || 'cash'
    grouped.set(method, (grouped.get(method) ?? 0) + (Number(payment.amount) || 0))
  }
  return [...grouped.entries()].map(([method, amount]) => [paymentMethodLabel(method), formatTicketMoney(amount)])
}

export function buildInvoiceTicket(invoice: TicketInvoice, order: TicketOrder, business: TicketBusiness, width: TicketWidth): string {
  const documentLabel = invoice.document_type === 'electronic' ? 'FACTURA ELECTRÓNICA DE VENTA' : 'DOCUMENTO EQUIVALENTE POS'
  const number = formatInvoiceNumber(invoice.prefix, invoice.number)
  const taxRate = `${((Number(invoice.tax_rate) || 0) * 100).toFixed(0)}%`
  const meta: [string, string][] = [
    ['Fecha', formatDateTime(invoice.issued_at)],
    ['Cliente', invoice.customer_name || order.customer_name || 'Consumidor final'],
  ]
  if (invoice.customer_tax_id) meta.push(['Identificación', invoice.customer_tax_id])
  meta.push(['Pedido', `#${orderCode(order)}`])
  if (invoice.invoice_resolution) meta.push(['Resolución', invoice.invoice_resolution])

  return buildTicketHtml({
    width,
    businessName: business.name,
    subtitle: [business.taxId ? `NIT ${business.taxId}` : '', business.address || '', business.phone || ''].filter(Boolean).join(' · '),
    title: documentLabel,
    code: number,
    meta,
    items: (order.order_items ?? []).map((item) => ({
      name: item.dishes?.nombre || item.name || item.dish_name || 'Producto',
      quantity: Number(item.quantity) || 1,
      unitPrice: Number(item.unit_price) || 0,
    })),
    totals: [
      ['Base gravable', formatTicketMoney(invoice.base_amount)],
      [`Impuesto (${taxRate})`, formatTicketMoney(invoice.tax_amount)],
      ['TOTAL', formatTicketMoney(invoice.total)],
    ],
    payments: summarizePaymentRows(order.order_payments ?? []),
    footer: invoice.invoice_resolution ? `Autorización de numeración: ${invoice.invoice_resolution}` : '',
    legal: 'Documento generado por el sistema. La transmisión a la DIAN requiere proveedor tecnológico habilitado.',
  })
}

/**
 * Imprime HTML en un iframe oculto para no abrir ventanas emergentes ni perder
 * la sesión del panel. Devuelve false si el navegador no permite imprimir.
 */
export function printHtml(html: string, title = 'Imprimir'): boolean {
  if (typeof document === 'undefined') return false
  const frame = document.createElement('iframe')
  frame.title = title
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;'
  document.body.appendChild(frame)

  const win = frame.contentWindow
  const doc = win?.document
  if (!win || !doc) {
    frame.remove()
    return false
  }

  doc.open()
  doc.write(html)
  doc.close()

  window.setTimeout(() => {
    try {
      win.focus()
      win.print()
    } finally {
      window.setTimeout(() => frame.remove(), 1500)
    }
  }, 60)

  return true
}
