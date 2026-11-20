import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { business } from '../config/business'
import { getDayRange } from '../lib/order-filters'
import {
  DEFAULT_FISCAL_SETTINGS,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  MIGRATION_HINT,
  PAYMENT_METHODS,
  buildInvoiceExport,
  calculateInvoiceAmounts,
  daysSince,
  formatInvoiceNumber,
  isMissingSchemaError,
  isSameLocalDay,
  paymentErrorMessage,
  summarizeExpenses,
  summarizePayments,
  taxRatePercent,
} from '../lib/billing'
import { MoneyInput } from './MoneyInput'
import PaymentSplit from './PaymentSplit'
import PrintDialog from './PrintDialog'

const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const formatDate = (value) => value ? new Date(value).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '—'
const sum = (items, selector) => items.reduce((total, item) => total + (Number(selector(item)) || 0), 0)
const lastDaysIso = (days) => {
  const date = new Date()
  date.setDate(date.getDate() - days)
  date.setHours(0, 0, 0, 0)
  return date.toISOString()
}

const TABS = [
  { value: 'invoices', label: 'Facturas' },
  { value: 'receivables', label: 'Cobros y cartera' },
  { value: 'expenses', label: 'Gastos del día' },
  { value: 'settings', label: 'Configuración fiscal' },
]

function Billing({ onOpenCash }) {
  const [tab, setTab] = useState('invoices')
  const [settings, setSettings] = useState(DEFAULT_FISCAL_SETTINGS)
  const [settingsReady, setSettingsReady] = useState(false)
  const [settingsError, setSettingsError] = useState('')
  const [refreshToken, setRefreshToken] = useState(0)

  const loadSettings = useCallback(async () => {
    const { data, error } = await supabase.from('restaurant_settings').select('*').eq('id', true).maybeSingle()
    if (error) {
      console.error('No se pudo cargar la configuración fiscal', error)
      setSettingsError(isMissingSchemaError(error) ? MIGRATION_HINT : 'No se pudo cargar la configuración fiscal.')
    } else if (data) {
      setSettings({ ...DEFAULT_FISCAL_SETTINGS, ...data })
    }
    setSettingsReady(true)
  }, [])

  useEffect(() => {
    async function initializeSettings() {
      await loadSettings()
    }
    initializeSettings()
  }, [loadSettings])

  const refresh = () => setRefreshToken((value) => value + 1)

  return <>
    <header className="page-header billing-header">
      <div><p className="eyebrow">FINANZAS · FACTURACIÓN</p><h1>Facturación y finanzas</h1><p className="muted">Documentos POS, cobros mixtos, cuentas por cobrar y gastos operativos.</p></div>
      <button className="secondary-button" onClick={refresh}>↻ Actualizar</button>
    </header>

    {settingsError && <div className="alert" role="alert">{settingsError}<button aria-label="Cerrar alerta" onClick={() => setSettingsError('')}>×</button></div>}

    <nav className="billing-tabs" role="tablist" aria-label="Secciones de facturación">
      {TABS.map((option) => <button
        type="button"
        role="tab"
        key={option.value}
        aria-selected={tab === option.value}
        className={tab === option.value ? 'active' : ''}
        onClick={() => setTab(option.value)}
      >{option.label}</button>)}
    </nav>

    {!settingsReady ? <div className="empty-state">Cargando configuración fiscal...</div> : tab === 'invoices'
      ? <InvoicesTab settings={settings} refreshToken={refreshToken} />
      : tab === 'receivables'
        ? <ReceivablesTab settings={settings} refreshToken={refreshToken} />
        : tab === 'expenses'
          ? <ExpensesTab refreshToken={refreshToken} onOpenCash={onOpenCash} />
          : <SettingsTab settings={settings} onSaved={async () => { await loadSettings(); refresh() }} />}
  </>
}

/* ---------------------------------- Facturas --------------------------------- */

