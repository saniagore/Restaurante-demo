import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const columns = [
  { key: 'pending', label: 'Pendientes', icon: '◷', next: 'accepted', action: 'Aceptar pedido' },
  { key: 'accepted', label: 'Aceptadas', icon: '✓', next: 'preparing', action: 'Empezar a preparar' },
  { key: 'preparing', label: 'Preparando', icon: '◌', next: 'on_the_way', action: 'Marcar en camino' },
  { key: 'on_the_way', label: 'En camino', icon: '⌁', next: null, action: 'Pedido completado' },
]

const money = (value) => `$${Number(value || 0).toFixed(2)}`
const formatTime = (value) => new Date(value).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })

function OrdersBoard() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updating, setUpdating] = useState(null)
  const today = new Date().toISOString().slice(0, 10)

  const loadOrders = useCallback(async () => {
    setLoading(true)
    const { data, error: queryError } = await supabase
      .from('orders')
      .select('*, order_items(*, dishes(name))')
      .gte('created_at', `${today}T00:00:00.000Z`)
      .lt('created_at', `${today}T23:59:59.999Z`)
      .order('created_at', { ascending: false })
    if (queryError) setError('No se pudieron cargar las órdenes.')
    else setOrders(data || [])
    setLoading(false)
  }, [today])

  useEffect(() => {
    async function initializeOrders() {
      await loadOrders()
    }
    initializeOrders()
    const channel = supabase.channel('admin-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, async (payload) => {
        if (payload.eventType === 'INSERT') {
          const { data: insertedOrder } = await supabase.from('orders').select('*, order_items(*, dishes(name))').eq('id', payload.new.id).single()
          setOrders((current) => current.some((order) => order.id === payload.new.id) ? current : [insertedOrder || payload.new, ...current])
        }
        if (payload.eventType === 'UPDATE') setOrders((current) => current.map((order) => order.id === payload.new.id ? { ...order, ...payload.new } : order))
        if (payload.eventType === 'DELETE') setOrders((current) => current.filter((order) => order.id !== payload.old.id))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadOrders])

  async function updateStatus(order, status) {
    setUpdating(order.id)
    const { error: updateError } = await supabase.from('orders').update({ status }).eq('id', order.id)
    if (updateError) setError('No se pudo actualizar la orden.')
    setUpdating(null)
  }

  const groupedOrders = useMemo(() => columns.reduce((result, column) => {
    result[column.key] = orders.filter((order) => order.status === column.key)
    return result
  }, {}), [orders])

  return (
    <>
      <header className="page-header">
        <div><p className="eyebrow">OPERACIÓN · {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}</p><h1>Órdenes de hoy <span className="live-dot">● En vivo</span></h1></div>
        <button className="secondary-button" onClick={loadOrders}>↻ Actualizar</button>
      </header>
      {error && <div className="alert">{error}<button onClick={() => setError('')}>×</button></div>}
      {loading ? <div className="empty-state">Cargando órdenes...</div> : <div className="orders-board">
        {columns.map((column) => <section className="order-column" key={column.key}>
          <div className="column-heading"><h2><span className={`status-icon ${column.key}`}>{column.icon}</span>{column.label}</h2><span className="count-badge">{groupedOrders[column.key]?.length || 0}</span></div>
          <div className="order-list">
            {groupedOrders[column.key]?.map((order) => <OrderCard key={order.id} order={order} column={column} updating={updating} onStatusChange={updateStatus} />)}
            {!groupedOrders[column.key]?.length && <div className="column-empty">No hay pedidos aquí</div>}
          </div>
        </section>)}
      </div>}
    </>
  )
}

function OrderCard({ order, column, updating, onStatusChange }) {
  const items = order.order_items || order.items || []
  return <article className="order-card">
    <div className="order-card-top"><strong>#{String(order.id).slice(-5)}</strong><time>{formatTime(order.created_at)}</time></div>
    <p className="customer-name">{order.customer_name || order.name || 'Cliente'}</p>
    <div className="items-list">{items.map((item, index) => <div className="order-item" key={item.id || index}><span><b>{item.quantity || 1}×</b> {item.dishes?.name || item.name || item.dish_name || 'Producto'}</span><span>{money(item.subtotal || item.unit_price * (item.quantity || 1))}</span></div>)}</div>
    <div className="order-total"><span>Total</span><strong>{money(order.total_amount || order.total)}</strong></div>
    {column.next ? <button className="primary-button order-action" onClick={() => onStatusChange(order, column.next)} disabled={updating === order.id}>{updating === order.id ? 'Guardando...' : column.action} <span>→</span></button> : <span className="completed-label">Último estado</span>}
  </article>
}

export default OrdersBoard
