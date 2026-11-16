import { describe, expect, it } from 'vitest'
import { aggregateProductStats } from '../src/lib/statistics'

const orders = [
  {
    id: 'o1',
    order_items: [
      { dish_id: 'd1', quantity: 2, unit_price: 10000, unit_cost: 4000, dishes: { nombre: 'Hamburguesa', category_id: 'c1' } },
      { dish_id: 'd2', quantity: 1, unit_price: 5000, unit_cost: null, dishes: { nombre: 'Papas', costo: 2000, category_id: 'c2' } },
    ],
  },
  {
    id: 'o2',
    order_items: [
      { dish_id: 'd1', quantity: 1, unit_price: 10000, unit_cost: 4000, dishes: { nombre: 'Hamburguesa', category_id: 'c1' } },
      { dish_id: 'd3', quantity: 3, unit_price: 3000, unit_cost: null, dishes: { nombre: 'Jugo' } },
    ],
  },
]

describe('product statistics', () => {
  it('aggregates units, revenue, cost and profit per product', () => {
    const stats = aggregateProductStats(orders)
    const burger = stats.products.find((product) => product.id === 'd1')
    expect(burger).toMatchObject({ units: 3, revenue: 30000, cost: 12000, profit: 18000 })
    expect(burger?.margin).toBeCloseTo(60)
    expect(stats.orders).toBe(2)
    expect(stats.units).toBe(7)
    expect(stats.revenue).toBe(44000)
    expect(stats.cost).toBe(14000)
    expect(stats.profit).toBe(30000)
    expect(stats.margin).toBeCloseTo(68.181, 2)
  })

  it('uses the dish cost when the order item has no snapshot', () => {
    const stats = aggregateProductStats(orders)
    const fries = stats.products.find((product) => product.id === 'd2')
    expect(fries).toMatchObject({ cost: 2000, profit: 3000, missingCost: false })
  })

  it('flags products without cost and ignores unknown data', () => {
    const stats = aggregateProductStats(orders)
    const juice = stats.products.find((product) => product.id === 'd3')
    expect(juice?.missingCost).toBe(true)
    expect(juice?.cost).toBe(0)
    expect(stats.missingCostItems).toBe(1)
    expect(stats.topSeller?.id).toBe('d1')
    expect(stats.topProfit?.id).toBe('d1')
  })

  it('returns empty values without orders', () => {
    const stats = aggregateProductStats([])
    expect(stats.products).toEqual([])
    expect(stats.topSeller).toBeNull()
    expect(stats.margin).toBe(0)
  })
})
