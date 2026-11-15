import { describe, expect, it } from 'vitest'
import { buildCheckoutInput, createCheckoutPayload, TERMS_MESSAGE } from '../src/lib/orders'
import { LEGAL_VERSION } from '../src/config/business'

const item = { id: '11111111-1111-4111-8111-111111111111', name: 'Arroz', description: '', price: 10, image_url: '', quantity: 2 }

const details = {
  customerName: 'Ana',
  phone: '300 123 4567',
  orderType: 'pickup',
  notes: '',
  deliveryAddress: '',
  acceptedTerms: true,
  clientId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  clientToken: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
}

describe('secure checkout payload', () => {
  it('keeps only server-priced item ids, normalizes the phone and strips markup from notes', () => {
    const payload = createCheckoutPayload(buildCheckoutInput([item], { ...details, notes: '<img src=x onerror=alert(1)> sin cebolla' }))
    expect(payload).toEqual({
      customer_name: 'Ana',
      customer_phone: '3001234567',
      order_type: 'pickup',
      delivery_address: null,
      notes: ' sin cebolla',
      legal_version: LEGAL_VERSION,
      client_id: details.clientId,
      client_token: details.clientToken,
      items: [{ dish_id: item.id, quantity: 2 }],
    })
    expect(payload).not.toHaveProperty('total')
  })

  it('rejects invalid names, order types and empty carts', () => {
    expect(() => createCheckoutPayload(buildCheckoutInput([], details))).toThrow()
    expect(() => createCheckoutPayload(buildCheckoutInput([item], { ...details, customerName: '' }))).toThrow()
    expect(() => createCheckoutPayload(buildCheckoutInput([item], { ...details, orderType: 'invalid' }))).toThrow()
  })

  it('includes the delivery address only for home delivery', () => {
    expect(createCheckoutPayload(buildCheckoutInput([item], { ...details, orderType: 'delivery', deliveryAddress: 'Calle 10 #20-30' }))).toMatchObject({
      order_type: 'delivery',
      delivery_address: 'Calle 10 #20-30',
    })
    expect(() => createCheckoutPayload(buildCheckoutInput([item], { ...details, orderType: 'delivery' }))).toThrow()
  })

  it('requires a phone with 7 to 15 digits and normalizes the +57 prefix', () => {
    expect(() => createCheckoutPayload(buildCheckoutInput([item], { ...details, phone: '12345' }))).toThrow(/teléfono/i)
    expect(createCheckoutPayload(buildCheckoutInput([item], { ...details, phone: '+57 (300) 123-4567' })).customer_phone).toBe('3001234567')
  })

  it('rejects more than 50 items on the client as a first barrier', () => {
    const many = Array.from({ length: 51 }, () => item)
    expect(() => createCheckoutPayload(buildCheckoutInput(many, details))).toThrow()
  })

  it('requires the terms and privacy acceptance', () => {
    expect(() => createCheckoutPayload(buildCheckoutInput([item], { ...details, acceptedTerms: false }))).toThrow(TERMS_MESSAGE)
  })

  it('requires a valid legal version', () => {
    expect(() => createCheckoutPayload(buildCheckoutInput([item], { ...details, legalVersion: 'v1' }))).toThrow()
  })

  it('defaults the acceptance to false when the field is omitted', () => {
    const { acceptedTerms, ...withoutAcceptance } = details
    expect(acceptedTerms).toBe(true)
    expect(() => createCheckoutPayload(buildCheckoutInput([item], withoutAcceptance))).toThrow(TERMS_MESSAGE)
  })
})
