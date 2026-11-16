import { describe, expect, it } from 'vitest'
import { formatAmountInput, sanitizeAmount } from '../src/lib/money'

describe('money input formatting', () => {
  it('keeps only digits and limits the length', () => {
    expect(sanitizeAmount('150.000')).toBe('150000')
    expect(sanitizeAmount('$ 150.000,00')).toBe('15000000')
    expect(sanitizeAmount('')).toBe('')
    expect(sanitizeAmount('123456789012')).toBe('1234567890')
  })

  it('formats thousands with dots', () => {
    expect(formatAmountInput('150000')).toBe('150.000')
    expect(formatAmountInput('1500')).toBe('1.500')
    expect(formatAmountInput('1234567890')).toBe('1.234.567.890')
    expect(formatAmountInput('')).toBe('')
  })

  it('accepts numbers and already formatted values', () => {
    expect(formatAmountInput(0)).toBe('0')
    expect(formatAmountInput(25000)).toBe('25.000')
    expect(formatAmountInput('1.234.567')).toBe('1.234.567')
  })
})
