export type CashMovement = { type: string; amount: number }

export type CashTotals = {
  income: number
  expense: number
  withdrawal: number
  expected: number
}

export function calculateCashTotals(opening: number, sales: number, movements: CashMovement[]): CashTotals {
  let income = 0
  let expense = 0
  let withdrawal = 0
  for (const movement of movements) {
    const amount = Number(movement.amount) || 0
    if (movement.type === 'income') income += amount
    else if (movement.type === 'expense') expense += amount
    else if (movement.type === 'withdrawal') withdrawal += amount
  }
  const expected = (Number(opening) || 0) + (Number(sales) || 0) + income - expense - withdrawal
  return { income, expense, withdrawal, expected }
}

export function cashDifference(counted: number, expected: number): number {
  return (Number(counted) || 0) - (Number(expected) || 0)
}

export type SaleLike = { total?: number | null; payment_method?: string | null }

export type SalesSummary = {
  cashTotal: number
  transferTotal: number
  cashCount: number
  transferCount: number
}

export function summarizeSales(orders: SaleLike[]): SalesSummary {
  let cashTotal = 0
  let transferTotal = 0
  let cashCount = 0
  let transferCount = 0
  for (const order of orders) {
    const amount = Number(order.total) || 0
    if (order.payment_method === 'transfer') {
      transferTotal += amount
      transferCount += 1
    } else {
      cashTotal += amount
      cashCount += 1
    }
  }
  return { cashTotal, transferTotal, cashCount, transferCount }
}

export { sanitizeAmount as sanitizeCashAmount } from './money'

export const CASH_MOVEMENT_LABELS: Record<string, string> = {
  income: 'Ingreso',
  expense: 'Gasto',
  withdrawal: 'Retiro',
}
