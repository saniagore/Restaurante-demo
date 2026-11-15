const PICKUP_LABELS = ['Pendiente', 'Aceptado', 'Preparando', 'Listo para recoger']
const DELIVERY_LABELS = ['Pendiente', 'Aceptado', 'Preparando', 'En camino', 'Completado']

const PICKUP_STATUSES = ['pending', 'accepted', 'preparing', 'completed']
const DELIVERY_STATUSES = ['pending', 'accepted', 'preparing', 'on_the_way', 'completed']

export type TrackedOrder = { order_type?: string; status?: string } | null | undefined

export function getTrackingState(order: TrackedOrder) {
  const isPickup = order?.order_type !== 'delivery'
  const statuses = isPickup ? PICKUP_STATUSES : DELIVERY_STATUSES
  const labels = isPickup ? PICKUP_LABELS : DELIVERY_LABELS
  const status = order?.status ?? 'pending'

  return {
    labels,
    current: Math.max(0, statuses.indexOf(status)),
    isPickup,
    isCompleted: status === 'completed',
    isCancelled: status === 'cancelled',
  }
}
