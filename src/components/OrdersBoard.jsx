import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getDayRange, isInRange } from '../lib/order-filters'
import { paymentErrorMessage, summarizePayments } from '../lib/billing'
import PaymentSplit from './PaymentSplit'
import PrintDialog from './PrintDialog'

const columns = [
  { key: 'pending', label: 'Pendientes', icon: '◷', next: 'accepted', action: 'Aceptar pedido' },
  { key: 'accepted', label: 'Aceptadas', icon: '✓', next: 'preparing', action: 'Empezar a preparar' },
  { key: 'preparing', label: 'Preparando', icon: '◌', next: 'on_the_way', action: 'Marcar en camino' },
  { key: 'on_the_way', label: 'En camino', icon: '⌁', next: 'completed', action: 'Marcar completado' },
  { key: 'completed', label: 'Completadas', icon: '✓', next: null, action: 'Pedido completado' },
  { key: 'cancelled', label: 'Canceladas', icon: '×', next: null, action: 'Pedido cancelado' },
]

const money = (value) => `$${Number(value || 0).toFixed(2)}`
const formatTime = (value) => new Date(value).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
const uniqueOrders = (orders) => Array.from(new Map(orders.map((order) => [order.id, order])).values())

function OrdersBoard({ onOpenHistory }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updating, setUpdating] = useState(null)
  const [collapsedColumns, setCollapsedColumns] = useState({ completed: true, cancelled: true })
  const [settings, setSettings] = useState(null)
  const [print, setPrint] = useState(null)
  const [paymentOrderId, setPaymentOrderId] = useState(null)
  const [notice, setNotice] = useState('')
  const loadOrders = useCallback(async () => {
    setLoading(true)
    const { startIso, endIso } = getDayRange()
    const { data, error: queryError } = await supabase
      .from('orders')
      .select('*, order_items(*, dishes(nombre,descripcion)), order_payments(*)')
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .order('created_at', { ascending: false })
    if (queryError) setError(`No se pudieron cargar las órdenes: ${queryError.message}`)
    else setOrders(uniqueOrders(data || []))
    setLoading(false)
  }, [])

  useEffect(() => {
    let mounted = true
    supabase.from('restaurant_settings').select('*').eq('id', true).maybeSingle().then(({ data }) => {
      if (mounted) setSettings(data || {})
    })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    async function initializeOrders() {
      await loadOrders()
    }
    initializeOrders()
    const channel = supabase.channel('admin-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, async (payload) => {
        if (payload.eventType === 'INSERT') {
          const { startIso, endIso } = getDayRange()
          if (!isInRange(payload.new.created_at, startIso, endIso)) return
          const { data: insertedOrder } = await supabase.from('orders').select('*, order_items(*, dishes(nombre,descripcion)), order_payments(*)').eq('id', payload.new.id).single()
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
    setNotice('')
    const { error: updateError } = await supabase.from('orders').update({ status }).eq('id', order.id)
    if (updateError) {
      setError('No se pudo actualizar el pedido. Intenta de nuevo.')
    } else if (status === 'completed' && settings?.auto_invoice_on_complete) {
      const { error: invoiceError } = await supabase.rpc('create_invoice', { p_order_id: order.id })
      if (invoiceError) {
        setNotice(`Pedido completado. No se pudo emitir el documento: ${paymentErrorMessage(invoiceError)}`)
      } else {
        setNotice('Pedido completado y documento equivalente POS emitido automáticamente.')
      }
    }
    setUpdating(null)
  }

  async function updatePaymentMethod(order, payment_method) {
    setUpdating(order.id)
    const { error: updateError } = await supabase.from('orders').update({ payment_method }).eq('id', order.id)
    if (updateError) {
      setError('No se pudo actualizar el método de pago.')
    } else {
      setOrders((current) => current.map((item) => item.id === order.id ? { ...item, payment_method } : item))
    }
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
        <div><p className="eyebrow">OPERACIÓN · {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}</p><h1>Órdenes de hoy <span className="live-dot">● En vivo</span></h1></div>
        <div className="header-actions">
          <span className="today-chip">{orders.length} {orders.length === 1 ? 'pedido hoy' : 'pedidos hoy'}</span>
          <button className="secondary-button" onClick={loadOrders}>↻ Actualizar</button>
          {onOpenHistory && <button className="secondary-button" onClick={onOpenHistory}>Historial</button>}
        </div>
      </header>
      {error && <div className="alert" role="alert">{error}<button aria-label="Cerrar alerta" onClick={() => setError('')}>×</button></div>}
      {notice && <div className="alert billing-success" role="status">{notice}<button aria-label="Cerrar aviso" onClick={() => setNotice('')}>×</button></div>}
      {loading ? <div className="empty-state">Cargando órdenes...</div> : <div className="orders-board">
        {columns.map((column) => {
          const collapsed = Boolean(collapsedColumns[column.key])
          return <section className={`order-column ${collapsed ? 'collapsed' : ''}`} key={column.key}>
          <div className="column-heading"><button className="column-toggle" type="button" aria-expanded={!collapsed} onClick={() => setCollapsedColumns((current) => ({ ...current, [column.key]: !current[column.key] }))}><h2><span className={`status-icon ${column.key}`}>{column.icon}</span>{column.label}</h2><span className="count-badge">{groupedOrders[column.key]?.length || 0}</span></button><span className="collapse-icon" aria-hidden="true">{collapsed ? '+' : '−'}</span></div>
          {!collapsed && <div className="order-list">
            {groupedOrders[column.key]?.map((order) => <OrderCard
              key={order.id}
              order={order}
              column={column}
              updating={updating}
              paymentsOpen={paymentOrderId === order.id}
              onStatusChange={updateStatus}
              onPaymentChange={updatePaymentMethod}
              onPrint={setPrint}
              onTogglePayments={() => setPaymentOrderId((current) => current === order.id ? null : order.id)}
              onPaymentsChanged={loadOrders}
            />)}
            {!groupedOrders[column.key]?.length && <div className="column-empty">No hay pedidos aquí</div>}
          </div>}
        </section>})}
      </div>}
      {print && <PrintDialog kind={print.kind} order={print.order} settings={settings} onClose={() => setPrint(null)} />}
    </>
  )
}

function paymentBadge(order, summary) {
  if (summary.methods.length > 0) {
    if (summary.cash > 0 && summary.electronic > 0) return { label: 'Mixto', className: 'mixed' }
    if (summary.electronic > 0) return { label: 'Transferencia', className: 'transfer' }
    return { label: 'Efectivo', className: '' }
  }
  return order.payment_method === 'transfer'
    ? { label: 'Transferencia', className: 'transfer' }
    : { label: 'Efectivo', className: '' }
}

function OrderCard({ order, column, updating, paymentsOpen, onStatusChange, onPaymentChange, onPrint, onTogglePayments, onPaymentsChanged }) {
  const items = order.order_items || order.items || []
  const payments = order.order_payments || []
  const paymentSummary = summarizePayments(payments, order.total_amount ?? order.total)
  const badge = paymentBadge(order, paymentSummary)
  const isPickup = order.order_type !== 'delivery'
  const deliveryLabel = isPickup ? 'Recoger en local' : 'Domicilio'
  const nextStatus = isPickup && column.key === 'preparing' ? 'completed' : column.next
  const nextAction = isPickup && column.key === 'preparing' ? 'Marcar listo para recoger' : column.action
  const [expanded, setExpanded] = useState(false)
  return <article className="order-card">
    <button className="order-card-summary" type="button" aria-expanded={expanded} onClick={() => setExpanded((current) => !current)}>
      <div className="order-card-top"><strong>#{String(order.id).slice(-5)}</strong><span className={`order-pay-badge ${badge.className}`}>{badge.label}</span><time>{formatTime(order.created_at)}</time></div>
      <div className="customer-row"><p className="customer-name">{order.customer_name || order.name || 'Cliente'}</p><span className="order-type">{deliveryLabel}</span></div>
      <div className="summary-total"><span>Total</span><strong>{money(order.total_amount || order.total)}</strong><span className="expand-icon">{expanded ? '−' : '+'}</span></div>
    </button>
    {expanded && <div className="order-details">
      <div className="items-list">{items.map((item, index) => <div className="order-item" key={item.id || index}><span><b>{item.quantity || 1}×</b> {item.dishes?.nombre || item.name || item.dish_name || 'Producto'}{item.dishes?.descripcion && <small>{item.dishes.descripcion}</small>}</span><span>{money(item.subtotal || item.unit_price * (item.quantity || 1))}</span></div>)}</div>
      {(order.delivery_address || order.notes || order.customer_phone) && <div className="order-notes">{order.customer_phone && <><strong>Teléfono</strong><p>{order.customer_phone}</p></>}{order.delivery_address && <><strong>Dirección</strong><p>{order.delivery_address}</p></>}{order.notes && <><strong>Notas</strong><p>{order.notes}</p></>}</div>}
      <div className="order-payment">
        <div className="order-payment-head">
          <div>
            <strong>Cobro</strong>
            <p className="muted">Pagado {money(paymentSummary.paid)} · Saldo {money(paymentSummary.pending)}</p>
          </div>
          <button type="button" className="text-button" onClick={onTogglePayments}>{paymentsOpen ? 'Ocultar' : 'Cobrar / dividir'}</button>
        </div>
        {paymentSummary.methods.length > 0 && !paymentsOpen && <div className="payment-list">
          {paymentSummary.methods.map((item) => <span key={item.method} className={`payment-chip ${item.method === 'cash' ? 'cash' : 'electronic'}`}>{item.label} · {money(item.amount)}</span>)}
        </div>}
        {!payments.length && !paymentsOpen && <label>Método de pago<select value={order.payment_method || 'cash'} disabled={updating === order.id} onChange={(event) => onPaymentChange(order, event.target.value)}><option value="cash">Efectivo</option><option value="transfer">Transferencia</option></select></label>}
        {paymentsOpen && <PaymentSplit key={`${order.id}-${paymentSummary.paid}`} order={order} onChanged={onPaymentsChanged} compact />}
      </div>
      <div className="order-tickets">
        <span className="muted">Imprimir</span>
        <button type="button" className="secondary-button" onClick={() => onPrint({ kind: 'kitchen', order })}>Comanda cocina</button>
        <button type="button" className="secondary-button" onClick={() => onPrint({ kind: 'customer', order })}>Cuenta del cliente</button>
      </div>
    </div>}
    {nextStatus ? <button className="primary-button order-action" onClick={() => onStatusChange(order, nextStatus)} disabled={updating === order.id}>{updating === order.id ? 'Guardando...' : nextAction} <span>→</span></button> : <span className="completed-label">{isPickup ? 'Pedido listo' : 'Último estado'}</span>}
    {['pending', 'accepted', 'preparing'].includes(column.key) && <button className="text-button order-cancel" disabled={updating === order.id} onClick={() => { if (window.confirm('¿Cancelar este pedido? Se liberará el teléfono del cliente.')) onStatusChange(order, 'cancelled') }}>Cancelar pedido</button>}
  </article>
}

export default OrdersBoard
