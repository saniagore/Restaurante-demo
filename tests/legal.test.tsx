import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LEGAL_DOCS, getLegalDoc, isLegalSlug } from '../src/legal/content'
import { LegalPage } from '../src/legal/LegalPage'
import { SiteFooter } from '../src/components/SiteFooter'
import { business } from '../src/config/business'

beforeEach(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
  document.title = ''
})

describe('legal document registry', () => {
  it('registers the four required documents', () => {
    expect(LEGAL_DOCS.map((doc) => doc.slug)).toEqual(['terminos', 'privacidad', 'cookies', 'pqrs'])
    expect(isLegalSlug('terminos')).toBe(true)
    expect(isLegalSlug('admin')).toBe(false)
    expect(getLegalDoc('desconocido').slug).toBe('terminos')
  })

  it('numbers the sections and keeps unique anchors', () => {
    for (const doc of LEGAL_DOCS) {
      const ids = doc.sections.map((section) => section.id)
      expect(new Set(ids).size).toBe(ids.length)
      expect(doc.sections.length).toBeGreaterThan(4)
    }
  })
})

describe('legal pages', () => {
  it('renders the terms with provider identification and the electronic commerce duty', () => {
    render(<LegalPage slug="terminos" navigate={() => {}} />)
    expect(screen.getByRole('heading', { level: 1, name: /Términos y Condiciones del Servicio/i })).toBeInTheDocument()
    expect(screen.getAllByText(/DIRECCION DE NOTIFICACION JUDICIAL/).length).toBeGreaterThan(0)
    expect(screen.getByText(/artículo 50, literal a\), de la Ley 1480/i)).toBeInTheDocument()
    expect(screen.getAllByText(/precios finales al consumidor/i).length).toBeGreaterThan(0)
  })

  it('renders the privacy policy with sensitive data and ARCO channels', () => {
    render(<LegalPage slug="privacidad" navigate={() => {}} />)
    expect(screen.getByRole('heading', { level: 1, name: /Política de Privacidad y Tratamiento de Datos/i })).toBeInTheDocument()
    expect(screen.getByText(/alergias o condiciones de salud es un dato sensible/i)).toBeInTheDocument()
    expect(screen.getByText(/diez \(10\) días hábiles/i)).toBeInTheDocument()
    expect(screen.getByText(/Supabase Inc\./)).toBeInTheDocument()
  })

  it('renders the storage notice and the PQRS channels', () => {
    render(<LegalPage slug="cookies" navigate={() => {}} />)
    expect(screen.getByText(/restaurant-cart/)).toBeInTheDocument()
    expect(screen.getByText(/No utilizamos cookies de publicidad/i)).toBeInTheDocument()

    render(<LegalPage slug="pqrs" navigate={() => {}} />)
    expect(screen.getByRole('heading', { level: 1, name: /Peticiones, Quejas, Reclamos/i })).toBeInTheDocument()
    expect(screen.getAllByText(/quince \(15\) días hábiles/i).length).toBeGreaterThan(0)
  })

  it('updates the document title and returns to the previous one', () => {
    const { unmount } = render(<LegalPage slug="cookies" navigate={() => {}} />)
    expect(document.title).toContain('Aviso de Cookies')
    unmount()
    expect(document.title).toBe('')
  })
})

describe('site footer', () => {
  it('shows the legal links and the provider data', () => {
    render(<SiteFooter />)
    for (const doc of LEGAL_DOCS) {
      expect(screen.getByRole('link', { name: doc.shortTitle })).toHaveAttribute('href', `/${doc.slug}`)
    }
    expect(screen.getByText(business.legalName)).toBeInTheDocument()
    expect(screen.getByText(/NIT:/)).toBeInTheDocument()
  })

  it('uses the SPA navigation when a handler is provided', () => {
    const onNavigate = vi.fn()
    render(<SiteFooter onNavigate={onNavigate} />)
    screen.getByRole('link', { name: 'Términos y Condiciones' }).click()
    expect(onNavigate).toHaveBeenCalledWith('/terminos')
  })
})
