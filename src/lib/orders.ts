import DOMPurify from 'dompurify'
import { z } from 'zod'
import type { CartItem } from './cart'
import { LEGAL_VERSION } from '../config/business'

const safeText = (max: number, min = 0) => z.string().trim().min(min, { message: 'Este campo es obligatorio' }).max(max, { message: `Máximo ${max} caracteres` }).transform((value) =>
  DOMPurify.sanitize(value, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }),
)

export const TERMS_MESSAGE =
  'Debes aceptar los Términos y Condiciones y la Política de Tratamiento de Datos Personales para continuar.'

export const normalizePhone = (value: string): string => {
  const digits = value.replace(/\D/g, '')
  return digits.length === 12 && digits.startsWith('57') ? digits.slice(2) : digits
}

export const phoneSchema = z.string()
  .trim()
  .transform(normalizePhone)
  .refine((value) => value.length >= 7 && value.length <= 15, {
    message: 'Escribe un teléfono válido de 7 a 15 dígitos',
  })

export const checkoutSchema = z.object({
  customerName: safeText(100, 1),
  phone: phoneSchema,
  orderType: z.enum(['pickup', 'delivery']),
  deliveryAddress: z.string().trim().max(300).optional().default(''),
  notes: safeText(500).optional().default(''),
  acceptedTerms: z.boolean().refine((accepted) => accepted === true, { message: TERMS_MESSAGE }),
  legalVersion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Versión legal inválida' }),
  clientId: z.string().uuid(),
  clientToken: z.string().uuid(),
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
  const result = checkoutSchema.safeParse(input)
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? 'Revisa los datos del pedido')
  }
  const parsed = result.data
  return {
    customer_name: parsed.customerName,
    customer_phone: parsed.phone,
    order_type: parsed.orderType,
    delivery_address: parsed.orderType === 'delivery' ? parsed.deliveryAddress : null,
    notes: parsed.notes,
    legal_version: parsed.legalVersion,
    client_id: parsed.clientId,
    client_token: parsed.clientToken,
    items: parsed.items.map(({ id, quantity }) => ({ dish_id: id, quantity })),
  }
}

export type CheckoutDetails = {
  customerName: string
  phone?: string
  orderType: string
  notes?: string
  deliveryAddress?: string
  acceptedTerms?: boolean
  legalVersion?: string
  clientId?: string
  clientToken?: string
}

export function buildCheckoutInput(items: CartItem[], details: CheckoutDetails) {
  return {
    customerName: details.customerName,
    phone: details.phone ?? '',
    orderType: details.orderType as CheckoutInput['orderType'],
    notes: details.notes ?? '',
    deliveryAddress: details.deliveryAddress ?? '',
    acceptedTerms: details.acceptedTerms ?? false,
    legalVersion: details.legalVersion ?? LEGAL_VERSION,
    clientId: details.clientId ?? '',
    clientToken: details.clientToken ?? '',
    items: items.map(({ id, quantity }) => ({ id, quantity })),
  }
}
