import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { daysAgoInputValue, getDateRange, orderStatusLabel, todayInputValue } from '../lib/order-filters'

const PAGE_SIZES = [25, 50, 100]
const STATUS_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  { value: 'pending-group', label: 'Pendientes' },
  { value: 'accepted', label: 'Aceptados' },
  { value: 'preparing', label: 'Preparando' },
  { value: 'on_the_way', label: 'En camino' },
  { value: 'completed', label: 'Completados' },
  { value: 'cancelled', label: 'Cancelados' },
]
const TYPE_OPTIONS = [
  { value: '', label: 'Todos los tipos' },
  { value: 'pickup', label: 'Recoger en local' },
  { value: 'delivery', label: 'Domicilio' },
]
const ACTIVE_STATUSES = 'accepted,preparing,on_the_way,completed,cancelled'

const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const formatDate = (value) => new Date(value).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
const uniqueOrders = (orders) => Array.from(new Map(orders.map((order) => [order.id, order])).values())

function csvCell(value) {
  const text = String(value ?? '')
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}

function OrdersHistory() {
  const [from, setFrom] = useState(() => daysAgoInputValue(7))
  const [to, setTo] = useState(() => todayInputValue())
  const [status, setStatus] = useState('')
  const [type, setType] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [pageSize, setPageSize] = useState(25)
  const [page, setPage] = useState(0)
  const [orders, setOrders] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  const invalidRange = Boolean(from && to && from > to)
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const pageTotal = useMemo(() => orders.reduce((sum, order) => sum + Number(order.total || 0), 0), [orders])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(0)
    }, 350)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const loadOrders = useCallback(async () => {
    if (invalidRange) {
      setOrders([])
      setTotal(0)
      setError('La fecha inicial no puede ser posterior a la final.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    const { startIso, endIso } = getDateRange(from, to)
    const term = search.replace(/[%,()]/g, ' ').trim()

    let query = supabase
      .from('orders')
      .select('*, order_items(*, dishes(nombre))', { count: 'exact' })

    if (startIso) query = query.gte('created_at', startIso)
    if (endIso) query = query.lt('created_at', endIso)
    if (status === 'pending-group') query = query.not('status', 'in', `(${ACTIVE_STATUSES})`)
    else if (status) query = query.eq('status', status)
    if (type === 'pickup') query = query.neq('order_type', 'delivery')
    else if (type === 'delivery') query = query.eq('order_type', 'delivery')
    if (term) query = query.or(`customer_name.ilike.%${term}%,customer_phone.ilike.%${term}%,track_token.ilike.%${term}%`)

    const { data, count, error: queryError } = await query
      .order('created_at', { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1)

    if (queryError) {
      console.error('No se pudo cargar el historial', queryError)
      setError('No se pudo cargar el historial. Revisa los filtros e intenta de nuevo.')
      setOrders([])
      setTotal(0)
    } else {
      setOrders(uniqueOrders(data || []))
      setTotal(count || 0)
      if ((data || []).length === 0 && page > 0) setPage((current) => Math.max(0, current - 1))
    }
    setLoading(false)
  }, [from, to, status, type, search, page, pageSize, invalidRange])

  useEffect(() => {
    async function initializeHistory() {
      await loadOrders()
    }
    initializeHistory()
  }, [loadOrders])

  function resetFilters() {
    setFrom(daysAgoInputValue(7))
    setTo(todayInputValue())
    setStatus('')
    setType('')
    setSearchInput('')
    setSearch('')
    setPage(0)
  }

  function exportCsv() {
    const header = ['Fecha', 'Código', 'Cliente', 'Teléfono', 'Tipo', 'Estado', 'Total', 'Productos']
    const rows = orders.map((order) => [
      formatDate(order.created_at),
      order.track_token || order.id,
      order.customer_name,
      order.customer_phone || '',
      order.order_type === 'delivery' ? 'Domicilio' : 'Recoger',
      orderStatusLabel(order.status),
      Number(order.total || 0),
      (order.order_items || []).map((item) => `${item.quantity}× ${item.dishes?.nombre || 'Producto'}`).join(' | '),
    ])
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `pedidos-${from || 'inicio'}-a-${to || 'hoy'}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <header className="page-header">
        <div><p className="eyebrow">OPERACIÓN · HISTORIAL</p><h1>Historial de pedidos</h1><p className="muted">Consulta por fecha, estado, tipo de entrega o cliente.</p></div>
        <button className="secondary-button" onClick={loadOrders}>↻ Actualizar</button>
      </header>
      {error && <div className="alert" role="alert">{error}<button aria-label="Cerrar alerta" onClick={() => setError('')}>×</button></div>}

      <section className="panel history-filters">
        <div className="history-filter-grid">
          <label>Desde<input type="date" value={from} max={to || undefined} onChange={(event) => { setFrom(event.target.value); setPage(0) }} /></label>
          <label>Hasta<input type="date" value={to} min={from || undefined} onChange={(event) => { setTo(event.target.value); setPage(0) }} /></label>
          <label>Estado<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(0) }}>{STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label>Tipo de entrega<select value={type} onChange={(event) => { setType(event.target.value); setPage(0) }}>{TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className="history-search">Buscar<input type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Cliente, teléfono o código" /></label>
        </div>
        <div className="history-filter-actions">
          <button className="text-button" onClick={resetFilters}>Limpiar filtros</button>
          <span className="muted">{total} {total === 1 ? 'pedido' : 'pedidos'}</span>
          <button className="secondary-button" onClick={exportCsv} disabled={!orders.length}>Exportar CSV</button>
        </div>
      </section>

      <section className="history-summary">
        <article><span>Pedidos encontrados</span><strong>{total}</strong></article>
        <article><span>Total de esta página</span><strong>{money.format(pageTotal)}</strong></article>
        <article><span>Página</span><strong>{page + 1} de {pageCount}</strong></article>
      </section>

      <section className="panel history-panel">
        {loading ? <div className="empty-state">Cargando historial...</div> : orders.length === 0 ? <div className="empty-state">No hay pedidos con esos filtros.</div> : (
          <div className="history-table-wrap">
            <table className="history-table">
              <thead><tr><th>Fecha</th><th>Pedido</th><th>Cliente</th><th>Teléfono</th><th>Tipo</th><th>Estado</th><th>Total</th><th /></tr></thead>
              <tbody>{orders.map((order) => {
                const expanded = expandedId === order.id
                return <Fragment key={order.id}>
                  <tr className={expanded ? 'expanded' : ''}>
                    <td><time>{formatDate(order.created_at)}</time></td>
                    <td><strong>#{String(order.track_token || order.id).slice(-6).toUpperCase()}</strong></td>
                    <td>{order.customer_name || 'Cliente'}</td>
                    <td>{order.customer_phone || '—'}</td>
                    <td><span className="history-type">{order.order_type === 'delivery' ? 'Domicilio' : 'Recoger'}</span></td>
                    <td><span className={`history-status ${order.status || 'pending'}`}>{orderStatusLabel(order.status)}</span></td>
                    <td className="history-total">{money.format(Number(order.total || 0))}</td>
                    <td><button className="text-button" onClick={() => setExpandedId(expanded ? null : order.id)}>{expanded ? 'Ocultar' : 'Ver'}</button></td>
                  </tr>
                  {expanded && <tr className="history-detail-row"><td colSpan={8}>
                    <div className="history-detail">
                      <div>
                        <h3>Productos</h3>
                        {(order.order_items || []).length ? <ul>{(order.order_items || []).map((item, index) => <li key={item.id || index}><span>{item.quantity}× {item.dishes?.nombre || 'Producto'}</span><strong>{money.format(Number(item.unit_price || 0) * Number(item.quantity || 0))}</strong></li>)}</ul> : <p className="muted">Sin detalle de productos.</p>}
                      </div>
                      <div>
                        <h3>Entrega y datos</h3>
                        <p><strong>Dirección:</strong> {order.delivery_address || 'Recoge en el local'}</p>
                        <p><strong>Notas:</strong> {order.notes || 'Sin notas'}</p>
                        <p className="muted">Versión legal: {order.legal_version || '—'} · Aceptada: {order.terms_accepted_at ? formatDate(order.terms_accepted_at) : '—'}</p>
                      </div>
                    </div>
                  </td></tr>}
                </Fragment>
              })}</tbody>
            </table>
          </div>
        )}
        <div className="history-pagination">
          <label>Filas por página<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(0) }}>{PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
          <span className="muted">{total === 0 ? '0' : `${page * pageSize + 1}–${Math.min(total, (page + 1) * pageSize)}`} de {total}</span>
          <div className="history-page-buttons">
            <button className="secondary-button" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>Anterior</button>
            <button className="secondary-button" disabled={page + 1 >= pageCount} onClick={() => setPage((current) => current + 1)}>Siguiente</button>
          </div>
        </div>
      </section>
    </>
  )
}

export default OrdersHistory
