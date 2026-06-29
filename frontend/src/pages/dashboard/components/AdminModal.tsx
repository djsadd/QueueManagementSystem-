import type { ReactNode } from 'react'

export function AdminModal({
  children,
  onClose,
  size = 'default',
  title,
}: {
  children: ReactNode
  onClose: () => void
  size?: 'default' | 'small' | 'wide'
  title: string
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={`admin-modal ${size === 'small' ? 'small' : size === 'wide' ? 'wide' : ''}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" type="button" aria-label="Закрыть" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  )
}
