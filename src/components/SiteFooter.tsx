import type { MouseEvent } from 'react'
import { business, LEGAL_VERSION, looksLikeEmail, looksLikePhone, priceNotice } from '../config/business'
import { LEGAL_DOCS } from '../legal/content'

type SiteFooterProps = {
  onNavigate?: (to: string) => void
}

export function SiteFooter({ onNavigate }: SiteFooterProps) {
  const year = new Date().getFullYear()
  const navigate = (to: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (!onNavigate) return
    event.preventDefault()
    onNavigate(to)
  }
  return <footer className="site-footer">
    <div className="footer-grid">
      <section className="footer-brand">
        <div className="footer-brand-name"><span className="brand-mark">M</span><span>{business.brand}<small>{business.tagline}</small></span></div>
        <p className="footer-price-note">{priceNotice}</p>
      </section>
      <section className="footer-block">
        <h2>Datos del proveedor</h2>
        <p>{business.legalName}</p>
        <p>NIT: {business.taxId}</p>
        <p>{business.legalAddress}, {business.city}</p>
      </section>
      <section className="footer-block">
        <h2>Atención al cliente</h2>
        <p>{looksLikePhone(business.phone) ? <a href={`tel:${business.phone.replace(/[^\d+]/g, '')}`}>{business.phone}</a> : business.phone}</p>
        <p>{looksLikeEmail(business.email) ? <a href={`mailto:${business.email}`}>{business.email}</a> : business.email}</p>
        <p>PQRS: {looksLikeEmail(business.pqrsEmail) ? <a href={`mailto:${business.pqrsEmail}`}>{business.pqrsEmail}</a> : business.pqrsEmail}</p>
        <p>{business.hours}</p>
      </section>
      <nav className="footer-block footer-links" aria-label="Información legal">
        <h2>Información legal</h2>
        {LEGAL_DOCS.map((doc) => <a key={doc.slug} href={`/${doc.slug}`} onClick={navigate(`/${doc.slug}`)}>{doc.shortTitle}</a>)}
        <p className="footer-version">Versión legal {LEGAL_VERSION}</p>
      </nav>
    </div>
    <div className="footer-bottom">
      <span>© {year} {business.brand}</span>
      <span>Precios finales en pesos colombianos (COP), con impuestos incluidos.</span>
    </div>
  </footer>
}
