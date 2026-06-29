export function ModalActions({ onCancel, submitText }: { onCancel: () => void; submitText: string }) {
  return (
    <div className="modal-actions">
      <button className="secondary-action compact" type="button" onClick={onCancel}>
        Отмена
      </button>
      <button className="primary-action compact" type="submit">
        {submitText}
      </button>
    </div>
  )
}
