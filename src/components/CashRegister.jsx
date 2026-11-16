import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { CASH_MOVEMENT_LABELS, calculateCashTotals, cashDifference, summarizeSales } from '../lib/cash'
import { MoneyInput } from './MoneyInput'

const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const formatDate = (value) => value ? new Date(value).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '—'
const MOVEMENT_TYPES = [
  { value: 'income', label: 'Ingreso' },
  { value: 'expense', label: 'Gasto' },
  { value: 'withdrawal', label: 'Retiro' },
]
const CASH_MODES = [
  { value: 'total', label: 'Total' },
  { value: 'cash', label: 'Efectivo' },
  { value: 'transfer', label: 'Transferencias' },
]

async function fetchCashSales(session) {
  const end = session.closed_at || new Date().toISOString()
  const { data, error } = await supabase
    .from('order_status_history')
    .select('order_id, changed_at, orders(total, payment_method)')
    .eq('to_status', 'completed')
    .gte('changed_at', session.opened_at)
    .lte('changed_at', end)

  if (error) {
    console.error('No se pudieron calcular las ventas de caja', error)
    return { cashTotal: 0, transferTotal: 0, cashCount: 0, transferCount: 0, error: true }
  }

  const seen = new Set()
  const completed = []
  for (const row of data || []) {
    if (!row.order_id || seen.has(row.order_id)) continue
    const order = Array.isArray(row.orders) ? row.orders[0] : row.orders
    if (!order) continue
    seen.add(row.order_id)
    completed.push(order)
  }
  return { ...summarizeSales(completed), error: false }
}

