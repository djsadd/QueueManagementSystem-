import type { TicketEventTicketSummaryItem } from '../../../features/admin/api/adminApi'
import {
  formatTicketEventDate,
  getTicketEventOperatorLabel,
  getTicketEventStatusFlowLabel,
  getTicketEventTicketSummaryFullNameLabel,
  getTicketEventTicketSummaryIinLabel,
  getTicketEventTicketSummaryLabel,
  getTicketEventTicketSummaryServiceLabel,
  getTicketEventTicketSummaryStatusLabel,
  getTicketEventTypeLabel,
} from '../dashboard-ticket-events'
import { CrudTable } from '../components/CrudTable'

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

function getVisiblePaginationItems(page: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const pages = new Set([1, totalPages, page, page - 1, page + 1])

  if (page <= 3) {
    pages.add(2)
    pages.add(3)
    pages.add(4)
  }

  if (page >= totalPages - 2) {
    pages.add(totalPages - 3)
    pages.add(totalPages - 2)
    pages.add(totalPages - 1)
  }

  const sortedPages = [...pages]
    .filter((item) => item >= 1 && item <= totalPages)
    .sort((left, right) => left - right)
  const items: Array<number | string> = []

  sortedPages.forEach((item) => {
    const previousItem = items[items.length - 1]

    if (typeof previousItem === 'number' && item - previousItem > 1) {
      items.push(`ellipsis-${previousItem}-${item}`)
    }

    items.push(item)
  })

  return items
}

export function TicketEventsRoute({
  dateFrom,
  dateTo,
  eventType,
  loading,
  onDetails,
  onEdit,
  onFilterReset,
  onDateFromChange,
  onDateToChange,
  onEventTypeChange,
  onOperatorChange,
  onPageChange,
  onSearchChange,
  onSearchSubmit,
  onStatusChange,
  operatorId,
  operatorOptions,
  page,
  search,
  status,
  ticketSummaries,
  total,
  totalPages,
}: {
  dateFrom: string
  dateTo: string
  eventType: string
  loading: boolean
  onDetails: (ticketSummary: TicketEventTicketSummaryItem) => void
  onEdit: (ticketSummary: TicketEventTicketSummaryItem) => void
  onFilterReset: () => void
  onDateFromChange: (value: string) => void
  onDateToChange: (value: string) => void
  onEventTypeChange: (value: string) => void
  onOperatorChange: (value: string) => void
  onPageChange: (page: number) => void
  onSearchChange: (value: string) => void
  onSearchSubmit: (value: string) => void
  onStatusChange: (value: string) => void
  operatorId: string
  operatorOptions: Array<{ id: string; label: string }>
  page: number
  search: string
  status: string
  ticketSummaries: TicketEventTicketSummaryItem[]
  total: number
  totalPages: number
}) {
  const paginationItems = getVisiblePaginationItems(page, totalPages)

  return (
    <section className="admin-panel tab-panel" key="ticketEvents">
      <form
        className="ticket-events-filter-bar"
        onSubmit={(event) => {
          event.preventDefault()
          onSearchSubmit(search)
        }}
      >
        <label>
          <span>Поиск</span>
          <input
            placeholder="Талон, ИИН, тип, статус"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </label>
        <button className="secondary-action compact" type="submit" disabled={loading}>
          Поиск
        </button>
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
      </form>

      <CrudTable
        columns={[
          'Талон',
          'Абитуриент',
          'Услуга',
          'Статус',
          'Последнее действие',
          'История',
          'Действия',
        ]}
        loading={loading}
        rowKeys={ticketSummaries.map((ticketSummary) => ticketSummary.ticket_id)}
        rows={ticketSummaries.map((ticketSummary) => [
          <div className="ticket-event-ticket-cell" key={`${ticketSummary.ticket_id}-ticket`}>
            <strong>{getTicketEventTicketSummaryLabel(ticketSummary)}</strong>
            <span>{ticketSummary.ticket_id.slice(0, 8)}</span>
          </div>,
          <div className="ticket-event-ticket-cell" key={`${ticketSummary.ticket_id}-person`}>
            <strong>{getTicketEventTicketSummaryFullNameLabel(ticketSummary)}</strong>
            <span>{getTicketEventTicketSummaryIinLabel(ticketSummary)}</span>
          </div>,
          getTicketEventTicketSummaryServiceLabel(ticketSummary),
          getTicketEventTicketSummaryStatusLabel(ticketSummary),
          <div className="ticket-event-ticket-cell" key={`${ticketSummary.ticket_id}-latest`}>
            <strong>{getTicketEventTypeLabel(ticketSummary.latest_event.event_type)}</strong>
            <span>
              {formatTicketEventDate(ticketSummary.latest_event.created_at)}
              {' · '}
              {getTicketEventOperatorLabel(ticketSummary.latest_event)}
            </span>
            <span>{getTicketEventStatusFlowLabel(ticketSummary.latest_event)}</span>
          </div>,
          <div className="ticket-event-history-cell" key={`${ticketSummary.ticket_id}-history`}>
            <strong>{ticketSummary.events_count}</strong>
            <span>событий</span>
            {ticketSummary.change_events_count > 0 && (
              <em>{ticketSummary.change_events_count} изменений</em>
            )}
          </div>,
          <div className="ticket-event-action-cell" key={`${ticketSummary.ticket_id}-actions`}>
            <button className="secondary-action compact" type="button" onClick={() => onDetails(ticketSummary)}>
              Детали
            </button>
            <button className="secondary-action compact" type="button" onClick={() => onEdit(ticketSummary)}>
              Редактировать
            </button>
          </div>,
        ])}
      />

      <div className="queue-panel ticket-events-pagination" aria-label="Пагинация истории талонов">
        <span>
          Показано {ticketSummaries.length} из {total}
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
          {paginationItems.map((item) =>
            typeof item === 'number' ? (
              <button
                aria-current={item === page ? 'page' : undefined}
                className={`secondary-action compact pagination-page${item === page ? ' active' : ''}`}
                disabled={loading || item === page}
                key={item}
                type="button"
                onClick={() => onPageChange(item)}
              >
                {item}
              </button>
            ) : (
              <span className="pagination-ellipsis" key={item}>
                ...
              </span>
            ),
          )}
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
