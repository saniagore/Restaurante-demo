import { beforeEach, describe, expect, it } from 'vitest'
import { useCart } from '../src/lib/cart'

const dish = { id: '11111111-1111-4111-8111-111111111111', name: 'Arroz', description: '', price: 10, image_url: '' }
const dessert = { id: '22222222-2222-4222-8222-222222222222', name: 'Flan', description: '', price: 5, image_url: '' }

describe('cart state', () => {
  beforeEach(() => useCart.setState({ items: [] }))

  it('adds, increments, updates and removes items', () => {
    useCart.getState().addItem(dish)
    useCart.getState().addItem(dish)
    useCart.getState().addItem(dessert)
    expect(useCart.getState().items[0].quantity).toBe(2)
    useCart.getState().updateQuantity(dish.id, 3)
    expect(useCart.getState().total()).toBe(35)
    useCart.getState().updateQuantity(dish.id, 0)
    expect(useCart.getState().items).toEqual([{ ...dessert, quantity: 1 }])
  })

  it('removes a selected item and clears the cart', () => {
    useCart.getState().addItem(dish)
    useCart.getState().removeItem(dish.id)
    expect(useCart.getState().items).toEqual([])
    useCart.getState().addItem(dish)
    useCart.getState().clearCart()
    expect(useCart.getState().total()).toBe(0)
  })
})
