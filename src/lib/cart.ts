import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Dish = {
  id: string
  name: string
  description: string
  price: number
  image_url: string
  category?: string
}

export type CartItem = Dish & { quantity: number }

export interface CartState {
  items: CartItem[]
  addItem: (dish: Dish) => void
  removeItem: (id: string) => void
  updateQuantity: (id: string, quantity: number) => void
  clearCart: () => void
  total: () => number
}

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

export const useCart = create<CartState>()(persist((set, get) => ({
  items: [],
  addItem: (dish) => set(({ items }) => {
    const found = items.find((item) => item.id === dish.id)
    return {
      items: found
        ? items.map((item) => item.id === dish.id ? { ...item, quantity: item.quantity + 1 } : item)
        : [...items, { ...dish, quantity: 1 }],
    }
  }),
  removeItem: (id) => set(({ items }) => ({ items: items.filter((item) => item.id !== id) })),
  updateQuantity: (id, quantity) => set(({ items }) => ({
    items: quantity > 0
      ? items.map((item) => item.id === id ? { ...item, quantity } : item)
      : items.filter((item) => item.id !== id),
  })),
  clearCart: () => set({ items: [] }),
  total: () => get().items.reduce((sum, item) => sum + item.price * item.quantity, 0),
}), {
  name: 'restaurant-cart',
  version: 1,
  migrate: (state) => ({
    ...state,
    items: state.items.filter((item) => isUuid(item.id)),
  }),
}))

