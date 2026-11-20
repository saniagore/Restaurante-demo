import { useEffect, useMemo, useState } from 'react'
import { resolveTicketBusiness } from '../lib/billing'
import { business as businessConfig } from '../config/business'
import {
  buildCustomerTicket,
  buildInvoiceTicket,
  buildKitchenTicket,
  normalizeTicketWidth,
  printHtml,
} from '../lib/print'

const TITLES = {
  kitchen: 'Comanda para cocina',
  customer: 'Cuenta del cliente',
  invoice: 'Documento fiscal',
}

function PrintDialog({ kind, order, invoice, settings, onClose }) {
  const [width, setWidth] = useState(() => normalizeTicketWidth(settings?.ticket_width))
  const ticketBusiness = useMemo(() => resolveTicketBusiness(settings, businessConfig.brand), [settings])
  const title = TITLES[kind] ?? 'Impresión'

  const html = useMemo(() => {
    if (kind === 'kitchen') return buildKitchenTicket(order, ticketBusiness, width)
    if (kind === 'invoice') {
      return buildInvoiceTicket(
        { ...invoice, invoice_resolution: settings?.invoice_resolution },
        order,
        ticketBusiness,
        width,
      )
    }
    return buildCustomerTicket(order, ticketBusiness, width, { title: invoice ? 'TIQUETE POS' : 'CUENTA' })
  }, [kind, order, invoice, ticketBusiness, width, settings])

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  function handlePrint() {
    if (!printHtml(html, title)) window.alert('El navegador bloqueó la impresión. Permite las ventanas emergentes e intenta de nuevo.')
  }

  return (
    <div className="billing-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="billing-modal print-modal" role="dialog" aria-modal="true" aria-labelledby="print-dialog-title">
        <header className="billing-modal-header">
          <div><p className="eyebrow">IMPRESIÓN · TIRILLA</p><h2 id="print-dialog-title">{title}</h2></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar">×</button>
        </header>

        <div className="ticket-format" role="radiogroup" aria-label="Ancho de la tirilla">
          {[58, 80].map((option) => (
            <button
              type="button"
              role="radio"
              aria-checked={width === option}
              key={option}
              className={width === option ? 'active' : ''}
              onClick={() => setWidth(option)}
            >
              {option} mm
            </button>
          ))}
          <span className="muted">La vista previa es aproximada; el navegador ajusta el papel al imprimir.</span>
        </div>

        <div className="ticket-preview">
          <iframe title="Vista previa del tiquete" srcDoc={html} sandbox="" style={{ width: width === 58 ? 240 : 320 }} />
        </div>

        <footer className="billing-modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cerrar</button>
          <button type="button" className="primary-button" onClick={handlePrint}>Imprimir {width} mm</button>
        </footer>
      </section>
    </div>
  )
}

export default PrintDialog
