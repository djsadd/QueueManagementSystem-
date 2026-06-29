import type { TicketEventItem } from '../../../features/admin/api/adminApi'
import { CrudTable } from '../components/CrudTable'
import { RowActions } from '../components/RowActions'

export function TicketEventsRoute({
  loading,
  onDelete,
  onEdit,
  ticketEvents,
}: {
  loading: boolean
  onDelete: (ticketEvent: TicketEventItem) => void
  onEdit: (ticketEvent: TicketEventItem) => void
  ticketEvents: TicketEventItem[]
}) {
  return (
    <section className="admin-panel tab-panel" key="ticketEvents">
      <CrudTable
        columns={[
          'ID',
          'Талон',
          'Тип',
          'Старый статус',
          'Новый статус',
          'Оператор',
          'Metadata',
          'Время',
          'Действия',
        ]}
        loading={loading}
        rows={ticketEvents.map((ticketEvent) => [
          ticketEvent.id.slice(0, 8),
          ticketEvent.ticket_id ?? 'Не указано',
          ticketEvent.event_type ?? 'Не указано',
          ticketEvent.old_status ?? 'Не указано',
          ticketEvent.new_status ?? 'Не указано',
          ticketEvent.operator_name ??
            ticketEvent.operator_email ??
            ticketEvent.operator_id?.slice(0, 8) ??
            'Не указано',
          ticketEvent.metadata ? JSON.stringify(ticketEvent.metadata) : 'Не указано',
          new Date(ticketEvent.created_at).toLocaleString(),
          <RowActions
            key={ticketEvent.id}
            onEdit={() => onEdit(ticketEvent)}
            onDelete={() => onDelete(ticketEvent)}
          />,
        ])}
      />
    </section>
  )
}
