import { describe, expect, it } from 'vitest'
import { buildCheckoutInput, createCheckoutPayload } from '../src/lib/orders'

const item = { id: '11111111-1111-4111-8111-111111111111', name: 'Arroz', description: '', price: 10, image_url: '', quantity: 2 }

describe('secure checkout payload', () => {
  it('keeps only server-priced item ids and strips markup from notes', () => {
    const payload = createCheckoutPayload(buildCheckoutInput([item], 'Ana', 'pickup', '<img src=x onerror=alert(1)> sin cebolla'))
    expect(payload).toEqual({
      customer_name: 'Ana',
      order_type: 'pickup',
      delivery_address: null,
      notes: ' sin cebolla',
      items: [{ dish_id: item.id, quantity: 2 }],
    })
    expect(payload).not.toHaveProperty('total')
  })

  it('rejects invalid names, order types and empty carts', () => {
    expect(() => createCheckoutPayload(buildCheckoutInput([], '', 'pickup', ''))).toThrow()
    expect(() => createCheckoutPayload(buildCheckoutInput([item], 'Ana', 'invalid', ''))).toThrow()
  })

  it('includes the delivery address only for home delivery', () => {
    expect(createCheckoutPayload(buildCheckoutInput([item], 'Ana', 'delivery', '', 'Calle 10 #20-30'))).toMatchObject({
      order_type: 'delivery',
      delivery_address: 'Calle 10 #20-30',
    })
    expect(() => createCheckoutPayload(buildCheckoutInput([item], 'Ana', 'delivery', ''))).toThrow()
  })
})
