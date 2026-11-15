import { CART_STORAGE_KEY } from './cart'
import { CLIENT_ID_KEY, LAST_ORDER_KEY } from './customer-session'
import { LEGAL_VERSION } from '../config/business'

export const STORAGE_NOTICE_KEY = 'storage-notice-ack'
export const STORAGE_NOTICE_VERSION = LEGAL_VERSION

export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>

const AUTH_TOKEN_PATTERN = /^sb-.*-auth-token$/

function resolveStorage(storage: KeyValueStorage | null | undefined): KeyValueStorage | null {
  if (storage) return storage
  if (storage === null) return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function hasAcceptedStorageNotice(storage?: KeyValueStorage | null): boolean {
  const store = resolveStorage(storage)
  if (!store) return false
  try {
    return store.getItem(STORAGE_NOTICE_KEY) === STORAGE_NOTICE_VERSION
  } catch {
    return false
  }
}

export function acceptStorageNotice(storage?: KeyValueStorage | null): boolean {
  const store = resolveStorage(storage)
  if (!store) return false
  try {
    store.setItem(STORAGE_NOTICE_KEY, STORAGE_NOTICE_VERSION)
    return true
  } catch {
    return false
  }
}

/** Elimina del navegador el carrito, el acuse, el identificador y las sesiones de Supabase. */
export function clearStoredBrowserData(storage?: KeyValueStorage | null): string[] {
  const store = resolveStorage(storage)
  if (!store) return []
  try {
    const removable = [CART_STORAGE_KEY, STORAGE_NOTICE_KEY, CLIENT_ID_KEY, LAST_ORDER_KEY]
    const keys: string[] = []
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index)
      if (key && (removable.includes(key) || AUTH_TOKEN_PATTERN.test(key))) {
        keys.push(key)
      }
    }
    keys.forEach((key) => store.removeItem(key))
    return keys
  } catch {
    return []
  }
}
