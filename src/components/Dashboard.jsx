import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const money = (value) => `$${Number(value || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`
const formatTime = (value) => new Date(value).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
const todayKey = () => new Date().toLocaleDateString('en-CA')
const orderTotal = (order) => Number(order.total_amount ?? order.total ?? 0)
const uniqueOrders = (orders) => Array.from(new Map(orders.map((order) => [order.id, order])).values())
const activeStatuses = new Set(['pending', 'accepted', 'preparing', 'on_the_way', 'completed'])

function Dashboard({ onOpenOrders }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadOrders = useCallback(async () => {
    setLoading(true)
    const { data, error: queryError } = await supabase
      .from('orders')
      .select('id,status,customer_name,order_type,total,created_at')
      .order('created_at', { ascending: false })
    if (queryError) setError(`No se pudo cargar el resumen: ${queryError.message}`)
    else setOrders(uniqueOrders(data || []))
    setLoading(false)
  }, [])

  useEffect(() => {
    async function initializeDashboard() {
      await loadOrders()
    }
    initializeDashboard()
    const channel = supabase.channel('admin-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        if (payload.eventType === 'INSERT') setOrders((current) => uniqueOrders([payload.new, ...current]))
        if (payload.eventType === 'UPDATE') setOrders((current) => current.map((order) => order.id === payload.new.id ? { ...order, ...payload.new } : order))
        if (payload.eventType === 'DELETE') setOrders((current) => current.filter((order) => order.id !== payload.old.id))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadOrders])

  const todayOrders = useMemo(() => orders.filter((order) => new Date(order.created_at).toLocaleDateString('en-CA') === todayKey()), [orders])
  const pendingOrders = useMemo(() => orders.filter((order) => order.status === 'pending' || !activeStatuses.has(order.status)), [orders])
  const sales = todayOrders.reduce((sum, order) => sum + orderTotal(order), 0)
  const average = todayOrders.length ? sales / todayOrders.length : 0

  return (
    <>
      <header className="page-header dashboard-header">
        <div><p className="eyebrow">RESUMEN · {new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}</p><h1>Así va tu día</h1></div>
        <button className="secondary-button" onClick={loadOrders}>↻ Actualizar</button>
      </header>
      {error && <div className="alert" role="alert">{error}<button aria-label="Cerrar alerta" onClick={() => setError('')}>×</button></div>}
      {loading ? <div className="empty-state">Cargando resumen...</div> : <>
        {pendingOrders.length > 0
          ? <section className="priority-alert"><div className="priority-icon">!</div><div><strong>{pendingOrders.length === 1 ? 'Hay una orden nueva' : `Hay ${pendingOrders.length} órdenes nuevas`}</strong><p>Revisa y acepta los pedidos pendientes para comenzar a prepararlos.</p></div><button className="primary-button" onClick={onOpenOrders}>Ver órdenes</button></section>
          : <section className="all-clear"><span>✓</span><div><strong>Todo está al día</strong><p>No hay órdenes pendientes de atención.</p></div></section>}
        <section className="metrics-grid">
          <article className="metric-card"><span>Ventas del día</span><strong>{money(sales)}</strong><small>{todayOrders.length} {todayOrders.length === 1 ? 'orden' : 'órdenes'}</small></article>
          <article className="metric-card"><span>Órdenes recibidas</span><strong>{todayOrders.length}</strong><small>Desde el inicio del día</small></article>
          <article className="metric-card"><span>Ticket promedio</span><strong>{money(average)}</strong><small>Por orden de hoy</small></article>
          <article className="metric-card metric-card-highlight"><span>Pendientes</span><strong>{pendingOrders.length}</strong><small>Requieren atención</small></article>
        </section>
        <section className="dashboard-grid">
          <article className="panel priority-orders">
            <div className="panel-heading"><div><h2>Atención prioritaria</h2><p className="muted">Órdenes que esperan respuesta.</p></div><button className="text-button" onClick={onOpenOrders}>Ver todas</button></div>
            {pendingOrders.length ? <div className="priority-list">{pendingOrders.slice(0, 5).map((order) => <button className="priority-order" key={order.id} onClick={onOpenOrders}><span className="priority-order-icon">◷</span><span><strong>{order.customer_name || 'Cliente'}</strong><small>#{String(order.id).slice(-5)} · {formatTime(order.created_at)}</small></span><b>{money(orderTotal(order))}</b><span>→</span></button>)}</div> : <div className="empty-state">No hay órdenes pendientes.</div>}
          </article>
          <article className="panel day-status">
            <div className="panel-heading"><div><h2>Estado de operación</h2><p className="muted">Órdenes activas en este momento.</p></div></div>
            <div className="status-summary"><div><span className="status-dot accepted" />Aceptadas<strong>{orders.filter((order) => order.status === 'accepted').length}</strong></div><div><span className="status-dot preparing" />Preparando<strong>{orders.filter((order) => order.status === 'preparing').length}</strong></div><div><span className="status-dot on-the-way" />En camino<strong>{orders.filter((order) => order.status === 'on_the_way').length}</strong></div><div><span className="status-dot completed" />Completadas<strong>{orders.filter((order) => order.status === 'completed').length}</strong></div></div>
          </article>
        </section>
      </>}
    </>
  )
}

export default Dashboard
