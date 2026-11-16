export type StatsDish = {
  nombre?: string
  costo?: number | null
  category_id?: string | null
}

export type StatsItem = {
  dish_id: string
  quantity: number
  unit_price: number
  unit_cost?: number | null
  dishes?: StatsDish | StatsDish[] | null
}

export type StatsOrder = {
  id: string
  order_items?: StatsItem[] | null
}

export type ProductStat = {
  id: string
  name: string
  categoryId: string | null
  units: number
  revenue: number
  cost: number
  profit: number
  margin: number
  missingCost: boolean
}

export type ProductStats = {
  products: ProductStat[]
  orders: number
  units: number
  revenue: number
  cost: number
  profit: number
  margin: number
  missingCostItems: number
  topSeller: ProductStat | null
  topProfit: ProductStat | null
  topMargin: ProductStat | null
}

const number = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function aggregateProductStats(orders: StatsOrder[]): ProductStats {
  const map = new Map<string, ProductStat>()
  let units = 0
  let revenue = 0
  let cost = 0
  let missingCostItems = 0

  for (const order of orders) {
    for (const item of order.order_items || []) {
      const quantity = number(item.quantity)
      const unitPrice = number(item.unit_price)
      const dish = Array.isArray(item.dishes) ? item.dishes[0] : item.dishes
      const unitCostValue = item.unit_cost ?? dish?.costo ?? null
      const unitCost = number(unitCostValue)
      const missingCost = unitCostValue === null || unitCostValue === undefined
      const lineRevenue = unitPrice * quantity
      const lineCost = unitCost * quantity

      units += quantity
      revenue += lineRevenue
      cost += lineCost
      if (missingCost) missingCostItems += 1

      const current = map.get(item.dish_id) || {
        id: item.dish_id,
        name: dish?.nombre || 'Producto eliminado',
        categoryId: dish?.category_id || null,
        units: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
        margin: 0,
        missingCost: false,
      }
      current.units += quantity
      current.revenue += lineRevenue
      current.cost += lineCost
      current.missingCost = current.missingCost || missingCost
      map.set(item.dish_id, current)
    }
  }

  const products = Array.from(map.values())
    .map((product) => ({
      ...product,
      profit: product.revenue - product.cost,
      margin: product.revenue > 0 ? ((product.revenue - product.cost) / product.revenue) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)

  const withSales = products.filter((product) => product.units > 0)
  const withCost = withSales.filter((product) => !product.missingCost)
  const topSeller = [...withSales].sort((a, b) => b.units - a.units || b.revenue - a.revenue)[0] || null
  const topProfit = [...withCost].sort((a, b) => b.profit - a.profit)[0] || null
  const topMargin = [...withCost].filter((product) => product.revenue > 0).sort((a, b) => b.margin - a.margin)[0] || null
  const profit = revenue - cost

  return {
    products,
    orders: orders.length,
    units,
    revenue,
    cost,
    profit,
    margin: revenue > 0 ? (profit / revenue) * 100 : 0,
    missingCostItems,
    topSeller,
    topProfit,
    topMargin,
  }
}
