import { describe, expect, it } from 'vitest'
import {
  daysAgoInputValue,
  getDateRange,
  getDayRange,
  isInRange,
  orderStatusLabel,
  todayInputValue,
} from '../src/lib/order-filters'

describe('order filters', () => {
  it('labels known and unknown statuses', () => {
    expect(orderStatusLabel('preparing')).toBe('Preparando')
    expect(orderStatusLabel('received')).toBe('Pendiente')
    expect(orderStatusLabel('otro')).toBe('Pendiente')
    expect(orderStatusLabel(null)).toBe('Pendiente')
  })

  it('builds the local day range [00:00, next 00:00)', () => {
    const { startIso, endIso } = getDayRange(new Date(2026, 10, 16, 15, 30))
    expect(startIso).toBe(new Date(2026, 10, 16, 0, 0, 0, 0).toISOString())
    expect(endIso).toBe(new Date(2026, 10, 17, 0, 0, 0, 0).toISOString())
    expect(new Date(endIso).getTime()).toBeGreaterThan(new Date(startIso).getTime())
  })

  it('turns date inputs into an exclusive end range', () => {
    const { startIso, endIso } = getDateRange('2026-11-01', '2026-11-03')
    expect(startIso).toBe(new Date(2026, 10, 1, 0, 0, 0, 0).toISOString())
    expect(endIso).toBe(new Date(2026, 10, 4, 0, 0, 0, 0).toISOString())
  })

  it('accepts empty date inputs', () => {
    expect(getDateRange('', '')).toEqual({ startIso: null, endIso: null })
  })

  it('checks whether a timestamp falls in a range', () => {
    const { startIso, endIso } = getDayRange(new Date(2026, 10, 16, 12, 0))
    expect(isInRange(new Date(2026, 10, 16, 8, 0).toISOString(), startIso, endIso)).toBe(true)
    expect(isInRange(new Date(2026, 10, 15, 23, 59).toISOString(), startIso, endIso)).toBe(false)
    expect(isInRange(new Date(2026, 10, 17, 0, 0).toISOString(), startIso, endIso)).toBe(false)
    expect(isInRange(null, startIso, endIso)).toBe(false)
  })

  it('formats date input defaults', () => {
    const date = new Date(2026, 10, 16, 18, 0)
    expect(todayInputValue(date)).toBe('2026-11-16')
    expect(daysAgoInputValue(7, date)).toBe('2026-11-09')
  })
})
