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

/** Deja solo dígitos y limita a 10 enteros para que quepa en numeric(12,2). */
export function sanitizeCashAmount(value: string): string {
  return String(value ?? '').replace(/\D/g, '').slice(0, 10)
}

export const CASH_MOVEMENT_LABELS: Record<string, string> = {
  income: 'Ingreso',
  expense: 'Gasto',
  withdrawal: 'Retiro',
}
