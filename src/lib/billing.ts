export type PaymentMethod = 'cash' | 'nequi' | 'daviplata' | 'card' | 'transfer'

export type PaymentMethodOption = {
  value: PaymentMethod
  label: string
  short: string
  cash: boolean
}

/** Medios de pago disponibles al dividir un cobro. */
export const PAYMENT_METHODS: PaymentMethodOption[] = [
  { value: 'cash', label: 'Efectivo', short: 'Efectivo', cash: true },
  { value: 'nequi', label: 'Nequi', short: 'Nequi', cash: false },
  { value: 'daviplata', label: 'Daviplata', short: 'Daviplata', cash: false },
  { value: 'card', label: 'Tarjeta débito/crédito', short: 'Tarjeta', cash: false },
  { value: 'transfer', label: 'Transferencia bancaria', short: 'Transferencia', cash: false },
]

export const PAYMENT_METHOD_LABELS: Record<string, string> = Object.fromEntries(
  PAYMENT_METHODS.map((method) => [method.value, method.label]),
)

export function isCashMethod(method?: string | null): boolean {
  return method === 'cash'
}

export function paymentMethodLabel(method?: string | null): string {
  if (!method) return 'Sin definir'
  return PAYMENT_METHOD_LABELS[method] ?? method
}

export const roundMoney = (value: number): number => {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return 0
  return Math.round((amount + Number.EPSILON) * 100) / 100
}

export type OrderPayment = {
  id?: string
  method?: string | null
  amount?: number | string | null
  reference?: string | null
  created_at?: string
}

export type PaymentSummary = {
  total: number
  paid: number
  pending: number
  overpaid: number
  cash: number
  electronic: number
  cashCount: number
  electronicCount: number
  settled: boolean
  methods: { method: string; label: string; amount: number }[]
}

/**
 * Resume los pagos registrados de un pedido. No asume que un pedido esté pago:
 * `paid` sale solo de las filas de `order_payments`.
 */
export function summarizePayments(payments: OrderPayment[] | null | undefined, total: number | string | null | undefined): PaymentSummary {
  const orderTotal = roundMoney(Number(total) || 0)
  const byMethod = new Map<string, number>()
  let paid = 0
  let cash = 0
  let electronic = 0
  let cashCount = 0
  let electronicCount = 0

  for (const payment of payments ?? []) {
    const amount = roundMoney(Number(payment.amount) || 0)
    if (amount <= 0) continue
    const method = payment.method || 'cash'
    byMethod.set(method, roundMoney((byMethod.get(method) ?? 0) + amount))
    paid = roundMoney(paid + amount)
    if (isCashMethod(method)) {
      cash = roundMoney(cash + amount)
      cashCount += 1
    } else {
      electronic = roundMoney(electronic + amount)
      electronicCount += 1
    }
  }

  const pending = Math.max(0, roundMoney(orderTotal - paid))
  const overpaid = Math.max(0, roundMoney(paid - orderTotal))

  return {
    total: orderTotal,
    paid,
    pending,
    overpaid,
    cash,
    electronic,
    cashCount,
    electronicCount,
    settled: orderTotal > 0 && pending === 0,
    methods: [...byMethod.entries()].map(([method, amount]) => ({ method, label: paymentMethodLabel(method), amount })),
  }
}

export type SaleLike = {
  total?: number | null
  payment_method?: string | null
  order_payments?: OrderPayment[] | null
}

export type SaleSplit = { cash: number; electronic: number; hasCash: boolean; hasElectronic: boolean }

/**
 * Divide una venta entre efectivo y medios electrónicos.
 *
 * Si hay pagos registrados manda el detalle del cobro (permite medios mixtos).
 * Si no, se conserva el comportamiento histórico de `payment_method` para no
 * alterar las cajas ya cerradas.
 */
export function splitOrderSale(order: SaleLike): SaleSplit {
  const payments = (order.order_payments ?? []).filter((payment) => roundMoney(Number(payment.amount) || 0) > 0)
  const total = roundMoney(Number(order.total) || 0)

  if (payments.length > 0) {
    const summary = summarizePayments(payments, total)
    return {
      cash: summary.cash,
      electronic: summary.electronic,
      hasCash: summary.cash > 0,
      hasElectronic: summary.electronic > 0,
    }
  }

  if (order.payment_method === 'transfer') {
    return { cash: 0, electronic: total, hasCash: false, hasElectronic: total > 0 }
  }
  return { cash: total, electronic: 0, hasCash: total > 0, hasElectronic: false }
}

export type SalesSummary = {
  cashTotal: number
  transferTotal: number
  cashCount: number
  transferCount: number
}

