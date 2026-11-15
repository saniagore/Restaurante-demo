export const CLIENT_ID_KEY = 'restaurant-client-id'
export const LAST_ORDER_KEY = 'restaurant-last-order'

export const ACTIVE_ORDER_STATUSES = ['pending', 'accepted', 'preparing', 'on_the_way'] as const

export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function resolveStorage(storage?: KeyValueStorage | null): KeyValueStorage | null {
  if (storage) return storage
  if (storage === null) return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function createId(): string {
  const cryptoApi = globalThis.crypto
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16)
    const value = character === 'x' ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })
}

/** Identificador estable del navegador; se crea la primera vez y se reutiliza. */
export function getClientId(storage?: KeyValueStorage | null): string {
  const store = resolveStorage(storage)
  const generated = createId()
  if (!store) return generated
  try {
    const existing = store.getItem(CLIENT_ID_KEY)
    if (existing && UUID_PATTERN.test(existing)) return existing
    store.setItem(CLIENT_ID_KEY, generated)
  } catch {
    return generated
  }
  return generated
}

export function rememberOrderToken(token: string, storage?: KeyValueStorage | null): boolean {
  if (!token) return false
  const store = resolveStorage(storage)
  if (!store) return false
  try {
    store.setItem(LAST_ORDER_KEY, token)
    return true
  } catch {
    return false
  }
}

export function getRememberedOrderToken(storage?: KeyValueStorage | null): string | null {
  const store = resolveStorage(storage)
  if (!store) return null
  try {
    const token = store.getItem(LAST_ORDER_KEY)
    return token && token.trim() ? token : null
  } catch {
    return null
  }
}

export function clearRememberedOrderToken(storage?: KeyValueStorage | null): void {
  const store = resolveStorage(storage)
  if (!store) return
  try {
    store.removeItem(LAST_ORDER_KEY)
  } catch {
    // Sin almacenamiento disponible no hay nada que borrar.
  }
}

export function isActiveOrderStatus(status: string | null | undefined): boolean {
  return Boolean(status) && (ACTIVE_ORDER_STATUSES as readonly string[]).includes(status as string)
}
