import type {
  TicketEventItem,
  TicketEventTicketSummaryItem,
} from '../../features/admin/api/adminApi'

const TICKET_EVENT_TYPE_LABELS: Record<string, string> = {
  OPERATOR_STATUS_CHANGED: 'Статус оператора',
  SERVICE_CHANGED: 'Переназначение услуги',
  STATUS_CHANGED: 'Изменение статуса',
  TICKET_ACCEPTED: 'Принят',
  TICKET_ASSIGNED: 'Назначен',
  TICKET_CALLED: 'Вызван',
  TICKET_COMPLETED: 'Завершен',
  TICKET_CREATED: 'Создан',
  TICKET_DECLINED: 'Отказ',
  TICKET_SKIPPED: 'Пропущен',
  TICKET_STUDY_LANGUAGE_UPDATED: 'Изменен язык обучения',
  TICKET_UPDATED: 'Изменен',
}

const TICKET_EVENT_FIELD_LABELS: Record<string, string> = {
  academic_degree_id: 'Академическая степень',
  applicant_id: 'Абитуриент',
  assignment_score: 'Балл назначения',
  called_at: 'Время вызова',
  completed_at: 'Время завершения',
  educational_program_id: 'Образовательная программа',
  estimated_wait: 'Ожидание',
  operator_id: 'Оператор',
  priority: 'Приоритет',
  routing_key: 'Маршрут',
  service_id: 'Услуга',
  service_language: 'Язык обслуживания',
  started_at: 'Начало обслуживания',
  status: 'Статус',
  study_language: 'Язык обучения',
  window_id: 'Окно',
}

const TICKET_EVENT_CHANGE_TYPES = new Set([
  'SERVICE_CHANGED',
  'STATUS_CHANGED',
  'TICKET_ASSIGNED',
  'TICKET_STUDY_LANGUAGE_UPDATED',
  'TICKET_UPDATED',
])

export type TicketEventDetailRow = {
  label: string
  value: string
}

export type TicketEventChangeRow = {
  field: string
  newValue: string
  oldValue: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null
}

function getStringValue(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key]

  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  return null
}

function formatUnknownValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return 'Не указано'
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function getTicketEventMetadataRecord(ticketEvent: TicketEventItem) {
  return getRecord(ticketEvent.metadata)
}

export function getTicketEventSnapshot(ticketEvent: TicketEventItem) {
  return getRecord(getTicketEventMetadataRecord(ticketEvent)?.ticket_snapshot)
}

function getTicketEventAssignedOperator(ticketEvent: TicketEventItem) {
  return getRecord(getTicketEventMetadataRecord(ticketEvent)?.assigned_operator)
}

function getTicketEventAssignedWindow(ticketEvent: TicketEventItem) {
  return getRecord(getTicketEventMetadataRecord(ticketEvent)?.assigned_window)
}

function getTicketEventSource(ticketEvent: TicketEventItem) {
  return getStringValue(getTicketEventMetadataRecord(ticketEvent), 'source')
}

export function getTicketEventTypeLabel(eventType: string | null) {
  if (!eventType) {
    return 'Не указано'
  }

  return TICKET_EVENT_TYPE_LABELS[eventType] ?? eventType
}

export function formatTicketEventDate(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString('ru-RU')
}

export function getTicketEventTicketLabel(ticketEvent: TicketEventItem) {
  const snapshot = getTicketEventSnapshot(ticketEvent)
  const ticketNumber = getStringValue(snapshot, 'ticket_number')

  if (ticketNumber) {
    return ticketNumber
  }

  return ticketEvent.ticket_id ? ticketEvent.ticket_id.slice(0, 8) : 'Без талона'
}

export function getTicketEventTicketSummaryLabel(ticketSummary: TicketEventTicketSummaryItem) {
  return ticketSummary.ticket_number ?? getTicketEventTicketLabel(ticketSummary.latest_event)
}

export function getTicketEventTicketSummaryIinLabel(ticketSummary: TicketEventTicketSummaryItem) {
  return ticketSummary.iin ?? getTicketEventIinLabel(ticketSummary.latest_event)
}

export function getTicketEventTicketSummaryFullNameLabel(ticketSummary: TicketEventTicketSummaryItem) {
  return ticketSummary.full_name ?? getTicketEventFullNameLabel(ticketSummary.latest_event)
}

export function getTicketEventTicketSummaryServiceLabel(ticketSummary: TicketEventTicketSummaryItem) {
  return ticketSummary.service_label ?? getTicketEventServiceLabel(ticketSummary.latest_event)
}

export function getTicketEventTicketSummaryStatusLabel(ticketSummary: TicketEventTicketSummaryItem) {
  return ticketSummary.status ?? getTicketEventStatusFlowLabel(ticketSummary.latest_event)
}

export function getTicketEventIinLabel(ticketEvent: TicketEventItem) {
  return getStringValue(getTicketEventSnapshot(ticketEvent), 'iin') ?? 'Не указано'
}