export function summarizeSales(orders: SaleLike[]): SalesSummary {
  let cashTotal = 0
  let transferTotal = 0
  let cashCount = 0
  let transferCount = 0
  for (const order of orders) {
    const split = splitOrderSale(order)
    cashTotal = roundMoney(cashTotal + split.cash)
    transferTotal = roundMoney(transferTotal + split.electronic)
    if (split.hasCash) cashCount += 1
    if (split.hasElectronic) transferCount += 1
  }
  return { cashTotal, transferTotal, cashCount, transferCount }
}

/** Saldo pendiente de un pedido según los pagos registrados. */
export function pendingBalance(order: SaleLike): number {
  return summarizePayments(order.order_payments, order.total).pending
}

export type InvoiceAmounts = { total: number; base: number; tax: number; rate: number }

/**
 * Los precios del menú incluyen impuestos, así que la base se despeja del total:
 * base = total / (1 + tasa) y el impuesto es la diferencia (sin descuadres).
 */
export function calculateInvoiceAmounts(total: number | string | null | undefined, taxRate: number | string | null | undefined): InvoiceAmounts {
  const gross = roundMoney(Number(total) || 0)
  const rate = Math.min(0.99, Math.max(0, Number(taxRate) || 0))
  const base = roundMoney(gross / (1 + rate))
  return { total: gross, base, tax: roundMoney(gross - base), rate }
}

export function formatInvoiceNumber(prefix: string | null | undefined, number: number | string | null | undefined): string {
  const cleanPrefix = String(prefix ?? '').trim() || 'POS'
  const digits = Math.max(0, Math.trunc(Number(number) || 0))
  return `${cleanPrefix}-${String(digits).padStart(6, '0')}`
}

export function taxRatePercent(rate: number | string | null | undefined): string {
  return `${((Number(rate) || 0) * 100).toFixed(2).replace(/\.?0+$/, '')}%`
}

export type ExpenseCategory = { value: string; label: string; hint?: string }

/** Categorías alineadas con el check de `cash_movements.category`. */
export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  { value: 'hielo', label: 'Hielo', hint: 'Bolsa o bloque de hielo' },
  { value: 'insumos', label: 'Insumos', hint: 'Mercado, verduras, aseo' },
  { value: 'propinas', label: 'Propinas repartidores', hint: 'Pago a domiciliarios' },
  { value: 'servicios', label: 'Servicios', hint: 'Agua, luz, gas, internet' },
  { value: 'transporte', label: 'Transporte', hint: 'Fletes y mandados' },
  { value: 'mantenimiento', label: 'Mantenimiento', hint: 'Reparaciones menores' },
  { value: 'otros', label: 'Otros', hint: 'Gasto menor no clasificado' },
]

export const EXPENSE_CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  EXPENSE_CATEGORIES.map((category) => [category.value, category.label]),
)

export type CashMovementLike = {
  type?: string | null
  category?: string | null
  amount?: number | string | null
  description?: string | null
  created_at?: string
}

export type ExpenseSummary = {
  total: number
  count: number
  byCategory: { category: string; label: string; amount: number; count: number }[]
}

/** Suma solo gastos operativos (`expense`); los retiros no son gasto del negocio. */
export function summarizeExpenses(movements: CashMovementLike[]): ExpenseSummary {
  const byCategory = new Map<string, { amount: number; count: number }>()
  let total = 0
  let count = 0

  for (const movement of movements) {
    if (movement.type !== 'expense') continue
    const amount = roundMoney(Number(movement.amount) || 0)
    if (amount <= 0) continue
    const category = movement.category && EXPENSE_CATEGORY_LABELS[movement.category] ? movement.category : 'otros'
    const current = byCategory.get(category) ?? { amount: 0, count: 0 }
    byCategory.set(category, { amount: roundMoney(current.amount + amount), count: current.count + 1 })
    total = roundMoney(total + amount)
    count += 1
  }

  return {
    total,
    count,
    byCategory: [...byCategory.entries()]
      .map(([category, value]) => ({ category, label: EXPENSE_CATEGORY_LABELS[category] ?? category, ...value }))
      .sort((a, b) => b.amount - a.amount),
  }
}

export function isSameLocalDay(value: string | null | undefined, date = new Date()): boolean {
  if (!value) return false
  return new Date(value).toLocaleDateString('en-CA') === date.toLocaleDateString('en-CA')
}

export function daysSince(value: string | null | undefined, date = new Date()): number {
  if (!value) return 0
  const from = new Date(value)
  from.setHours(0, 0, 0, 0)
  const to = new Date(date)
  to.setHours(0, 0, 0, 0)
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86_400_000))
}

