import { describe, expect, it } from 'vitest'
import { isAdminSession } from '../src/lib/auth'

describe('admin route guard', () => {
  it('accepts only sessions with the admin app metadata role', () => {
    expect(isAdminSession({ user: { app_metadata: { role: 'admin' } } })).toBe(true)
    expect(isAdminSession({ user: { app_metadata: { role: 'customer' } } })).toBe(false)
    expect(isAdminSession({ user: {} })).toBe(false)
    expect(isAdminSession(null)).toBe(false)
  })
})
