import DOMPurify from 'dompurify'
import { z } from 'zod'
import type { CartItem } from './cart'

const safeText = (max: number, min = 0) => z.string().trim().min(min).max(max).transform((value) =>
  DOMPurify.sanitize(value, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }),
)

export const checkoutSchema = z.object({
  customerName: safeText(100, 1),
  orderType: z.enum(['pickup', 'delivery']),
  deliveryAddress: z.string().trim().max(300).optional().default(''),
  notes: safeText(500).optional().default(''),
  items: z.array(z.object({
    id: z.string().uuid(),
    quantity: z.number().int().min(1).max(99),
  })).min(1).max(50),
}).superRefine((value, context) => {
  if (value.orderType === 'delivery' && !value.deliveryAddress.trim()) {
    context.addIssue({ code: 'custom', path: ['deliveryAddress'], message: 'La dirección de entrega es obligatoria' })
  }
})

export type CheckoutInput = z.input<typeof checkoutSchema>

export function createCheckoutPayload(input: CheckoutInput) {
  const parsed = checkoutSchema.parse(input)
  return {
    customer_name: parsed.customerName,
    order_type: parsed.orderType,
    delivery_address: parsed.orderType === 'delivery' ? parsed.deliveryAddress : null,
    notes: parsed.notes,
    items: parsed.items.map(({ id, quantity }) => ({ dish_id: id, quantity })),
  }
}

export function buildCheckoutInput(items: CartItem[], customerName: string, orderType: string, notes: string, deliveryAddress = '') {
  return {
    customerName,
    orderType,
    notes,
    deliveryAddress,
    items: items.map(({ id, quantity }) => ({ id, quantity })),
  }
}
