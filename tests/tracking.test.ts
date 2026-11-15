import { describe, expect, it } from 'vitest'
import { getTrackingState } from '../src/lib/tracking'

describe('tracking steps', () => {
  it('shows "Listo para recoger" when a pickup order is completed', () => {
    const state = getTrackingState({ order_type: 'pickup', status: 'completed' })
    expect(state.isPickup).toBe(true)
    expect(state.isCompleted).toBe(true)
    expect(state.labels[state.current]).toBe('Listo para recoger')
    expect(state.labels).toHaveLength(4)
  })

  it('keeps the delivery flow with "En camino"', () => {
    const state = getTrackingState({ order_type: 'delivery', status: 'on_the_way' })
    expect(state.isPickup).toBe(false)
    expect(state.labels[state.current]).toBe('En camino')
    expect(state.labels).toHaveLength(5)
  })

  it('shows the completed delivery state at the end', () => {
    const state = getTrackingState({ order_type: 'delivery', status: 'completed' })
    expect(state.isCompleted).toBe(true)
    expect(state.labels[state.current]).toBe('Completado')
  })

  it('falls back to "Pendiente" for an unknown initial status', () => {
    const state = getTrackingState({ order_type: 'pickup', status: 'received' })
    expect(state.current).toBe(0)
    expect(state.labels[0]).toBe('Pendiente')
  })

  it('marks cancelled orders regardless of the type', () => {
    expect(getTrackingState({ order_type: 'pickup', status: 'cancelled' }).isCancelled).toBe(true)
    expect(getTrackingState({ order_type: 'delivery', status: 'cancelled' }).isCancelled).toBe(true)
  })

  it('treats a missing order as a pickup request without crashing', () => {
    const state = getTrackingState(null)
    expect(state.isPickup).toBe(true)
    expect(state.current).toBe(0)
    expect(state.isCompleted).toBe(false)
    expect(state.isCancelled).toBe(false)
  })
})
