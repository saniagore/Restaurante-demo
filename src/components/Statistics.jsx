import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { aggregateProductStats } from '../lib/statistics'
import { daysAgoInputValue, getDateRange, todayInputValue } from '../lib/order-filters'

const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const percent = (value) => `${(Number(value) || 0).toFixed(1)}%`
const RANGES = [
  { label: '7 días', days: 7 },
  { label: '30 días', days: 30 },
  { label: '90 días', days: 90 },
]

function Statistics({ onOpenMenu }) {
  const [from, setFrom] = useState(() => daysAgoInputValue(30))
  const [to, setTo] = useState(() => todayInputValue())
  const [orders, setOrders] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const invalidRange = Boolean(from && to && from > to)
  const stats = useMemo(() => aggregateProductStats(orders), [orders])
  const categoryName = (id) => categories.find((category) => category.id === id)?.nombre || 'Sin categoría'
  const maxUnits = Math.max(1, ...stats.products.map((product) => product.units))
  const missingCostProducts = stats.products.filter((product) => product.missingCost).length

  useEffect(() => {
    if (!supabase) return
    supabase.from('categories').select('id,nombre').order('orden').then(({ data, error: categoryError }) => {
      if (!categoryError) setCategories(data || [])
    })
  }, [])

  const loadStats = useCallback(async () => {
    if (invalidRange) {
      setOrders([])
      setError('La fecha inicial no puede ser posterior a la final.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    const { startIso, endIso } = getDateRange(from, to)
    let query = supabase
      .from('orders')
      .select('id,order_items(quantity,unit_price,unit_cost,dish_id,dishes(nombre,costo,category_id))')
      .eq('status', 'completed')
    if (startIso) query = query.gte('created_at', startIso)
    if (endIso) query = query.lt('created_at', endIso)

    const { data, error: queryError } = await query
    if (queryError) {
      setError('No se pudieron cargar las estadísticas. Revisa que las migraciones estén aplicadas.')
      setOrders([])
    } else {
      setOrders(data || [])
    }
    setLoading(false)
  }, [from, to, invalidRange])

  useEffect(() => {
    async function initializeStats() {
      await loadStats()
    }
    initializeStats()
  }, [loadStats])

  function setRange(days) {
    setFrom(daysAgoInputValue(days))
    setTo(todayInputValue())
  }

  return <>
    <header className="page-header">
      <div><p className="eyebrow">OPERACIÓN · ESTADÍSTICAS</p><h1>Rentabilidad por producto</h1><p className="muted">Ventas y ganancia de pedidos completados según la fecha de creación.</p></div>
      <button className="secondary-button" onClick={loadStats}>↻ Actualizar</button>
    </header>
    {error && <div className="alert" role="alert">{error}<button aria-label="Cerrar alerta" onClick={() => setError('')}>×</button></div>}
    {missingCostProducts > 0 && <div className="alert stats-warning" role="status">
      <span>{missingCostProducts} {missingCostProducts === 1 ? 'producto no tiene' : 'productos no tienen'} costo configurado; su ganancia se muestra como ingreso.</span>
      {onOpenMenu && <button onClick={onOpenMenu}>Completar costos</button>}
    </div>}

    <section className="panel stats-filters">
      <div className="stats-filter-grid">
        <label>Desde<input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} /></label>
        <label>Hasta<input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} /></label>
        <div className="stats-ranges" role="group" aria-label="Rangos rápidos">
          {RANGES.map((range) => <button type="button" key={range.days} onClick={() => setRange(range.days)}>{range.label}</button>)}
        </div>
      </div>
    </section>

    <section className="stats-kpis">
      <article><span>Pedidos</span><strong>{stats.orders}</strong></article>
      <article><span>Unidades</span><strong>{stats.units}</strong></article>
      <article><span>Ventas de productos</span><strong>{money.format(stats.revenue)}</strong></article>
      <article><span>Ganancia estimada</span><strong className={stats.profit < 0 ? 'negative' : ''}>{money.format(stats.profit)}</strong></article>
      <article><span>Margen</span><strong>{percent(stats.margin)}</strong></article>
    </section>

    <section className="stats-tops">
      <article className="stats-top-card"><span>Más vendido</span><strong>{stats.topSeller?.name || '—'}</strong><small>{stats.topSeller ? `${stats.topSeller.units} unidades` : 'Sin ventas'}</small></article>
      <article className="stats-top-card"><span>Más rentable</span><strong>{stats.topProfit?.name || '—'}</strong><small>{stats.topProfit ? money.format(stats.topProfit.profit) : 'Sin ventas'}</small></article>
      <article className="stats-top-card"><span>Mayor margen</span><strong>{stats.topMargin?.name || '—'}</strong><small>{stats.topMargin ? percent(stats.topMargin.margin) : 'Sin ventas'}</small></article>
    </section>

    <section className="panel stats-panel">
      <div className="panel-heading"><div><h2>Productos</h2><p className="muted">Ordenados por ingresos. La ganancia usa el costo guardado al momento del pedido.</p></div><span className="dish-count">{stats.products.length} productos</span></div>
      {loading ? <div className="empty-state">Calculando estadísticas...</div> : stats.products.length === 0 ? <div className="empty-state">No hay pedidos completados en este rango.</div> : <div className="stats-table-wrap">
        <table className="stats-table">
          <thead><tr><th>Producto</th><th>Categoría</th><th>Unidades</th><th>Ventas</th><th>Costo</th><th>Ganancia</th><th>Margen</th><th>Participación</th></tr></thead>
          <tbody>{stats.products.map((product) => <tr key={product.id}>
            <td><strong>{product.name}</strong>{product.missingCost && <small className="stats-missing">Sin costo</small>}</td>
            <td><span className="stats-category">{categoryName(product.categoryId)}</span></td>
            <td>{product.units}</td>
            <td>{money.format(product.revenue)}</td>
            <td>{money.format(product.cost)}</td>
            <td><strong className={product.profit < 0 ? 'negative' : 'positive'}>{money.format(product.profit)}</strong></td>
            <td>{percent(product.margin)}</td>
            <td><div className="stats-share"><span style={{ width: `${Math.round((product.units / maxUnits) * 100)}%` }} /><small>{stats.revenue > 0 ? percent((product.revenue / stats.revenue) * 100) : '0%'}</small></div></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  </>
}

export default Statistics