export function getTicketEventFullNameLabel(ticketEvent: TicketEventItem) {
  return getStringValue(getTicketEventSnapshot(ticketEvent), 'full_name') ?? 'Не указано'
}

export function getTicketEventServiceLabel(ticketEvent: TicketEventItem) {
  const snapshot = getTicketEventSnapshot(ticketEvent)
  return (
    getStringValue(snapshot, 'service_name') ??
    getStringValue(snapshot, 'service_code') ??
    getStringValue(snapshot, 'service_id') ??
    'Не указано'
  )
}

export function getTicketEventOperatorLabel(ticketEvent: TicketEventItem) {
  return (
    ticketEvent.operator_name ??
    ticketEvent.operator_email ??
    ticketEvent.operator_id?.slice(0, 8) ??
    'Не указано'
  )
}

export function getTicketEventStatusFlowLabel(ticketEvent: TicketEventItem) {
  if (ticketEvent.old_status && ticketEvent.new_status && ticketEvent.old_status !== ticketEvent.new_status) {
    return `${ticketEvent.old_status} -> ${ticketEvent.new_status}`
  }

  return ticketEvent.new_status ?? ticketEvent.old_status ?? 'Не указано'
}

export function getTicketEventDetailRows(ticketEvent: TicketEventItem): TicketEventDetailRow[] {
  const snapshot = getTicketEventSnapshot(ticketEvent)
  const assignedOperator = getTicketEventAssignedOperator(ticketEvent)
  const assignedWindow = getTicketEventAssignedWindow(ticketEvent)
  const programLabel =
    getStringValue(snapshot, 'educational_program_name') ??
    getStringValue(snapshot, 'educational_program_code') ??
    getStringValue(snapshot, 'educational_program_id') ??
    'Не указано'

  return [
    { label: 'Талон', value: getTicketEventTicketLabel(ticketEvent) },
    { label: 'Дата', value: formatTicketEventDate(ticketEvent.created_at) },
    { label: 'ИИН', value: getTicketEventIinLabel(ticketEvent) },
    { label: 'ФИО', value: getTicketEventFullNameLabel(ticketEvent) },
    { label: 'Тип события', value: getTicketEventTypeLabel(ticketEvent.event_type) },
    { label: 'Статус', value: getTicketEventStatusFlowLabel(ticketEvent) },
    { label: 'Услуга', value: getTicketEventServiceLabel(ticketEvent) },
    { label: 'Образовательная программа', value: programLabel },
    { label: 'Оператор события', value: getTicketEventOperatorLabel(ticketEvent) },
    {
      label: 'Назначенный оператор',
      value:
        getStringValue(assignedOperator, 'full_name') ??
        getStringValue(assignedOperator, 'email') ??
        getStringValue(assignedOperator, 'id') ??
        'Не указано',
    },
    {
      label: 'Окно',
      value:
        getStringValue(assignedWindow, 'name') ??
        getStringValue(assignedWindow, 'id') ??
        'Не указано',
    },
    { label: 'Источник', value: getTicketEventSource(ticketEvent) ?? 'Не указано' },
  ]
}

export function getTicketEventChangeRows(ticketEvent: TicketEventItem): TicketEventChangeRow[] {
  const changes = getRecord(getTicketEventMetadataRecord(ticketEvent)?.changes)

  if (!changes) {
    return []
  }

  return Object.entries(changes).map(([field, change]) => {
    const changeRecord = getRecord(change)

    return {
      field: TICKET_EVENT_FIELD_LABELS[field] ?? field,
      oldValue: formatUnknownValue(changeRecord?.old),
      newValue: formatUnknownValue(changeRecord?.new),
    }
  })
}

export function isTicketEventChangeLike(ticketEvent: TicketEventItem) {
  return (
    getTicketEventChangeRows(ticketEvent).length > 0 ||
    TICKET_EVENT_CHANGE_TYPES.has(ticketEvent.event_type ?? '')
  )
}

export function getTicketEventTicketSummaryDetailRows(
  ticketSummary: TicketEventTicketSummaryItem,
): TicketEventDetailRow[] {
  return [
    { label: 'Талон', value: getTicketEventTicketSummaryLabel(ticketSummary) },
    { label: 'ИИН', value: getTicketEventTicketSummaryIinLabel(ticketSummary) },
    { label: 'ФИО', value: getTicketEventTicketSummaryFullNameLabel(ticketSummary) },
    { label: 'Услуга', value: getTicketEventTicketSummaryServiceLabel(ticketSummary) },
    { label: 'Текущий статус', value: getTicketEventTicketSummaryStatusLabel(ticketSummary) },
    { label: 'Первое событие', value: formatTicketEventDate(ticketSummary.first_event_at) },
    { label: 'Последнее событие', value: formatTicketEventDate(ticketSummary.last_event_at) },
    { label: 'Событий в истории', value: String(ticketSummary.events_count) },
  ]
}

export function getTicketEventMetadataText(ticketEvent: TicketEventItem) {
  return ticketEvent.metadata ? JSON.stringify(ticketEvent.metadata, null, 2) : ''
}
