import { describe, expect, it } from 'vitest'
import { calculateCashTotals, cashDifference, sanitizeCashAmount, summarizeSales } from '../src/lib/cash'

describe('cash totals', () => {
  it('adds sales and income, subtracts expenses and withdrawals', () => {
    const totals = calculateCashTotals(50000, 120000, [
      { type: 'income', amount: 10000 },
      { type: 'expense', amount: 15000 },
      { type: 'withdrawal', amount: 20000 },
      { type: 'ignored', amount: 999 },
    ])
    expect(totals).toEqual({ income: 10000, expense: 15000, withdrawal: 20000, expected: 145000 })
  })

  it('works without movements and with numeric strings', () => {
    const totals = calculateCashTotals(0, 0, [])
    expect(totals.expected).toBe(0)
    expect(calculateCashTotals(10000, 5000, [{ type: 'expense', amount: 2500 }]).expected).toBe(12500)
  })

  it('computes the closing difference', () => {
    expect(cashDifference(150000, 145000)).toBe(5000)
    expect(cashDifference(140000, 145000)).toBe(-5000)
    expect(cashDifference(0, 0)).toBe(0)
  })

  it('splits completed sales between cash and transfers', () => {
    const summary = summarizeSales([
      { total: 100000, payment_method: 'cash' },
      { total: 50000, payment_method: 'transfer' },
      { total: 25000, payment_method: null },
    ])
    expect(summary).toEqual({ cashTotal: 125000, transferTotal: 50000, cashCount: 2, transferCount: 1 })
    expect(summarizeSales([])).toEqual({ cashTotal: 0, transferTotal: 0, cashCount: 0, transferCount: 0 })
  })

  it('accepts amounts with dots, commas or currency symbols', () => {
    expect(sanitizeCashAmount('150.000')).toBe('150000')
    expect(sanitizeCashAmount('$ 150.000,00')).toBe('15000000')
    expect(sanitizeCashAmount('150000')).toBe('150000')
    expect(sanitizeCashAmount('')).toBe('')
    expect(sanitizeCashAmount('123456789012')).toBe('1234567890')
  })
})
