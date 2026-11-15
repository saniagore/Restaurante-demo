import { useState } from 'react'
import { acceptStorageNotice, clearStoredBrowserData, hasAcceptedStorageNotice } from '../lib/storage-notice'

type StorageNoticeProps = {
  onOpenDetails: () => void
  onClear?: () => void
}

export function StorageNotice({ onOpenDetails, onClear }: StorageNoticeProps) {
  const [visible, setVisible] = useState(() => !hasAcceptedStorageNotice())
  const [cleared, setCleared] = useState(false)

  if (!visible) return null

  const dismiss = () => {
    acceptStorageNotice()
    setVisible(false)
  }

  const clear = () => {
    onClear?.()
    clearStoredBrowserData()
    setCleared(true)
  }

  return <aside className="storage-notice" role="region" aria-label="Aviso de almacenamiento local">
    <div className="storage-notice-copy">
      <strong>Guardamos datos en tu navegador</strong>
      <p>
        Usamos almacenamiento local para conservar tu carrito y, si eres del equipo, la sesión del panel.
        No usamos cookies de publicidad ni analítica.
        {cleared ? ' Listo: borramos los datos guardados en este navegador.' : ''}
      </p>
      <button type="button" className="legal-link" onClick={onOpenDetails}>Más información</button>
    </div>
    <div className="storage-notice-actions">
      <button type="button" className="outline-button compact" onClick={clear}>Borrar datos guardados</button>
      <button type="button" className="primary-button compact" onClick={dismiss}>Entendido</button>
    </div>
  </aside>
}
