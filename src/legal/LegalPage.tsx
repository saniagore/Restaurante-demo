import { useEffect } from 'react'
import { business, LEGAL_LAST_UPDATED, LEGAL_VERSION } from '../config/business'
import { SiteFooter } from '../components/SiteFooter'
import { LEGAL_DOCS, getLegalDoc, type LegalDocSlug } from './content'
import { LegalSections } from './LegalSections'

type LegalPageProps = {
  slug: LegalDocSlug
  navigate: (to: string) => void
}

export function LegalPage({ slug, navigate }: LegalPageProps) {
  const doc = getLegalDoc(slug)

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [slug])

  useEffect(() => {
    const previousTitle = document.title
    document.title = `${doc.title} | ${business.brand}`
    return () => { document.title = previousTitle }
  }, [doc.title])

  return <div className="legal-page">
    <header className="topbar legal-topbar">
      <a className="brand" href="/" onClick={(event) => { event.preventDefault(); navigate('/') }}>
        <span className="brand-mark">M</span>
        <span>{business.brand}<small>{business.tagline}</small></span>
      </a>
      <a className="back-link page-back" href="/" onClick={(event) => { event.preventDefault(); navigate('/') }}>Volver al menú</a>
    </header>
    <main className="legal-main">
      <nav className="legal-tabs" aria-label="Documentos legales">
        {LEGAL_DOCS.map((item) => <a
          key={item.slug}
          href={`/${item.slug}`}
          className={item.slug === doc.slug ? 'legal-tab active' : 'legal-tab'}
          aria-current={item.slug === doc.slug ? 'page' : undefined}
          onClick={(event) => { event.preventDefault(); navigate(`/${item.slug}`) }}
        >{item.shortTitle}</a>)}
      </nav>
      <article className="legal-doc">
        <p className="eyebrow">INFORMACIÓN LEGAL</p>
        <h1>{doc.title}</h1>
        <p className="legal-meta">Versión {LEGAL_VERSION} · Última actualización: {LEGAL_LAST_UPDATED}</p>
        <p className="legal-summary">{doc.summary}</p>
        <LegalSections doc={doc} />
        <p className="legal-footnote">La versión aplicable es la vigente al momento de la aceptación y queda registrada junto con cada pedido.</p>
      </article>
    </main>
    <SiteFooter onNavigate={navigate} />
  </div>
}
