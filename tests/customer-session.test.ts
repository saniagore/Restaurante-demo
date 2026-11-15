import { describe, expect, it } from 'vitest'
import {
  ACTIVE_ORDER_STATUSES,
  clearRememberedOrderToken,
  createId,
  getClientId,
  getRememberedOrderToken,
  isActiveOrderStatus,
  rememberOrderToken,
  type KeyValueStorage,
} from '../src/lib/customer-session'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function createStorage(initial: Record<string, string> = {}): KeyValueStorage {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
    removeItem: (key: string) => { data.delete(key) },
  }
}

describe('customer session identifiers', () => {
  it('creates a UUID and reuses the stored client id', () => {
    const storage = createStorage()
    const first = getClientId(storage)
    expect(first).toMatch(UUID)
    expect(getClientId(storage)).toBe(first)
  })

  it('replaces an invalid stored identifier', () => {
    const storage = createStorage({ 'restaurant-client-id': 'not-a-uuid' })
    const id = getClientId(storage)
    expect(id).toMatch(UUID)
    expect(getClientId(storage)).toBe(id)
  })

  it('generates identifiers when storage is unavailable or throws', () => {
    expect(getClientId(null)).toMatch(UUID)
    const failing: KeyValueStorage = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
      removeItem: () => { throw new Error('blocked') },
    }
    expect(getClientId(failing)).toMatch(UUID)
    expect(createId()).toMatch(UUID)
  })

  it('remembers, reads and clears the last order token', () => {
    const storage = createStorage()
    expect(getRememberedOrderToken(storage)).toBeNull()
    expect(rememberOrderToken('abc123', storage)).toBe(true)
    expect(getRememberedOrderToken(storage)).toBe('abc123')
    clearRememberedOrderToken(storage)
    expect(getRememberedOrderToken(storage)).toBeNull()
  })

  it('ignores empty tokens and failing storage', () => {
    const storage = createStorage()
    expect(rememberOrderToken('', storage)).toBe(false)
    expect(rememberOrderToken('abc', null)).toBe(false)
    expect(getRememberedOrderToken(null)).toBeNull()
    expect(rememberOrderToken('abc', {
      getItem: () => null,
      setItem: () => { throw new Error('blocked') },
      removeItem: () => undefined,
    })).toBe(false)
    clearRememberedOrderToken(null)
  })

  it('recognizes the active statuses of the order', () => {
    for (const status of ACTIVE_ORDER_STATUSES) expect(isActiveOrderStatus(status)).toBe(true)
    expect(isActiveOrderStatus('completed')).toBe(false)
    expect(isActiveOrderStatus('cancelled')).toBe(false)
    expect(isActiveOrderStatus(null)).toBe(false)
  })
})
