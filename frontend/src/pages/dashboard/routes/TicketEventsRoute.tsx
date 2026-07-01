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

const TICKET_EVENT_TYPE_FILTER_OPTIONS = [
  { label: 'Все действия', value: '' },
  { label: 'Вызван', value: 'TICKET_CALLED' },
  { label: 'Принят', value: 'TICKET_ACCEPTED' },
  { label: 'Завершен', value: 'TICKET_COMPLETED' },
  { label: 'Пропущен', value: 'TICKET_SKIPPED' },
  { label: 'Отказ', value: 'TICKET_DECLINED' },
  { label: 'Переназначение услуги', value: 'SERVICE_CHANGED' },
  { label: 'Изменен язык обучения', value: 'TICKET_STUDY_LANGUAGE_UPDATED' },
  { label: 'Назначен', value: 'TICKET_ASSIGNED' },
  { label: 'Создан', value: 'TICKET_CREATED' },
]

const TICKET_EVENT_STATUS_FILTER_OPTIONS = [
  { label: 'Все статусы', value: '' },
  { label: 'WAITING', value: 'WAITING' },
  { label: 'CALLED', value: 'CALLED' },
  { label: 'COMPLETED', value: 'COMPLETED' },
  { label: 'SKIPPED', value: 'SKIPPED' },
  { label: 'CANCELLED', value: 'CANCELLED' },
]

export function TicketEventsRoute({
  dateFrom,
  dateTo,
  eventType,
  loading,
  onDelete,
  onEdit,
  onFilterReset,
  onDateFromChange,
  onDateToChange,
  onEventTypeChange,
  onOperatorChange,
  onPageChange,
  onSearchChange,
  onStatusChange,
  operatorId,
  operatorOptions,
  page,
  search,
  status,
  ticketEvents,
  total,
  totalPages,
}: {
  dateFrom: string
  dateTo: string
  eventType: string
  loading: boolean
  onDelete: (ticketEvent: TicketEventItem) => void
  onEdit: (ticketEvent: TicketEventItem) => void
  onFilterReset: () => void
  onDateFromChange: (value: string) => void
  onDateToChange: (value: string) => void
  onEventTypeChange: (value: string) => void
  onOperatorChange: (value: string) => void
  onPageChange: (page: number) => void
  onSearchChange: (value: string) => void
  onStatusChange: (value: string) => void
  operatorId: string
  operatorOptions: Array<{ id: string; label: string }>
  page: number
  search: string
  status: string
  ticketEvents: TicketEventItem[]
  total: number
  totalPages: number
}) {
  return (
    <section className="admin-panel tab-panel" key="ticketEvents">
      <div className="ticket-events-filter-bar">
        <label>
          <span>Поиск</span>
          <input
            placeholder="Талон, ИИН, тип, статус"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </label>
        <label>
          <span>Действие</span>
          <select value={eventType} onChange={(event) => onEventTypeChange(event.target.value)}>
            {TICKET_EVENT_TYPE_FILTER_OPTIONS.map((option) => (
              <option key={option.value || 'all'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Оператор</span>
          <select value={operatorId} onChange={(event) => onOperatorChange(event.target.value)}>
            <option value="">Все операторы</option>
            {operatorOptions.map((operator) => (
              <option key={operator.id} value={operator.id}>
                {operator.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Статус</span>
          <select value={status} onChange={(event) => onStatusChange(event.target.value)}>
            {TICKET_EVENT_STATUS_FILTER_OPTIONS.map((option) => (
              <option key={option.value || 'all'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>С даты</span>
          <input type="date" value={dateFrom} onChange={(event) => onDateFromChange(event.target.value)} />
        </label>
        <label>
          <span>По дату</span>
          <input type="date" value={dateTo} onChange={(event) => onDateToChange(event.target.value)} />
        </label>
        <button className="secondary-action compact" type="button" onClick={onFilterReset}>
          Сбросить
        </button>
      </div>

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

      <div className="queue-panel ticket-events-pagination" aria-label="Пагинация истории талонов">
        <span>
          Показано {ticketEvents.length} из {total}
        </span>
        <div className="pagination-pages">
          <button
            className="secondary-action compact pagination-page"
            type="button"
            disabled={loading || page <= 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
          >
            Назад
          </button>
          <strong>
            {page} / {totalPages}
          </strong>
          <button
            className="secondary-action compact pagination-page"
            type="button"
            disabled={loading || page >= totalPages}
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          >
            Вперед
          </button>
        </div>
      </div>
    </section>
  )
}
