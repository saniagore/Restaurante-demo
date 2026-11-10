type SessionLike = {
  user?: {
    app_metadata?: Record<string, unknown>
  }
} | null

export function isAdminSession(session: SessionLike) {
  return session?.user?.app_metadata?.role === 'admin'
}
