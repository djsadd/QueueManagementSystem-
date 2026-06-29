export function RowActions({ onDelete, onEdit }: { onDelete: () => void; onEdit: () => void }) {
  return (
    <div className="row-actions">
      <button className="secondary-action compact" type="button" onClick={onEdit}>
        Изменить
      </button>
      <button className="danger-action" type="button" onClick={onDelete}>
        Удалить
      </button>
    </div>
  )
}