function CashRegister() {
  const [session, setSession] = useState(null)
  const [movements, setMovements] = useState([])
  const [history, setHistory] = useState([])
  const [sales, setSales] = useState({ cashTotal: 0, transferTotal: 0, cashCount: 0, transferCount: 0, error: false })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const [openingAmount, setOpeningAmount] = useState('')
  const [openingNotes, setOpeningNotes] = useState('')
  const [movementType, setMovementType] = useState('expense')
  const [movementAmount, setMovementAmount] = useState('')
  const [movementDescription, setMovementDescription] = useState('')
  const [countedAmount, setCountedAmount] = useState('')
  const [closingNotes, setClosingNotes] = useState('')
  const [justClosed, setJustClosed] = useState(null)
  const [mode, setMode] = useState('total')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data: openRows, error: openError } = await supabase
      .from('cash_sessions')
      .select('*')
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)

    if (openError) {
      console.error('No se pudo cargar la caja', openError)
      setError('No se pudo cargar la caja.')
      setLoading(false)
      return
    }

    const open = openRows?.[0] || null
    setSession(open)

    if (open) {
      const [movementResult, salesResult] = await Promise.all([
        supabase.from('cash_movements').select('*').eq('session_id', open.id).order('created_at'),
        fetchCashSales(open),
      ])
      if (movementResult.error) setError('No se pudieron cargar los movimientos de caja.')
      setMovements(movementResult.data || [])
      setSales(salesResult)
    } else {
      setMovements([])
      setSales({ cashTotal: 0, transferTotal: 0, cashCount: 0, transferCount: 0, error: false })
    }

    const { data: closed, error: closedError } = await supabase
      .from('cash_sessions')
      .select('*')
      .eq('status', 'closed')
      .order('closed_at', { ascending: false })
      .limit(12)
    if (!closedError) setHistory(closed || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    async function initializeCash() {
      await load()
    }
    initializeCash()
  }, [load])

  const totals = useMemo(
    () => calculateCashTotals(Number(session?.opening_amount) || 0, sales.cashTotal, movements),
    [session, sales.cashTotal, movements],
  )
  const estimatedDifference = cashDifference(Number(countedAmount) || 0, totals.expected)
  const totalSales = sales.cashTotal + sales.transferTotal
  const totalCount = sales.cashCount + sales.transferCount
  const summaryCards = mode === 'transfer'
    ? [
        { label: 'Transferencias', value: sales.transferTotal, sub: `${sales.transferCount} pedidos`, highlight: true },
        { label: 'Ventas totales', value: totalSales },
        { label: 'Efectivo', value: sales.cashTotal },
        { label: 'Pedidos por transferencia', value: sales.transferCount, count: true },
        { label: 'Efectivo esperado', value: totals.expected },
      ]
    : mode === 'cash'
      ? [
          { label: 'Apertura', value: Number(session?.opening_amount) || 0 },
          { label: 'Ventas en efectivo', value: sales.cashTotal, sub: `${sales.cashCount} pedidos` },
          { label: 'Ingresos', value: totals.income },
          { label: 'Gastos y retiros', value: totals.expense + totals.withdrawal },
          { label: 'Efectivo esperado', value: totals.expected, highlight: true },
        ]
      : [
          { label: 'Apertura', value: Number(session?.opening_amount) || 0 },
          { label: 'Ventas totales', value: totalSales, sub: `${totalCount} pedidos`, highlight: true },
          { label: 'Efectivo', value: sales.cashTotal, sub: `${sales.cashCount} pedidos` },
          { label: 'Transferencias', value: sales.transferTotal, sub: `${sales.transferCount} pedidos` },
          { label: 'Efectivo esperado', value: totals.expected },
        ]

  async function openCash(event) {
    event.preventDefault()
    setError('')
    const amount = Number(openingAmount)
    if (!Number.isFinite(amount) || amount < 0) {
      setError('La base inicial debe ser un número mayor o igual a cero.')
      return
    }
    setWorking(true)
    const { error: openError } = await supabase.from('cash_sessions').insert({
      opening_amount: amount,
      opening_notes: openingNotes.trim() || null,
    })
    if (openError) {
      console.error('No se pudo abrir la caja', openError)
      setError('No se pudo abrir la caja. Puede que ya exista una caja abierta.')
    } else {
      setOpeningAmount('')
      setOpeningNotes('')
      setJustClosed(null)
      await load()
    }
    setWorking(false)
  }

  async function addMovement(event) {
    event.preventDefault()
    if (!session) return
    setError('')
    const amount = Number(movementAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('El monto del movimiento debe ser mayor que cero.')
      return
    }
    setWorking(true)
    const { error: movementError } = await supabase.from('cash_movements').insert({
      session_id: session.id,
      type: movementType,
      amount,
      description: movementDescription.trim() || null,
    })
    if (movementError) {
      console.error('No se pudo registrar el movimiento', movementError)
      setError('No se pudo registrar el movimiento.')
    } else {
      setMovementAmount('')
      setMovementDescription('')
      await load()
    }
    setWorking(false)
  }

  async function deleteMovement(movement) {
    if (!window.confirm('¿Eliminar este movimiento de caja?')) return
    setWorking(true)
    const { error: deleteError } = await supabase.from('cash_movements').delete().eq('id', movement.id)
    if (deleteError) {
      console.error('No se pudo eliminar el movimiento', deleteError)
      setError('No se pudo eliminar el movimiento.')
    } else {
      await load()
    }
    setWorking(false)
  }

  async function closeCash(event) {
    event.preventDefault()
    if (!session) return
    setError('')
    const counted = Number(countedAmount)
    if (!Number.isFinite(counted) || counted < 0) {
      setError('Ingresa el efectivo contado para cerrar la caja.')
      return
    }

    setWorking(true)
    const [latestSales, latestMovementsResult] = await Promise.all([
      fetchCashSales(session),
      supabase.from('cash_movements').select('*').eq('session_id', session.id).order('created_at'),
    ])
    if (latestSales.error || latestMovementsResult.error) {
      console.error('No se pudo recalcular la caja', latestMovementsResult.error)
      setError('No se pudieron recalcular las ventas o movimientos; actualiza e intenta de nuevo.')
      setWorking(false)
      return
    }

    const latestMovements = latestMovementsResult.data || []
    setMovements(latestMovements)
    const latestTotals = calculateCashTotals(Number(session.opening_amount) || 0, latestSales.cashTotal, latestMovements)
    const difference = cashDifference(counted, latestTotals.expected)
    const { data: { user } } = await supabase.auth.getUser()

    const { data, error: closeError } = await supabase
      .from('cash_sessions')
      .update({
        status: 'closed',
        counted_amount: counted,
        expected_amount: latestTotals.expected,
        difference,
        sales_total: latestSales.cashTotal + latestSales.transferTotal,
        sales_count: latestSales.cashCount + latestSales.transferCount,
        cash_sales_total: latestSales.cashTotal,
        transfer_sales_total: latestSales.transferTotal,
        cash_sales_count: latestSales.cashCount,
        transfer_sales_count: latestSales.transferCount,
        closing_notes: closingNotes.trim() || null,
        closed_at: new Date().toISOString(),
        closed_by: user?.id || null,
      })
      .eq('id', session.id)
      .eq('status', 'open')
      .select()
      .single()

    if (closeError) {
      console.error('No se pudo cerrar la caja', closeError)
      setError('No se pudo cerrar la caja. Actualiza e intenta de nuevo.')
    } else {
      setJustClosed(data)
      setCountedAmount('')
      setClosingNotes('')
      await load()
    }
    setWorking(false)
  }

  return <>
    <header className="page-header">
      <div><p className="eyebrow">OPERACIÓN · CAJA</p><h1>Caja</h1><p className="muted">Apertura, movimientos y cierre del turno.</p></div>
      <button className="secondary-button" onClick={load}>↻ Actualizar</button>
    </header>
    {error && <div className="alert" role="alert">{error}<button aria-label="Cerrar alerta" onClick={() => setError('')}>×</button></div>}

    {loading ? <div className="empty-state">Cargando caja...</div> : session ? <>
      <div className="cash-mode" role="tablist" aria-label="Vista de caja">
        {CASH_MODES.map((option) => <button type="button" role="tab" key={option.value} aria-selected={mode === option.value} className={mode === option.value ? 'active' : ''} onClick={() => setMode(option.value)}>{option.label}</button>)}
      </div>
      <p className="cash-mode-note">El cierre siempre cuenta el efectivo físico; las transferencias se guardan aparte.</p>
      <section className="cash-summary">
        {summaryCards.map((card) => <article key={card.label} className={card.highlight ? 'cash-expected' : ''}>
          <span>{card.label}</span>
          <strong>{card.count ? card.value : money.format(card.value)}</strong>
          {card.sub && <small>{card.sub}</small>}
        </article>)}
      </section>
      {sales.error && <div className="alert" role="alert">No se pudieron calcular las ventas desde el historial de pedidos. Revisa la migración antes de cerrar.</div>}

      <div className="cash-layout">
        <section className="panel">
          <div className="panel-heading"><div><h2>Movimientos de efectivo</h2><p className="muted">Gastos, retiros e ingresos del turno.</p></div></div>
          <form className="cash-form" onSubmit={addMovement}>
            <label>Tipo<select value={movementType} onChange={(event) => setMovementType(event.target.value)}>{MOVEMENT_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label>Monto<MoneyInput required value={movementAmount} onChange={setMovementAmount} placeholder="0" aria-label="Monto del movimiento" /></label>
            <label>Descripción<input value={movementDescription} onChange={(event) => setMovementDescription(event.target.value)} placeholder="Ej. compra de hielo" /></label>
            <button className="primary-button" disabled={working}>Agregar movimiento</button>
          </form>
          <div className="cash-movements">
            {movements.length ? movements.map((movement) => <div className="cash-movement" key={movement.id}>
              <span className={`cash-movement-type ${movement.type}`}>{CASH_MOVEMENT_LABELS[movement.type] || movement.type}</span>
              <span>{movement.description || 'Sin descripción'}</span>
              <strong>{movement.type === 'income' ? '+' : '−'}{money.format(Number(movement.amount) || 0)}</strong>
              <button className="text-button" onClick={() => deleteMovement(movement)} disabled={working}>Eliminar</button>
            </div>) : <p className="muted cash-empty">Sin movimientos registrados.</p>}
          </div>
        </section>

        <section className="panel cash-close">
          <div className="panel-heading"><div><h2>Cerrar caja</h2><p className="muted">Cuenta el efectivo físico y registra el cierre.</p></div></div>
          <p className="cash-hint">Las transferencias se guardan en el arqueo, pero no suman al efectivo contado.</p>
          <form className="cash-form" onSubmit={closeCash}>
            <label>Efectivo contado<MoneyInput required value={countedAmount} onChange={setCountedAmount} placeholder="0" aria-label="Efectivo contado" /></label>
            <label>Notas del cierre<textarea rows="3" value={closingNotes} onChange={(event) => setClosingNotes(event.target.value)} placeholder="Novedades, faltantes o sobrantes..." /></label>
            <div className="cash-difference"><span>Diferencia estimada</span><strong className={estimatedDifference === 0 ? '' : estimatedDifference > 0 ? 'positive' : 'negative'}>{money.format(estimatedDifference)}</strong></div>
            <button className="primary-button" disabled={working || sales.error || !countedAmount}>Cerrar caja</button>
          </form>
        </section>
      </div>
    </> : <>
      {justClosed && <section className="panel cash-result">
        <div><p className="eyebrow">CAJA CERRADA</p><h2>Cierre completado</h2></div>
        <div className="cash-result-grid">
          <span>Esperado <strong>{money.format(Number(justClosed.expected_amount) || 0)}</strong></span>
          <span>Contado <strong>{money.format(Number(justClosed.counted_amount) || 0)}</strong></span>
          <span>Transferencias <strong>{money.format(Number(justClosed.transfer_sales_total) || 0)}</strong></span>
          <span>Total ventas <strong>{money.format(Number(justClosed.sales_total) || 0)}</strong></span>
          <span>Diferencia <strong className={Number(justClosed.difference) === 0 ? '' : Number(justClosed.difference) > 0 ? 'positive' : 'negative'}>{money.format(Number(justClosed.difference) || 0)}</strong></span>
        </div>
        <button className="secondary-button" onClick={() => setJustClosed(null)}>Preparar nueva caja</button>
      </section>}

      <section className="panel cash-open">
        <div className="panel-heading"><div><h2>Abrir caja</h2><p className="muted">Registra la base inicial del turno.</p></div></div>
        <form className="cash-form cash-open-form" onSubmit={openCash}>
          <label>Base inicial<MoneyInput required value={openingAmount} onChange={setOpeningAmount} placeholder="0" aria-label="Base inicial" /><small className="cash-hint">Solo números: puedes escribir 150000 o 150.000.</small></label>
          <label>Notas de apertura<input value={openingNotes} onChange={(event) => setOpeningNotes(event.target.value)} placeholder="Ej. turno de la mañana" /></label>
          <button className="primary-button" disabled={working}>Abrir caja</button>
        </form>
      </section>
    </>}

    <section className="panel cash-history">
      <div className="panel-heading"><div><h2>Cierres recientes</h2><p className="muted">Últimos turnos cerrados.</p></div></div>
      {history.length ? <div className="cash-table-wrap">
        <table className="cash-table">
          <thead><tr><th>Cierre</th><th>Base</th><th>Efectivo</th><th>Transferencias</th><th>Total</th><th>Esperado</th><th>Contado</th><th>Diferencia</th></tr></thead>
          <tbody>{history.map((item) => {
            const transfer = Number(item.transfer_sales_total) || 0
            const cash = Number(item.cash_sales_total) || (transfer ? 0 : Number(item.sales_total) || 0)
            const total = Number(item.sales_total) || cash + transfer
            return <tr key={item.id}>
              <td>{formatDate(item.closed_at)}</td>
              <td>{money.format(Number(item.opening_amount) || 0)}</td>
              <td>{money.format(cash)}<small>{item.cash_sales_count || 0} pedidos</small></td>
              <td>{money.format(transfer)}<small>{item.transfer_sales_count || 0} pedidos</small></td>
              <td>{money.format(total)}</td>
              <td>{money.format(Number(item.expected_amount) || 0)}</td>
              <td>{money.format(Number(item.counted_amount) || 0)}</td>
              <td><strong className={Number(item.difference) === 0 ? '' : Number(item.difference) > 0 ? 'positive' : 'negative'}>{money.format(Number(item.difference) || 0)}</strong></td>
            </tr>
          })}</tbody>
        </table>
      </div> : <div className="empty-state">Aún no hay cierres de caja.</div>}
    </section>
  </>
}

export default CashRegister
