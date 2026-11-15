import { useEffect, useRef, useState } from 'react'
import { LEGAL_LAST_UPDATED, LEGAL_VERSION } from '../config/business'
import { LEGAL_DOCS, getLegalDoc, type LegalDocSlug } from './content'
import { LegalSections } from './LegalSections'

type LegalModalProps = {
  slug: LegalDocSlug
  onClose: () => void
}

const FOCUSABLE = 'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])'

export function LegalModal({ slug: initialSlug, onClose }: LegalModalProps) {
  const [slug, setSlug] = useState<LegalDocSlug>(initialSlug)
  const doc = getLegalDoc(slug)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    return () => { previouslyFocused?.focus?.() }
  }, [])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((element) => element.offsetParent !== null)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  return <div className="legal-modal-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div className="legal-modal" role="dialog" aria-modal="true" aria-labelledby="legal-modal-title" ref={dialogRef}>
      <header className="legal-modal-head">
        <div>
          <p className="eyebrow">INFORMACIÓN LEGAL</p>
          <h2 id="legal-modal-title">{doc.title}</h2>
        </div>
        <button type="button" className="icon-button legal-close" ref={closeRef} onClick={onClose} aria-label="Cerrar documento legal">
          <span aria-hidden="true">×</span>
        </button>
      </header>
      <nav className="legal-modal-tabs" aria-label="Documentos legales">
        {LEGAL_DOCS.map((item) => <button
          type="button"
          key={item.slug}
          className={item.slug === doc.slug ? 'legal-tab active' : 'legal-tab'}
          aria-current={item.slug === doc.slug ? 'page' : undefined}
          onClick={() => setSlug(item.slug)}
        >{item.shortTitle}</button>)}
      </nav>
      <div className="legal-modal-body">
        <p className="legal-meta">Versión {LEGAL_VERSION} · Última actualización: {LEGAL_LAST_UPDATED}</p>
        <LegalSections doc={doc} />
      </div>
      <footer className="legal-modal-foot">
        <span>Al continuar aceptas la versión vigente de estos documentos.</span>
        <button type="button" className="primary-button compact" onClick={onClose}>Cerrar</button>
      </footer>
    </div>
  </div>
}
