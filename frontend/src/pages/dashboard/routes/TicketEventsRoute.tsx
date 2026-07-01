import type { TicketEventItem } from '../../../features/admin/api/adminApi'
import {
  formatTicketEventDate,
  getTicketEventIinLabel,
  getTicketEventOperatorLabel,
  getTicketEventServiceLabel,
  getTicketEventStatusFlowLabel,
  getTicketEventTicketLabel,
  getTicketEventTypeLabel,
} from '../dashboard-ticket-events'
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
          'Талон',
          'Дата',
          'ИИН',
          'Действие',
          'Оператор',
          'Статус',
          'Действия',
        ]}
        loading={loading}
        rows={ticketEvents.map((ticketEvent) => [
          <div className="ticket-event-ticket-cell" key={`${ticketEvent.id}-ticket`}>
            <strong>{getTicketEventTicketLabel(ticketEvent)}</strong>
            <span>{getTicketEventServiceLabel(ticketEvent)}</span>
          </div>,
          formatTicketEventDate(ticketEvent.created_at),
          getTicketEventIinLabel(ticketEvent),
          getTicketEventTypeLabel(ticketEvent.event_type),
          getTicketEventOperatorLabel(ticketEvent),
          getTicketEventStatusFlowLabel(ticketEvent),
          <RowActions
            key={ticketEvent.id}
            editLabel="Детали"
            onEdit={() => onEdit(ticketEvent)}
            onDelete={() => onDelete(ticketEvent)}
          />,
        ])}
      />
    </section>
  )
}
