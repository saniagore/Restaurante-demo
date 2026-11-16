export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  received: 'Pendiente',
  new: 'Pendiente',
  accepted: 'Aceptado',
  preparing: 'Preparando',
  on_the_way: 'En camino',
  completed: 'Completado',
  cancelled: 'Cancelado',
}

export function orderStatusLabel(status?: string | null): string {
  return ORDER_STATUS_LABELS[status ?? ''] ?? 'Pendiente'
}

/** Rango [inicio de hoy, inicio de mañana) en ISO, en la zona horaria local. */
export function getDayRange(date = new Date()) {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const end = new Date(date)
  end.setHours(24, 0, 0, 0)
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}

/** Rango [desde 00:00, día siguiente al "hasta" 00:00) a partir de inputs YYYY-MM-DD. */
export function getDateRange(from: string, to: string) {
  const start = from ? new Date(`${from}T00:00:00`) : null
  const end = to ? new Date(`${to}T00:00:00`) : null
  if (end) end.setDate(end.getDate() + 1)
  return {
    startIso: start ? start.toISOString() : null,
    endIso: end ? end.toISOString() : null,
  }
}

export function isInRange(value: string | null | undefined, startIso: string, endIso: string): boolean {
  if (!value) return false
  const time = new Date(value).getTime()
  return time >= new Date(startIso).getTime() && time < new Date(endIso).getTime()
}

export function todayInputValue(date = new Date()): string {
  return date.toLocaleDateString('en-CA')
}

export function daysAgoInputValue(days: number, date = new Date()): string {
  const copy = new Date(date)
  copy.setDate(copy.getDate() - days)
  return copy.toLocaleDateString('en-CA')
}