/** JSON listo para entregar a un proveedor tecnológico de facturación. */
export function buildInvoiceExport(invoice: {
  prefix?: string | null
  number?: number | null
  document_type?: string | null
  customer_name?: string | null
  customer_tax_id?: string | null
  customer_email?: string | null
  base_amount?: number | string | null
  tax_rate?: number | string | null
  tax_amount?: number | string | null
  total?: number | string | null
  issued_at?: string | null
  status?: string | null
}, order: {
  id?: string
  track_token?: string | null
  created_at?: string | null
  order_type?: string | null
  notes?: string | null
  order_items?: { quantity?: number | null; unit_price?: number | string | null; dishes?: { nombre?: string | null } | null }[] | null
  order_payments?: OrderPayment[] | null
} | null) {
  return {
    documento: {
      tipo: invoice.document_type === 'electronic' ? 'factura_electronica' : 'documento_equivalente_pos',
      prefijo: invoice.prefix ?? null,
      numero: invoice.number ?? null,
      numero_completo: formatInvoiceNumber(invoice.prefix, invoice.number),
      estado: invoice.status ?? null,
      emitido_en: invoice.issued_at ?? null,
    },
    adquirente: {
      nombre: invoice.customer_name ?? null,
      identificacion: invoice.customer_tax_id ?? null,
      correo: invoice.customer_email ?? null,
    },
    valores: {
      base: Number(invoice.base_amount) || 0,
      impuesto: Number(invoice.tax_amount) || 0,
      tasa: Number(invoice.tax_rate) || 0,
      total: Number(invoice.total) || 0,
    },
    pedido: order ? {
      id: order.id ?? null,
      codigo: order.track_token ?? null,
      creado_en: order.created_at ?? null,
      tipo: order.order_type ?? null,
      notas: order.notes ?? null,
      items: (order.order_items ?? []).map((item) => ({
        descripcion: item.dishes?.nombre ?? 'Producto',
        cantidad: Number(item.quantity) || 0,
        valor_unitario: Number(item.unit_price) || 0,
      })),
      pagos: (order.order_payments ?? []).map((payment) => ({
        metodo: payment.method ?? null,
        valor: Number(payment.amount) || 0,
      })),
    } : null,
    aviso: 'Documento generado por el panel. La transmisión a la DIAN requiere un proveedor tecnológico habilitado.',
  }
}

export const MIGRATION_HINT = 'Aplica la migración 20261118000000_billing_and_finance.sql para habilitar esta función.'

export type FiscalSettings = {
  invoice_prefix?: string | null
  invoice_tax_rate?: number | string | null
  invoice_resolution?: string | null
  invoice_range_from?: number | string | null
  invoice_range_to?: number | string | null
  invoice_business_name?: string | null
  invoice_tax_id?: string | null
  invoice_address?: string | null
  invoice_phone?: string | null
  ticket_width?: number | string | null
  auto_invoice_on_complete?: boolean | null
}

export const DEFAULT_FISCAL_SETTINGS: FiscalSettings = {
  invoice_prefix: 'POS',
  invoice_tax_rate: 0.08,
  invoice_resolution: '',
  invoice_range_from: null,
  invoice_range_to: null,
  invoice_business_name: '',
  invoice_tax_id: '',
  invoice_address: '',
  invoice_phone: '',
  ticket_width: 80,
  auto_invoice_on_complete: true,
}

/** Datos que encabezan comandas y facturas; usa la configuración guardada y cae al código. */
export function resolveTicketBusiness(settings: FiscalSettings | null | undefined, fallbackName?: string) {
  const value = settings ?? {}
  return {
    name: String(value.invoice_business_name ?? '').trim() || fallbackName || 'Restaurante',
    taxId: String(value.invoice_tax_id ?? '').trim(),
    address: String(value.invoice_address ?? '').trim(),
    phone: String(value.invoice_phone ?? '').trim(),
  }
}

export function isMissingTableError(error: unknown): boolean {
  const value = error as { code?: string; message?: string } | null
  if (!value) return false
  return value.code === '42P01'
    || value.code === 'PGRST205'
    || /could not find the table|relation .* does not exist/i.test(value.message ?? '')
}

/** Tabla, columna o función que aún no existe porque falta aplicar la migración. */
export function isMissingSchemaError(error: unknown): boolean {
  const value = error as { code?: string; message?: string } | null
  if (!value) return false
  return isMissingTableError(error)
    || value.code === '42703'
    || value.code === 'PGRST202'
    || value.code === 'PGRST204'
    || /column .* does not exist|could not find the function/i.test(value.message ?? '')
}

export function paymentErrorMessage(error: unknown): string {
  if (isMissingSchemaError(error)) return MIGRATION_HINT
  const message = (error as { message?: string } | null)?.message ?? ''
  if (/ya tiene un documento/i.test(message)) return 'Este pedido ya tiene una factura emitida.'
  if (/rango de numeración/i.test(message)) return 'Se agotó el rango de numeración autorizado. Revisa la resolución en Configuración.'
  if (/saldo pendiente/i.test(message)) return 'El pago supera el saldo pendiente del pedido.'
  if (/cancelado/i.test(message)) return 'El pedido está cancelado.'
  if (/Solo se facturan pedidos completados/i.test(message)) return 'Solo se pueden facturar pedidos completados.'
  return message || 'No se pudo completar la operación.'
}
