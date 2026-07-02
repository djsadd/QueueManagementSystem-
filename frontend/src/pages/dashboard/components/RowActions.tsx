export function RowActions({
  editLabel = 'Изменить',
  onDelete,
  onEdit,
}: {
  editLabel?: string
  onDelete: () => void
  onEdit: () => void
}) {
  return (
    <div className="row-actions">
      <button className="secondary-action compact" type="button" onClick={onEdit}>
        {editLabel}
      </button>
      <button className="danger-action" type="button" onClick={onDelete}>
        Удалить
      </button>
    </div>
  )
}
