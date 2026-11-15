import type { LegalDoc } from './content'

export function LegalSections({ doc }: { doc: LegalDoc }) {
  return <div className="legal-sections">
    {doc.sections.map((section) => <section className="legal-section" id={section.id} key={section.id}>
      <h2>{section.title}</h2>
      {section.body}
    </section>)}
  </div>
}
