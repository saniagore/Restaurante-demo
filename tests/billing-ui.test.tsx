import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Billing from '../src/components/Billing'
import PaymentSplit from '../src/components/PaymentSplit'
import PrintDialog from '../src/components/PrintDialog'

vi.mock('../src/lib/supabase', () => {
  const query = () => {
    const q: Record<string, unknown> = {}
    Object.assign(q, {
      select: () => q,
      eq: () => q,
      order: () => q,
      gte: () => q,
      lt: () => q,
      neq: () => q,
      limit: () => Promise.resolve({ data: [], error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
    })
    return q
  }
  return { supabase: { from: vi.fn(() => query()), rpc: vi.fn() } }
})

const order = {
  id: 'order-1',
  track_token: 'abc123',
  customer_name: 'Ana',
  order_type: 'delivery',
  total: 108000,
  created_at: '2026-11-20T12:00:00-05:00',
  order_items: [
    { id: 'i1', quantity: 2, unit_price: 50000, dishes: { nombre: 'Bandeja' } },
  ],
  order_payments: [
    { id: 'p1', method: 'cash', amount: 60000, created_at: '2026-11-20T12:05:00-05:00', reference: 'Caja 1' },
  ],
}

describe('panel de cobros', () => {
  it('resume total, pagado y saldo pendiente', () => {
    render(<PaymentSplit order={order} />)
    expect(screen.getAllByText(/108\.000/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/60\.000/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/48\.000/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Efectivo').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /registrar pago/i })).toBeInTheDocument()
  })

  it('muestra el pedido cobrado cuando no hay saldo', () => {
    render(<PaymentSplit order={{ ...order, order_payments: [{ id: 'p1', method: 'card', amount: 108000 }] }} />)
    expect(screen.getByText(/cobrado en su totalidad/i)).toBeInTheDocument()
  })
})

describe('diálogo de impresión', () => {
  it('previsualiza la comanda y permite cambiar el ancho de tirilla', () => {
    render(<PrintDialog kind="kitchen" order={order} settings={{ ticket_width: 80 }} onClose={vi.fn()} />)
    expect(screen.getByRole('heading', { name: /comanda para cocina/i })).toBeInTheDocument()
    expect(screen.getByTitle(/vista previa/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /imprimir 80 mm/i })).toBeInTheDocument()
  })
})

describe('vista de facturación', () => {
  it('permite recorrer las cuatro secciones', async () => {
    const user = userEvent.setup()
    render(<Billing onOpenCash={vi.fn()} />)

    expect(screen.getByRole('heading', { name: /facturación y finanzas/i })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Documentos emitidos')).toBeInTheDocument())

    await user.click(screen.getByRole('tab', { name: /cobros y cartera/i }))
    expect(await screen.findByText('Cuentas por cobrar')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /gastos del día/i }))
    expect(await screen.findByText('Registrar gasto rápido')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /configuración fiscal/i }))
    expect(await screen.findByText('Datos del emisor')).toBeInTheDocument()
  })
})
