import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { PAYMENT_METHODS, paymentErrorMessage, paymentMethodLabel, summarizePayments } from '../lib/billing'
import { MoneyInput } from './MoneyInput'

const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const formatDate = (value) => value ? new Date(value).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : ''

function PaymentSplit({ order, onChanged, compact = false }) {
  const summary = useMemo(() => summarizePayments(order.order_payments, order.total), [order])
  const [method, setMethod] = useState('cash')
  const [amount, setAmount] = useState(() => summary.pending > 0 ? String(Math.round(summary.pending)) : '')
  const [reference, setReference] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const progress = summary.total > 0 ? Math.min(100, Math.round((summary.paid / summary.total) * 100)) : 0

  async function registerPayment(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) {
      setError('Escribe un monto mayor que cero.')
      return
    }
    if (value > summary.pending + 0.01) {
      setError(`El saldo pendiente es ${money.format(summary.pending)}.`)
      return
    }
    setWorking(true)
    const { error: rpcError } = await supabase.rpc('register_order_payment', {
      p_order_id: order.id,
      p_method: method,
      p_amount: value,
      p_reference: reference.trim() || null,
    })
    if (rpcError) {
      setError(paymentErrorMessage(rpcError))
    } else {
      setNotice('Pago registrado.')
      setAmount('')
      setReference('')
      await onChanged?.()
    }
    setWorking(false)
  }

  async function deletePayment(payment) {
    if (!payment.id) return
    if (!window.confirm('¿Eliminar este pago registrado? El saldo del pedido volverá a quedar pendiente.')) return
    setWorking(true)
    setError('')
    const { error: deleteError } = await supabase.from('order_payments').delete().eq('id', payment.id)
    if (deleteError) {
      setError(paymentErrorMessage(deleteError))
    } else {
      const remaining = (order.order_payments ?? []).filter((item) => item.id !== payment.id)
      if (remaining.length > 0) {
        const allCash = remaining.every((item) => item.method === 'cash')
        await supabase.from('orders').update({ payment_method: allCash ? 'cash' : 'transfer' }).eq('id', order.id)
      }
      setNotice('Pago eliminado.')
      await onChanged?.()
    }
    setWorking(false)
  }

  return (
    <section className={compact ? 'payment-split compact' : 'payment-split'} aria-label="Cobro del pedido">
      <div className="payment-summary">
        <div><span>Total</span><strong>{money.format(summary.total)}</strong></div>
        <div><span>Pagado</span><strong className="positive">{money.format(summary.paid)}</strong></div>
        <div><span>Saldo</span><strong className={summary.pending > 0 ? 'negative' : 'positive'}>{money.format(summary.pending)}</strong></div>
      </div>
      <div className="payment-progress" role="progressbar" aria-valuenow={progress} aria-valuemin="0" aria-valuemax="100">
        <span style={{ width: `${progress}%` }} />
      </div>

      {summary.overpaid > 0 && <p className="payment-warning">Hay {money.format(summary.overpaid)} por encima del total del pedido.</p>}
      {error && <div className="alert" role="alert">{error}<button type="button" aria-label="Cerrar alerta" onClick={() => setError('')}>×</button></div>}
      {notice && <p className="payment-notice" role="status">{notice}</p>}

      {summary.methods.length > 0 && <div className="payment-list">
        {summary.methods.map((item) => <span key={item.method} className={`payment-chip ${item.method === 'cash' ? 'cash' : 'electronic'}`}>{item.label} · {money.format(item.amount)}</span>)}
      </div>}

      {(order.order_payments ?? []).length > 0 && <div className="payment-rows">
        {order.order_payments.map((payment, index) => <div className="payment-row" key={payment.id || index}>
          <span className="payment-method">{paymentMethodLabel(payment.method)}</span>
          <span className="payment-reference">{payment.reference || 'Sin referencia'}</span>
          <small>{formatDate(payment.created_at)}</small>
          <strong>{money.format(Number(payment.amount) || 0)}</strong>
          <button type="button" className="text-button" onClick={() => deletePayment(payment)} disabled={working}>Eliminar</button>
        </div>)}
      </div>}

      {(order.order_payments ?? []).length === 0 && <p className="payment-hint">Aún no hay pagos registrados. Método actual del pedido: <strong>{paymentMethodLabel(order.payment_method)}</strong>.</p>}

      {summary.pending > 0 ? <form className="payment-form" onSubmit={registerPayment}>
        <label>Medio de pago<select value={method} onChange={(event) => setMethod(event.target.value)} disabled={working}>
          {PAYMENT_METHODS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select></label>
        <label>Monto<MoneyInput required value={amount} onChange={setAmount} placeholder="0" aria-label="Monto del pago" /></label>
        <label>Referencia<input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Aprobación, last4, nota" /></label>
        <div className="payment-actions">
          <button type="button" className="text-button" onClick={() => setAmount(String(Math.round(summary.pending)))} disabled={working}>Usar saldo</button>
          <button type="button" className="text-button" onClick={() => setAmount(String(Math.round(summary.pending / 2)))} disabled={working}>Mitad</button>
          <button className="primary-button" disabled={working}>{working ? 'Guardando...' : 'Registrar pago'}</button>
        </div>
      </form> : <p className="payment-settled">✓ Pedido cobrado en su totalidad.</p>}
    </section>
  )
}

export default PaymentSplit
