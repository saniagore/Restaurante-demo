import { describe, expect, it } from 'vitest'
import {
  buildCustomerTicket,
  buildInvoiceTicket,
  buildKitchenTicket,
  buildTicketHtml,
  escapeHtml,
  formatTicketMoney,
} from '../src/lib/print'

const order = {
  id: 'abcd-123456',
  track_token: 'tok789',
  customer_name: 'Ana & <Luis>',
  order_type: 'delivery',
  created_at: '2026-11-20T12:00:00-05:00',
  notes: 'Sin cebolla',
  total: 108000,
  order_items: [
    { quantity: 2, unit_price: 50000, dishes: { nombre: 'Bandeja <paisa>' } },
    { quantity: 1, unit_price: 8000, dishes: { nombre: 'Jugo natural' } },
  ],
  order_payments: [
    { method: 'cash', amount: 60000 },
    { method: 'card', amount: 48000 },
  ],
}

const business = { name: 'Mesa abierta', taxId: '900123456-7', address: 'Calle 1 #2-3', phone: '300 123 4567' }

describe('tiquetes e impresión', () => {
  it('escapa HTML de los datos del pedido', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(escapeHtml('Ana & Luis')).toBe('Ana &amp; Luis')
  })

  it('formatea montos en pesos sin centavos', () => {
    expect(formatTicketMoney(108000)).toBe('$ 108.000')
    expect(formatTicketMoney('2500')).toBe('$ 2.500')
    expect(formatTicketMoney(null)).toBe('$ 0')
  })

  it('genera la comanda de cocina sin precios', () => {
    const html = buildKitchenTicket(order, business, 58)
    expect(html).toContain('COMANDA COCINA')
    expect(html).toContain('Bandeja &lt;paisa&gt;')
    expect(html).toContain('2×')
    expect(html).toContain('Sin cebolla')
    expect(html).toContain('@page { size: 58mm auto')
    expect(html).not.toContain('50.000')
    expect(html).not.toContain('$')
  })

  it('genera la cuenta del cliente con totales y medios de pago', () => {
    const html = buildCustomerTicket(order, business, 80)
    expect(html).toContain('CUENTA')
    expect(html).toContain('Ana &amp; &lt;Luis&gt;')
    expect(html).toContain('TOTAL')
    expect(html).toContain('$ 108.000')
    expect(html).toContain('Efectivo')
    expect(html).toContain('Tarjeta')
    expect(html).toContain('@page { size: 80mm auto')
    expect(html).toMatch(/no es factura/i)
  })

  it('genera el documento equivalente POS con base, impuesto y numeración', () => {
    const html = buildInvoiceTicket({
      prefix: 'POS',
      number: 7,
      document_type: 'pos',
      customer_name: 'Ana',
      customer_tax_id: '1020304050',
      base_amount: 100000,
      tax_rate: 0.08,
      tax_amount: 8000,
      total: 108000,
      issued_at: '2026-11-20T12:30:00-05:00',
      invoice_resolution: 'Resolución 18764000123456',
    }, order, business, 80)
    expect(html).toContain('DOCUMENTO EQUIVALENTE POS')
    expect(html).toContain('POS-000007')
    expect(html).toContain('NIT 900123456-7')
    expect(html).toContain('Base gravable')
    expect(html).toContain('Impuesto (8%)')
    expect(html).toContain('Resolución 18764000123456')
    expect(html).toContain('1020304050')
    expect(html).toMatch(/DIAN/)
  })

  it('acepta cualquier ancho y escapa títulos', () => {
    const html = buildTicketHtml({ width: 80, businessName: 'A <B>', title: 'TIQUETE', items: [] })
    expect(html).toContain('A &lt;B&gt;')
    expect(html).toContain('@page { size: 80mm auto')
    expect(html).toContain('Sin productos')
  })
})