function InvoicesTab({ settings, refreshToken }) {
  const [invoices, setInvoices] = useState([])
  const [completedOrders, setCompletedOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [issuing, setIssuing] = useState(null)
  const [modalError, setModalError] = useState('')
  const [print, setPrint] = useState(null)
  const [working, setWorking] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const from = lastDaysIso(30)
    const [invoiceResult, orderResult] = await Promise.all([
      supabase
        .from('invoices')
        .select('*, orders(id,track_token,customer_name,total,created_at,order_type,notes,order_items(quantity,unit_price,dishes(nombre)),order_payments(method,amount,created_at,reference))')
        .gte('issued_at', from)
        .order('issued_at', { ascending: false })
        .limit(200),
      supabase
        .from('orders')
        .select('id,track_token,customer_name,total,created_at,order_type,notes,order_items(quantity,unit_price,dishes(nombre)),order_payments(method,amount,created_at,reference)')
        .eq('status', 'completed')
        .gte('created_at', from)
        .order('created_at', { ascending: false })
        .limit(200),
    ])

    if (invoiceResult.error) {
      console.error('No se pudieron cargar las facturas', invoiceResult.error)
      setError(isMissingSchemaError(invoiceResult.error) ? MIGRATION_HINT : 'No se pudieron cargar las facturas.')
      setInvoices([])
    } else {
      setInvoices(invoiceResult.data || [])
    }
    if (orderResult.error) {
      console.error('No se pudieron cargar los pedidos facturables', orderResult.error)
      setCompletedOrders([])
    } else {
      setCompletedOrders(orderResult.data || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    async function initializeInvoices() {
      await load()
    }
    initializeInvoices()
  }, [load, refreshToken])

  const invoicedOrderIds = useMemo(() => new Set(invoices.map((invoice) => invoice.order_id)), [invoices])
  const pendingOrders = useMemo(() => completedOrders.filter((order) => !invoicedOrderIds.has(order.id)), [completedOrders, invoicedOrderIds])
  const todayInvoices = useMemo(() => invoices.filter((invoice) => isSameLocalDay(invoice.issued_at) && invoice.status === 'issued'), [invoices])
  const voided = useMemo(() => invoices.filter((invoice) => invoice.status === 'void'), [invoices])
  const billedToday = sum(todayInvoices, (invoice) => invoice.total)
  const taxToday = sum(todayInvoices, (invoice) => invoice.tax_amount)
  const rate = Number(settings.invoice_tax_rate) || 0

  async function issueInvoice(event) {
    event.preventDefault()
    if (!issuing) return
    setModalError('')
    setWorking(true)
    const { data, error: rpcError } = await supabase.rpc('create_invoice', {
      p_order_id: issuing.id,
      p_customer_name: issuing.customerName,
      p_customer_tax_id: issuing.taxId || null,
      p_customer_email: issuing.email || null,
      p_document_type: issuing.documentType,
      p_notes: issuing.notes || null,
    })
    if (rpcError) {
      console.error('No se pudo emitir la factura', rpcError)
      setModalError(paymentErrorMessage(rpcError))
      setWorking(false)
      return
    }
    const created = Array.isArray(data) ? data[0] : data
    setNotice('Documento emitido. Revisa la vista previa antes de imprimir.')
    setIssuing(null)
    await load()
    if (created) setPrint({ invoice: created, order: issuing.order })
    setWorking(false)
  }

  function openIssueModal(order) {
    setModalError('')
    setNotice('')
    setIssuing({
      order,
      customerName: order.customer_name || 'Consumidor final',
      taxId: '',
      email: '',
      documentType: 'pos',
      notes: '',
    })
  }

  async function voidInvoice(invoice) {
    const reason = window.prompt(`Motivo de la anulación de ${formatInvoiceNumber(invoice.prefix, invoice.number)}:`)
    if (reason === null) return
    if (!reason.trim()) { window.alert('Escribe el motivo de la anulación.'); return }
    setWorking(true)
    const { error: voidError } = await supabase.from('invoices').update({
      status: 'void',
      void_reason: reason.trim(),
      voided_at: new Date().toISOString(),
    }).eq('id', invoice.id)
    if (voidError) {
      console.error('No se pudo anular la factura', voidError)
      setError(paymentErrorMessage(voidError))
    } else {
      setNotice('Documento anulado. El consecutivo no se reutiliza.')
      await load()
    }
    setWorking(false)
  }

  async function exportInvoice(invoice) {
    setWorking(true)
    setError('')
    try {
      const payload = buildInvoiceExport(invoice, invoice.orders)
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${formatInvoiceNumber(invoice.prefix, invoice.number)}.json`
      link.click()
      URL.revokeObjectURL(url)
      const { error: updateError } = await supabase.from('invoices').update({ dian_status: 'exported' }).eq('id', invoice.id)
      if (updateError) console.error('No se pudo marcar la factura como exportada', updateError)
      setNotice('JSON exportado. Envíalo a tu proveedor tecnológico para la transmisión fiscal.')
      await load()
    } catch (exportError) {
      console.error('No se pudo exportar la factura', exportError)
      setError('No se pudo generar el archivo de exportación.')
    }
    setWorking(false)
  }

  const preview = issuing ? calculateInvoiceAmounts(issuing.order.total, rate) : null

  return <>
    <div className="alert billing-info" role="note">
      <span>Este módulo emite el documento equivalente POS y exporta el JSON para tu proveedor. La transmisión a la DIAN no está incluida: requiere proveedor habilitado y resolución propia.</span>
    </div>

    {error && <div className="alert" role="alert">{error}<button aria-label="Cerrar alerta" onClick={() => setError('')}>×</button></div>}
    {notice && <div className="alert billing-success" role="status">{notice}<button aria-label="Cerrar aviso" onClick={() => setNotice('')}>×</button></div>}

    <section className="billing-kpis">
      <article><span>Facturado hoy</span><strong>{money.format(billedToday)}</strong><small>{todayInvoices.length} {todayInvoices.length === 1 ? 'documento' : 'documentos'}</small></article>
      <article><span>Impuesto de hoy</span><strong>{money.format(taxToday)}</strong><small>{taxRatePercent(rate)} incluido en precios</small></article>
      <article><span>Por emitir</span><strong>{pendingOrders.length}</strong><small>Pedidos completados sin documento</small></article>
      <article><span>Anuladas</span><strong>{voided.length}</strong><small>Últimos 30 días</small></article>
    </section>

    <section className="panel billing-panel">
      <div className="panel-heading">
        <div><h2>Documentos emitidos</h2><p className="muted">Últimos 30 días. El consecutivo se asigna de forma atómica por prefijo.</p></div>
        <span className="dish-count">{invoices.length} {invoices.length === 1 ? 'documento' : 'documentos'}</span>
      </div>
      {loading ? <div className="empty-state">Cargando facturas...</div> : !invoices.length ? <div className="empty-state">Todavía no hay documentos emitidos.</div> : <div className="billing-table-wrap">
        <table className="billing-table">
          <thead><tr><th>Número</th><th>Fecha</th><th>Cliente</th><th>Pedido</th><th>Total</th><th>Impuesto</th><th>Estado</th><th>DIAN</th><th /></tr></thead>
          <tbody>{invoices.map((invoice) => <tr key={invoice.id}>
            <td><strong>{formatInvoiceNumber(invoice.prefix, invoice.number)}</strong><small>{invoice.document_type === 'electronic' ? 'Factura electrónica' : 'Documento POS'}</small></td>
            <td>{formatDate(invoice.issued_at)}</td>
            <td>{invoice.customer_name}<small>{invoice.customer_tax_id || 'Consumidor final'}</small></td>
            <td>#{String(invoice.orders?.track_token || invoice.order_id || '').slice(-6).toUpperCase()}</td>
            <td><strong>{money.format(Number(invoice.total) || 0)}</strong></td>
            <td>{money.format(Number(invoice.tax_amount) || 0)}</td>
            <td><span className={invoice.status === 'void' ? 'billing-status void' : 'billing-status issued'}>{invoice.status === 'void' ? 'Anulada' : 'Emitida'}</span>{invoice.status === 'void' && invoice.void_reason && <small>{invoice.void_reason}</small>}</td>
            <td><span className={invoice.dian_status === 'exported' ? 'billing-status exported' : 'billing-status draft'}>{invoice.dian_status === 'exported' ? 'Exportada' : 'Sin enviar'}</span></td>
            <td className="billing-actions">
              <button type="button" className="text-button" onClick={() => setPrint({ invoice, order: invoice.orders })}>Imprimir</button>
              <button type="button" className="text-button" onClick={() => exportInvoice(invoice)} disabled={working}>JSON</button>
              {invoice.status === 'issued' && <button type="button" className="text-button danger" onClick={() => voidInvoice(invoice)} disabled={working}>Anular</button>}
            </td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>

    <section className="panel billing-panel">
      <div className="panel-heading">
        <div><h2>Pedidos completados por facturar</h2><p className="muted">Puedes emitir el documento al completar el pedido o hacerlo aquí.</p></div>
        <span className="dish-count">{pendingOrders.length} {pendingOrders.length === 1 ? 'pendiente' : 'pendientes'}</span>
      </div>
      {loading ? <div className="empty-state">Cargando pedidos...</div> : !pendingOrders.length ? <div className="empty-state">Todos los pedidos completados de los últimos 30 días tienen documento.</div> : <div className="billing-table-wrap">
        <table className="billing-table">
          <thead><tr><th>Pedido</th><th>Fecha</th><th>Cliente</th><th>Total</th><th /></tr></thead>
          <tbody>{pendingOrders.map((order) => <tr key={order.id}>
            <td><strong>#{String(order.track_token || order.id).slice(-6).toUpperCase()}</strong></td>
            <td>{formatDate(order.created_at)}</td>
            <td>{order.customer_name || 'Cliente'}</td>
            <td><strong>{money.format(Number(order.total) || 0)}</strong></td>
            <td className="billing-actions"><button type="button" className="secondary-button" onClick={() => openIssueModal(order)}>Emitir documento</button></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>

    {issuing && <div className="billing-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIssuing(null) }}>
      <section className="billing-modal" role="dialog" aria-modal="true" aria-labelledby="issue-dialog-title">
        <header className="billing-modal-header">
          <div><p className="eyebrow">EMISIÓN FISCAL</p><h2 id="issue-dialog-title">Emitir documento</h2><p className="muted">Pedido #{String(issuing.order.track_token || issuing.order.id).slice(-6).toUpperCase()} · {money.format(Number(issuing.order.total) || 0)}</p></div>
          <button type="button" className="icon-button" onClick={() => setIssuing(null)} aria-label="Cerrar">×</button>
        </header>
        <form className="billing-form-grid" onSubmit={issueInvoice}>
          <label>Nombre o razón social<input required value={issuing.customerName} onChange={(event) => setIssuing({ ...issuing, customerName: event.target.value })} /></label>
          <label>NIT o cédula (opcional)<input value={issuing.taxId} onChange={(event) => setIssuing({ ...issuing, taxId: event.target.value })} placeholder="Consumidor final" /></label>
          <label>Correo (opcional)<input type="email" value={issuing.email} onChange={(event) => setIssuing({ ...issuing, email: event.target.value })} placeholder="cliente@correo.com" /></label>
          <label>Tipo de documento<select value={issuing.documentType} onChange={(event) => setIssuing({ ...issuing, documentType: event.target.value })}>
            <option value="pos">Documento equivalente POS</option>
            <option value="electronic">Factura electrónica (requiere proveedor)</option>
          </select></label>
          <label className="billing-form-wide">Notas<input value={issuing.notes} onChange={(event) => setIssuing({ ...issuing, notes: event.target.value })} placeholder="Opcional" /></label>
          <div className="billing-invoice-preview billing-form-wide">
            <div><span>Base gravable</span><strong>{money.format(preview.base)}</strong></div>
            <div><span>Impuesto ({taxRatePercent(rate)})</span><strong>{money.format(preview.tax)}</strong></div>
            <div><span>Total</span><strong>{money.format(preview.total)}</strong></div>
          </div>
          {modalError && <div className="alert billing-form-wide" role="alert">{modalError}<button type="button" aria-label="Cerrar alerta" onClick={() => setModalError('')}>×</button></div>}
          <footer className="billing-modal-actions billing-form-wide">
            <button type="button" className="secondary-button" onClick={() => setIssuing(null)}>Cancelar</button>
            <button className="primary-button" disabled={working}>{working ? 'Emitiendo...' : 'Emitir e imprimir'}</button>
          </footer>
        </form>
      </section>
    </div>}

    {print && <PrintDialog kind="invoice" invoice={print.invoice} order={print.order} settings={settings} onClose={() => setPrint(null)} />}
  </>
}

/* ------------------------------- Cobros y cartera ---------------------------- */

function ReceivablesTab({ settings, refreshToken }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [print, setPrint] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, error: queryError } = await supabase
      .from('orders')
      .select('id,track_token,customer_name,customer_phone,total,status,created_at,order_items(quantity,unit_price,dishes(nombre)),order_payments(id,method,amount,created_at,reference)')
      .neq('status', 'cancelled')
      .gte('created_at', lastDaysIso(60))
      .order('created_at', { ascending: true })
      .limit(300)
    if (queryError) {
      console.error('No se pudieron cargar las cuentas por cobrar', queryError)
      setError(isMissingSchemaError(queryError) ? MIGRATION_HINT : 'No se pudieron cargar los cobros y la cartera.')
      setOrders([])
    } else {
      setOrders(data || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    async function initializeReceivables() {
      await load()
    }
    initializeReceivables()
  }, [load, refreshToken])

  const paymentsToday = useMemo(() => {
    const result = new Map()
    for (const order of orders) {
      for (const payment of order.order_payments ?? []) {
        if (!isSameLocalDay(payment.created_at)) continue
        const method = payment.method || 'cash'
        result.set(method, (result.get(method) ?? 0) + (Number(payment.amount) || 0))
      }
    }
    return result
  }, [orders])

  const receivables = useMemo(() => orders
    .map((order) => ({ order, summary: summarizePayments(order.order_payments, order.total) }))
    .filter(({ summary }) => summary.paid > 0 && summary.pending > 0)
    .filter(({ order }) => {
      const term = search.trim().toLowerCase()
      if (!term) return true
      return String(order.customer_name || '').toLowerCase().includes(term)
        || String(order.track_token || order.id || '').toLowerCase().includes(term)
    }), [orders, search])

  const totalReceivable = sum(receivables, (item) => item.summary.pending)
  const oldestDays = Math.max(0, ...receivables.map((item) => daysSince(item.order.created_at)))
  const collectedToday = [...paymentsToday.values()].reduce((total, value) => total + value, 0)

  return <>
    {error && <div className="alert" role="alert">{error}<button aria-label="Cerrar alerta" onClick={() => setError('')}>×</button></div>}

    <section className="billing-kpis">
      <article><span>Cartera pendiente</span><strong>{money.format(totalReceivable)}</strong><small>{receivables.length} {receivables.length === 1 ? 'pedido' : 'pedidos'} con saldo</small></article>
      <article><span>Cobrado hoy</span><strong className="positive">{money.format(collectedToday)}</strong><small>Todos los medios de pago</small></article>
      <article><span>Saldo más antiguo</span><strong>{oldestDays} {oldestDays === 1 ? 'día' : 'días'}</strong><small>Desde la creación del pedido</small></article>
      <article><span>Medios usados hoy</span><strong>{paymentsToday.size}</strong><small>Efectivo, Nequi, Daviplata, tarjeta o transferencia</small></article>
    </section>

    {paymentsToday.size > 0 && <section className="panel billing-collections">
      <div className="panel-heading"><div><h2>Cobros de hoy</h2><p className="muted">Lo recibido hoy por cada medio, incluyendo abonos de cartera.</p></div></div>
      <div className="billing-method-grid">
        {PAYMENT_METHODS.map((method) => <div key={method.value} className={paymentsToday.has(method.value) ? 'billing-method active' : 'billing-method'}>
          <span>{method.label}</span><strong>{money.format(paymentsToday.get(method.value) ?? 0)}</strong>
        </div>)}
      </div>
    </section>}

    <section className="panel billing-panel">
      <div className="panel-heading">
        <div><h2>Cuentas por cobrar</h2><p className="muted">Pedidos con pagos parciales registrados. Abre el detalle para completar el cobro.</p></div>
        <label className="billing-search">Buscar<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cliente o código" /></label>
      </div>
      {loading ? <div className="empty-state">Cargando cartera...</div> : !receivables.length ? <div className="empty-state">No hay saldos pendientes en los últimos 60 días.</div> : <div className="billing-table-wrap">
        <table className="billing-table">
          <thead><tr><th>Pedido</th><th>Cliente</th><th>Fecha</th><th>Total</th><th>Pagado</th><th>Saldo</th><th>Días</th><th /></tr></thead>
          <tbody>{receivables.map(({ order, summary }) => {
            const expanded = expandedId === order.id
            return <tr key={order.id} className={expanded ? 'expanded' : ''}>
              <td><strong>#{String(order.track_token || order.id).slice(-6).toUpperCase()}</strong></td>
              <td>{order.customer_name || 'Cliente'}<small>{order.customer_phone || '—'}</small></td>
              <td>{formatDate(order.created_at)}</td>
              <td>{money.format(summary.total)}</td>
              <td className="positive">{money.format(summary.paid)}</td>
              <td><strong className="negative">{money.format(summary.pending)}</strong></td>
              <td>{daysSince(order.created_at)}</td>
              <td className="billing-actions">
                <button type="button" className="text-button" onClick={() => setExpandedId(expanded ? null : order.id)}>{expanded ? 'Ocultar' : 'Cobrar'}</button>
                <button type="button" className="text-button" onClick={() => setPrint({ invoice: null, order })}>Cuenta</button>
              </td>
            </tr>
          })}</tbody>
        </table>
      </div>}
    </section>

    {expandedId && <section className="panel billing-panel">
      {(() => {
        const selected = receivables.find((item) => item.order.id === expandedId)
        if (!selected) return null
        return <>
          <div className="panel-heading"><div><h2>Cobro del pedido #{String(selected.order.track_token || selected.order.id).slice(-6).toUpperCase()}</h2><p className="muted">Puedes dividir el pago entre varios medios.</p></div><button type="button" className="text-button" onClick={() => setExpandedId(null)}>Cerrar</button></div>
          <PaymentSplit key={`${selected.order.id}-${selected.summary.paid}`} order={selected.order} onChanged={async () => { await load() }} />
        </>
      })()}
    </section>}

    {print && <PrintDialog kind="customer" order={print.order} settings={settings} onClose={() => setPrint(null)} />}
  </>
}

/* ---------------------------------- Gastos ---------------------------------- */

function ExpensesTab({ refreshToken, onOpenCash }) {
  const [movements, setMovements] = useState([])
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [working, setWorking] = useState(false)
  const [category, setCategory] = useState('hielo')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const { startIso, endIso } = getDayRange()
    const [sessionResult, movementResult] = await Promise.all([
      supabase.from('cash_sessions').select('id,opened_at').eq('status', 'open').order('opened_at', { ascending: false }).limit(1),
      supabase.from('cash_movements').select('*').gte('created_at', startIso).lt('created_at', endIso).order('created_at', { ascending: false }),
    ])
    if (sessionResult.error) {
      console.error('No se pudo consultar la caja abierta', sessionResult.error)
      setSession(null)
    } else {
      setSession(sessionResult.data?.[0] || null)
    }
    if (movementResult.error) {
      console.error('No se pudieron cargar los gastos', movementResult.error)
      setError(isMissingSchemaError(movementResult.error) ? MIGRATION_HINT : 'No se pudieron cargar los gastos del día.')
      setMovements([])
    } else {
      setMovements(movementResult.data || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    async function initializeExpenses() {
      await load()
    }
    initializeExpenses()
  }, [load, refreshToken])

  const summary = useMemo(() => summarizeExpenses(movements), [movements])
  const withdrawals = useMemo(() => sum(movements.filter((movement) => movement.type === 'withdrawal'), (movement) => movement.amount), [movements])
  const maxCategory = Math.max(1, ...summary.byCategory.map((group) => group.amount))

  async function addExpense(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (!session) {
      setError('Abre la caja para registrar gastos de la caja menor.')
      return
    }
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) {
      setError('El monto del gasto debe ser mayor que cero.')
      return
    }
    setWorking(true)
    const { error: insertError } = await supabase.from('cash_movements').insert({
      session_id: session.id,
      type: 'expense',
      category,
      amount: value,
      description: description.trim() || EXPENSE_CATEGORY_LABELS[category],
    })
    if (insertError) {
      console.error('No se pudo registrar el gasto', insertError)
      setError(isMissingSchemaError(insertError) ? MIGRATION_HINT : 'No se pudo registrar el gasto.')
    } else {
      setNotice('Gasto registrado y descontado del efectivo esperado.')
      setAmount('')
      setDescription('')
      await load()
    }
    setWorking(false)
  }

  async function deleteExpense(movement) {
    if (!window.confirm('¿Eliminar este gasto? El efectivo esperado volverá a subir.')) return
    setWorking(true)
    const { error: deleteError } = await supabase.from('cash_movements').delete().eq('id', movement.id)
    if (deleteError) {
      console.error('No se pudo eliminar el gasto', deleteError)
      setError('No se pudo eliminar el gasto.')
    } else {
      await load()
    }
    setWorking(false)
  }

  return <>
    {error && <div className="alert" role="alert">{error}<button aria-label="Cerrar alerta" onClick={() => setError('')}>×</button></div>}
    {notice && <div className="alert billing-success" role="status">{notice}<button aria-label="Cerrar aviso" onClick={() => setNotice('')}>×</button></div>}

    <section className="billing-kpis">
      <article><span>Gastos de hoy</span><strong>{money.format(summary.total)}</strong><small>{summary.count} {summary.count === 1 ? 'movimiento' : 'movimientos'}</small></article>
      <article><span>Categoría más usada</span><strong>{summary.byCategory[0]?.label || '—'}</strong><small>{summary.byCategory[0] ? money.format(summary.byCategory[0].amount) : 'Sin gastos'}</small></article>
      <article><span>Retiros de caja</span><strong>{money.format(withdrawals)}</strong><small>No cuentan como gasto</small></article>
      <article><span>Caja</span><strong>{session ? 'Abierta' : 'Cerrada'}</strong><small>{session ? `Desde ${formatDate(session.opened_at)}` : 'Abre la caja para registrar gastos'}</small></article>
    </section>

    <div className="billing-expenses-grid">
      <section className="panel">
        <div className="panel-heading"><div><h2>Registrar gasto rápido</h2><p className="muted">Sale de la caja menor y cuadra el cierre de caja.</p></div></div>
        {!session && <div className="alert billing-warning" role="status">No hay una caja abierta. {onOpenCash && <button type="button" className="text-button" onClick={onOpenCash}>Ir a Caja</button>}</div>}
        <form className="expense-form" onSubmit={addExpense}>
          <div className="expense-chips" role="group" aria-label="Categoría del gasto">
            {EXPENSE_CATEGORIES.map((option) => <button
              type="button"
              key={option.value}
              className={category === option.value ? 'active' : ''}
              onClick={() => setCategory(option.value)}
              title={option.hint}
            >{option.label}</button>)}
          </div>
          <label>Descripción<input value={description} onChange={(event) => setDescription(event.target.value)} placeholder={EXPENSE_CATEGORIES.find((option) => option.value === category)?.hint || 'Detalle del gasto'} /></label>
          <label>Monto<MoneyInput required value={amount} onChange={setAmount} placeholder="0" aria-label="Monto del gasto" /></label>
          <button className="primary-button" disabled={working || !session}>{working ? 'Guardando...' : 'Registrar gasto'}</button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-heading"><div><h2>Resumen por categoría</h2><p className="muted">Solo gastos operativos de hoy; los retiros van aparte.</p></div></div>
        {summary.byCategory.length === 0 ? <div className="empty-state">Sin gastos registrados hoy.</div> : <div className="expense-bars">
          {summary.byCategory.map((group) => <div className="expense-bar" key={group.category}>
            <div><span>{group.label}</span><strong>{money.format(group.amount)}</strong></div>
            <div className="expense-bar-track"><span style={{ width: `${Math.round((group.amount / maxCategory) * 100)}%` }} /></div>
            <small>{group.count} {group.count === 1 ? 'movimiento' : 'movimientos'}</small>
          </div>)}
        </div>}
      </section>
    </div>

    <section className="panel billing-panel">
      <div className="panel-heading"><div><h2>Movimientos de hoy</h2><p className="muted">Gastos, retiros e ingresos manuales registrados en la caja.</p></div><span className="dish-count">{movements.length} movimientos</span></div>
      {loading ? <div className="empty-state">Cargando movimientos...</div> : !movements.length ? <div className="empty-state">No hay movimientos de caja hoy.</div> : <div className="billing-table-wrap">
        <table className="billing-table">
          <thead><tr><th>Hora</th><th>Tipo</th><th>Categoría</th><th>Descripción</th><th>Monto</th><th /></tr></thead>
          <tbody>{movements.map((movement) => <tr key={movement.id}>
            <td>{new Date(movement.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</td>
            <td><span className={`billing-status ${movement.type === 'expense' ? 'void' : movement.type === 'withdrawal' ? 'draft' : 'issued'}`}>{movement.type === 'expense' ? 'Gasto' : movement.type === 'withdrawal' ? 'Retiro' : 'Ingreso'}</span></td>
            <td>{movement.category ? EXPENSE_CATEGORY_LABELS[movement.category] || movement.category : '—'}</td>
            <td>{movement.description || 'Sin descripción'}</td>
            <td className={movement.type === 'income' ? 'positive' : ''}><strong>{money.format(Number(movement.amount) || 0)}</strong></td>
            <td className="billing-actions"><button type="button" className="text-button danger" onClick={() => deleteExpense(movement)} disabled={working}>Eliminar</button></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  </>
}

/* ------------------------------- Configuración ------------------------------- */

function SettingsTab({ settings, onSaved }) {
  const [form, setForm] = useState(() => toSettingsForm(settings))
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function saveSettings(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    const rate = Number(form.taxPercent)
    if (!Number.isFinite(rate) || rate < 0 || rate >= 100) {
      setError('El impuesto debe estar entre 0 y 99.99%.')
      return
    }
    const rangeFrom = form.rangeFrom ? Number(form.rangeFrom) : null
    const rangeTo = form.rangeTo ? Number(form.rangeTo) : null
    if (rangeFrom !== null && rangeTo !== null && rangeFrom > rangeTo) {
      setError('El rango inicial no puede ser mayor que el final.')
      return
    }
    setWorking(true)
    const { error: updateError } = await supabase.from('restaurant_settings').update({
      invoice_business_name: form.businessName.trim() || null,
      invoice_tax_id: form.taxId.trim() || null,
      invoice_address: form.address.trim() || null,
      invoice_phone: form.phone.trim() || null,
      invoice_prefix: form.prefix.trim().toUpperCase() || 'POS',
      invoice_tax_rate: rate / 100,
      invoice_resolution: form.resolution.trim() || null,
      invoice_range_from: rangeFrom,
      invoice_range_to: rangeTo,
      ticket_width: Number(form.ticketWidth),
      auto_invoice_on_complete: form.autoInvoice,
    }).eq('id', true)
    if (updateError) {
      console.error('No se pudo guardar la configuración fiscal', updateError)
      setError(isMissingSchemaError(updateError) ? MIGRATION_HINT : 'No se pudo guardar la configuración fiscal.')
    } else {
      setNotice('Configuración fiscal guardada. Aplica a los próximos documentos.')
      await onSaved?.()
    }
    setWorking(false)
  }

  return <>
    {error && <div className="alert" role="alert">{error}<button aria-label="Cerrar alerta" onClick={() => setError('')}>×</button></div>}
    {notice && <div className="alert billing-success" role="status">{notice}<button aria-label="Cerrar aviso" onClick={() => setNotice('')}>×</button></div>}

    <div className="alert billing-info" role="note">
      <span><strong>Integración fiscal.</strong> Estos datos se imprimen en el documento y alimentan el JSON de exportación. La emisión electrónica válida ante la DIAN exige proveedor tecnológico habilitado, certificado y resolución de numeración; este panel no transmite documentos.</span>
    </div>

    <form className="panel billing-settings" onSubmit={saveSettings}>
      <div className="panel-heading"><div><h2>Datos del emisor</h2><p className="muted">Aparecen en la cabecera de facturas y tiquetes.</p></div></div>
      <div className="billing-form-grid">
        <label>Razón social<input value={form.businessName} onChange={(event) => update('businessName', event.target.value)} placeholder={business.brand} /></label>
        <label>NIT<input value={form.taxId} onChange={(event) => update('taxId', event.target.value)} placeholder="900123456-7" /></label>
        <label>Dirección fiscal<input value={form.address} onChange={(event) => update('address', event.target.value)} placeholder="Calle 1 #2-3, Ciudad" /></label>
        <label>Teléfono<input value={form.phone} onChange={(event) => update('phone', event.target.value)} placeholder="300 123 4567" /></label>
      </div>

      <div className="panel-heading billing-subheading"><div><h2>Numeración e impuestos</h2><p className="muted">El consecutivo se incrementa una sola vez por documento emitido.</p></div></div>
      <div className="billing-form-grid">
        <label>Prefijo<input value={form.prefix} onChange={(event) => update('prefix', event.target.value)} maxLength={10} placeholder="POS" /></label>
        <label>Impuesto incluido (%)<input type="number" min="0" max="99.99" step="0.01" value={form.taxPercent} onChange={(event) => update('taxPercent', event.target.value)} /></label>
        <label>Resolución / autorización<input value={form.resolution} onChange={(event) => update('resolution', event.target.value)} placeholder="Número de resolución" /></label>
        <label>Ancho de tirilla<select value={form.ticketWidth} onChange={(event) => update('ticketWidth', event.target.value)}><option value={58}>58 mm</option><option value={80}>80 mm</option></select></label>
        <label>Rango desde<input type="number" min="1" value={form.rangeFrom} onChange={(event) => update('rangeFrom', event.target.value)} placeholder="1" /></label>
        <label>Rango hasta<input type="number" min="1" value={form.rangeTo} onChange={(event) => update('rangeTo', event.target.value)} placeholder="5000" /></label>
      </div>

      <label className="billing-checkbox"><input type="checkbox" checked={form.autoInvoice} onChange={(event) => update('autoInvoice', event.target.checked)} /> Emitir el documento automáticamente cuando un pedido se marca como completado</label>

      <footer className="billing-modal-actions">
        <button className="primary-button" disabled={working}>{working ? 'Guardando...' : 'Guardar configuración'}</button>
      </footer>
    </form>
  </>
}

function toSettingsForm(settings) {
  return {
    businessName: settings.invoice_business_name || '',
    taxId: settings.invoice_tax_id || '',
    address: settings.invoice_address || '',
    phone: settings.invoice_phone || '',
    prefix: settings.invoice_prefix || 'POS',
    taxPercent: String(Math.round((Number(settings.invoice_tax_rate) || 0) * 10000) / 100),
    resolution: settings.invoice_resolution || '',
    rangeFrom: settings.invoice_range_from ?? '',
    rangeTo: settings.invoice_range_to ?? '',
    ticketWidth: String(settings.ticket_width || 80),
    autoInvoice: Boolean(settings.auto_invoice_on_complete),
  }
}

export default Billing
