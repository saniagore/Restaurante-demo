import { describe, expect, it } from 'vitest'
import {
  acceptStorageNotice,
  clearStoredBrowserData,
  hasAcceptedStorageNotice,
  STORAGE_NOTICE_KEY,
  STORAGE_NOTICE_VERSION,
  type KeyValueStorage,
} from '../src/lib/storage-notice'

function createStorage(initial: Record<string, string> = {}): KeyValueStorage {
  const data = new Map(Object.entries(initial))
  return {
    get length() { return data.size },
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
    removeItem: (key: string) => { data.delete(key) },
  }
}

const currentVersion = { [STORAGE_NOTICE_KEY]: STORAGE_NOTICE_VERSION }

describe('storage notice acknowledgement', () => {
  it('starts pending and is accepted with the current version', () => {
    const storage = createStorage()
    expect(hasAcceptedStorageNotice(storage)).toBe(false)
    expect(acceptStorageNotice(storage)).toBe(true)
    expect(hasAcceptedStorageNotice(storage)).toBe(true)
    expect(storage.getItem(STORAGE_NOTICE_KEY)).toBe(STORAGE_NOTICE_VERSION)
  })

  it('asks again when the stored version is outdated', () => {
    const storage = createStorage({ [STORAGE_NOTICE_KEY]: '2020-01-01' })
    expect(hasAcceptedStorageNotice(storage)).toBe(false)
  })

  it('fails closed when the storage is unavailable or throws', () => {
    const failing: KeyValueStorage = {
      length: 0,
      key: () => null,
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
      removeItem: () => { throw new Error('blocked') },
    }
    expect(hasAcceptedStorageNotice(null)).toBe(false)
    expect(acceptStorageNotice(null)).toBe(false)
    expect(clearStoredBrowserData(null)).toEqual([])
    expect(hasAcceptedStorageNotice(failing)).toBe(false)
    expect(acceptStorageNotice(failing)).toBe(false)
    expect(clearStoredBrowserData(failing)).toEqual([])
  })
})

describe('clearStoredBrowserData', () => {
  it('removes the cart, the notice acknowledgement and Supabase sessions only', () => {
    const storage = createStorage({
      'restaurant-cart': '{"state":{"items":[]}}',
      ...currentVersion,
      'restaurant-client-id': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'restaurant-last-order': 'abc123',
      'sb-project-auth-token': '{"access_token":"x"}',
      'unrelated-key': 'keep me',
    })
    const removed = clearStoredBrowserData(storage)
    expect(removed.sort()).toEqual([
      'restaurant-cart',
      'restaurant-client-id',
      'restaurant-last-order',
      'sb-project-auth-token',
      STORAGE_NOTICE_KEY,
    ].sort())
    expect(storage.getItem('unrelated-key')).toBe('keep me')
    expect(storage.getItem('restaurant-cart')).toBeNull()
    expect(storage.getItem('restaurant-client-id')).toBeNull()
    expect(storage.getItem('restaurant-last-order')).toBeNull()
    expect(storage.getItem(STORAGE_NOTICE_KEY)).toBeNull()
    expect(storage.getItem('sb-project-auth-token')).toBeNull()
  })

  it('tolerates storages that fail while removing keys', () => {
    const storage = createStorage({
      'restaurant-cart': '{}',
      'stuck': 'value',
    })
    const failing: KeyValueStorage = {
      get length() { return storage.length },
      key: (index: number) => storage.key(index),
      getItem: (key: string) => storage.getItem(key),
      setItem: (key: string, value: string) => storage.setItem(key, value),
      removeItem: (key: string) => { if (key === 'restaurant-cart') throw new Error('blocked'); storage.removeItem(key) },
    }
    expect(clearStoredBrowserData(failing)).toEqual([])
    expect(storage.getItem('restaurant-cart')).toEqual('{}')
  })

  it('uses window.localStorage when no storage is provided', () => {
    window.localStorage.clear()
    expect(hasAcceptedStorageNotice()).toBe(false)
    expect(acceptStorageNotice()).toBe(true)
    expect(hasAcceptedStorageNotice()).toBe(true)
    expect(clearStoredBrowserData()).toEqual([STORAGE_NOTICE_KEY])
    window.localStorage.clear()
  })
})
