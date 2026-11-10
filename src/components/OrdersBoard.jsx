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
const uniqueOrders = (orders) => Array.from(new Map(orders.map((order) => [order.id, order])).values())

function OrdersBoard() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updating, setUpdating] = useState(null)
  const loadOrders = useCallback(async () => {
    setLoading(true)
    const { data, error: queryError } = await supabase
      .from('orders')
      .select('*, order_items(*, dishes(nombre,descripcion))')
      .order('created_at', { ascending: false })
    if (queryError) setError(`No se pudieron cargar las órdenes: ${queryError.message}`)
    else setOrders(uniqueOrders(data || []))
    setLoading(false)
  }, [])

  useEffect(() => {
    async function initializeOrders() {
      await loadOrders()
    }
    initializeOrders()
    const channel = supabase.channel('admin-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, async (payload) => {
        if (payload.eventType === 'INSERT') {
          const { data: insertedOrder } = await supabase.from('orders').select('*, order_items(*, dishes(nombre,descripcion))').eq('id', payload.new.id).single()
          setOrders((current) => uniqueOrders([insertedOrder || payload.new, ...current]))
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
    if (updateError) setError(`No se pudo actualizar la orden: ${updateError.message}`)
    setUpdating(null)
  }

  const groupedOrders = useMemo(() => {
    const knownStatuses = new Set(columns.map((column) => column.key))
    return columns.reduce((result, column) => {
      result[column.key] = orders.filter((order) => order.status === column.key || (
        column.key === 'pending' && !knownStatuses.has(order.status)
      ))
      return result
    }, {})
  }, [orders])

  return (
    <>
      <header className="page-header">
        <div><p className="eyebrow">OPERACIÓN · {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}</p><h1>Órdenes <span className="live-dot">● En vivo</span></h1></div>
        <button className="secondary-button" onClick={loadOrders}>↻ Actualizar</button>
      </header>
      {error && <div className="alert" role="alert">{error}<button aria-label="Cerrar alerta" onClick={() => setError('')}>×</button></div>}
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
  const deliveryLabel = order.order_type === 'delivery' ? 'Domicilio' : 'Recoger en local'
  const [expanded, setExpanded] = useState(false)
  return <article className="order-card">
    <button className="order-card-summary" type="button" aria-expanded={expanded} onClick={() => setExpanded((current) => !current)}>
      <div className="order-card-top"><strong>#{String(order.id).slice(-5)}</strong><time>{formatTime(order.created_at)}</time></div>
      <div className="customer-row"><p className="customer-name">{order.customer_name || order.name || 'Cliente'}</p><span className="order-type">{deliveryLabel}</span></div>
      <div className="summary-total"><span>Total</span><strong>{money(order.total_amount || order.total)}</strong><span className="expand-icon">{expanded ? '−' : '+'}</span></div>
    </button>
    {expanded && <div className="order-details">
      <div className="items-list">{items.map((item, index) => <div className="order-item" key={item.id || index}><span><b>{item.quantity || 1}×</b> {item.dishes?.nombre || item.name || item.dish_name || 'Producto'}{item.dishes?.descripcion && <small>{item.dishes.descripcion}</small>}</span><span>{money(item.subtotal || item.unit_price * (item.quantity || 1))}</span></div>)}</div>
      {(order.delivery_address || order.notes) && <div className="order-notes">{order.delivery_address && <><strong>Dirección</strong><p>{order.delivery_address}</p></>}{order.notes && <><strong>Notas</strong><p>{order.notes}</p></>}</div>}
    </div>}
    {column.next ? <button className="primary-button order-action" onClick={() => onStatusChange(order, column.next)} disabled={updating === order.id}>{updating === order.id ? 'Guardando...' : column.action} <span>→</span></button> : <span className="completed-label">Último estado</span>}
  </article>
}

export default OrdersBoard
