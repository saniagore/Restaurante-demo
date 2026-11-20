import { describe, expect, it } from 'vitest'
import {
  buildInvoiceExport,
  calculateInvoiceAmounts,
  daysSince,
  formatInvoiceNumber,
  isMissingTableError,
  paymentErrorMessage,
  pendingBalance,
  splitOrderSale,
  summarizeExpenses,
  summarizePayments,
  summarizeSales,
  taxRatePercent,
} from '../src/lib/billing'

describe('facturación', () => {
  it('despeja la base y el impuesto de un precio que ya los incluye', () => {
    expect(calculateInvoiceAmounts(108000, 0.08)).toEqual({ total: 108000, base: 100000, tax: 8000, rate: 0.08 })
    expect(calculateInvoiceAmounts(100000, 0.19)).toEqual({ total: 100000, base: 84033.61, tax: 15966.39, rate: 0.19 })
    expect(calculateInvoiceAmounts(50000, 0)).toEqual({ total: 50000, base: 50000, tax: 0, rate: 0 })
  })

  it('redondea sin perder centavos entre base, impuesto y total', () => {
    const amounts = calculateInvoiceAmounts(33333, 0.08)
    expect(amounts.base + amounts.tax).toBeCloseTo(amounts.total, 6)
  })

  it('formatea el consecutivo con prefijo y seis dígitos', () => {
    expect(formatInvoiceNumber('POS', 7)).toBe('POS-000007')
    expect(formatInvoiceNumber('', 12)).toBe('POS-000012')
    expect(taxRatePercent(0.08)).toBe('8%')
    expect(taxRatePercent(0.1)).toBe('10%')
  })
})

describe('pagos mixtos', () => {
  it('suma varios medios y calcula el saldo pendiente', () => {
    const summary = summarizePayments([
      { method: 'cash', amount: 30000 },
      { method: 'nequi', amount: 20000.5 },
    ], 60000)
    expect(summary.paid).toBe(50000.5)
    expect(summary.pending).toBe(9999.5)
    expect(summary.cash).toBe(30000)
    expect(summary.electronic).toBe(20000.5)
    expect(summary.methods).toHaveLength(2)
    expect(summary.settled).toBe(false)
  })

  it('marca pagos completos y sobrantes', () => {
    expect(summarizePayments([{ method: 'card', amount: 60000 }], 60000).settled).toBe(true)
    const overpaid = summarizePayments([{ method: 'cash', amount: 70000 }], 60000)
    expect(overpaid.pending).toBe(0)
    expect(overpaid.overpaid).toBe(10000)
  })

  it('ignora pagos vacíos o inválidos', () => {
    expect(summarizePayments([{ method: 'cash', amount: 0 }, { method: null, amount: null }], 1000)).toMatchObject({
      paid: 0,
      pending: 1000,
      settled: false,
    })
  })

  it('usa el detalle de pagos y conserva el respaldo de payment_method', () => {
    expect(splitOrderSale({ total: 50000, payment_method: 'cash', order_payments: [{ method: 'cash', amount: 20000 }, { method: 'card', amount: 30000 }] })).toEqual({
      cash: 20000,
      electronic: 30000,
      hasCash: true,
      hasElectronic: true,
    })
    expect(splitOrderSale({ total: 50000, payment_method: 'transfer' })).toEqual({
      cash: 0,
      electronic: 50000,
      hasCash: false,
      hasElectronic: true,
    })
    expect(splitOrderSale({ total: 40000, payment_method: null })).toEqual({
      cash: 40000,
      electronic: 0,
      hasCash: true,
      hasElectronic: false,
    })
  })

  it('cuenta una orden mixta en ambos grupos de la caja', () => {
    const summary = summarizeSales([
      { total: 100000, payment_method: 'cash', order_payments: [{ method: 'cash', amount: 60000 }, { method: 'nequi', amount: 40000 }] },
      { total: 50000, payment_method: 'transfer' },
      { total: 25000, payment_method: 'cash' },
    ])
    expect(summary).toEqual({ cashTotal: 85000, transferTotal: 90000, cashCount: 2, transferCount: 2 })
  })

  it('calcula el saldo pendiente de una orden', () => {
    expect(pendingBalance({ total: 30000, order_payments: [{ method: 'cash', amount: 12000 }] })).toBe(18000)
    expect(pendingBalance({ total: 30000, order_payments: [] })).toBe(30000)
  })
})

describe('gastos operativos', () => {
  it('agrupa solo gastos por categoría', () => {
    const summary = summarizeExpenses([
      { type: 'expense', category: 'hielo', amount: 5000 },
      { type: 'expense', category: 'hielo', amount: 2500 },
      { type: 'expense', category: 'propinas', amount: 10000 },
      { type: 'expense', amount: 1000 },
      { type: 'withdrawal', category: 'insumos', amount: 90000 },
      { type: 'income', amount: 20000 },
    ])
    expect(summary.total).toBe(18500)
    expect(summary.count).toBe(4)
    expect(summary.byCategory.map((group) => group.category)).toEqual(['propinas', 'hielo', 'otros'])
    expect(summary.byCategory[1]).toMatchObject({ label: 'Hielo', amount: 7500, count: 2 })
  })

  it('calcula días transcurridos desde una fecha', () => {
    const today = new Date('2026-11-20T15:00:00')
    expect(daysSince('2026-11-20T09:00:00', today)).toBe(0)
    expect(daysSince('2026-11-17T09:00:00', today)).toBe(3)
    expect(daysSince(null, today)).toBe(0)
  })
})

describe('exportación y errores de migración', () => {
  it('arma el JSON para el proveedor tecnológico', () => {
    const payload = buildInvoiceExport({
      prefix: 'POS',
      number: 12,
      document_type: 'pos',
      customer_name: 'Ana',
      base_amount: 100000,
      tax_rate: 0.08,
      tax_amount: 8000,
      total: 108000,
    }, {
      id: 'order-1',
      track_token: 'abc123',
      order_items: [{ quantity: 2, unit_price: 54000, dishes: { nombre: 'Bandeja' } }],
      order_payments: [{ method: 'cash', amount: 108000 }],
    })
    expect(payload.documento.numero_completo).toBe('POS-000012')
    expect(payload.pedido?.items[0]).toEqual({ descripcion: 'Bandeja', cantidad: 2, valor_unitario: 54000 })
    expect(payload.aviso).toMatch(/DIAN/)
  })

  it('reconoce tablas faltantes y traduce errores frecuentes', () => {
    expect(isMissingTableError({ code: '42P01' })).toBe(true)
    expect(isMissingTableError({ message: 'Could not find the table public.invoices' })).toBe(true)
    expect(isMissingTableError({ code: '23505', message: 'duplicate key' })).toBe(false)
    expect(paymentErrorMessage({ code: '42P01' })).toMatch(/migración/)
    expect(paymentErrorMessage({ message: 'El pago supera el saldo pendiente del pedido' })).toMatch(/saldo pendiente/i)
    expect(paymentErrorMessage({ message: 'Este pedido ya tiene un documento emitido' })).toMatch(/ya tiene una factura/i)
  })
})
