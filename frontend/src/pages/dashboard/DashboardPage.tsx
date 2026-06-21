import { useEffect, useRef, useState } from 'react'
import type { FormEvent, MouseEvent, ReactNode } from 'react'
import {
  adminApi,
  type AcademicDegreeItem,
  type AcademicDegreePayload,
  type ApplicantItem,
  type ApplicantPayload,
  type EducationalProgramItem,
  type EducationalProgramPayload,
  type OperatorItem,
  type OperatorPayload,
  type OperatorStatus,
  type ServiceLanguage,
  type StudyLanguage,
  type ServiceItem,
  type ServicePayload,
  type MyWindowTickets,
  type OperatorDailyAnalyticsItem,
  type OperatorTicketAnalyticsItem,
  type ReceptionTickets,
  type TicketItem,
  type TicketEventItem,
  type TicketEventPayload,
  type UserItem,
  type UserPayload,
  type UserRole,
  type WindowItem,
  type WindowPayload,
  type WindowStatus,
} from '../../features/admin/api/adminApi'
import type { AuthUser } from '../../features/auth/model/types'
import { env } from '../../shared/config/env'
import { refreshAuthTokens } from '../../shared/api/httpClient'
import { tokenStorage } from '../../shared/lib/tokenStorage'
import logoUrl from '../../assets/Logo+RGB.png'
import './dashboard-page.css'

type Lang = 'ru' | 'kk' | 'en'
type CrudSection =
  | 'services'
  | 'windows'
  | 'users'
  | 'operators'
  | 'academicDegrees'
  | 'educationalPrograms'
  | 'applicants'
  | 'ticketEvents'
type DashboardSection = CrudSection | 'profile' | 'myWindow' | 'analytics' | 'reception'
type MyWindowRealtimeStatus = 'connecting' | 'connected' | 'disconnected'
type MyWindowTicketHighlight = 'new' | 'updated'
type AnalyticsTimeGrouping = 'day' | 'month'
type AnalyticsPieSegment = {
  color: string
  detail: string
  label: string
  value: number
}
type AnalyticsDistributionItem = {
  id: string
  label: string
  value: number
}
type OperatorPerformancePoint = {
  averageProcessingMinutes: number
  clientsPerHour: number
  effectiveWorkSeconds: number
  label: string
  operatorId: string
  processed: number
  utilizationPercent: number
}
type DeleteTarget = {
  section: CrudSection
  id: number | string
  label: string
}

const LANG_STORAGE_KEY = 'queueflow-language'
const MY_WINDOW_PAGE_SIZE = 10
const ACTIVE_MY_WINDOW_TICKET_STATUSES = new Set(['WAITING', 'CALLED'])
const ANALYTICS_SERVICE_COLORS = [
  '#9a002d',
  '#0f766e',
  '#2563eb',
  '#b45309',
  '#7c3aed',
  '#be123c',
  '#047857',
  '#4f46e5',
]
const ANALYTICS_STATUS_COLORS = {
  completed: '#0f766e',
  skipped: '#b45309',
  active: '#2563eb',
}
const languages = ['ru', 'kk', 'en'] as const
const serviceLanguageOptions: Array<{ value: ServiceLanguage; label: string }> = [
  { value: 'KAZAKH', label: 'KAZ' },
  { value: 'RUSSIAN', label: 'RUS' },
  { value: 'ENGLISH', label: 'ENG' },
]
const defaultServiceLanguages: ServiceLanguage[] = serviceLanguageOptions.map((option) => option.value)
const defaultStudyLanguages: StudyLanguage[] = serviceLanguageOptions.map((option) => option.value)
const emptyService: ServicePayload = {
  name: '',
  name_kk: '',
  name_en: '',
  code: '',
  priority: 0,
  is_active: true,
  requires_educational_program: false,
  requires_reception_desk: false,
  requires_service_language: false,
}
const emptyWindow: WindowPayload = { name: '', floor: '', status: 'OPEN', current_operator_id: null }
const emptyUser: UserPayload = {
  email: '',
  password: '',
  full_name: '',
  role: 'OPERATOR',
  is_active: true,
}
const emptyOperator: OperatorPayload = {
  user_id: '',
  window_id: null,
  status: 'OFFLINE',
}
const emptyAcademicDegree: AcademicDegreePayload = { name: '', code: '', is_active: true }
const emptyEducationalProgram: EducationalProgramPayload = {
  name: '',
  name_kk: '',
  name_en: '',
  code: '',
  academic_degree_id: 0,
  requires_service_language: true,
  is_active: true,
}
const emptyApplicant: ApplicantPayload = {
  full_name: '',
  iin: '',
  phone: '',
  telegram_chat_id: null,
}
const emptyTicketEvent: TicketEventPayload = {
  ticket_id: null,
  event_type: 'TICKET_CREATED',
  old_status: null,
  new_status: null,
  operator_id: null,
  metadata: null,
}

const operatorStatusLabels: Record<OperatorStatus, string> = {
  ONLINE: 'Готов',
  BUSY: 'Занят',
  BREAK: 'Отошел',
  OFFLINE: 'Не работает',
}

const operatorStatusActions: Array<{ status: OperatorStatus; label: string }> = [
  { status: 'ONLINE', label: 'Готов' },
  { status: 'BUSY', label: 'Занят' },
  { status: 'BREAK', label: 'Отошел' },
  { status: 'OFFLINE', label: 'Не работает' },
]

const windowStatusLabels: Record<WindowStatus, string> = {
  OPEN: 'Открыто',
  BUSY: 'Занято',
  CLOSED: 'Закрыто',
}

const ticketStatusLabels: Record<string, string> = {
  WAITING: 'Ожидает',
  CALLED: 'Принят',
  COMPLETED: 'Завершен',
  SKIPPED: 'Пропущен',
  CANCELLED: 'Отменен',
}

const studyLanguageLabels: Record<StudyLanguage, string> = {
  KAZAKH: 'Казахский',
  RUSSIAN: 'Русский',
  ENGLISH: 'Английский',
}

const studyLanguageOptions: Array<{ value: StudyLanguage; label: string }> = [
  { value: 'KAZAKH', label: studyLanguageLabels.KAZAKH },
  { value: 'RUSSIAN', label: studyLanguageLabels.RUSSIAN },
  { value: 'ENGLISH', label: studyLanguageLabels.ENGLISH },
]

const myWindowStatusActions: Array<{ status: WindowStatus; label: string }> = [
  { status: 'OPEN', label: 'Открыто' },
  { status: 'BUSY', label: 'Занято' },
  { status: 'CLOSED', label: 'Закрыто' },
]

const sectionLabels: Record<DashboardSection, string> = {
  myWindow: 'Мое окно',
  reception: 'Регистратура',
  profile: 'Профиль',
  services: 'Услуги',
  windows: 'Окна',
  users: 'Пользователи',
  operators: 'Операторы',
  academicDegrees: 'Академические степени',
  educationalPrograms: 'Образовательные программы',
  applicants: 'Абитуриенты',
  analytics: 'Аналитика',
  ticketEvents: 'История талонов',
}

const sectionPaths: Record<DashboardSection, string> = {
  myWindow: 'my-window',
  reception: 'reception',
  profile: 'profile',
  services: 'services',
  windows: 'windows',
  users: 'users',
  operators: 'operators',
  academicDegrees: 'academic-degrees',
  educationalPrograms: 'educational-programs',
  applicants: 'applicants',
  analytics: 'analytics',
  ticketEvents: 'ticket-events',
}

function isDashboardSection(value: string | undefined): value is DashboardSection {
  return (
    value === 'profile' ||
    value === 'reception' ||
    value === 'services' ||
    value === 'windows' ||
    value === 'users' ||
    value === 'operators' ||
    value === 'academic-degrees' ||
    value === 'educational-programs' ||
    value === 'applicants' ||
    value === 'analytics' ||
    value === 'ticket-events'
  )
}

function isLang(value: string | undefined): value is Lang {
  return languages.includes(value as Lang)
}

function getInitialLang(): Lang {
  const pathLang = window.location.pathname.split('/').filter(Boolean)[0]

  if (pathLang === 'kz') {
    return 'kk'
  }

  if (isLang(pathLang)) {
    return pathLang
  }

  const savedLang = localStorage.getItem(LANG_STORAGE_KEY) ?? undefined
  return isLang(savedLang) ? savedLang : 'ru'
}

function getSectionFromPath(): DashboardSection {
  const pathParts = window.location.pathname.split('/').filter(Boolean)
  const sectionCandidate = pathParts[pathParts.length - 1]

  if (pathParts.includes('analytics')) {
    return 'analytics'
  }

  if (sectionCandidate === 'academic-degrees') {
    return 'academicDegrees'
  }

  if (sectionCandidate === 'educational-programs') {
    return 'educationalPrograms'
  }

  if (sectionCandidate === 'ticket-events') {
    return 'ticketEvents'
  }

  if (sectionCandidate === 'analytics') {
    return 'analytics'
  }

  if (sectionCandidate === 'my-window') {
    return 'myWindow'
  }

  if (sectionCandidate === 'reception') {
    return 'reception'
  }

  return isDashboardSection(sectionCandidate) ? sectionCandidate : 'services'
}

function getAnalyticsOperatorIdFromPath() {
  const pathParts = window.location.pathname.split('/').filter(Boolean)
  const analyticsIndex = pathParts.indexOf('analytics')

  if (analyticsIndex === -1) {
    return null
  }

  const operatorId = pathParts[analyticsIndex + 1]
  return operatorId ? decodeURIComponent(operatorId) : null
}

function canUseOperatorSection(section: DashboardSection) {
  return section === 'myWindow' || section === 'profile'
}

function buildSectionPath(lang: Lang, section: DashboardSection, analyticsOperatorId: string | null = null) {
  const analyticsOperatorPath =
    section === 'analytics' && analyticsOperatorId ? `/${encodeURIComponent(analyticsOperatorId)}` : ''

  return `/${lang}/admin/${sectionPaths[section]}${analyticsOperatorPath}${window.location.search}${window.location.hash}`
}

function buildOperatorDisplayPath(lang: Lang) {
  return `/${lang}/admin/operator-display?fullscreen=1`
}

type BrowserScreen = {
  availHeight?: number
  availLeft?: number
  availTop?: number
  availWidth?: number
  height: number
  isPrimary?: boolean
  left: number
  top: number
  width: number
}

type BrowserScreenDetails = {
  screens: BrowserScreen[]
}

async function openOperatorDisplayOnSecondScreen(url: string) {
  const popup = window.open(
    'about:blank',
    'operator-second-display',
    'popup=yes,fullscreen=yes,width=1280,height=720',
  )

  if (!popup) {
    return 'Браузер заблокировал открытие окна. Разрешите всплывающие окна для этого сайта.'
  }

  try {
    const screenApi = window as Window & {
      getScreenDetails?: () => Promise<BrowserScreenDetails>
    }
    const screenDetails = screenApi.getScreenDetails ? await screenApi.getScreenDetails() : null
    const secondScreen =
      screenDetails?.screens.find((screen) => !screen.isPrimary) ?? screenDetails?.screens[1] ?? null

    if (secondScreen) {
      const left = secondScreen.availLeft ?? secondScreen.left
      const top = secondScreen.availTop ?? secondScreen.top
      const width = secondScreen.availWidth ?? secondScreen.width
      const height = secondScreen.availHeight ?? secondScreen.height

      popup.moveTo(left, top)
      popup.resizeTo(width, height)
    }
  } catch {
    // The display still opens even when the browser denies multi-screen placement.
  }

  popup.location.replace(url)
  popup.focus()
  return null
}

function Icon({ name }: { name: string }) {
  return (
    <svg className="dashboard-icon" viewBox="0 0 24 24" aria-hidden="true">
      {name === 'grid' && <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />}
      {name === 'briefcase' && <path d="M10 6V5a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v1M4 7h16v12H4zM4 12h16" />}
      {name === 'monitor' && <path d="M4 5h16v11H4zM9 20h6M12 16v4" />}
      {name === 'users' && <path d="M16 19a5 5 0 0 0-10 0M11 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M20 19a4 4 0 0 0-3-3.8M17 4.3a3.2 3.2 0 0 1 0 6.2" />}
      {name === 'badge' && <path d="M8 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0M6 21v-2a6 6 0 0 1 12 0v2M9 21h6" />}
      {name === 'book' && <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5zM8 6h8M8 10h6" />}
      {name === 'award' && <path d="M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12M9 14l-1 7 4-2 4 2-1-7" />}
      {name === 'id-card' && <path d="M4 5h16v14H4zM8 9h4M8 13h8M8 16h5M15 9h2" />}
      {name === 'history' && <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2" />}
      {name === 'chart' && <path d="M4 19V5M4 19h16M8 16V9M12 16V6M16 16v-4" />}
      {name === 'display' && <path d="M4 5h16v11H4zM8 20h8M12 16v4M8 9h3M13 9h3M8 12h8" />}
      {name === 'download' && <path d="M12 4v10M8 10l4 4 4-4M5 20h14" />}
      {name === 'plus' && <path d="M12 5v14M5 12h14" />}
      {name === 'refresh' && <path d="M20 12a8 8 0 0 1-13.7 5.7M4 12A8 8 0 0 1 17.7 6.3M18 3v4h-4M6 21v-4h4" />}
      {name === 'sidebar-collapse' && <path d="M4 5h16v14H4zM9 5v14M15 9l-3 3 3 3" />}
      {name === 'sidebar-expand' && <path d="M4 5h16v14H4zM9 5v14M12 9l3 3-3 3" />}
    </svg>
  )
}

function AnalyticsDonutChart({
  centerLabel,
  centerValue,
  segments,
  total,
}: {
  centerLabel: string
  centerValue: string | number
  segments: AnalyticsPieSegment[]
  total: number
}) {
  const [hoveredSegment, setHoveredSegment] = useState<{
    detail: string
    label: string
    percent: number
    value: number
    x: number
    y: number
  } | null>(null)
  let offset = 0
  const visibleSegments = segments.filter((segment) => segment.value > 0)

  function moveTooltip(event: MouseEvent<SVGCircleElement>, segment: AnalyticsPieSegment, percent: number) {
    const svg = event.currentTarget.ownerSVGElement
    const rect = svg?.getBoundingClientRect()

    setHoveredSegment({
      detail: segment.detail,
      label: segment.label,
      percent: Math.round(percent),
      value: segment.value,
      x: rect ? ((event.clientX - rect.left) / rect.width) * 100 : 50,
      y: rect ? ((event.clientY - rect.top) / rect.height) * 100 : 50,
    })
  }

  return (
    <div className="analytics-donut">
      <svg viewBox="0 0 100 100" role="img" aria-label={centerLabel}>
        <circle className="analytics-donut-track" cx="50" cy="50" r="38" pathLength="100" />
        {visibleSegments.map((segment) => {
          const percent = total > 0 ? (segment.value / total) * 100 : 0
          const currentOffset = offset
          const midpoint = currentOffset + percent / 2
          const midpointRadians = (midpoint / 100) * Math.PI * 2 - Math.PI / 2
          offset += percent

          return (
            <circle
              className="analytics-donut-segment"
              cx="50"
              cy="50"
              key={segment.label}
              pathLength="100"
              r="38"
              stroke={segment.color}
              strokeDasharray={`${percent} ${100 - percent}`}
              strokeDashoffset={-currentOffset}
              tabIndex={0}
              onBlur={() => setHoveredSegment(null)}
              onFocus={() =>
                setHoveredSegment({
                  detail: segment.detail,
                  label: segment.label,
                  percent: Math.round(percent),
                  value: segment.value,
                  x: 50 + Math.cos(midpointRadians) * 32,
                  y: 50 + Math.sin(midpointRadians) * 32,
                })
              }
              onMouseEnter={(event) => moveTooltip(event, segment, percent)}
              onMouseLeave={() => setHoveredSegment(null)}
              onMouseMove={(event) => moveTooltip(event, segment, percent)}
            />
          )
        })}
      </svg>
      <div className="analytics-donut-center">
        <strong>{centerValue}</strong>
        <span>{centerLabel}</span>
      </div>
      {hoveredSegment && (
        <div
          className="analytics-donut-tooltip"
          style={{
            left: `${hoveredSegment.x}%`,
            top: `${hoveredSegment.y}%`,
          }}
        >
          <strong>{hoveredSegment.percent}%</strong>
          <span>{hoveredSegment.label}</span>
          <small>
            {hoveredSegment.value} · {hoveredSegment.detail}
          </small>
        </div>
      )}
    </div>
  )
}

function AnalyticsDonutPanel({
  centerLabel,
  centerValue,
  segments,
  title,
  total,
}: {
  centerLabel: string
  centerValue: string | number
  segments: AnalyticsPieSegment[]
  title: string
  total: number
}) {
  return (
    <div className="analytics-chart-block">
      <h3>{title}</h3>
      <AnalyticsDonutChart
        centerLabel={centerLabel}
        centerValue={centerValue}
        segments={segments}
        total={total}
      />
    </div>
  )
}

function boolLabel(value: boolean) {
  return value ? 'Активно' : 'Выключено'
}

function AnalyticsDailyLineChart({
  grouping,
  rows,
  valueKey = 'completed',
  valueLabel = 'Обслужено',
  averageLabel,
}: {
  grouping: AnalyticsTimeGrouping
  rows: OperatorDailyAnalyticsItem[]
  valueKey?: 'completed' | 'tickets_count'
  valueLabel?: string
  averageLabel?: string
}) {
  if (rows.length === 0) {
    return null
  }

  const totalValue = rows.reduce((total, rowStats) => total + rowStats[valueKey], 0)
  const averageValue = rows.length > 0 ? Math.round(totalValue / rows.length) : 0
  const maxValue = Math.max(1, ...rows.map((rowStats) => rowStats[valueKey]))
  const chartWidth = 640
  const chartHeight = 190
  const padding = { bottom: 34, left: 34, right: 16, top: 16 }
  const innerWidth = chartWidth - padding.left - padding.right
  const innerHeight = chartHeight - padding.top - padding.bottom
  const points = rows.map((rowStats, index) => {
    const x =
      rows.length === 1
        ? padding.left + innerWidth / 2
        : padding.left + (index / (rows.length - 1)) * innerWidth
    const value = rowStats[valueKey]
    const y = padding.top + ((maxValue - value) / maxValue) * innerHeight

    return {
      ...rowStats,
      label: grouping === 'month' ? formatAnalyticsMonth(rowStats.date) : formatAnalyticsDate(rowStats.date),
      value,
      x,
      y,
    }
  })
  const pointPath = points.map((point) => `${point.x},${point.y}`).join(' ')
  const labelStep = grouping === 'month' ? 1 : Math.max(1, Math.ceil(rows.length / 7))
  const yTicks = [0, Math.ceil(maxValue / 2), maxValue]

  return (
    <div className="analytics-line-chart">
      <div className="analytics-line-summary">
        <div>
          <span>{valueLabel}</span>
          <strong>{totalValue}</strong>
        </div>
        <div>
          <span>{averageLabel ?? (grouping === 'month' ? 'Среднее в месяц' : 'Среднее в день')}</span>
          <strong>{averageValue}</strong>
        </div>
      </div>
      <svg
        className="analytics-line-plot"
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        role="img"
        aria-label="Линейная диаграмма обслуженных талонов по дням"
      >
        {yTicks.map((tick) => {
          const y = padding.top + ((maxValue - tick) / maxValue) * innerHeight

          return (
            <g className="analytics-line-grid" key={tick}>
              <line x1={padding.left} x2={chartWidth - padding.right} y1={y} y2={y} />
              <text x={padding.left - 10} y={y + 4}>
                {tick}
              </text>
            </g>
          )
        })}
        <line
          className="analytics-line-axis"
          x1={padding.left}
          x2={chartWidth - padding.right}
          y1={chartHeight - padding.bottom}
          y2={chartHeight - padding.bottom}
        />
        <line
          className="analytics-line-axis"
          x1={padding.left}
          x2={padding.left}
          y1={padding.top}
          y2={chartHeight - padding.bottom}
        />
        {points.length > 1 ? (
          <polyline className="analytics-line-path" points={pointPath} />
        ) : (
          <line
            className="analytics-line-path"
            x1={padding.left}
            x2={chartWidth - padding.right}
            y1={points[0].y}
            y2={points[0].y}
          />
        )}
        {points.map((point, index) => {
          const showDateLabel = index === 0 || index === points.length - 1 || index % labelStep === 0

          return (
            <g className="analytics-line-point" key={point.date}>
              <circle cx={point.x} cy={point.y} r="3.5" />
              {point.value > 0 && (
                <text className="analytics-line-value" x={point.x} y={point.y - 10}>
                  {point.value}
                </text>
              )}
              {showDateLabel && (
                <text className="analytics-line-date" x={point.x} y={chartHeight - 14}>
                  {point.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function getEducationalProgramDisplayLabel(ticket: Pick<TicketItem, 'educational_program_name'>) {
  return ticket.educational_program_name ?? 'Не указано'
}

function formatQueueWaitTime(startDate: Date, endDate: Date) {
  const diffMinutes = Math.max(0, Math.floor((endDate.getTime() - startDate.getTime()) / 60000))

  if (diffMinutes < 1) {
    return 'меньше 1 мин'
  }

  const hours = Math.floor(diffMinutes / 60)
  const minutes = diffMinutes % 60

  if (hours === 0) {
    return `${minutes} мин`
  }

  return minutes === 0 ? `${hours} ч` : `${hours} ч ${minutes} мин`
}

function parseApiDate(value: string) {
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value)
  return new Date(hasTimezone ? value : `${value}Z`)
}

function getTicketQueueWaitLabel(
  ticket: Pick<TicketItem, 'created_at' | 'called_at' | 'started_at' | 'completed_at'>,
  now: Date,
) {
  const createdAt = parseApiDate(ticket.created_at)
  const queueEndAt = ticket.called_at ?? ticket.started_at ?? ticket.completed_at
  const endAt = queueEndAt ? parseApiDate(queueEndAt) : now

  if (Number.isNaN(createdAt.getTime()) || Number.isNaN(endAt.getTime())) {
    return 'Не указано'
  }

  return formatQueueWaitTime(createdAt, endAt)
}

function getTicketStatusLabel(status: string) {
  return ticketStatusLabels[status] ?? status
}

function formatTicketExportDate(value: string | null) {
  if (!value) {
    return ''
  }

  const date = parseApiDate(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ru-RU')
}

function getTicketProcessingMinutes(ticket: TicketItem) {
  if (!ticket.called_at || !ticket.completed_at) {
    return ''
  }

  const calledAt = parseApiDate(ticket.called_at).getTime()
  const completedAt = parseApiDate(ticket.completed_at).getTime()

  if (Number.isNaN(calledAt) || Number.isNaN(completedAt) || completedAt < calledAt) {
    return ''
  }

  return String(Math.round((completedAt - calledAt) / 60000))
}

function getTicketWaitMinutes(ticket: TicketItem) {
  const createdAt = parseApiDate(ticket.created_at).getTime()
  const calledAt = ticket.called_at ? parseApiDate(ticket.called_at).getTime() : null

  if (Number.isNaN(createdAt) || calledAt === null || Number.isNaN(calledAt) || calledAt < createdAt) {
    return ''
  }

  return String(Math.round((calledAt - createdAt) / 60000))
}

function escapeCsvCell(value: string | number | null | undefined) {
  const normalizedValue = value === null || value === undefined ? '' : String(value)
  return `"${normalizedValue.replace(/"/g, '""')}"`
}

function downloadCsvFile(filename: string, rows: Array<Array<string | number | null | undefined>>) {
  const csv = rows.map((row) => row.map(escapeCsvCell).join(';')).join('\r\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function sanitizeExportFilename(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'tickets'
}

function downloadTicketExport(tickets: TicketItem[], scopeLabel: string) {
  const header = [
    'ID талона',
    'Номер талона',
    'Номер очереди',
    'Статус',
    'Статус RU',
    'Приоритет',
    'Ожидание, мин',
    'Обслуживание, мин',
    'Создан',
    'Вызван',
    'Начат',
    'Завершен',
    'Оператор ID',
    'Оператор',
    'Email оператора',
    'Окно ID',
    'Окно',
    'Этаж',
    'Услуга ID',
    'Услуга',
    'Код услуги',
    'ОП ID',
    'ОП',
    'Код ОП',
    'Степень',
    'Код степени',
    'Язык обучения',
    'ИИН',
    'ФИО',
    'Телефон',
    'Applicant ID',
    'Routing key',
    'Assignment score',
    'Ожидание план, мин',
  ]
  const rows = tickets.map((ticket) => [
    ticket.id,
    ticket.ticket_number,
    ticket.queue_number,
    ticket.status,
    getTicketStatusLabel(ticket.status),
    ticket.priority,
    getTicketWaitMinutes(ticket),
    getTicketProcessingMinutes(ticket),
    formatTicketExportDate(ticket.created_at),
    formatTicketExportDate(ticket.called_at),
    formatTicketExportDate(ticket.started_at),
    formatTicketExportDate(ticket.completed_at),
    ticket.operator_id,
    ticket.operator_name,
    ticket.operator_email,
    ticket.window_id,
    ticket.window_name,
    ticket.window_floor,
    ticket.service_id,
    ticket.service_name,
    ticket.service_code,
    ticket.educational_program_id,
    ticket.educational_program_name,
    ticket.educational_program_code,
    ticket.academic_degree_name,
    ticket.academic_degree_code,
    ticket.study_language ? getStudyLanguageLabel(ticket.study_language) : '',
    ticket.iin,
    ticket.full_name,
    ticket.phone,
    ticket.applicant_id,
    ticket.routing_key,
    ticket.assignment_score,
    ticket.estimated_wait,
  ])
  const dateStamp = new Date().toISOString().slice(0, 10)

  downloadCsvFile(`tickets-${sanitizeExportFilename(scopeLabel)}-${dateStamp}.csv`, [header, ...rows])
}

function downloadUserLoginExport(users: UserItem[]) {
  const header = ['ID', 'ФИО', 'Логин / email', 'Роль', 'Активен']
  const rows = users.map((user) => [
    user.id,
    user.full_name,
    user.email,
    user.role,
    boolLabel(user.is_active),
  ])
  const dateStamp = new Date().toISOString().slice(0, 10)

  downloadCsvFile(`user-logins-${dateStamp}.csv`, [header, ...rows])
}

function getMyWindowTicketStatusClassName(status: string) {
  if (status === 'WAITING') {
    return 'pill status-waiting'
  }

  if (status === 'CALLED') {
    return 'pill status-working'
  }

  return 'pill status-neutral'
}

function isActiveMyWindowTicket(ticket: TicketItem) {
  return ACTIVE_MY_WINDOW_TICKET_STATUSES.has(ticket.status)
}

function getMyWindowTicketStatusOrder(status: string) {
  if (status === 'CALLED') {
    return 0
  }

  if (status === 'WAITING') {
    return 1
  }

  return 2
}

function getTicketCreatedAtTime(ticket: TicketItem) {
  const createdAtTime = Date.parse(ticket.created_at)
  return Number.isNaN(createdAtTime) ? 0 : createdAtTime
}

function sortMyWindowTickets(tickets: TicketItem[]) {
  return [...tickets].sort((firstTicket, secondTicket) => {
    const statusOrder = getMyWindowTicketStatusOrder(firstTicket.status) - getMyWindowTicketStatusOrder(secondTicket.status)

    if (statusOrder !== 0) {
      return statusOrder
    }

    const createdAtOrder = getTicketCreatedAtTime(firstTicket) - getTicketCreatedAtTime(secondTicket)

    if (createdAtOrder !== 0) {
      return createdAtOrder
    }

    if (firstTicket.queue_number !== secondTicket.queue_number) {
      return firstTicket.queue_number - secondTicket.queue_number
    }

    return firstTicket.ticket_number.localeCompare(secondTicket.ticket_number)
  })
}

function sortReceptionTickets(tickets: TicketItem[]) {
  return [...tickets].sort((firstTicket, secondTicket) => {
    if (firstTicket.status === secondTicket.status) {
      return 0
    }

    if (firstTicket.status === 'WAITING') {
      return -1
    }

    if (secondTicket.status === 'WAITING') {
      return 1
    }

    return 0
  })
}

function getStudyLanguageLabel(studyLanguage: StudyLanguage | null) {
  return studyLanguage ? studyLanguageLabels[studyLanguage] : 'Не указан'
}

function parseStudyLanguage(value: string): StudyLanguage | null {
  return studyLanguageOptions.some((option) => option.value === value) ? (value as StudyLanguage) : null
}

function getUserLabel(users: UserItem[], userId: string) {
  const user = users.find((item) => item.id === userId)
  return user ? `${user.full_name} (${user.email})` : userId
}

function getWindowLabel(windows: WindowItem[], windowId: number | null) {
  if (windowId === null) {
    return 'Не назначено'
  }

  const windowItem = windows.find((item) => item.id === windowId)
  return windowItem
    ? `${windowItem.name}${windowItem.floor ? `, этаж ${windowItem.floor}` : ''} (${windowItem.status})`
    : String(windowId)
}

function getOperatorLabel(operators: OperatorItem[], users: UserItem[], operatorId: string | null) {
  if (operatorId === null) {
    return 'Не назначен'
  }

  const operator = operators.find((item) => item.id === operatorId)
  return operator ? getUserLabel(users, operator.user_id) : operatorId
}

function getAnalyticsOperatorLabel(
  stats: OperatorTicketAnalyticsItem,
  operator: OperatorItem | undefined,
  users: UserItem[],
) {
  if (operator) {
    return getUserLabel(users, operator.user_id)
  }

  return stats.operator_name ?? stats.operator_email ?? stats.operator_id
}

function formatDuration(totalSeconds: number) {
  if (totalSeconds <= 0) {
    return '0 мин'
  }

  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.round((totalSeconds % 3600) / 60)

  if (hours === 0) {
    return `${Math.max(1, minutes)} мин`
  }

  if (minutes === 0) {
    return `${hours} ч`
  }

  return `${hours} ч ${minutes} мин`
}

function getAnalyticsServiceColor(index: number) {
  return ANALYTICS_SERVICE_COLORS[index % ANALYTICS_SERVICE_COLORS.length]
}

function formatDecimal(value: number, fractionDigits = 1) {
  return value.toLocaleString('ru-RU', {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  })
}

function getPresenceSeconds(stats: OperatorTicketAnalyticsItem) {
  return Math.max(stats.worked_seconds + stats.break_seconds, stats.worked_seconds, stats.total_processing_seconds)
}

function getOperatorUtilizationPercent(stats: OperatorTicketAnalyticsItem) {
  const presenceSeconds = getPresenceSeconds(stats)

  if (presenceSeconds <= 0) {
    return 0
  }

  return Math.round((stats.total_processing_seconds / presenceSeconds) * 100)
}

function getOperatorClientsPerHour(stats: OperatorTicketAnalyticsItem) {
  const presenceHours = getPresenceSeconds(stats) / 3600

  if (presenceHours <= 0) {
    return 0
  }

  return stats.processed / presenceHours
}

function formatAnalyticsDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'short',
  })
}

function formatAnalyticsMonth(value: string) {
  return new Date(`${value}-01T00:00:00`).toLocaleDateString('ru-RU', {
    month: 'short',
    year: '2-digit',
  })
}

function formatDateInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDateInputValue(value: string) {
  const [year, month, day] = value.split('-').map(Number)

  if (!year || !month || !day) {
    return null
  }

  const date = new Date(year, month - 1, day)
  return Number.isNaN(date.getTime()) ? null : date
}

function getDefaultSummerDateRange() {
  const year = new Date().getFullYear()

  return {
    from: `${year}-06-01`,
    to: `${year}-08-31`,
  }
}

function buildDailyAnalyticsRange(days: OperatorDailyAnalyticsItem[], from: string, to: string) {
  const fromDate = parseDateInputValue(from)
  const toDate = parseDateInputValue(to)

  if (fromDate === null || toDate === null || fromDate > toDate) {
    return []
  }

  const daysByDate = new Map(days.map((dayStats) => [dayStats.date, dayStats]))
  const rows: OperatorDailyAnalyticsItem[] = []
  const currentDate = new Date(fromDate)

  while (currentDate <= toDate) {
    const dateKey = formatDateInputValue(currentDate)
    const dayStats = daysByDate.get(dateKey)

    rows.push(
      dayStats ?? {
        active: 0,
        completed: 0,
        date: dateKey,
        skipped: 0,
        tickets_count: 0,
      },
    )
    currentDate.setDate(currentDate.getDate() + 1)
  }

  return rows
}

function buildMonthlyAnalyticsRange(days: OperatorDailyAnalyticsItem[], from: string, to: string) {
  const fromDate = parseDateInputValue(from)
  const toDate = parseDateInputValue(to)

  if (fromDate === null || toDate === null || fromDate > toDate) {
    return []
  }

  const monthsByDate = new Map<string, OperatorDailyAnalyticsItem>()
  days.forEach((dayStats) => {
    const monthKey = dayStats.date.slice(0, 7)
    const monthStats = monthsByDate.get(monthKey)

    if (monthStats) {
      monthStats.active += dayStats.active
      monthStats.completed += dayStats.completed
      monthStats.skipped += dayStats.skipped
      monthStats.tickets_count += dayStats.tickets_count
    }

    monthsByDate.set(monthKey, {
      active: dayStats.active,
      completed: dayStats.completed,
      date: monthKey,
      skipped: dayStats.skipped,
      tickets_count: dayStats.tickets_count,
    })
  })

  const rows: OperatorDailyAnalyticsItem[] = []
  const currentDate = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1)
  const endDate = new Date(toDate.getFullYear(), toDate.getMonth(), 1)

  while (currentDate <= endDate) {
    const monthKey = formatDateInputValue(currentDate).slice(0, 7)
    const monthStats = monthsByDate.get(monthKey)

    rows.push(
      monthStats ?? {
        active: 0,
        completed: 0,
        date: monthKey,
        skipped: 0,
        tickets_count: 0,
      },
    )
    currentDate.setMonth(currentDate.getMonth() + 1)
  }

  return rows
}

function aggregateDailyAnalytics(rows: OperatorDailyAnalyticsItem[]) {
  const rowsByDate = new Map<string, OperatorDailyAnalyticsItem>()

  rows.forEach((dayStats) => {
    const current = rowsByDate.get(dayStats.date)

    if (current) {
      current.active += dayStats.active
      current.completed += dayStats.completed
      current.skipped += dayStats.skipped
      current.tickets_count += dayStats.tickets_count
      return
    }

    rowsByDate.set(dayStats.date, { ...dayStats })
  })

  return [...rowsByDate.values()].sort((firstStats, secondStats) =>
    firstStats.date.localeCompare(secondStats.date),
  )
}

function buildTicketDistribution<T extends string>(
  tickets: TicketItem[],
  getKey: (ticket: TicketItem) => T,
  getLabel: (ticket: TicketItem) => string,
) {
  const rowsByKey = new Map<T, AnalyticsDistributionItem>()

  tickets.forEach((ticket) => {
    const key = getKey(ticket)
    const current = rowsByKey.get(key)

    if (current) {
      current.value += 1
      return
    }

    rowsByKey.set(key, {
      id: key,
      label: getLabel(ticket),
      value: 1,
    })
  })

  return [...rowsByKey.values()].sort((firstItem, secondItem) => secondItem.value - firstItem.value)
}

function distributionToPieSegments(
  rows: AnalyticsDistributionItem[],
  total: number,
  detailLabel = 'от всех талонов',
) {
  return rows.map((item, index) => ({
    color: getAnalyticsServiceColor(index),
    detail: `${total > 0 ? Math.round((item.value / total) * 100) : 0}% ${detailLabel}`,
    label: item.label,
    value: item.value,
  }))
}

function getDegreeLabel(degrees: AcademicDegreeItem[], degreeId: number) {
  const degree = degrees.find((item) => item.id === degreeId)
  return degree ? `${degree.name} (${degree.code})` : String(degreeId)
}

function normalizeChoiceSearch(value: string) {
  return value.trim().toLowerCase()
}

function getProgramLabels(programs: EducationalProgramItem[], programIds: number[]) {
  if (programIds.length === 0) {
    return 'Не выбрано'
  }

  return programIds
    .map((programId) => {
      const program = programs.find((item) => item.id === programId)
      return program ? program.code : String(programId)
    })
    .join(', ')
}

function getServiceLabels(services: ServiceItem[], serviceIds: number[]) {
  if (serviceIds.length === 0) {
    return 'Не выбрано'
  }

  return serviceIds
    .map((serviceId) => {
      const service = services.find((item) => item.id === serviceId)
      return service ? service.code : String(serviceId)
    })
    .join(', ')
}

function normalizeServiceLanguages(languages: ServiceLanguage[] | undefined) {
  if (!languages || languages.length === 0) {
    return defaultServiceLanguages
  }

  const selected = defaultServiceLanguages.filter((language) => languages.includes(language))
  return selected.length > 0 ? selected : defaultServiceLanguages
}

function buildServiceLanguagesPayload(
  serviceIds: number[],
  serviceLanguages: Record<number, ServiceLanguage[]>,
) {
  return Object.fromEntries(
    serviceIds.map((serviceId) => [
      serviceId,
      normalizeServiceLanguages(serviceLanguages[serviceId]),
    ]),
  )
}

function normalizeStudyLanguages(languages: StudyLanguage[] | undefined) {
  if (!languages || languages.length === 0) {
    return defaultStudyLanguages
  }

  const selected = defaultStudyLanguages.filter((language) => languages.includes(language))
  return selected.length > 0 ? selected : defaultStudyLanguages
}

function buildStudyLanguagesPayload(
  programIds: number[],
  programLanguages: Record<number, StudyLanguage[]>,
) {
  return Object.fromEntries(
    programIds.map((programId) => [
      programId,
      normalizeStudyLanguages(programLanguages[programId]),
    ]),
  )
}

function getCurrentUserIdFromToken() {
  const token = tokenStorage.getAccessToken()

  if (!token) {
    return null
  }

  try {
    const [, payloadPart] = token.split('.')
    const normalizedPayload = payloadPart.replace(/-/g, '+').replace(/_/g, '/')
    const paddedPayload = normalizedPayload.padEnd(
      normalizedPayload.length + ((4 - (normalizedPayload.length % 4)) % 4),
      '=',
    )
    const payload = JSON.parse(window.atob(paddedPayload)) as { sub?: string }

    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}

function getMyWindowWebSocketUrl(token: string) {
  const baseUrl = env.apiWsBaseUrl.replace(/\/$/, '')
  const url = new URL(`${baseUrl}/ws/my-window`)
  url.searchParams.set('token', token)
  return url.toString()
}

export function DashboardPage({ authUser }: { authUser: AuthUser }) {
  const currentUserId = getCurrentUserIdFromToken()
  const isAdminUser = authUser.role === 'ADMIN'
  const [lang, setLang] = useState<Lang>(getInitialLang)
  const [activeSection, setActiveSection] = useState<DashboardSection>(() => {
    const requestedSection = getSectionFromPath()
    return isAdminUser || canUseOperatorSection(requestedSection) ? requestedSection : 'myWindow'
  })
  const [formModal, setFormModal] = useState<CrudSection | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [services, setServices] = useState<ServiceItem[]>([])
  const [windows, setWindows] = useState<WindowItem[]>([])
  const [users, setUsers] = useState<UserItem[]>([])
  const [operators, setOperators] = useState<OperatorItem[]>([])
  const [academicDegrees, setAcademicDegrees] = useState<AcademicDegreeItem[]>([])
  const [educationalPrograms, setEducationalPrograms] = useState<EducationalProgramItem[]>([])
  const [applicants, setApplicants] = useState<ApplicantItem[]>([])
  const [ticketEvents, setTicketEvents] = useState<TicketEventItem[]>([])
  const [operatorAnalytics, setOperatorAnalytics] = useState<OperatorTicketAnalyticsItem[]>([])
  const [analyticsTickets, setAnalyticsTickets] = useState<TicketItem[]>([])
  const [ticketExportingKey, setTicketExportingKey] = useState<string | null>(null)
  const [analyticsDateFrom, setAnalyticsDateFrom] = useState(() => getDefaultSummerDateRange().from)
  const [analyticsDateTo, setAnalyticsDateTo] = useState(() => getDefaultSummerDateRange().to)
  const [analyticsTimeGrouping, setAnalyticsTimeGrouping] = useState<AnalyticsTimeGrouping>('day')
  const [selectedAnalyticsOperatorId, setSelectedAnalyticsOperatorId] = useState<string | null>(() =>
    isAdminUser ? getAnalyticsOperatorIdFromPath() : null,
  )
  const [myWindowTickets, setMyWindowTickets] = useState<MyWindowTickets | null>(null)
  const [myWindowRealtimeStatus, setMyWindowRealtimeStatus] =
    useState<MyWindowRealtimeStatus>('disconnected')
  const [myWindowRefreshing, setMyWindowRefreshing] = useState(false)
  const [myWindowTicketHighlights, setMyWindowTicketHighlights] = useState<
    Record<string, MyWindowTicketHighlight>
  >({})
  const myWindowTicketsRef = useRef<MyWindowTickets | null>(null)
  const [myWindowError, setMyWindowError] = useState('')
  const [myWindowPage, setMyWindowPage] = useState(1)
  const [selectedMyWindowTicket, setSelectedMyWindowTicket] = useState<TicketItem | null>(null)
  const [receptionTickets, setReceptionTickets] = useState<ReceptionTickets | null>(null)
  const [receptionPage, setReceptionPage] = useState(1)
  const [receptionServiceId, setReceptionServiceId] = useState('')
  const [receptionSearch, setReceptionSearch] = useState('')
  const [receptionRefreshing, setReceptionRefreshing] = useState(false)
  const [receptionError, setReceptionError] = useState('')
  const [selectedReceptionTicket, setSelectedReceptionTicket] = useState<TicketItem | null>(null)
  const [acceptIin, setAcceptIin] = useState('')
  const [acceptStudyLanguage, setAcceptStudyLanguage] = useState<StudyLanguage | ''>('')
  const [ticketActionSaving, setTicketActionSaving] = useState(false)
  const [reassignServiceId, setReassignServiceId] = useState('')
  const [reassignProgramId, setReassignProgramId] = useState('')
  const [reassignServiceLanguage, setReassignServiceLanguage] = useState<ServiceLanguage | ''>('')
  const [reassignServiceQuery, setReassignServiceQuery] = useState('')
  const [reassignProgramQuery, setReassignProgramQuery] = useState('')
  const [reassignServiceListOpen, setReassignServiceListOpen] = useState(false)
  const [reassignProgramListOpen, setReassignProgramListOpen] = useState(false)
  const [operatorProgramIds, setOperatorProgramIds] = useState<Record<string, number[]>>({})
  const [operatorProgramLanguages, setOperatorProgramLanguages] = useState<
    Record<string, Record<number, StudyLanguage[]>>
  >({})
  const [operatorServiceIds, setOperatorServiceIds] = useState<Record<string, number[]>>({})
  const [operatorServiceLanguages, setOperatorServiceLanguages] = useState<
    Record<string, Record<number, ServiceLanguage[]>>
  >({})
  const [serviceForm, setServiceForm] = useState<ServicePayload>(emptyService)
  const [windowForm, setWindowForm] = useState<WindowPayload>(emptyWindow)
  const [selectedWindowOperatorId, setSelectedWindowOperatorId] = useState('')
  const [userForm, setUserForm] = useState<UserPayload>(emptyUser)
  const [operatorForm, setOperatorForm] = useState<OperatorPayload>(emptyOperator)
  const [academicDegreeForm, setAcademicDegreeForm] = useState<AcademicDegreePayload>(emptyAcademicDegree)
  const [educationalProgramForm, setEducationalProgramForm] =
    useState<EducationalProgramPayload>(emptyEducationalProgram)
  const [applicantForm, setApplicantForm] = useState<ApplicantPayload>(emptyApplicant)
  const [ticketEventForm, setTicketEventForm] = useState<TicketEventPayload>(emptyTicketEvent)
  const [ticketEventMetadataText, setTicketEventMetadataText] = useState('')
  const [selectedOperatorProgramIds, setSelectedOperatorProgramIds] = useState<number[]>([])
  const [selectedOperatorProgramLanguages, setSelectedOperatorProgramLanguages] = useState<
    Record<number, StudyLanguage[]>
  >({})
  const [selectedOperatorServiceIds, setSelectedOperatorServiceIds] = useState<number[]>([])
  const [selectedOperatorServiceLanguages, setSelectedOperatorServiceLanguages] = useState<
    Record<number, ServiceLanguage[]>
  >({})
  const [profileProgramIds, setProfileProgramIds] = useState<number[]>([])
  const [profileProgramLanguages, setProfileProgramLanguages] = useState<Record<number, StudyLanguage[]>>({})
  const [profileServiceIds, setProfileServiceIds] = useState<number[]>([])
  const [profileServiceLanguages, setProfileServiceLanguages] = useState<Record<number, ServiceLanguage[]>>({})
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMessage, setProfileMessage] = useState('')
  const [windowStatusSaving, setWindowStatusSaving] = useState(false)
  const [windowStatusMessage, setWindowStatusMessage] = useState('')
  const [editingServiceId, setEditingServiceId] = useState<number | null>(null)
  const [editingWindowId, setEditingWindowId] = useState<number | null>(null)
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [editingOperatorId, setEditingOperatorId] = useState<string | null>(null)
  const [editingAcademicDegreeId, setEditingAcademicDegreeId] = useState<number | null>(null)
  const [editingEducationalProgramId, setEditingEducationalProgramId] = useState<number | null>(null)
  const [editingApplicantId, setEditingApplicantId] = useState<string | null>(null)
  const [editingTicketEventId, setEditingTicketEventId] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState(() => new Date())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    myWindowTicketsRef.current = myWindowTickets
  }, [myWindowTickets])

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setCurrentTime(new Date())
    }, 30000)

    return () => window.clearInterval(timerId)
  }, [])

  useEffect(() => {
    localStorage.setItem(LANG_STORAGE_KEY, lang)

    const localizedPath = buildSectionPath(
      lang,
      activeSection,
      isAdminUser && activeSection === 'analytics' ? selectedAnalyticsOperatorId : null,
    )
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`

    if (localizedPath !== currentPath) {
      window.history.replaceState(null, '', localizedPath)
    }
  }, [activeSection, isAdminUser, lang, selectedAnalyticsOperatorId])

  useEffect(() => {
    function syncSectionFromPath() {
      if (!isAdminUser) {
        const requestedSection = getSectionFromPath()
        setActiveSection(canUseOperatorSection(requestedSection) ? requestedSection : 'myWindow')
        setSelectedAnalyticsOperatorId(null)
        return
      }

      const nextSection = getSectionFromPath()
      setActiveSection(nextSection)
      setSelectedAnalyticsOperatorId(nextSection === 'analytics' ? getAnalyticsOperatorIdFromPath() : null)
    }

    window.addEventListener('popstate', syncSectionFromPath)

    return () => window.removeEventListener('popstate', syncSectionFromPath)
  }, [isAdminUser])

  function navigateToSection(section: DashboardSection, analyticsOperatorId: string | null = null) {
    if (!isAdminUser && !canUseOperatorSection(section)) {
      section = 'myWindow'
    }

    setActiveSection(section)
    setSelectedAnalyticsOperatorId(section === 'analytics' && isAdminUser ? analyticsOperatorId : null)
    closeFormModal()
    setDeleteTarget(null)
    setProfileMenuOpen(false)

    const sectionPath = buildSectionPath(
      lang,
      section,
      section === 'analytics' && isAdminUser ? analyticsOperatorId : null,
    )
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`

    if (sectionPath !== currentPath) {
      window.history.pushState(null, '', sectionPath)
    }
  }

  function selectProfileService(serviceId: number, checked: boolean) {
    if (checked) {
      setProfileServiceIds([...profileServiceIds, serviceId])
      setProfileServiceLanguages({
        ...profileServiceLanguages,
        [serviceId]: normalizeServiceLanguages(profileServiceLanguages[serviceId]),
      })
      return
    }

    setProfileServiceIds(profileServiceIds.filter((selectedServiceId) => selectedServiceId !== serviceId))
    setProfileServiceLanguages(
      Object.fromEntries(
        Object.entries(profileServiceLanguages)
          .filter(([selectedServiceId]) => Number(selectedServiceId) !== serviceId)
          .map(([selectedServiceId, languages]) => [Number(selectedServiceId), languages]),
      ),
    )
  }

  function toggleProfileServiceLanguage(serviceId: number, language: ServiceLanguage, checked: boolean) {
    const currentLanguages = normalizeServiceLanguages(profileServiceLanguages[serviceId])
    const nextLanguages = checked
      ? normalizeServiceLanguages([...currentLanguages, language])
      : currentLanguages.filter((selectedLanguage) => selectedLanguage !== language)

    if (nextLanguages.length === 0) {
      return
    }

    setProfileServiceLanguages({
      ...profileServiceLanguages,
      [serviceId]: nextLanguages,
    })
  }

  function selectProfileProgram(programId: number, checked: boolean) {
    if (checked) {
      setProfileProgramIds([...profileProgramIds, programId])
      setProfileProgramLanguages({
        ...profileProgramLanguages,
        [programId]: normalizeStudyLanguages(profileProgramLanguages[programId]),
      })
      return
    }

    setProfileProgramIds(profileProgramIds.filter((selectedProgramId) => selectedProgramId !== programId))
    setProfileProgramLanguages(
      Object.fromEntries(
        Object.entries(profileProgramLanguages)
          .filter(([selectedProgramId]) => Number(selectedProgramId) !== programId)
          .map(([selectedProgramId, languages]) => [Number(selectedProgramId), languages]),
      ),
    )
  }

  function toggleProfileProgramLanguage(programId: number, language: StudyLanguage, checked: boolean) {
    const currentLanguages = normalizeStudyLanguages(profileProgramLanguages[programId])
    const nextLanguages = checked
      ? normalizeStudyLanguages([...currentLanguages, language])
      : currentLanguages.filter((selectedLanguage) => selectedLanguage !== language)

    if (nextLanguages.length === 0) {
      return
    }

    setProfileProgramLanguages({
      ...profileProgramLanguages,
      [programId]: nextLanguages,
    })
  }

  async function openSecondDisplay() {
    setError('')
    const launchError = await openOperatorDisplayOnSecondScreen(buildOperatorDisplayPath(lang))

    if (launchError) {
      setError(launchError)
    }
  }

  function highlightMyWindowChanges(nextRows: MyWindowTickets) {
    const previousRows = myWindowTicketsRef.current
    if (!previousRows) {
      return
    }

    const previousById = new Map(previousRows.tickets.map((ticket) => [ticket.id, ticket]))
    const nextHighlights: Record<string, MyWindowTicketHighlight> = {}

    nextRows.tickets.forEach((ticket) => {
      const previousTicket = previousById.get(ticket.id)
      if (!previousTicket) {
        nextHighlights[ticket.id] = 'new'
        return
      }

      if (JSON.stringify(previousTicket) !== JSON.stringify(ticket)) {
        nextHighlights[ticket.id] = 'updated'
      }
    })

    const highlightedIds = Object.keys(nextHighlights)
    if (highlightedIds.length === 0) {
      return
    }

    setMyWindowTicketHighlights((current) => ({ ...current, ...nextHighlights }))
    window.setTimeout(() => {
      setMyWindowTicketHighlights((current) => {
        const next = { ...current }
        highlightedIds.forEach((ticketId) => {
          if (next[ticketId] === nextHighlights[ticketId]) {
            delete next[ticketId]
          }
        })
        return next
      })
    }, 1800)
  }

  function applyMyWindowData(nextRows: MyWindowTickets, animate = false) {
    const orderedRows = {
      ...nextRows,
      tickets: sortMyWindowTickets(nextRows.tickets),
    }

    if (animate) {
      highlightMyWindowChanges(orderedRows)
    }

    myWindowTicketsRef.current = orderedRows
    setMyWindowTickets(orderedRows)
    setSelectedMyWindowTicket((current) =>
      current ? orderedRows.tickets.find((ticket) => ticket.id === current.id) ?? current : current,
    )
  }

  function applyReceptionData(nextRows: ReceptionTickets) {
    setReceptionTickets(nextRows)
    setSelectedReceptionTicket((current) =>
      current ? nextRows.tickets.find((ticket) => ticket.id === current.id) ?? current : current,
    )
  }

  async function refreshMyWindowFromRealtime() {
    setMyWindowRefreshing(true)

    try {
      const myWindowRows = await adminApi.tickets.myWindow({
        page: myWindowPage,
        page_size: MY_WINDOW_PAGE_SIZE,
      })
      applyMyWindowData(myWindowRows, true)
      setMyWindowPage(myWindowRows.page)
      setMyWindowError('')
    } catch (requestError) {
      setMyWindowError(requestError instanceof Error ? requestError.message : 'Не удалось обновить мое окно')
    } finally {
      setMyWindowRefreshing(false)
    }
  }

  async function loadAdminData() {
    setLoading(true)
    setError('')
    setMyWindowError('')

    try {
      const [
        serviceRows,
        windowRows,
        userRows,
        operatorRows,
        degreeRows,
        programRows,
        applicantRows,
        ticketEventRows,
        analyticsRows,
        ticketRows,
      ] = await Promise.all([
        adminApi.services.list(),
        adminApi.windows.list(),
        adminApi.users.list(),
        adminApi.operators.list(),
        adminApi.academicDegrees.list(),
        adminApi.educationalPrograms.list(),
        adminApi.applicants.list(),
        adminApi.ticketEvents.list(),
        adminApi.ticketEvents.analytics(),
        adminApi.tickets.export(),
      ])
      const operatorProgramsRows = await Promise.all(
        operatorRows.map(async (operator) => ({
          operatorId: operator.id,
          programs: await adminApi.operators.programs(operator.id),
        })),
      )
      const operatorServicesRows = await Promise.all(
        operatorRows.map(async (operator) => ({
          operatorId: operator.id,
          services: await adminApi.operators.services(operator.id),
        })),
      )

      setServices(serviceRows)
      setWindows(windowRows)
      setUsers(userRows)
      setOperators(operatorRows)
      setAcademicDegrees(degreeRows)
      setEducationalPrograms(programRows)
      setApplicants(applicantRows)
      setTicketEvents(ticketEventRows)
      setOperatorAnalytics(analyticsRows)
      setAnalyticsTickets(ticketRows)
      setOperatorProgramIds(
        Object.fromEntries(
          operatorProgramsRows.map((row) => [
            row.operatorId,
            row.programs.map((program) => program.id),
          ]),
        ),
      )
      setOperatorProgramLanguages(
        Object.fromEntries(
          operatorProgramsRows.map((row) => [
            row.operatorId,
            Object.fromEntries(
              row.programs.map((program) => [
                program.id,
                normalizeStudyLanguages(program.study_languages),
              ]),
            ),
          ]),
        ),
      )
      setOperatorServiceIds(
        Object.fromEntries(
          operatorServicesRows.map((row) => [
            row.operatorId,
            row.services.map((service) => service.id),
          ]),
        ),
      )
      setOperatorServiceLanguages(
        Object.fromEntries(
          operatorServicesRows.map((row) => [
            row.operatorId,
            Object.fromEntries(
              row.services.map((service) => [
                service.id,
                normalizeServiceLanguages(service.service_languages),
              ]),
            ),
          ]),
        ),
      )
      const currentOperator = operatorRows.find((operator) => operator.user_id === currentUserId)
      const currentOperatorPrograms = operatorProgramsRows.find((row) => row.operatorId === currentOperator?.id)
      const currentOperatorServices = operatorServicesRows.find((row) => row.operatorId === currentOperator?.id)
      setProfileProgramIds(currentOperatorPrograms?.programs.map((program) => program.id) ?? [])
      setProfileProgramLanguages(
        Object.fromEntries(
          currentOperatorPrograms?.programs.map((program) => [
            program.id,
            normalizeStudyLanguages(program.study_languages),
          ]) ?? [],
        ),
      )
      setProfileServiceIds(currentOperatorServices?.services.map((service) => service.id) ?? [])
      setProfileServiceLanguages(
        Object.fromEntries(
          currentOperatorServices?.services.map((service) => [
            service.id,
            normalizeServiceLanguages(service.service_languages),
          ]) ?? [],
        ),
      )
      try {
        applyMyWindowData(await adminApi.tickets.myWindow())
      } catch (requestError) {
        myWindowTicketsRef.current = null
        setMyWindowTickets(null)
        setMyWindowError(requestError instanceof Error ? requestError.message : 'Мое окно пока не назначено')
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось загрузить данные')
    } finally {
      setLoading(false)
    }
  }

  async function loadMyWindowData({ animate = false, silent = false } = {}) {
    if (silent) {
      setMyWindowRefreshing(true)
    } else {
      setLoading(true)
    }
    setError('')
    setMyWindowError('')

    try {
      const [myWindowRows, serviceRows, programRows] = await Promise.all([
        adminApi.tickets.myWindow({
          page: myWindowPage,
          page_size: MY_WINDOW_PAGE_SIZE,
        }),
        adminApi.operators.availableServices(),
        adminApi.operators.availablePrograms(),
      ])

      applyMyWindowData(myWindowRows, animate)
      setMyWindowPage(myWindowRows.page)
      setServices(serviceRows)
      setEducationalPrograms(programRows)
    } catch (requestError) {
      if (!silent) {
        myWindowTicketsRef.current = null
        setMyWindowTickets(null)
      }
      setMyWindowError(requestError instanceof Error ? requestError.message : 'Мое окно пока не назначено')
    } finally {
      if (silent) {
        setMyWindowRefreshing(false)
      } else {
        setLoading(false)
      }
    }
  }

  async function loadReceptionData({ silent = false } = {}) {
    if (silent) {
      setReceptionRefreshing(true)
    } else {
      setLoading(true)
    }

    setError('')
    setReceptionError('')

    try {
      const [receptionRows, serviceRows] = await Promise.all([
        adminApi.tickets.reception({
          search: receptionSearch,
          service_id: receptionServiceId ? Number(receptionServiceId) : undefined,
          page: receptionPage,
          page_size: MY_WINDOW_PAGE_SIZE,
        }),
        adminApi.services.list(),
      ])

      applyReceptionData(receptionRows)
      setReceptionPage(receptionRows.page)
      setServices(serviceRows)
    } catch (requestError) {
      setReceptionError(requestError instanceof Error ? requestError.message : 'Не удалось загрузить регистратуру')
    } finally {
      if (silent) {
        setReceptionRefreshing(false)
      } else {
        setLoading(false)
      }
    }
  }

  async function loadOperatorProfileData() {
    setLoading(true)
    setError('')

    try {
      const [operator, selectedServices, selectedPrograms, serviceRows, programRows, degreeRows] =
        await Promise.all([
          adminApi.operators.me(),
          adminApi.operators.myServices(),
          adminApi.operators.myPrograms(),
          adminApi.operators.availableServices(),
          adminApi.operators.availablePrograms(),
          adminApi.operators.availableDegrees(),
        ])

      setOperators([operator])
      setServices(serviceRows)
      setEducationalPrograms(programRows)
      setAcademicDegrees(degreeRows)
      setProfileServiceIds(selectedServices.map((service) => service.id))
      setProfileProgramIds(selectedPrograms.map((program) => program.id))
      setOperatorServiceIds({ [operator.id]: selectedServices.map((service) => service.id) })
      setOperatorProgramIds({ [operator.id]: selectedPrograms.map((program) => program.id) })
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось загрузить профиль оператора')
    } finally {
      setLoading(false)
    }
  }

  async function loadOperatorAnalyticsData() {
    setLoading(true)
    setError('')

    try {
      const [operator, analyticsRow] = await Promise.all([
        adminApi.operators.me(),
        adminApi.ticketEvents.myAnalytics(),
      ])

      setOperators([operator])
      setUsers([authUser])
      setOperatorAnalytics([analyticsRow])
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось загрузить аналитику оператора')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isAdminUser) {
      void loadAdminData()
    }
  }, [isAdminUser])

  useEffect(() => {
    if (isAdminUser) {
      return
    }

    if (activeSection === 'profile') {
      void loadOperatorProfileData()
      return
    }

    if (activeSection === 'analytics') {
      void loadOperatorAnalyticsData()
      return
    }

    void loadMyWindowData()
  }, [activeSection, isAdminUser])

  useEffect(() => {
    if (activeSection !== 'myWindow') {
      return
    }

    const timerId = window.setTimeout(() => {
      void loadMyWindowData({
        animate: Boolean(myWindowTicketsRef.current),
        silent: Boolean(myWindowTicketsRef.current),
      })
    }, 0)

    return () => window.clearTimeout(timerId)
  }, [activeSection, myWindowPage])

  useEffect(() => {
    if (!isAdminUser || activeSection !== 'reception') {
      return
    }

    const timerId = window.setTimeout(() => {
      void loadReceptionData({ silent: Boolean(receptionTickets) })
    }, 250)

    return () => window.clearTimeout(timerId)
  }, [activeSection, isAdminUser, receptionPage, receptionSearch, receptionServiceId])

  useEffect(() => {
    if (activeSection !== 'myWindow' || !myWindowTickets) {
      setMyWindowRealtimeStatus('disconnected')
      return
    }

    if (!tokenStorage.hasTokens()) {
      setMyWindowRealtimeStatus('disconnected')
      return
    }

    let socket: WebSocket | null = null
    let reconnectTimer: number | undefined
    let refreshTimer: number | undefined
    let closed = false

    async function connect(forceTokenRefresh = false) {
      setMyWindowRealtimeStatus('connecting')
      let accessToken = tokenStorage.getAccessToken()

      if (forceTokenRefresh || !accessToken) {
        const tokens = await refreshAuthTokens().catch(() => null)
        accessToken = tokens?.access_token ?? tokenStorage.getAccessToken()
      }

      if (!accessToken || closed) {
        setMyWindowRealtimeStatus('disconnected')
        if (!closed && tokenStorage.hasTokens()) {
          reconnectTimer = window.setTimeout(() => {
            void connect()
          }, 2500)
        }
        return
      }

      socket = new WebSocket(getMyWindowWebSocketUrl(accessToken))

      socket.onopen = () => {
        setMyWindowRealtimeStatus('connected')
      }

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as { type?: string }
          if (message.type !== 'my_window.updated') {
            return
          }
        } catch {
          return
        }

        window.clearTimeout(refreshTimer)
        refreshTimer = window.setTimeout(() => {
          void refreshMyWindowFromRealtime()
        }, 140)
      }

      socket.onclose = (event) => {
        if (closed) {
          return
        }

        setMyWindowRealtimeStatus('disconnected')
        reconnectTimer = window.setTimeout(() => {
          void connect(event.code === 1008)
        }, 2500)
      }

      socket.onerror = () => {
        socket?.close()
      }
    }

    void connect()

    return () => {
      closed = true
      window.clearTimeout(reconnectTimer)
      window.clearTimeout(refreshTimer)
      socket?.close()
    }
  }, [activeSection, myWindowTickets?.window_id])

  function closeFormModal() {
    setFormModal(null)
    setEditingServiceId(null)
    setEditingWindowId(null)
    setEditingUserId(null)
    setEditingOperatorId(null)
    setEditingAcademicDegreeId(null)
    setEditingEducationalProgramId(null)
    setEditingApplicantId(null)
    setEditingTicketEventId(null)
    setServiceForm(emptyService)
    setWindowForm(emptyWindow)
    setUserForm(emptyUser)
    setOperatorForm(emptyOperator)
    setAcademicDegreeForm(emptyAcademicDegree)
    setEducationalProgramForm(emptyEducationalProgram)
    setApplicantForm(emptyApplicant)
    setTicketEventForm(emptyTicketEvent)
    setTicketEventMetadataText('')
    setSelectedWindowOperatorId('')
    setSelectedOperatorProgramIds([])
    setSelectedOperatorProgramLanguages({})
    setSelectedOperatorServiceIds([])
    setSelectedOperatorServiceLanguages({})
  }

  function openCreateModal(section: CrudSection) {
    closeFormModal()
    setFormModal(section)
  }

  async function submitService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    try {
      if (editingServiceId === null) {
        await adminApi.services.create(serviceForm)
      } else {
        await adminApi.services.update(editingServiceId, serviceForm)
      }

      closeFormModal()
      await loadAdminData()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось сохранить услугу')
    }
  }

  async function submitWindow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    try {
      let savedWindowId = editingWindowId
      const payload = {
        ...windowForm,
        floor: windowForm.floor?.trim() || null,
        current_operator_id: null,
      }

      if (editingWindowId === null) {
        const createdWindow = await adminApi.windows.create(payload)
        savedWindowId = createdWindow.id
      } else {
        await adminApi.windows.update(editingWindowId, payload)
      }

      if (savedWindowId !== null) {
        const previousWindowOperators = operators.filter((operator) => operator.window_id === savedWindowId)
        await Promise.all(
          previousWindowOperators
            .filter((operator) => operator.id !== selectedWindowOperatorId)
            .map((operator) => adminApi.operators.update(operator.id, { window_id: null })),
        )

        if (selectedWindowOperatorId) {
          await adminApi.operators.update(selectedWindowOperatorId, { window_id: savedWindowId })
        }
      }

      closeFormModal()
      await loadAdminData()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось сохранить окно')
    }
  }

  async function submitUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    try {
      const payload = { ...userForm }

      if (!payload.password) {
        delete payload.password
      }

      if (editingUserId === null) {
        if (!userForm.password) {
          setError('Укажите пароль для нового пользователя')
          return
        }

        await adminApi.users.create(userForm as UserPayload & { password: string })
      } else {
        await adminApi.users.update(editingUserId, payload)
      }

      closeFormModal()
      await loadAdminData()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось сохранить пользователя')
    }
  }

  async function submitOperator(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    try {
      const payload = {
        ...operatorForm,
        window_id: operatorForm.window_id,
      }
      let operatorId = editingOperatorId

      if (editingOperatorId === null) {
        const createdOperator = await adminApi.operators.create(payload)
        operatorId = createdOperator.id
      } else {
        await adminApi.operators.update(editingOperatorId, payload)
      }

      if (operatorId !== null) {
        await adminApi.operators.setPrograms(
          operatorId,
          selectedOperatorProgramIds,
          buildStudyLanguagesPayload(selectedOperatorProgramIds, selectedOperatorProgramLanguages),
        )
        await adminApi.operators.setServices(
          operatorId,
          selectedOperatorServiceIds,
          buildServiceLanguagesPayload(selectedOperatorServiceIds, selectedOperatorServiceLanguages),
        )
      }

      closeFormModal()
      await loadAdminData()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось сохранить оператора')
    }
  }

  async function submitAcademicDegree(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    try {
      if (editingAcademicDegreeId === null) {
        await adminApi.academicDegrees.create(academicDegreeForm)
      } else {
        await adminApi.academicDegrees.update(editingAcademicDegreeId, academicDegreeForm)
      }

      closeFormModal()
      await loadAdminData()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось сохранить академическую степень')
    }
  }

  async function submitEducationalProgram(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    try {
      if (editingEducationalProgramId === null) {
        await adminApi.educationalPrograms.create(educationalProgramForm)
      } else {
        await adminApi.educationalPrograms.update(editingEducationalProgramId, educationalProgramForm)
      }

      closeFormModal()
      await loadAdminData()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось сохранить образовательную программу')
    }
  }

  async function submitApplicant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    const payload: ApplicantPayload = {
      full_name: applicantForm.full_name || null,
      iin: applicantForm.iin || null,
      phone: applicantForm.phone || null,
      telegram_chat_id: applicantForm.telegram_chat_id,
    }

    try {
      if (editingApplicantId === null) {
        await adminApi.applicants.create(payload)
      } else {
        await adminApi.applicants.update(editingApplicantId, payload)
      }

      closeFormModal()
      await loadAdminData()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось сохранить абитуриента')
    }
  }

  async function submitTicketEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    let metadata: Record<string, unknown> | null = null

    if (ticketEventMetadataText.trim()) {
      try {
        const parsedMetadata = JSON.parse(ticketEventMetadataText) as unknown

        if (parsedMetadata === null || Array.isArray(parsedMetadata) || typeof parsedMetadata !== 'object') {
          setError('Metadata должен быть JSON-объектом')
          return
        }

        metadata = parsedMetadata as Record<string, unknown>
      } catch {
        setError('Metadata содержит некорректный JSON')
        return
      }
    }

    const payload: TicketEventPayload = {
      ...ticketEventForm,
      metadata,
    }

    try {
      if (editingTicketEventId === null) {
        await adminApi.ticketEvents.create(payload)
      } else {
        await adminApi.ticketEvents.update(editingTicketEventId, payload)
      }

      closeFormModal()
      await loadAdminData()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось сохранить событие талона')
    }
  }

  async function saveProfilePrograms() {
    setError('')
    setProfileMessage('')

    const currentOperator = operators.find((operator) => operator.user_id === currentUserId)

    if (!currentOperator) {
      setError('Для текущего пользователя не найден профиль оператора')
      return
    }

    setProfileSaving(true)

    try {
      const savedPrograms = isAdminUser
        ? await adminApi.operators.setPrograms(
            currentOperator.id,
            profileProgramIds,
            buildStudyLanguagesPayload(profileProgramIds, profileProgramLanguages),
          )
        : await adminApi.operators.setMyPrograms(
            profileProgramIds,
            buildStudyLanguagesPayload(profileProgramIds, profileProgramLanguages),
          )
      setOperatorProgramIds({
        ...operatorProgramIds,
        [currentOperator.id]: savedPrograms.map((program) => program.id),
      })
      setOperatorProgramLanguages({
        ...operatorProgramLanguages,
        [currentOperator.id]: Object.fromEntries(
          savedPrograms.map((program) => [
            program.id,
            normalizeStudyLanguages(program.study_languages),
          ]),
        ),
      })
      setProfileProgramIds(savedPrograms.map((program) => program.id))
      setProfileProgramLanguages(
        Object.fromEntries(
          savedPrograms.map((program) => [
            program.id,
            normalizeStudyLanguages(program.study_languages),
          ]),
        ),
      )
      setProfileMessage('Образовательные программы сохранены')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось сохранить образовательные программы')
    } finally {
      setProfileSaving(false)
    }
  }

  async function saveProfileServices() {
    setError('')
    setProfileMessage('')

    const currentOperator = operators.find((operator) => operator.user_id === currentUserId)

    if (!currentOperator) {
      setError('Для текущего пользователя не найден профиль оператора')
      return
    }

    setProfileSaving(true)

    try {
      const savedServices = isAdminUser
        ? await adminApi.operators.setServices(
            currentOperator.id,
            profileServiceIds,
            buildServiceLanguagesPayload(profileServiceIds, profileServiceLanguages),
          )
        : await adminApi.operators.setMyServices(
            profileServiceIds,
            buildServiceLanguagesPayload(profileServiceIds, profileServiceLanguages),
          )
      setOperatorServiceIds({
        ...operatorServiceIds,
        [currentOperator.id]: savedServices.map((service) => service.id),
      })
      setOperatorServiceLanguages({
        ...operatorServiceLanguages,
        [currentOperator.id]: Object.fromEntries(
          savedServices.map((service) => [
            service.id,
            normalizeServiceLanguages(service.service_languages),
          ]),
        ),
      })
      setProfileServiceIds(savedServices.map((service) => service.id))
      setProfileServiceLanguages(
        Object.fromEntries(
          savedServices.map((service) => [
            service.id,
            normalizeServiceLanguages(service.service_languages),
          ]),
        ),
      )
      setProfileMessage('Типы услуг сохранены')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось сохранить типы услуг')
    } finally {
      setProfileSaving(false)
    }
  }

  async function updateMyWindowStatus(nextStatus: WindowStatus) {
    setError('')
    setMyWindowError('')
    setWindowStatusMessage('')
    setWindowStatusSaving(true)

    try {
      const updatedWindow = await adminApi.tickets.updateMyWindowStatus(nextStatus)
      applyMyWindowData(updatedWindow)
      setWindows((currentWindows) =>
        currentWindows.map((windowItem) =>
          windowItem.id === updatedWindow.window_id
            ? { ...windowItem, status: updatedWindow.window_status ?? windowItem.status }
            : windowItem,
        ),
      )
      setWindowStatusMessage(`Статус окна изменен: ${windowStatusLabels[nextStatus]}`)
    } catch (requestError) {
      setMyWindowError(requestError instanceof Error ? requestError.message : 'Не удалось изменить статус окна')
    } finally {
      setWindowStatusSaving(false)
    }
  }

  function updateMyWindowTicketInState(updatedTicket: TicketItem) {
    const currentRows = myWindowTicketsRef.current
    if (currentRows) {
      const nextTickets = isActiveMyWindowTicket(updatedTicket)
        ? currentRows.tickets.map((item) => (item.id === updatedTicket.id ? updatedTicket : item))
        : currentRows.tickets.filter((item) => item.id !== updatedTicket.id)

      applyMyWindowData({
        ...currentRows,
        tickets: nextTickets,
      })
    }
    setSelectedMyWindowTicket((current) => {
      if (current?.id !== updatedTicket.id) {
        return current
      }

      return isActiveMyWindowTicket(updatedTicket) ? updatedTicket : null
    })
  }

  function openMyWindowTicketDetails(ticket: TicketItem) {
    setSelectedMyWindowTicket(ticket)
    setAcceptIin(ticket.iin ?? '')
    setAcceptStudyLanguage(ticket.study_language ?? '')
    setReassignServiceId(String(ticket.service_id))
    setReassignProgramId(ticket.educational_program_id === null ? '' : String(ticket.educational_program_id))
    setReassignServiceQuery('')
    setReassignProgramQuery('')
    setReassignServiceListOpen(false)
    setReassignProgramListOpen(false)
  }

  function closeMyWindowTicketDetails() {
    setSelectedMyWindowTicket(null)
    setAcceptIin('')
    setAcceptStudyLanguage('')
    setReassignServiceId('')
    setReassignProgramId('')
    setReassignServiceQuery('')
    setReassignProgramQuery('')
    setReassignServiceListOpen(false)
    setReassignProgramListOpen(false)
  }

  async function persistMyWindowTicketApplicantData(ticket: TicketItem) {
    const normalizedIin = acceptIin.trim()

    if (!/^\d{12}$/.test(normalizedIin)) {
      throw new Error('ИИН должен состоять из 12 цифр')
    }

    if (!acceptStudyLanguage) {
      throw new Error('Выберите язык обучения')
    }

    let acceptedTicket = await adminApi.tickets.acceptMyTicket(ticket.id, { iin: normalizedIin })
    acceptedTicket = await adminApi.tickets.updateMyTicketStudyLanguage(acceptedTicket.id, {
      study_language: acceptStudyLanguage,
    })
    updateMyWindowTicketInState(acceptedTicket)
    return acceptedTicket
  }

  async function callNextMyWindowTicket() {
    setError('')
    setMyWindowError('')
    setTicketActionSaving(true)

    try {
      const nextTicket = await adminApi.tickets.callNextMyTicket()
      await loadMyWindowData({ animate: true, silent: true })
      openMyWindowTicketDetails(nextTicket)
    } catch (requestError) {
      setMyWindowError(requestError instanceof Error ? requestError.message : 'Не удалось вызвать следующий талон')
    } finally {
      setTicketActionSaving(false)
    }
  }

  async function openAcceptMyWindowTicket(ticket: TicketItem) {
    setMyWindowError('')
    setTicketActionSaving(true)

    try {
      const acceptedTicket = await adminApi.tickets.acceptMyTicket(ticket.id, {})
      updateMyWindowTicketInState(acceptedTicket)
      openMyWindowTicketDetails(acceptedTicket)
    } catch (requestError) {
      setMyWindowError(requestError instanceof Error ? requestError.message : 'Не удалось принять талон')
    } finally {
      setTicketActionSaving(false)
    }
  }

  async function saveMyWindowTicketApplicantData(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (selectedMyWindowTicket === null) {
      return
    }

    setError('')
    setMyWindowError('')
    setTicketActionSaving(true)

    try {
      await persistMyWindowTicketApplicantData(selectedMyWindowTicket)
    } catch (requestError) {
      setMyWindowError(requestError instanceof Error ? requestError.message : 'Не удалось принять талон')
    } finally {
      setTicketActionSaving(false)
    }
  }

  async function completeMyWindowTicket(ticket: TicketItem) {
    setError('')
    setMyWindowError('')
    setTicketActionSaving(true)

    try {
      const ticketToComplete =
        selectedMyWindowTicket?.id === ticket.id ? await persistMyWindowTicketApplicantData(ticket) : ticket
      const completedTicket = await adminApi.tickets.completeMyTicket(ticketToComplete.id)
      updateMyWindowTicketInState(completedTicket)
      closeMyWindowTicketDetails()
      await loadMyWindowData({ animate: true, silent: true })
    } catch (requestError) {
      setMyWindowError(requestError instanceof Error ? requestError.message : 'Не удалось завершить талон')
    } finally {
      setTicketActionSaving(false)
    }
  }

  async function skipMyWindowTicket(ticket: TicketItem) {
    const confirmed = window.confirm(`Отметить талон ${ticket.ticket_number} как "Не явился"?`)

    if (!confirmed) {
      return
    }

    setError('')
    setMyWindowError('')
    setTicketActionSaving(true)

    try {
      const skippedTicket = await adminApi.tickets.skipMyTicket(ticket.id)
      updateMyWindowTicketInState(skippedTicket)
      closeMyWindowTicketDetails()
      await loadMyWindowData({ animate: true, silent: true })
    } catch (requestError) {
      setMyWindowError(requestError instanceof Error ? requestError.message : 'Не удалось пропустить талон')
    } finally {
      setTicketActionSaving(false)
    }
  }

  async function declineMyWindowTicket(ticket: TicketItem) {
    const confirmed = window.confirm(`Отказать талону ${ticket.ticket_number} и передать другому оператору?`)

    if (!confirmed) {
      return
    }

    setError('')
    setMyWindowError('')
    setTicketActionSaving(true)

    try {
      const declinedTicket = await adminApi.tickets.declineMyTicket(ticket.id)
      updateMyWindowTicketInState(declinedTicket)
      await loadMyWindowData({ animate: true, silent: true })
    } catch (requestError) {
      setMyWindowError(requestError instanceof Error ? requestError.message : 'Не удалось отказать талону')
    } finally {
      setTicketActionSaving(false)
    }
  }

  async function reassignMyWindowTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (selectedMyWindowTicket === null || !reassignServiceId) {
      return
    }

    const serviceToReassign = services.find((service) => String(service.id) === reassignServiceId)

    if (serviceToReassign?.requires_educational_program && !reassignProgramId) {
      setMyWindowError('Выберите ОП')
      return
    }

    if (selectedReassignProgramRequiresLanguage && !acceptStudyLanguage && !selectedMyWindowTicket.study_language) {
      setMyWindowError('Выберите язык ОП')
      return
    }

    if (serviceToReassign?.requires_service_language && !reassignServiceLanguage) {
      setMyWindowError('Выберите язык обслуживания')
      return
    }

    setError('')
    setMyWindowError('')
    setTicketActionSaving(true)

    try {
      const ticketToReassign = await persistMyWindowTicketApplicantData(selectedMyWindowTicket)
      await adminApi.tickets.reassignMyTicketService(ticketToReassign.id, {
        service_id: Number(reassignServiceId),
        educational_program_id: reassignProgramId ? Number(reassignProgramId) : null,
        study_language: selectedReassignProgramRequiresLanguage
          ? acceptStudyLanguage || ticketToReassign.study_language
          : null,
        service_language: serviceToReassign?.requires_service_language ? reassignServiceLanguage || null : null,
      })
      closeMyWindowTicketDetails()
      await loadMyWindowData({ animate: true, silent: true })
    } catch (requestError) {
      setMyWindowError(requestError instanceof Error ? requestError.message : 'Не удалось переназначить услугу')
    } finally {
      setTicketActionSaving(false)
    }
  }

  function updateReceptionTicketInState(updatedTicket: TicketItem) {
    if (receptionTickets) {
      const nextTickets = isActiveMyWindowTicket(updatedTicket)
        ? receptionTickets.tickets.map((item) => (item.id === updatedTicket.id ? updatedTicket : item))
        : receptionTickets.tickets.filter((item) => item.id !== updatedTicket.id)

      applyReceptionData({
        ...receptionTickets,
        tickets: nextTickets,
      })
    }
    setSelectedReceptionTicket((current) => {
      if (current?.id !== updatedTicket.id) {
        return current
      }

      return isActiveMyWindowTicket(updatedTicket) ? updatedTicket : null
    })
  }

  function openReceptionTicketDetails(ticket: TicketItem) {
    setSelectedReceptionTicket(ticket)
    setAcceptIin(ticket.iin ?? '')
    setAcceptStudyLanguage(ticket.study_language ?? '')
    setReassignServiceId(String(ticket.service_id))
    setReassignProgramId(ticket.educational_program_id === null ? '' : String(ticket.educational_program_id))
    setReassignServiceQuery('')
    setReassignProgramQuery('')
    setReassignServiceListOpen(false)
    setReassignProgramListOpen(false)
  }

  function closeReceptionTicketDetails() {
    setSelectedReceptionTicket(null)
    setAcceptIin('')
    setAcceptStudyLanguage('')
    setReassignServiceId('')
    setReassignProgramId('')
    setReassignServiceQuery('')
    setReassignProgramQuery('')
    setReassignServiceListOpen(false)
    setReassignProgramListOpen(false)
  }

  async function persistReceptionTicketApplicantData(ticket: TicketItem) {
    const normalizedIin = acceptIin.trim()

    if (!/^\d{12}$/.test(normalizedIin)) {
      throw new Error('ИИН должен состоять из 12 цифр')
    }

    if (!acceptStudyLanguage) {
      throw new Error('Выберите язык обучения')
    }

    let acceptedTicket = await adminApi.tickets.acceptReceptionTicket(ticket.id, { iin: normalizedIin })
    acceptedTicket = await adminApi.tickets.updateReceptionTicketStudyLanguage(acceptedTicket.id, {
      study_language: acceptStudyLanguage,
    })
    updateReceptionTicketInState(acceptedTicket)
    return acceptedTicket
  }

  async function saveReceptionTicketApplicantData(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (selectedReceptionTicket === null) {
      return
    }

    setError('')
    setReceptionError('')
    setTicketActionSaving(true)

    try {
      await persistReceptionTicketApplicantData(selectedReceptionTicket)
    } catch (requestError) {
      setReceptionError(requestError instanceof Error ? requestError.message : 'Не удалось сохранить данные талона')
    } finally {
      setTicketActionSaving(false)
    }
  }

  async function completeReceptionTicket(ticket: TicketItem) {
    setError('')
    setReceptionError('')
    setTicketActionSaving(true)

    try {
      const ticketToComplete =
        selectedReceptionTicket?.id === ticket.id ? await persistReceptionTicketApplicantData(ticket) : ticket
      const completedTicket = await adminApi.tickets.completeReceptionTicket(ticketToComplete.id)
      updateReceptionTicketInState(completedTicket)
      closeReceptionTicketDetails()
      await loadReceptionData({ silent: true })
    } catch (requestError) {
      setReceptionError(requestError instanceof Error ? requestError.message : 'Не удалось завершить талон')
    } finally {
      setTicketActionSaving(false)
    }
  }

  async function skipReceptionTicket(ticket: TicketItem) {
    const confirmed = window.confirm(`Отметить талон ${ticket.ticket_number} как "Не явился"?`)

    if (!confirmed) {
      return
    }

    setError('')
    setReceptionError('')
    setTicketActionSaving(true)

    try {
      const skippedTicket = await adminApi.tickets.skipReceptionTicket(ticket.id)
      updateReceptionTicketInState(skippedTicket)
      closeReceptionTicketDetails()
      await loadReceptionData({ silent: true })
    } catch (requestError) {
      setReceptionError(requestError instanceof Error ? requestError.message : 'Не удалось пропустить талон')
    } finally {
      setTicketActionSaving(false)
    }
  }

  async function reassignReceptionTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (selectedReceptionTicket === null || !reassignServiceId) {
      return
    }

    const serviceToReassign = services.find((service) => String(service.id) === reassignServiceId)

    if (serviceToReassign?.requires_educational_program && !reassignProgramId) {
      setReceptionError('Выберите ОП')
      return
    }

    if (selectedReassignProgramRequiresLanguage && !acceptStudyLanguage && !selectedReceptionTicket.study_language) {
      setReceptionError('Выберите язык ОП')
      return
    }

    setError('')
    setReceptionError('')
    setTicketActionSaving(true)

    try {
      await adminApi.tickets.reassignReceptionTicketService(selectedReceptionTicket.id, {
        service_id: Number(reassignServiceId),
        educational_program_id: reassignProgramId ? Number(reassignProgramId) : null,
        study_language: selectedReassignProgramRequiresLanguage
          ? acceptStudyLanguage || selectedReceptionTicket.study_language
          : null,
        service_language: serviceToReassign?.requires_service_language ? reassignServiceLanguage || null : null,
      })
      closeReceptionTicketDetails()
      await loadReceptionData({ silent: true })
    } catch (requestError) {
      setReceptionError(requestError instanceof Error ? requestError.message : 'Не удалось переназначить услугу')
    } finally {
      setTicketActionSaving(false)
    }
  }

  async function confirmDelete() {
    if (deleteTarget === null) {
      return
    }

    setError('')

    try {
      if (deleteTarget.section === 'services') {
        await adminApi.services.delete(Number(deleteTarget.id))
      }

      if (deleteTarget.section === 'windows') {
        await adminApi.windows.delete(Number(deleteTarget.id))
      }

      if (deleteTarget.section === 'users') {
        await adminApi.users.delete(String(deleteTarget.id))
      }

      if (deleteTarget.section === 'operators') {
        await adminApi.operators.delete(String(deleteTarget.id))
      }

      if (deleteTarget.section === 'academicDegrees') {
        await adminApi.academicDegrees.delete(Number(deleteTarget.id))
      }

      if (deleteTarget.section === 'educationalPrograms') {
        await adminApi.educationalPrograms.delete(Number(deleteTarget.id))
      }

      if (deleteTarget.section === 'applicants') {
        await adminApi.applicants.delete(String(deleteTarget.id))
      }

      if (deleteTarget.section === 'ticketEvents') {
        await adminApi.ticketEvents.delete(String(deleteTarget.id))
      }

      setDeleteTarget(null)
      await loadAdminData()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось удалить запись')
    }
  }

  async function exportTicketsCsv(operatorId: string | null, scopeLabel: string) {
    const exportKey = operatorId ?? 'all'

    setTicketExportingKey(exportKey)
    setError('')

    try {
      const tickets = await adminApi.tickets.export(operatorId ? { operator_id: operatorId } : {})
      downloadTicketExport(tickets, scopeLabel)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось выгрузить талоны')
    } finally {
      setTicketExportingKey(null)
    }
  }

  const isEditing =
    (formModal === 'services' && editingServiceId !== null) ||
    (formModal === 'windows' && editingWindowId !== null) ||
    (formModal === 'users' && editingUserId !== null) ||
    (formModal === 'operators' && editingOperatorId !== null) ||
    (formModal === 'academicDegrees' && editingAcademicDegreeId !== null) ||
    (formModal === 'educationalPrograms' && editingEducationalProgramId !== null) ||
    (formModal === 'applicants' && editingApplicantId !== null) ||
    (formModal === 'ticketEvents' && editingTicketEventId !== null)
  const modalTitle = formModal === null ? '' : `${isEditing ? 'Изменить' : 'Создать'}: ${sectionLabels[formModal]}`
  const myWindowTicketList = myWindowTickets?.tickets ?? []
  const myWindowTotal = myWindowTickets?.total ?? 0
  const myWindowTotalPages = myWindowTickets?.total_pages ?? 1
  const myWindowCurrentPage = myWindowTickets?.page ?? myWindowPage
  const myWindowWaitingCount = myWindowTickets?.global_waiting_count ?? 0
  const receptionTicketList = receptionTickets?.tickets ?? []
  const receptionTotal = receptionTickets?.total ?? 0
  const receptionTotalPages = receptionTickets?.total_pages ?? 1
  const receptionCurrentPage = receptionTickets?.page ?? receptionPage
  const receptionWaitingCount = receptionTickets?.waiting_count ?? 0
  const receptionCalledCount = receptionTickets?.called_count ?? 0
  const operatorAnalyticsRows = operatorAnalytics.map((stats) => ({
    operator: operators.find((operator) => operator.id === stats.operator_id),
    stats,
  }))
  const operatorPerformancePoints = operatorAnalyticsRows.map<OperatorPerformancePoint>(({ operator, stats }) => ({
    averageProcessingMinutes: Math.round((stats.average_processing_seconds / 60) * 10) / 10,
    clientsPerHour: getOperatorClientsPerHour(stats),
    effectiveWorkSeconds: stats.total_processing_seconds,
    label: getAnalyticsOperatorLabel(stats, operator, users),
    operatorId: stats.operator_id,
    processed: stats.processed,
    utilizationPercent: getOperatorUtilizationPercent(stats),
  }))
  const operatorPerformanceTotalPresenceSeconds = operatorAnalyticsRows.reduce(
    (total, row) => total + getPresenceSeconds(row.stats),
    0,
  )
  const operatorPerformanceTotalEffectiveSeconds = operatorPerformancePoints.reduce(
    (total, point) => total + point.effectiveWorkSeconds,
    0,
  )
  const operatorPerformanceClientsPerHour =
    operatorPerformanceTotalPresenceSeconds > 0
      ? operatorPerformancePoints.reduce((total, point) => total + point.processed, 0) /
        (operatorPerformanceTotalPresenceSeconds / 3600)
      : 0
  const operatorPerformanceUtilization =
    operatorPerformanceTotalPresenceSeconds > 0
      ? Math.round((operatorPerformanceTotalEffectiveSeconds / operatorPerformanceTotalPresenceSeconds) * 100)
      : 0
  const selectedOperatorAnalyticsRow = selectedAnalyticsOperatorId
    ? selectedAnalyticsOperatorId === 'general'
      ? null
      : operatorAnalyticsRows.find((row) => row.stats.operator_id === selectedAnalyticsOperatorId) ?? null
    : isAdminUser
      ? null
      : operatorAnalyticsRows[0] ?? null
  const selectedGeneralAnalytics = isAdminUser && selectedAnalyticsOperatorId === 'general'
  const analyticsExportOperatorId =
    selectedAnalyticsOperatorId && selectedAnalyticsOperatorId !== 'general' ? selectedAnalyticsOperatorId : null
  const analyticsExportLabel = selectedOperatorAnalyticsRow
    ? getAnalyticsOperatorLabel(
        selectedOperatorAnalyticsRow.stats,
        selectedOperatorAnalyticsRow.operator,
        users,
      )
    : 'all-operators'
  const analyticsExportKey = analyticsExportOperatorId ?? 'all'
  const selectedServiceAnalyticsRows = selectedOperatorAnalyticsRow?.stats.service_analytics ?? []
  const selectedRawDailyAnalyticsRows = selectedOperatorAnalyticsRow?.stats.daily_analytics ?? []
  const generalRawDailyAnalyticsRows = aggregateDailyAnalytics(
    operatorAnalyticsRows.flatMap((row) => row.stats.daily_analytics),
  )
  const generalDailyAnalyticsRows =
    analyticsTimeGrouping === 'month'
      ? buildMonthlyAnalyticsRange(generalRawDailyAnalyticsRows, analyticsDateFrom, analyticsDateTo)
      : buildDailyAnalyticsRange(generalRawDailyAnalyticsRows, analyticsDateFrom, analyticsDateTo)
  const generalDailyAnalyticsUnitLabel =
    analyticsTimeGrouping === 'month' ? 'месяцев' : 'дней'
  const generalDailyAnalyticsEmptyLabel =
    analyticsTimeGrouping === 'month'
      ? 'По всем талонам пока нет данных по месяцам'
      : 'По всем талонам пока нет данных по дням'
  const generalTicketsTotal = analyticsTickets.length
  const generalServiceRows = buildTicketDistribution(
    analyticsTickets,
    (ticket) => String(ticket.service_id),
    (ticket) => ticket.service_name ?? ticket.service_code ?? `Услуга ${ticket.service_id}`,
  )
  const generalProgramRows = buildTicketDistribution(
    analyticsTickets,
    (ticket) => ticket.educational_program_id === null ? 'none' : String(ticket.educational_program_id),
    (ticket) =>
      ticket.educational_program_name ??
      ticket.educational_program_code ??
      (ticket.educational_program_id === null ? 'Без образовательной программы' : `ОП ${ticket.educational_program_id}`),
  )
  const generalOperatorRows = buildTicketDistribution(
    analyticsTickets,
    (ticket) => ticket.operator_id ?? 'none',
    (ticket) => ticket.operator_name ?? ticket.operator_email ?? (ticket.operator_id ? ticket.operator_id.slice(0, 8) : 'Не назначен'),
  )
  const generalStatusRows = buildTicketDistribution(
    analyticsTickets,
    (ticket) => ticket.status,
    (ticket) => getTicketStatusLabel(ticket.status),
  )
  const generalServicePieSegments = distributionToPieSegments(generalServiceRows, generalTicketsTotal)
  const generalProgramPieSegments = distributionToPieSegments(generalProgramRows, generalTicketsTotal)
  const generalOperatorPieSegments = distributionToPieSegments(generalOperatorRows, generalTicketsTotal)
  const generalStatusPieSegments = generalStatusRows.map((item, index) => ({
    color:
      item.id === 'COMPLETED'
        ? ANALYTICS_STATUS_COLORS.completed
        : item.id === 'SKIPPED'
          ? ANALYTICS_STATUS_COLORS.skipped
          : item.id === 'WAITING' || item.id === 'CALLED'
            ? ANALYTICS_STATUS_COLORS.active
            : getAnalyticsServiceColor(index),
    detail: `${generalTicketsTotal > 0 ? Math.round((item.value / generalTicketsTotal) * 100) : 0}% от всех талонов`,
    label: item.label,
    value: item.value,
  }))
  const selectedDailyAnalyticsRows =
    analyticsTimeGrouping === 'month'
      ? buildMonthlyAnalyticsRange(selectedRawDailyAnalyticsRows, analyticsDateFrom, analyticsDateTo)
      : buildDailyAnalyticsRange(selectedRawDailyAnalyticsRows, analyticsDateFrom, analyticsDateTo)
  const selectedDailyAnalyticsUnitLabel =
    analyticsTimeGrouping === 'month' ? 'месяцев' : 'дней'
  const selectedDailyAnalyticsEmptyLabel =
    analyticsTimeGrouping === 'month'
      ? 'По этому сотруднику пока нет талонов по месяцам'
      : 'По этому сотруднику пока нет талонов по дням'
  const selectedServiceAnalyticsTotalTickets = selectedServiceAnalyticsRows.reduce(
    (total, serviceStats) => total + serviceStats.tickets_count,
    0,
  )
  const selectedServiceAnalyticsTotalTime = selectedServiceAnalyticsRows.reduce(
    (total, serviceStats) => total + serviceStats.total_processing_seconds,
    0,
  )
  const selectedServiceAnalyticsBestCompletion = selectedServiceAnalyticsRows
    .filter((serviceStats) => serviceStats.processed > 0)
    .sort((firstStats, secondStats) => secondStats.completion_rate - firstStats.completion_rate)[0]
  const selectedServicePieSegments = selectedServiceAnalyticsRows.map((serviceStats, index) => ({
    color: getAnalyticsServiceColor(index),
    detail: `${serviceStats.share_percent}% от всех талонов`,
    label: serviceStats.service_name ?? `Услуга ${serviceStats.service_id}`,
    value: serviceStats.tickets_count,
  }))
  const selectedStatusCompleted = selectedServiceAnalyticsRows.reduce(
    (total, serviceStats) => total + serviceStats.completed,
    0,
  )
  const selectedStatusSkipped = selectedServiceAnalyticsRows.reduce(
    (total, serviceStats) => total + serviceStats.skipped,
    0,
  )
  const selectedStatusActive = selectedServiceAnalyticsRows.reduce(
    (total, serviceStats) => total + serviceStats.active,
    0,
  )
  const selectedStatusTotal = selectedStatusCompleted + selectedStatusSkipped + selectedStatusActive
  const selectedStatusPieSegments: AnalyticsPieSegment[] = [
    {
      color: ANALYTICS_STATUS_COLORS.completed,
      detail: 'Талоны со статусом завершено',
      label: 'Завершено',
      value: selectedStatusCompleted,
    },
    {
      color: ANALYTICS_STATUS_COLORS.skipped,
      detail: 'Клиент не явился',
      label: 'Не явился',
      value: selectedStatusSkipped,
    },
    {
      color: ANALYTICS_STATUS_COLORS.active,
      detail: 'Талоны еще в работе или ожидании',
      label: 'В работе',
      value: selectedStatusActive,
    },
  ]
  const operatorAnalyticsProcessedTotal = operatorAnalyticsRows.reduce(
    (total, row) => total + row.stats.processed,
    0,
  )
  const sectionStats: Record<DashboardSection, { icon: string; label: string; value: number }> = {
    myWindow: { icon: 'monitor', label: 'Талонов всего', value: myWindowTotal },
    reception: { icon: 'id-card', label: 'Активных талонов', value: receptionTotal },
    profile: { icon: 'users', label: 'Выбранных программ', value: profileProgramIds.length },
    services: { icon: 'briefcase', label: 'Услуг', value: services.length },
    windows: { icon: 'monitor', label: 'Окон', value: windows.length },
    users: { icon: 'users', label: 'Пользователей', value: users.length },
    operators: { icon: 'badge', label: 'Операторов', value: operators.length },
    academicDegrees: { icon: 'award', label: 'Степеней', value: academicDegrees.length },
    educationalPrograms: { icon: 'book', label: 'Образовательных программ', value: educationalPrograms.length },
    applicants: { icon: 'id-card', label: 'Абитуриентов', value: applicants.length },
    analytics: { icon: 'chart', label: 'Обработано талонов', value: operatorAnalyticsProcessedTotal },
    ticketEvents: { icon: 'history', label: 'Событий талонов', value: ticketEvents.length },
  }
  const activeStat = sectionStats[activeSection]
  const activeStats =
    activeSection === 'myWindow'
      ? [
          activeStat,
          { icon: 'users', label: 'Человек в очереди', value: myWindowWaitingCount },
        ]
      : activeSection === 'reception'
        ? [
            activeStat,
            { icon: 'users', label: 'Ожидают', value: receptionWaitingCount },
            { icon: 'monitor', label: 'Приняты', value: receptionCalledCount },
          ]
      : activeSection === 'analytics'
        ? selectedOperatorAnalyticsRow
          ? [
              { icon: 'briefcase', label: 'Услуг', value: selectedServiceAnalyticsRows.length },
              { icon: 'chart', label: 'Талонов по услугам', value: selectedServiceAnalyticsTotalTickets },
              { icon: 'history', label: 'Время, мин', value: Math.round(selectedServiceAnalyticsTotalTime / 60) },
            ]
          : [
              { icon: 'badge', label: 'Сотрудников', value: operatorAnalyticsRows.length },
            ]
      : [activeStat]
  const currentUser = users.find((user) => user.id === currentUserId) ?? authUser
  const currentOperator = operators.find((operator) => operator.user_id === currentUserId)
  const activeServices = services.filter((service) => service.is_active)
  const receptionServices = activeServices.filter((service) => service.requires_reception_desk)
  const activeEducationalPrograms = educationalPrograms.filter((program) => program.is_active)
  const selectedReassignService = services.find((service) => String(service.id) === reassignServiceId)
  const selectedReassignProgram = educationalPrograms.find((program) => String(program.id) === reassignProgramId)
  const selectedReassignProgramRequiresLanguage = Boolean(selectedReassignProgram?.requires_service_language)
  const normalizedReassignServiceQuery = normalizeChoiceSearch(reassignServiceQuery)
  const normalizedReassignProgramQuery = normalizeChoiceSearch(reassignProgramQuery)
  const filteredReassignServices = activeServices.filter((service) => {
    if (!normalizedReassignServiceQuery) {
      return true
    }

    return normalizeChoiceSearch(`${service.name} ${service.name_kk} ${service.name_en} ${service.code}`).includes(
      normalizedReassignServiceQuery,
    )
  })
  const filteredReassignPrograms = activeEducationalPrograms.filter((program) => {
    if (!normalizedReassignProgramQuery) {
      return true
    }

    return normalizeChoiceSearch(`${program.name} ${program.name_kk} ${program.name_en} ${program.code}`).includes(
      normalizedReassignProgramQuery,
    )
  })
  const filteredMyWindowTickets = sortMyWindowTickets(myWindowTicketList.filter(isActiveMyWindowTicket))
  const filteredReceptionTickets = sortReceptionTickets(receptionTicketList.filter(isActiveMyWindowTicket))
  const dashboardClassName = [
    'dashboard-layout',
    sidebarCollapsed ? 'sidebar-collapsed' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const navSections: DashboardSection[] = isAdminUser
    ? [
        'myWindow',
        'reception',
        'profile',
        'analytics',
        'services',
        'windows',
        'users',
        'operators',
        'academicDegrees',
        'educationalPrograms',
        'applicants',
        'ticketEvents',
      ]
    : ['myWindow', 'profile']

  return (
    <div className={dashboardClassName}>
      <aside className="dashboard-sidebar">
        <div className="dashboard-brand">
          <img className="dashboard-brand-logo" src={logoUrl} alt="Turan Astana University" />
          <button
            className="sidebar-toggle"
            type="button"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-pressed={sidebarCollapsed}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => {
              setSidebarCollapsed((isCollapsed) => !isCollapsed)
              setProfileMenuOpen(false)
            }}
          >
            <Icon name={sidebarCollapsed ? 'sidebar-expand' : 'sidebar-collapse'} />
          </button>
        </div>

        <nav className="dashboard-nav" aria-label="Admin navigation">
          {navSections.map((section) => (
            <a
              className={activeSection === section ? 'nav-item active' : 'nav-item'}
              href={buildSectionPath(lang, section)}
              key={section}
              onClick={(event) => {
                event.preventDefault()
                navigateToSection(section)
              }}
            >
              <Icon
                name={
                  section === 'reception'
                    ? 'id-card'
                    : section === 'services'
                    ? 'briefcase'
                    : section === 'myWindow'
                      ? 'monitor'
                    : section === 'windows'
                      ? 'monitor'
                    : section === 'operators'
                      ? 'badge'
                      : section === 'analytics'
                        ? 'chart'
                      : section === 'academicDegrees'
                        ? 'award'
                          : section === 'educationalPrograms'
                            ? 'book'
                            : section === 'applicants'
                              ? 'id-card'
                              : section === 'ticketEvents'
                                ? 'history'
                                : 'users'
                }
              />
              <span>{sectionLabels[section]}</span>
            </a>
          ))}
          <button className="nav-item nav-item-display" type="button" onClick={() => void openSecondDisplay()}>
            <Icon name="display" />
            <span>Второй дисплей</span>
          </button>
          {isAdminUser && (
            <a className="nav-item" href={`/${lang}/queue-display`} target="_blank" rel="noreferrer">
              <Icon name="display" />
              <span>Табло</span>
            </a>
          )}
        </nav>

        <button
          className="sidebar-user"
          type="button"
          aria-expanded={profileMenuOpen}
          onClick={() => setProfileMenuOpen((isOpen) => !isOpen)}
        >
          <div className="user-avatar">{currentUser.full_name.charAt(0).toUpperCase()}</div>
          <div>
            <strong>Администратор</strong>
            <span>Профиль</span>
          </div>
        </button>
        {profileMenuOpen && (
          <div className="profile-menu">
            <button
              className="profile-menu-item"
              type="button"
              onClick={() => navigateToSection('profile')}
            >
              Мой профиль
            </button>
            <button
              className="profile-menu-item danger"
              type="button"
              onClick={() => {
                tokenStorage.clear()
                window.location.reload()
              }}
            >
              Выйти
            </button>
          </div>
        )}
      </aside>

      <main className="dashboard-main">
        <header className="dashboard-header">
          <div>
            <h1>{sectionLabels[activeSection]}</h1>
          </div>
          <div className="header-actions">
            <div className="language-switcher" aria-label="Language switcher">
              {languages.map((language) => (
                <button
                  className={language === lang ? 'selected' : ''}
                  type="button"
                  key={language}
                  onClick={() => setLang(language)}
                >
                  {language.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </header>

        {activeSection !== 'analytics' && (
          <section
            className={activeSection === 'myWindow' ? 'stats-grid compact' : 'stats-grid'}
            aria-label="Admin counters"
          >
            {activeStats.map((stat) => (
              <article className="stat-card" key={stat.label}>
                <div className="stat-top">
                  <span className="stat-icon">
                    <Icon name={stat.icon} />
                  </span>
                  <span>{activeSection === 'myWindow' ? 'LIVE' : 'API'}</span>
                </div>
                <strong>{stat.value}</strong>
                <p>{stat.label}</p>
              </article>
            ))}
          </section>
        )}

        {activeSection !== 'profile' && activeSection !== 'myWindow' && activeSection !== 'analytics' && activeSection !== 'reception' && (
          <div className="dashboard-toolbar">
            <button className="primary-action" type="button" onClick={() => openCreateModal(activeSection)}>
              <Icon name="plus" />
              Создать
            </button>
            {activeSection === 'users' && (
              <button className="secondary-action" type="button" onClick={() => downloadUserLoginExport(users)}>
                <Icon name="download" />
                Выгрузить логины
              </button>
            )}
          </div>
        )}

        {error && <div className="admin-alert">{error}</div>}

        {activeSection === 'myWindow' && (
          <section className="admin-panel tab-panel" key="myWindow">
            <div className="dashboard-toolbar">
              <button
                className="primary-action compact"
                type="button"
                disabled={
                  ticketActionSaving ||
                  myWindowRefreshing ||
                  !myWindowTickets ||
                  myWindowTickets.operator_status !== 'ONLINE' ||
                  myWindowTickets.window_status !== 'OPEN'
                }
                onClick={() => void callNextMyWindowTicket()}
              >
                Следующий
              </button>
              {myWindowTickets && (
                <span className={`my-window-realtime ${myWindowRealtimeStatus}`}>
                  <span aria-hidden="true" />
                  {myWindowRealtimeStatus === 'connected'
                    ? 'В реальном времени'
                    : myWindowRealtimeStatus === 'connecting'
                      ? 'Подключение...'
                      : 'Нет realtime'}
                </span>
              )}
              {myWindowRefreshing && <span className="my-window-refreshing">Обновляется...</span>}
              <div className="operator-status-actions" aria-label="Статус окна">
                {myWindowStatusActions.map((action) => (
                  <button
                    className={
                      myWindowTickets?.window_status === action.status
                        ? 'secondary-action compact selected'
                        : 'secondary-action compact'
                    }
                    disabled={windowStatusSaving || !myWindowTickets}
                    key={action.status}
                    type="button"
                    onClick={() => updateMyWindowStatus(action.status)}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>

            {windowStatusMessage && <div className="admin-alert success">{windowStatusMessage}</div>}

            <CrudTable
              columns={[
                'Талон',
                'Услуга',
                'ОП',
                'Статус',
                'Ожидание',
                'Действия',
              ]}
              loading={loading}
              rowClassNames={filteredMyWindowTickets.map((ticket) => {
                const highlight = myWindowTicketHighlights[ticket.id]
                const statusClassName =
                  ticket.status === 'WAITING'
                    ? 'my-window-ticket-waiting'
                    : ticket.status === 'CALLED'
                      ? 'my-window-ticket-working'
                      : ''
                const highlightClassName = highlight ? `realtime-row realtime-row-${highlight}` : ''

                return [statusClassName, highlightClassName].filter(Boolean).join(' ')
              })}
              rowKeys={filteredMyWindowTickets.map((ticket) => ticket.id)}
              rows={filteredMyWindowTickets.map((ticket) => [
                ticket.ticket_number,
                ticket.service_name ?? ticket.service_id,
                getEducationalProgramDisplayLabel(ticket),
                <span className={getMyWindowTicketStatusClassName(ticket.status)} key={`${ticket.id}-status`}>
                  {getTicketStatusLabel(ticket.status)}
                </span>,
                getTicketQueueWaitLabel(ticket, currentTime),
                <div className="row-actions" key={ticket.id}>
                  {(() => {
                    const isCurrentWindowTicket = ticket.window_id === myWindowTickets?.window_id

                    if (ticket.status === 'WAITING' && isCurrentWindowTicket) {
                      return (
                        <>
                          <button
                            className="primary-action compact"
                            type="button"
                            disabled={ticketActionSaving}
                            onClick={() => openAcceptMyWindowTicket(ticket)}
                          >
                            Принять
                          </button>
                          <button
                            className="danger-action"
                            type="button"
                            disabled={ticketActionSaving}
                            onClick={() => declineMyWindowTicket(ticket)}
                          >
                            Отказать
                          </button>
                        </>
                      )
                    }

                    if (ticket.status === 'CALLED' && isCurrentWindowTicket) {
                      return (
                        <button
                          className="secondary-action compact"
                          type="button"
                          onClick={() => openMyWindowTicketDetails(ticket)}
                        >
                          Детали
                        </button>
                      )
                    }

                    return <span className="row-actions-empty">—</span>
                  })()}
                </div>,
              ])}
            />
            <div className="queue-panel my-window-pagination" aria-label="Пагинация талонов">
              <div className="pagination-pages">
                {Array.from({ length: myWindowTotalPages }, (_, pageIndex) => pageIndex + 1).map((pageNumber) => (
                  <button
                    className={
                      pageNumber === myWindowCurrentPage
                        ? 'secondary-action compact pagination-page selected'
                        : 'secondary-action compact pagination-page'
                    }
                    type="button"
                    disabled={myWindowRefreshing}
                    key={pageNumber}
                    aria-current={pageNumber === myWindowCurrentPage ? 'page' : undefined}
                    onClick={() => setMyWindowPage(pageNumber)}
                  >
                    {pageNumber}
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeSection === 'reception' && (
          <section className="admin-panel tab-panel" key="reception">
            <div className="dashboard-toolbar">
              <input
                className="toolbar-input"
                placeholder="Поиск по талону, ИИН, услуге или ОП"
                value={receptionSearch}
                onChange={(event) => {
                  setReceptionPage(1)
                  setReceptionSearch(event.target.value)
                }}
              />
              <select
                value={receptionServiceId}
                onChange={(event) => {
                  setReceptionPage(1)
                  setReceptionServiceId(event.target.value)
                }}
              >
                <option value="">Все услуги регистратуры</option>
                {receptionServices.map((service) => (
                  <option value={service.id} key={service.id}>
                    {service.name} ({service.code})
                  </option>
                ))}
              </select>
              <button
                className="secondary-action compact"
                type="button"
                onClick={() => void loadReceptionData({ silent: Boolean(receptionTickets) })}
              >
                <Icon name="refresh" />
                Обновить
              </button>
              {receptionRefreshing && <span className="my-window-refreshing">Обновляется...</span>}
            </div>

            {receptionError && <div className="admin-alert">{receptionError}</div>}

            <CrudTable
              columns={[
                'Талон',
                'Услуга',
                'ОП',
                'Статус',
                'Ожидание',
                'Оператор / окно',
                'Действия',
              ]}
              loading={loading}
              rowClassNames={filteredReceptionTickets.map((ticket) =>
                ticket.status === 'WAITING'
                  ? 'my-window-ticket-waiting'
                  : ticket.status === 'CALLED'
                    ? 'my-window-ticket-working'
                    : '',
              )}
              rowKeys={filteredReceptionTickets.map((ticket) => ticket.id)}
              rows={filteredReceptionTickets.map((ticket) => [
                ticket.ticket_number,
                ticket.service_name ?? ticket.service_id,
                getEducationalProgramDisplayLabel(ticket),
                <span className={getMyWindowTicketStatusClassName(ticket.status)} key={`${ticket.id}-status`}>
                  {getTicketStatusLabel(ticket.status)}
                </span>,
                getTicketQueueWaitLabel(ticket, currentTime),
                `${ticket.operator_name ?? ticket.operator_email ?? 'Не назначен'} / ${ticket.window_name ?? ticket.window_id ?? 'нет окна'}`,
                <div className="row-actions" key={ticket.id}>
                  <button
                    className="secondary-action compact"
                    type="button"
                    disabled={ticketActionSaving}
                    onClick={() => openReceptionTicketDetails(ticket)}
                  >
                    Действия
                  </button>
                </div>,
              ])}
            />
            <div className="queue-panel my-window-pagination" aria-label="Пагинация талонов регистратуры">
              <span>
                Страница {receptionCurrentPage} из {receptionTotalPages}
              </span>
              <div>
                <button
                  className="secondary-action compact"
                  type="button"
                  disabled={receptionRefreshing || receptionCurrentPage <= 1}
                  onClick={() => setReceptionPage((page) => Math.max(1, page - 1))}
                >
                  Назад
                </button>
                <button
                  className="secondary-action compact"
                  type="button"
                  disabled={receptionRefreshing || receptionCurrentPage >= receptionTotalPages}
                  onClick={() => setReceptionPage((page) => Math.min(receptionTotalPages, page + 1))}
                >
                  Вперед
                </button>
              </div>
            </div>
          </section>
        )}

        {activeSection === 'profile' && (
          <section className="admin-panel tab-panel profile-section" key="profile">
            {!isAdminUser && (
              <div className="operator-profile-intro">
                <div>
                  <span className="operator-console-label">Профиль оператора</span>
                  <h2>Выбор услуг и ОП</h2>
                  <p>Отметьте услуги и образовательные программы, которые это окно может принимать.</p>
                </div>
                <button className="secondary-action compact" type="button" onClick={() => navigateToSection('myWindow')}>
                  <Icon name="monitor" />
                  Вернуться к окну
                </button>
              </div>
            )}
            <div className="profile-summary queue-panel">
              <div>
                <span className="profile-label">Пользователь</span>
                <strong>{currentUser?.full_name ?? 'Текущий пользователь'}</strong>
                <p>{currentUser?.email ?? 'Данные пользователя загружаются'}</p>
              </div>
              <div>
                <span className="profile-label">Роль</span>
                <strong>{currentUser?.role ?? 'Не определена'}</strong>
                <p>{currentOperator ? `Оператор: ${operatorStatusLabels[currentOperator.status]}` : 'Профиль оператора не найден'}</p>
              </div>
            </div>

            <div className="queue-panel profile-programs-panel">
              <h2>Мои типы услуг</h2>
              <div className="profile-programs-body">
                {!currentOperator && (
                  <div className="admin-alert">
                    Чтобы выбирать типы услуг, текущий пользователь должен быть добавлен в раздел операторов.
                  </div>
                )}

                {activeServices.length === 0 && (
                  <p className="profile-empty">Активных услуг пока нет</p>
                )}

                {activeServices.length > 0 && (
                  <div className="profile-table-wrap">
                    <table className="profile-selection-table">
                      <thead>
                        <tr>
                          <th>Услуга</th>
                          <th>Параметры</th>
                          {serviceLanguageOptions.map((option) => (
                            <th className="profile-language-head" key={option.value}>
                              {option.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                    {activeServices.map((service) => {
                      const checked = profileServiceIds.includes(service.id)
                      const selectedLanguages = normalizeServiceLanguages(profileServiceLanguages[service.id])

                      return (
                        <tr className={checked ? 'is-selected' : ''} key={service.id}>
                          <td>
                            <label className="profile-row-check">
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={!currentOperator || profileSaving}
                                onChange={(event) => selectProfileService(service.id, event.target.checked)}
                              />
                              <span>
                                <strong>{service.name}</strong>
                                <small>{service.code}</small>
                              </span>
                            </label>
                          </td>
                          <td>
                            <span>Приоритет {service.priority}</span>
                            <small>
                              {service.requires_service_language ? 'Нужен язык обслуживания' : 'Язык не требуется'}
                            </small>
                          </td>
                          {serviceLanguageOptions.map((option) => (
                            <td className="profile-language-cell" key={option.value}>
                              {service.requires_service_language ? (
                                <label className="profile-language-check">
                                  <input
                                    type="checkbox"
                                    checked={checked && selectedLanguages.includes(option.value)}
                                    disabled={!currentOperator || profileSaving || !checked}
                                    onChange={(event) =>
                                      toggleProfileServiceLanguage(service.id, option.value, event.target.checked)
                                    }
                                  />
                                  <span>{option.label}</span>
                                </label>
                              ) : (
                                <span className="profile-muted">-</span>
                              )}
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="profile-actions">
                  {profileMessage && <span className="profile-success">{profileMessage}</span>}
                  <button
                    className="primary-action compact"
                    type="button"
                    disabled={!currentOperator || profileSaving}
                    onClick={saveProfileServices}
                  >
                    {profileSaving ? 'Сохранение...' : 'Сохранить услуги'}
                  </button>
                </div>
              </div>
            </div>

            <div className="queue-panel profile-programs-panel">
              <h2>Мои образовательные программы</h2>
              <div className="profile-programs-body">
                {!currentOperator && (
                  <div className="admin-alert">
                    Чтобы выбирать образовательные программы, текущий пользователь должен быть добавлен в раздел
                    операторов.
                  </div>
                )}

                {activeEducationalPrograms.length === 0 && (
                  <p className="profile-empty">Активных образовательных программ пока нет</p>
                )}

                {activeEducationalPrograms.length > 0 && (
                  <div className="profile-table-wrap">
                    <table className="profile-selection-table">
                      <thead>
                        <tr>
                          <th>ОП</th>
                          <th>Степень</th>
                          {serviceLanguageOptions.map((option) => (
                            <th className="profile-language-head" key={option.value}>
                              {option.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                    {activeEducationalPrograms.map((program) => {
                      const checked = profileProgramIds.includes(program.id)
                      const selectedLanguages = normalizeStudyLanguages(profileProgramLanguages[program.id])

                      return (
                        <tr className={checked ? 'is-selected' : ''} key={program.id}>
                          <td>
                            <label className="profile-row-check">
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={!currentOperator || profileSaving}
                                onChange={(event) => selectProfileProgram(program.id, event.target.checked)}
                              />
                              <span>
                                <strong>{program.name}</strong>
                                <small>{program.code}</small>
                              </span>
                            </label>
                          </td>
                          <td>
                            <span>{getDegreeLabel(academicDegrees, program.academic_degree_id)}</span>
                            <small>
                              {program.requires_service_language ? 'Нужен язык ОП' : 'Язык не требуется'}
                            </small>
                          </td>
                          {serviceLanguageOptions.map((option) => (
                            <td className="profile-language-cell" key={option.value}>
                              {program.requires_service_language ? (
                                <label className="profile-language-check">
                                  <input
                                    type="checkbox"
                                    checked={checked && selectedLanguages.includes(option.value)}
                                    disabled={!currentOperator || profileSaving || !checked}
                                    onChange={(event) =>
                                      toggleProfileProgramLanguage(program.id, option.value, event.target.checked)
                                    }
                                  />
                                  <span>{option.label}</span>
                                </label>
                              ) : (
                                <span className="profile-muted">-</span>
                              )}
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="profile-actions">
                  {profileMessage && <span className="profile-success">{profileMessage}</span>}
                  <button
                    className="primary-action compact"
                    type="button"
                    disabled={!currentOperator || profileSaving}
                    onClick={saveProfilePrograms}
                  >
                    {profileSaving ? 'Сохранение...' : 'Сохранить программы'}
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {activeSection === 'services' && (
          <section className="admin-panel tab-panel" key="services">
            <CrudTable
              columns={['ID', 'Название (RU)', 'Название (KZ)', 'Название (EN)', 'Код', 'Приоритет', 'Обр. программа', 'Регистратура', 'Статус', 'Действия']}
              loading={loading}
              rows={services.map((service) => [
                service.id,
                service.name,
                service.name_kk,
                service.name_en,
                service.code,
                service.priority,
                boolLabel(service.requires_educational_program),
                boolLabel(service.requires_service_language),
                boolLabel(service.requires_reception_desk),
                boolLabel(service.is_active),
                <RowActions
                  key={service.id}
                  onEdit={() => {
                    setEditingServiceId(service.id)
                    setServiceForm({
                      name: service.name,
                      name_kk: service.name_kk,
                      name_en: service.name_en,
                      code: service.code,
                      priority: service.priority,
                      is_active: service.is_active,
                      requires_educational_program: service.requires_educational_program,
                      requires_reception_desk: service.requires_reception_desk,
                      requires_service_language: service.requires_service_language,
                    })
                    setFormModal('services')
                  }}
                  onDelete={() => setDeleteTarget({ section: 'services', id: service.id, label: service.name })}
                />,
              ])}
            />
          </section>
        )}

        {activeSection === 'windows' && (
          <section className="admin-panel tab-panel" key="windows">
            <CrudTable
              columns={['ID', 'Название', 'Этаж', 'Статус', 'Оператор', 'Действия']}
              loading={loading}
              rows={windows.map((windowItem) => [
                windowItem.id,
                windowItem.name,
                windowItem.floor ?? 'Не указан',
                windowItem.status,
                getOperatorLabel(
                  operators,
                  users,
                  operators.find((operator) => operator.window_id === windowItem.id)?.id ?? null,
                ),
                <RowActions
                  key={windowItem.id}
                  onEdit={() => {
                    const assignedOperator = operators.find((operator) => operator.window_id === windowItem.id)
                    setEditingWindowId(windowItem.id)
                    setWindowForm({
                      name: windowItem.name,
                      floor: windowItem.floor ?? '',
                      status: windowItem.status,
                      current_operator_id: windowItem.current_operator_id,
                    })
                    setSelectedWindowOperatorId(assignedOperator?.id ?? '')
                    setFormModal('windows')
                  }}
                  onDelete={() => setDeleteTarget({ section: 'windows', id: windowItem.id, label: windowItem.name })}
                />,
              ])}
            />
          </section>
        )}

        {activeSection === 'users' && (
          <section className="admin-panel tab-panel" key="users">
            <CrudTable
              columns={['ID', 'ФИО', 'Email', 'Роль', 'Статус', 'Действия']}
              loading={loading}
              rows={users.map((user) => [
                user.id.slice(0, 8),
                user.full_name,
                user.email,
                user.role,
                boolLabel(user.is_active),
                <RowActions
                  key={user.id}
                  onEdit={() => {
                    setEditingUserId(user.id)
                    setUserForm({
                      email: user.email,
                      full_name: user.full_name,
                      password: '',
                      role: user.role,
                      is_active: user.is_active,
                    })
                    setFormModal('users')
                  }}
                  onDelete={() => setDeleteTarget({ section: 'users', id: user.id, label: user.full_name })}
                />,
              ])}
            />
          </section>
        )}

        {activeSection === 'operators' && (
          <section className="admin-panel tab-panel" key="operators">
            <CrudTable
              columns={['ID', 'Пользователь', 'Окно', 'Услуги', 'ОП', 'Статус', 'Дата создания', 'Действия']}
              loading={loading}
              rows={operators.map((operator) => [
                operator.id.slice(0, 8),
                getUserLabel(users, operator.user_id),
                getWindowLabel(windows, operator.window_id),
                getServiceLabels(services, operatorServiceIds[operator.id] ?? []),
                getProgramLabels(educationalPrograms, operatorProgramIds[operator.id] ?? []),
                operatorStatusLabels[operator.status],
                new Date(operator.created_at).toLocaleString(),
                <div className="row-actions" key={operator.id}>
                  <button
                    className="secondary-action compact"
                    type="button"
                    onClick={() => {
                      navigateToSection('analytics', operator.id)
                    }}
                  >
                    Отчет
                  </button>
                  <button
                    className="secondary-action compact"
                    type="button"
                    onClick={() => {
                      setEditingOperatorId(operator.id)
                      setOperatorForm({
                        user_id: operator.user_id,
                        window_id: operator.window_id,
                        status: operator.status,
                      })
                      setSelectedOperatorProgramIds(operatorProgramIds[operator.id] ?? [])
                      setSelectedOperatorProgramLanguages(operatorProgramLanguages[operator.id] ?? {})
                      setSelectedOperatorServiceIds(operatorServiceIds[operator.id] ?? [])
                      setSelectedOperatorServiceLanguages(operatorServiceLanguages[operator.id] ?? {})
                      setFormModal('operators')
                    }}
                  >
                    Изменить
                  </button>
                  <button
                    className="danger-action"
                    type="button"
                    onClick={() =>
                      setDeleteTarget({
                        section: 'operators',
                        id: operator.id,
                        label: getUserLabel(users, operator.user_id),
                      })
                    }
                  >
                    Удалить
                  </button>
                </div>,
              ])}
            />
          </section>
        )}

        {activeSection === 'analytics' && (
          <section className="admin-panel tab-panel analytics-section" key="analytics">
            {isAdminUser && (
              <div className="analytics-master">
                {selectedAnalyticsOperatorId ? (
                  <button
                    className="secondary-action compact"
                    type="button"
                    onClick={() => navigateToSection('analytics')}
                  >
                    <Icon name="users" />
                    Все сотрудники
                  </button>
                ) : (
                  <span className="profile-label">Выберите сотрудника для детального отчета</span>
                )}
                <button
                  className="secondary-action compact"
                  type="button"
                  disabled={ticketExportingKey !== null || loading}
                  onClick={() => exportTicketsCsv(analyticsExportOperatorId, analyticsExportLabel)}
                >
                  <Icon name="download" />
                  {ticketExportingKey === analyticsExportKey
                    ? 'Выгрузка...'
                    : analyticsExportOperatorId
                      ? 'Выгрузить талоны'
                      : 'Выгрузить все талоны'}
                </button>
              </div>
            )}

            {isAdminUser && !selectedOperatorAnalyticsRow && (
              <>
                {selectedGeneralAnalytics && !loading && operatorAnalyticsRows.length > 0 && (
                  <div className="analytics-dashboard-section analytics-general-section">
                    <div className="analytics-section-heading">
                      <div>
                        <span className="profile-label">Раздел</span>
                        <h2>Общая аналитика</h2>
                      </div>
                      <span className="analytics-status">{operatorPerformancePoints.length} операторов</span>
                    </div>

                    <div className="analytics-performance-summary">
                      <div>
                        <span className="profile-label">Клиентов в час</span>
                        <strong>{formatDecimal(operatorPerformanceClientsPerHour)}</strong>
                      </div>
                      <div>
                        <span className="profile-label">Эффективное рабочее время</span>
                        <strong>{formatDuration(operatorPerformanceTotalEffectiveSeconds)}</strong>
                      </div>
                      <div>
                        <span className="profile-label">Коэффициент загрузки</span>
                        <strong>{operatorPerformanceUtilization}%</strong>
                      </div>
                    </div>

                    <div className="analytics-daily-panel">
                      <div className="analytics-card-header">
                        <div>
                          <span className="profile-label">Все операторы</span>
                          <h3>Талоны по дням</h3>
                        </div>
                        <span className="analytics-status">
                          {generalDailyAnalyticsRows.length} {generalDailyAnalyticsUnitLabel}
                        </span>
                      </div>
                      <div className="analytics-date-filter">
                        <div className="analytics-grouping-toggle" role="group" aria-label="Группировка общей аналитики">
                          <button
                            className={analyticsTimeGrouping === 'day' ? 'selected' : ''}
                            type="button"
                            onClick={() => setAnalyticsTimeGrouping('day')}
                          >
                            Дни
                          </button>
                          <button
                            className={analyticsTimeGrouping === 'month' ? 'selected' : ''}
                            type="button"
                            onClick={() => setAnalyticsTimeGrouping('month')}
                          >
                            Месяцы
                          </button>
                        </div>
                        <label>
                          <span>С даты</span>
                          <input
                            type="date"
                            value={analyticsDateFrom}
                            onChange={(event) => setAnalyticsDateFrom(event.target.value)}
                          />
                        </label>
                        <label>
                          <span>По дату</span>
                          <input
                            type="date"
                            value={analyticsDateTo}
                            onChange={(event) => setAnalyticsDateTo(event.target.value)}
                          />
                        </label>
                        <button
                          className="secondary-action compact"
                          type="button"
                          onClick={() => {
                            const summerRange = getDefaultSummerDateRange()
                            setAnalyticsDateFrom(summerRange.from)
                            setAnalyticsDateTo(summerRange.to)
                          }}
                        >
                          Лето
                        </button>
                      </div>
                      {generalDailyAnalyticsRows.length === 0 ? (
                        <div className="analytics-empty">{generalDailyAnalyticsEmptyLabel}</div>
                      ) : (
                        <AnalyticsDailyLineChart
                          grouping={analyticsTimeGrouping}
                          rows={generalDailyAnalyticsRows}
                          valueKey="tickets_count"
                          valueLabel="Всего талонов"
                        />
                      )}
                    </div>

                    <div className="analytics-general-donut-grid">
                      <AnalyticsDonutPanel
                        centerLabel="талонов"
                        centerValue={generalTicketsTotal}
                        segments={generalServicePieSegments}
                        title="Распределение по услугам"
                        total={generalTicketsTotal}
                      />
                      <AnalyticsDonutPanel
                        centerLabel="статусов"
                        centerValue={generalTicketsTotal}
                        segments={generalStatusPieSegments}
                        title="Статусы талонов"
                        total={generalTicketsTotal}
                      />
                      <AnalyticsDonutPanel
                        centerLabel="талонов"
                        centerValue={generalTicketsTotal}
                        segments={generalProgramPieSegments}
                        title="Образовательные программы"
                        total={generalTicketsTotal}
                      />
                      <AnalyticsDonutPanel
                        centerLabel="талонов"
                        centerValue={generalTicketsTotal}
                        segments={generalOperatorPieSegments}
                        title="Талоны по операторам"
                        total={generalTicketsTotal}
                      />
                    </div>
                  </div>
                )}

                {!selectedAnalyticsOperatorId && (
                <div className="analytics-employee-grid">
                {loading && <div className="analytics-empty">Загрузка...</div>}
                {!loading && operatorAnalyticsRows.length === 0 && (
                  <div className="analytics-empty">Данных по операторам пока нет</div>
                )}
                {!loading && operatorAnalyticsRows.length > 0 && (
                  <button
                    className="analytics-employee-card analytics-general-link-card"
                    type="button"
                    onClick={() => navigateToSection('analytics', 'general')}
                  >
                    <div className="analytics-card-header">
                      <div>
                        <span className="profile-label">Раздел</span>
                        <strong>Общая аналитика</strong>
                      </div>
                      <span className="analytics-status">{operatorPerformancePoints.length} операторов</span>
                    </div>
                    <div className="analytics-employee-metrics">
                      <span>
                        Клиентов/час
                        <strong>{formatDecimal(operatorPerformanceClientsPerHour)}</strong>
                      </span>
                      <span>
                        Эфф. время
                        <strong>{formatDuration(operatorPerformanceTotalEffectiveSeconds)}</strong>
                      </span>
                      <span>
                        Загрузка
                        <strong>{operatorPerformanceUtilization}%</strong>
                      </span>
                    </div>
                  </button>
                )}
                {!loading && operatorAnalyticsRows.map(({ operator, stats }) => (
                  <button
                    className="analytics-employee-card"
                    key={stats.operator_id}
                    type="button"
                    onClick={() => navigateToSection('analytics', stats.operator_id)}
                  >
                    <div className="analytics-card-header">
                      <div>
                        <span className="profile-label">Сотрудник</span>
                        <strong>{getAnalyticsOperatorLabel(stats, operator, users)}</strong>
                      </div>
                      <span className="analytics-status">
                        {operator ? operatorStatusLabels[operator.status] : 'Без статуса'}
                      </span>
                    </div>
                    <div className="analytics-employee-metrics">
                      <span>
                        Клиентов/час
                        <strong>{formatDecimal(getOperatorClientsPerHour(stats))}</strong>
                      </span>
                      <span>
                        Эфф. время
                        <strong>{formatDuration(stats.total_processing_seconds)}</strong>
                      </span>
                      <span>
                        Загрузка
                        <strong>{getOperatorUtilizationPercent(stats)}%</strong>
                      </span>
                    </div>
                  </button>
                ))}
              </div>
                )}
              </>
            )}

            {!isAdminUser && !loading && !selectedOperatorAnalyticsRow && (
              <div className="analytics-empty">Данных по оператору пока нет</div>
            )}

            {selectedOperatorAnalyticsRow && (
              <>
                <div className="analytics-dashboard-section">
                  <div className="analytics-section-heading">
                    <div>
                      <span className="profile-label">Раздел 1</span>
                      <h2>Аналитика по услугам</h2>
                    </div>
                    <span className="analytics-status">
                      {selectedServiceAnalyticsRows.length} услуг
                    </span>
                  </div>

                  <div className="analytics-service-summary">
                    <div>
                      <span className="profile-label">Всего талонов по услугам</span>
                      <strong>{selectedServiceAnalyticsTotalTickets}</strong>
                      <p>Все талоны, закрепленные за сотрудником</p>
                    </div>
                    <div>
                      <span className="profile-label">Общее время оказания</span>
                      <strong>{formatDuration(selectedServiceAnalyticsTotalTime)}</strong>
                      <p>Сумма времени обслуживания по услугам</p>
                    </div>
                    <div>
                      <span className="profile-label">Лучшее завершение</span>
                      <strong>{selectedServiceAnalyticsBestCompletion?.service_name ?? 'Нет данных'}</strong>
                      <p>
                        {selectedServiceAnalyticsBestCompletion
                          ? `${selectedServiceAnalyticsBestCompletion.completion_rate}% завершения`
                          : 'Пока нет обработанных услуг'}
                      </p>
                    </div>
                  </div>

                  <div className="analytics-service-pie-panel">
                    {selectedServiceAnalyticsRows.length === 0 ? (
                      <div className="analytics-empty">По этому сотруднику пока нет услуг</div>
                    ) : (
                      <>
                        <div className="analytics-chart-block">
                          <h3>Распределение по услугам</h3>
                          <AnalyticsDonutChart
                            centerLabel="талонов"
                            centerValue={selectedServiceAnalyticsTotalTickets}
                            segments={selectedServicePieSegments}
                            total={selectedServiceAnalyticsTotalTickets}
                          />
                        </div>
                        <div className="analytics-chart-block">
                          <h3>Статусы талонов</h3>
                          <AnalyticsDonutChart
                            centerLabel="статусов"
                            centerValue={selectedStatusTotal}
                            segments={selectedStatusPieSegments}
                            total={selectedStatusTotal}
                          />
                        </div>
                      </>
                    )}
                  </div>

                  <div className="analytics-daily-panel">
                    <div className="analytics-card-header">
                      <div>
                        <span className="profile-label">Раздел 2</span>
                        <h3>Талоны по дням</h3>
                      </div>
                      <span className="analytics-status">
                        {selectedDailyAnalyticsRows.length} {selectedDailyAnalyticsUnitLabel}
                      </span>
                    </div>
                    <div className="analytics-date-filter">
                      <div className="analytics-grouping-toggle" role="group" aria-label="Группировка графика">
                        <button
                          className={analyticsTimeGrouping === 'day' ? 'selected' : ''}
                          type="button"
                          onClick={() => setAnalyticsTimeGrouping('day')}
                        >
                          Дни
                        </button>
                        <button
                          className={analyticsTimeGrouping === 'month' ? 'selected' : ''}
                          type="button"
                          onClick={() => setAnalyticsTimeGrouping('month')}
                        >
                          Месяцы
                        </button>
                      </div>
                      <label>
                        <span>С даты</span>
                        <input
                          type="date"
                          value={analyticsDateFrom}
                          onChange={(event) => setAnalyticsDateFrom(event.target.value)}
                        />
                      </label>
                      <label>
                        <span>По дату</span>
                        <input
                          type="date"
                          value={analyticsDateTo}
                          onChange={(event) => setAnalyticsDateTo(event.target.value)}
                        />
                      </label>
                      <button
                        className="secondary-action compact"
                        type="button"
                        onClick={() => {
                          const summerRange = getDefaultSummerDateRange()
                          setAnalyticsDateFrom(summerRange.from)
                          setAnalyticsDateTo(summerRange.to)
                        }}
                      >
                        Лето
                      </button>
                    </div>
                    {selectedDailyAnalyticsRows.length === 0 ? (
                      <div className="analytics-empty">{selectedDailyAnalyticsEmptyLabel}</div>
                    ) : (
                      <AnalyticsDailyLineChart grouping={analyticsTimeGrouping} rows={selectedDailyAnalyticsRows} />
                    )}
                  </div>

                  <div className="analytics-services-grid">
                    {selectedServiceAnalyticsRows.map((serviceStats) => (
                        <article className="analytics-service-card" key={serviceStats.service_id}>
                          <div className="analytics-card-header">
                            <div>
                              <span className="profile-label">Услуга</span>
                              <strong>{serviceStats.service_name ?? `Услуга ${serviceStats.service_id}`}</strong>
                            </div>
                            <span className="analytics-status">{serviceStats.share_percent}%</span>
                          </div>
                          <div className="analytics-service-metrics">
                            <div>
                              <span>Талонов</span>
                              <strong>{serviceStats.tickets_count}</strong>
                            </div>
                            <div>
                              <span>Среднее время</span>
                              <strong>{formatDuration(serviceStats.average_processing_seconds)}</strong>
                            </div>
                            <div>
                              <span>Общее время</span>
                              <strong>{formatDuration(serviceStats.total_processing_seconds)}</strong>
                            </div>
                            <div>
                              <span>Завершено</span>
                              <strong>{serviceStats.completed}</strong>
                            </div>
                            <div>
                              <span>Не явился</span>
                              <strong>{serviceStats.skipped}</strong>
                            </div>
                            <div>
                              <span>Ожидание</span>
                              <strong>{formatDuration(serviceStats.average_wait_seconds)}</strong>
                            </div>
                            <div>
                              <span>Диапазон</span>
                              <strong>
                                {formatDuration(serviceStats.fastest_processing_seconds)} - {formatDuration(serviceStats.slowest_processing_seconds)}
                              </strong>
                            </div>
                          </div>
                        </article>
                    ))}
                  </div>

                  <CrudTable
                    columns={[
                      'Услуга',
                      'Талонов',
                      'Обработано',
                      'Завершено',
                      'Не явился',
                      'В работе',
                      'Среднее время',
                      'Общее время',
                      'Среднее ожидание',
                      'Доля',
                      'Завершение',
                      'Последний талон',
                    ]}
                    loading={loading}
                    rows={selectedServiceAnalyticsRows.map((serviceStats) => [
                      serviceStats.service_name ?? `Услуга ${serviceStats.service_id}`,
                      serviceStats.tickets_count,
                      serviceStats.processed,
                      serviceStats.completed,
                      serviceStats.skipped,
                      serviceStats.active,
                      formatDuration(serviceStats.average_processing_seconds),
                      formatDuration(serviceStats.total_processing_seconds),
                      formatDuration(serviceStats.average_wait_seconds),
                      `${serviceStats.share_percent}%`,
                      `${serviceStats.completion_rate}%`,
                      serviceStats.last_ticket_at
                        ? new Date(serviceStats.last_ticket_at).toLocaleString()
                        : 'Активности нет',
                    ])}
                  />
                </div>
              </>
            )}
          </section>
        )}

        {activeSection === 'academicDegrees' && (
          <section className="admin-panel tab-panel" key="academicDegrees">
            <CrudTable
              columns={['ID', 'Название', 'Код', 'Статус', 'Действия']}
              loading={loading}
              rows={academicDegrees.map((degree) => [
                degree.id,
                degree.name,
                degree.code,
                boolLabel(degree.is_active),
                <RowActions
                  key={degree.id}
                  onEdit={() => {
                    setEditingAcademicDegreeId(degree.id)
                    setAcademicDegreeForm({
                      name: degree.name,
                      code: degree.code,
                      is_active: degree.is_active,
                    })
                    setFormModal('academicDegrees')
                  }}
                  onDelete={() =>
                    setDeleteTarget({
                      section: 'academicDegrees',
                      id: degree.id,
                      label: degree.name,
                    })
                  }
                />,
              ])}
            />
          </section>
        )}

        {activeSection === 'educationalPrograms' && (
          <section className="admin-panel tab-panel" key="educationalPrograms">
            <CrudTable
              columns={['ID', 'Название (RU)', 'Название (KZ)', 'Название (EN)', 'Код', 'Степень', 'Требовать язык обслуживания', 'Статус', 'Действия']}
              loading={loading}
              rows={educationalPrograms.map((program) => [
                program.id,
                program.name,
                program.name_kk,
                program.name_en,
                program.code,
                getDegreeLabel(academicDegrees, program.academic_degree_id),
                boolLabel(program.requires_service_language),
                boolLabel(program.is_active),
                <RowActions
                  key={program.id}
                  onEdit={() => {
                    setEditingEducationalProgramId(program.id)
                    setEducationalProgramForm({
                      name: program.name,
                      name_kk: program.name_kk,
                      name_en: program.name_en,
                      code: program.code,
                      academic_degree_id: program.academic_degree_id,
                      requires_service_language: program.requires_service_language,
                      is_active: program.is_active,
                    })
                    setFormModal('educationalPrograms')
                  }}
                  onDelete={() =>
                    setDeleteTarget({
                      section: 'educationalPrograms',
                      id: program.id,
                      label: program.name,
                    })
                  }
                />,
              ])}
            />
          </section>
        )}

        {activeSection === 'applicants' && (
          <section className="admin-panel tab-panel" key="applicants">
            <CrudTable
              columns={['ID', 'ФИО', 'ИИН', 'Телефон', 'Telegram Chat ID', 'Дата регистрации', 'Действия']}
              loading={loading}
              rows={applicants.map((applicant) => [
                applicant.id.slice(0, 8),
                applicant.full_name ?? 'Не указано',
                applicant.iin ?? 'Не указано',
                applicant.phone ?? 'Не указано',
                applicant.telegram_chat_id ?? 'Не указано',
                new Date(applicant.created_at).toLocaleString(),
                <RowActions
                  key={applicant.id}
                  onEdit={() => {
                    setEditingApplicantId(applicant.id)
                    setApplicantForm({
                      full_name: applicant.full_name ?? '',
                      iin: applicant.iin ?? '',
                      phone: applicant.phone ?? '',
                      telegram_chat_id: applicant.telegram_chat_id,
                    })
                    setFormModal('applicants')
                  }}
                  onDelete={() =>
                    setDeleteTarget({
                      section: 'applicants',
                      id: applicant.id,
                      label: applicant.full_name ?? applicant.iin ?? applicant.id,
                    })
                  }
                />,
              ])}
            />
          </section>
        )}

        {activeSection === 'ticketEvents' && (
          <section className="admin-panel tab-panel" key="ticketEvents">
            <CrudTable
              columns={['ID', 'Талон', 'Тип', 'Старый статус', 'Новый статус', 'Оператор', 'Metadata', 'Время', 'Действия']}
              loading={loading}
              rows={ticketEvents.map((ticketEvent) => [
                ticketEvent.id.slice(0, 8),
                ticketEvent.ticket_id ?? 'Не указано',
                ticketEvent.event_type ?? 'Не указано',
                ticketEvent.old_status ?? 'Не указано',
                ticketEvent.new_status ?? 'Не указано',
                ticketEvent.operator_name ?? ticketEvent.operator_email ?? ticketEvent.operator_id?.slice(0, 8) ?? 'Не указано',
                ticketEvent.metadata ? JSON.stringify(ticketEvent.metadata) : 'Не указано',
                new Date(ticketEvent.created_at).toLocaleString(),
                <RowActions
                  key={ticketEvent.id}
                  onEdit={() => {
                    setEditingTicketEventId(ticketEvent.id)
                    setTicketEventForm({
                      ticket_id: ticketEvent.ticket_id,
                      event_type: ticketEvent.event_type,
                      old_status: ticketEvent.old_status,
                      new_status: ticketEvent.new_status,
                      operator_id: ticketEvent.operator_id,
                      metadata: ticketEvent.metadata,
                    })
                    setTicketEventMetadataText(
                      ticketEvent.metadata ? JSON.stringify(ticketEvent.metadata, null, 2) : '',
                    )
                    setFormModal('ticketEvents')
                  }}
                  onDelete={() =>
                    setDeleteTarget({
                      section: 'ticketEvents',
                      id: ticketEvent.id,
                      label: ticketEvent.event_type ?? ticketEvent.id,
                    })
                  }
                />,
              ])}
            />
          </section>
        )}
      </main>

      {formModal !== null && (
        <AdminModal title={modalTitle} onClose={closeFormModal}>
          {formModal === 'services' && (
            <form className="admin-form modal-form" onSubmit={submitService}>
              <input
                required
                placeholder="Название на русском"
                value={serviceForm.name}
                onChange={(event) => setServiceForm({ ...serviceForm, name: event.target.value })}
              />
              <input
                required
                placeholder="Название на казахском"
                value={serviceForm.name_kk}
                onChange={(event) => setServiceForm({ ...serviceForm, name_kk: event.target.value })}
              />
              <input
                required
                placeholder="Название на английском"
                value={serviceForm.name_en}
                onChange={(event) => setServiceForm({ ...serviceForm, name_en: event.target.value })}
              />
              <input
                required
                maxLength={10}
                placeholder="Код"
                value={serviceForm.code}
                onChange={(event) => setServiceForm({ ...serviceForm, code: event.target.value.toUpperCase() })}
              />
              <input
                min={0}
                type="number"
                placeholder="Приоритет"
                value={serviceForm.priority}
                onChange={(event) => setServiceForm({ ...serviceForm, priority: Number(event.target.value) })}
              />
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={serviceForm.is_active}
                  onChange={(event) => setServiceForm({ ...serviceForm, is_active: event.target.checked })}
                />
                Активна
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={serviceForm.requires_educational_program}
                  onChange={(event) =>
                    setServiceForm({
                      ...serviceForm,
                      requires_educational_program: event.target.checked,
                    })
                  }
                />
                При данной услуге запрашивать образовательные программы
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={serviceForm.requires_reception_desk}
                  onChange={(event) =>
                    setServiceForm({
                      ...serviceForm,
                      requires_reception_desk: event.target.checked,
                    })
                  }
                />
                Предусмотреть для данной услуги стойку регистратуры
              </label>
              <ModalActions onCancel={closeFormModal} submitText={editingServiceId === null ? 'Создать' : 'Сохранить'} />
            </form>
          )}

          {formModal === 'services' && (
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={serviceForm.requires_service_language}
                  onChange={(event) =>
                    setServiceForm({
                      ...serviceForm,
                      requires_service_language: event.target.checked,
                    })
                  }
                />
                Требовать выбор языка обслуживания
              </label>
          )}
          {formModal === 'windows' && (
            <form className="admin-form modal-form" onSubmit={submitWindow}>
              <input
                required
                placeholder="Название окна"
                value={windowForm.name}
                onChange={(event) => setWindowForm({ ...windowForm, name: event.target.value })}
              />
              <input
                placeholder="Этаж"
                value={windowForm.floor ?? ''}
                onChange={(event) => setWindowForm({ ...windowForm, floor: event.target.value })}
              />
              <select
                value={windowForm.status}
                onChange={(event) => setWindowForm({ ...windowForm, status: event.target.value as WindowStatus })}
              >
                <option value="OPEN">OPEN</option>
                <option value="BUSY">BUSY</option>
                <option value="CLOSED">CLOSED</option>
              </select>
              <select
                value={selectedWindowOperatorId}
                onChange={(event) => setSelectedWindowOperatorId(event.target.value)}
              >
                <option value="">Оператор не назначен</option>
                {operators.map((operator) => {
                  const assignedWindow = getWindowLabel(windows, operator.window_id)

                  return (
                    <option value={operator.id} key={operator.id}>
                      {getUserLabel(users, operator.user_id)}
                      {operator.window_id !== null ? ` - ${assignedWindow}` : ''}
                    </option>
                  )
                })}
              </select>
              <ModalActions onCancel={closeFormModal} submitText={editingWindowId === null ? 'Создать' : 'Сохранить'} />
            </form>
          )}

          {formModal === 'users' && (
            <form className="admin-form modal-form" onSubmit={submitUser}>
              <input
                required
                placeholder="ФИО"
                value={userForm.full_name}
                onChange={(event) => setUserForm({ ...userForm, full_name: event.target.value })}
              />
              <input
                required
                type="email"
                placeholder="Email"
                value={userForm.email}
                onChange={(event) => setUserForm({ ...userForm, email: event.target.value })}
              />
              <input
                required={editingUserId === null}
                type="password"
                placeholder={editingUserId === null ? 'Пароль' : 'Новый пароль'}
                value={userForm.password ?? ''}
                onChange={(event) => setUserForm({ ...userForm, password: event.target.value })}
              />
              <select
                value={userForm.role}
                onChange={(event) => setUserForm({ ...userForm, role: event.target.value as UserRole })}
              >
                <option value="ADMIN">ADMIN</option>
                <option value="OPERATOR">OPERATOR</option>
                <option value="MANAGER">MANAGER</option>
              </select>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={userForm.is_active}
                  onChange={(event) => setUserForm({ ...userForm, is_active: event.target.checked })}
                />
                Активен
              </label>
              <ModalActions onCancel={closeFormModal} submitText={editingUserId === null ? 'Создать' : 'Сохранить'} />
            </form>
          )}

          {formModal === 'operators' && (
            <form className="admin-form modal-form" onSubmit={submitOperator}>
              <select
                required
                value={operatorForm.user_id}
                onChange={(event) => setOperatorForm({ ...operatorForm, user_id: event.target.value })}
              >
                <option value="">Выберите пользователя</option>
                {users.map((user) => (
                  <option value={user.id} key={user.id}>
                    {user.full_name} ({user.email})
                  </option>
                ))}
              </select>
              <select
                value={operatorForm.window_id ?? ''}
                onChange={(event) =>
                  setOperatorForm({
                    ...operatorForm,
                    window_id: event.target.value ? Number(event.target.value) : null,
                  })
                }
              >
                <option value="">Окно не назначено</option>
                {windows.map((windowItem) => (
                  <option value={windowItem.id} key={windowItem.id}>
                    {windowItem.name} ({windowItem.status})
                  </option>
                ))}
              </select>
              <select
                value={operatorForm.status}
                onChange={(event) => setOperatorForm({ ...operatorForm, status: event.target.value as OperatorStatus })}
              >
                {operatorStatusActions.map((action) => (
                  <option value={action.status} key={action.status}>
                    {action.label}
                  </option>
                ))}
              </select>
              <select
                multiple
                className="multi-select"
                value={selectedOperatorServiceIds.map(String)}
                onChange={(event) => {
                  const nextServiceIds = Array.from(event.target.selectedOptions, (option) => Number(option.value))
                  setSelectedOperatorServiceIds(nextServiceIds)
                  setSelectedOperatorServiceLanguages((current) =>
                    Object.fromEntries(
                      nextServiceIds.map((serviceId) => [
                        serviceId,
                        normalizeServiceLanguages(current[serviceId]),
                      ]),
                    ),
                  )
                }}
              >
                {services.map((service) => (
                  <option value={service.id} key={service.id}>
                    {service.name} ({service.code})
                  </option>
                ))}
              </select>
              {selectedOperatorServiceIds.some((serviceId) =>
                services.find((service) => service.id === serviceId)?.requires_service_language,
              ) && (
                <div className="program-choice-grid">
                  {selectedOperatorServiceIds
                    .map((serviceId) => services.find((service) => service.id === serviceId))
                    .filter((service): service is ServiceItem => Boolean(service?.requires_service_language))
                    .map((service) => (
                      <div className="program-choice" key={service.id}>
                        <span>
                          <strong>{service.name}</strong>
                          <small>{service.code} - языки обслуживания</small>
                        </span>
                        <span className="language-option-row">
                          {serviceLanguageOptions.map((option) => {
                            const checked = normalizeServiceLanguages(
                              selectedOperatorServiceLanguages[service.id],
                            ).includes(option.value)

                            return (
                              <label className="check-field inline-check" key={option.value}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(event) => {
                                    const current = normalizeServiceLanguages(
                                      selectedOperatorServiceLanguages[service.id],
                                    )
                                    setSelectedOperatorServiceLanguages({
                                      ...selectedOperatorServiceLanguages,
                                      [service.id]: event.target.checked
                                        ? normalizeServiceLanguages([...current, option.value])
                                        : current.filter((language) => language !== option.value),
                                    })
                                  }}
                                />
                                {option.label}
                              </label>
                            )
                          })}
                        </span>
                      </div>
                    ))}
                </div>
              )}
              <select
                multiple
                className="multi-select"
                value={selectedOperatorProgramIds.map(String)}
                onChange={(event) => {
                  const nextProgramIds = Array.from(event.target.selectedOptions, (option) => Number(option.value))
                  setSelectedOperatorProgramIds(nextProgramIds)
                  setSelectedOperatorProgramLanguages((current) =>
                    Object.fromEntries(
                      nextProgramIds.map((programId) => [
                        programId,
                        normalizeStudyLanguages(current[programId]),
                      ]),
                    ),
                  )
                }}
              >
                {educationalPrograms.map((program) => (
                  <option value={program.id} key={program.id}>
                    {program.name} ({program.code}) - {getDegreeLabel(academicDegrees, program.academic_degree_id)}
                  </option>
                ))}
              </select>
              <ModalActions onCancel={closeFormModal} submitText={editingOperatorId === null ? 'Создать' : 'Сохранить'} />
            </form>
          )}

          {formModal === 'operators' && selectedOperatorProgramIds.length > 0 && (
            <div className="program-choice-grid">
              {selectedOperatorProgramIds
                .map((programId) => educationalPrograms.find((program) => program.id === programId))
                .filter((program): program is EducationalProgramItem => Boolean(program))
                .map((program) => (
                  <div className="program-choice" key={program.id}>
                    <span>
                      <strong>{program.name}</strong>
                      <small>{program.code} - языки ОП</small>
                    </span>
                    <span className="language-option-row">
                      {serviceLanguageOptions.map((option) => {
                        const checked = normalizeStudyLanguages(
                          selectedOperatorProgramLanguages[program.id],
                        ).includes(option.value)

                        return (
                          <label className="check-field inline-check" key={option.value}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) => {
                                const current = normalizeStudyLanguages(
                                  selectedOperatorProgramLanguages[program.id],
                                )
                                setSelectedOperatorProgramLanguages({
                                  ...selectedOperatorProgramLanguages,
                                  [program.id]: event.target.checked
                                    ? normalizeStudyLanguages([...current, option.value])
                                    : current.filter((language) => language !== option.value),
                                })
                              }}
                            />
                            {option.label}
                          </label>
                        )
                      })}
                    </span>
                  </div>
                ))}
            </div>
          )}

          {formModal === 'academicDegrees' && (
            <form className="admin-form modal-form" onSubmit={submitAcademicDegree}>
              <input
                required
                placeholder="Название степени"
                value={academicDegreeForm.name}
                onChange={(event) => setAcademicDegreeForm({ ...academicDegreeForm, name: event.target.value })}
              />
              <input
                required
                placeholder="Код"
                value={academicDegreeForm.code}
                onChange={(event) => setAcademicDegreeForm({ ...academicDegreeForm, code: event.target.value.toUpperCase() })}
              />
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={academicDegreeForm.is_active}
                  onChange={(event) =>
                    setAcademicDegreeForm({ ...academicDegreeForm, is_active: event.target.checked })
                  }
                />
                Активна
              </label>
              <ModalActions
                onCancel={closeFormModal}
                submitText={editingAcademicDegreeId === null ? 'Создать' : 'Сохранить'}
              />
            </form>
          )}

          {formModal === 'educationalPrograms' && (
            <form className="admin-form modal-form" onSubmit={submitEducationalProgram}>
              <input
                required
                placeholder="Название ОП на русском"
                value={educationalProgramForm.name}
                onChange={(event) =>
                  setEducationalProgramForm({ ...educationalProgramForm, name: event.target.value })
                }
              />
              <input
                required
                placeholder="Название ОП на казахском"
                value={educationalProgramForm.name_kk}
                onChange={(event) =>
                  setEducationalProgramForm({ ...educationalProgramForm, name_kk: event.target.value })
                }
              />
              <input
                required
                placeholder="Название ОП на английском"
                value={educationalProgramForm.name_en}
                onChange={(event) =>
                  setEducationalProgramForm({ ...educationalProgramForm, name_en: event.target.value })
                }
              />
              <input
                required
                placeholder="Код"
                value={educationalProgramForm.code}
                onChange={(event) =>
                  setEducationalProgramForm({
                    ...educationalProgramForm,
                    code: event.target.value.toUpperCase(),
                  })
                }
              />
              <select
                required
                value={educationalProgramForm.academic_degree_id || ''}
                onChange={(event) =>
                  setEducationalProgramForm({
                    ...educationalProgramForm,
                    academic_degree_id: Number(event.target.value),
                  })
                }
              >
                <option value="">Выберите степень</option>
                {academicDegrees.map((degree) => (
                  <option value={degree.id} key={degree.id}>
                    {degree.name} ({degree.code})
                  </option>
                ))}
              </select>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={educationalProgramForm.requires_service_language}
                  onChange={(event) =>
                    setEducationalProgramForm({
                      ...educationalProgramForm,
                      requires_service_language: event.target.checked,
                    })
                  }
                />
                Требовать выбор языка обслуживания
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={educationalProgramForm.is_active}
                  onChange={(event) =>
                    setEducationalProgramForm({
                      ...educationalProgramForm,
                      is_active: event.target.checked,
                    })
                  }
                />
                Активна
              </label>
              <ModalActions
                onCancel={closeFormModal}
                submitText={editingEducationalProgramId === null ? 'Создать' : 'Сохранить'}
              />
            </form>
          )}

          {formModal === 'applicants' && (
            <form className="admin-form modal-form" onSubmit={submitApplicant}>
              <input
                placeholder="ФИО"
                value={applicantForm.full_name ?? ''}
                onChange={(event) => setApplicantForm({ ...applicantForm, full_name: event.target.value })}
              />
              <input
                maxLength={12}
                minLength={12}
                placeholder="ИИН"
                value={applicantForm.iin ?? ''}
                onChange={(event) => setApplicantForm({ ...applicantForm, iin: event.target.value })}
              />
              <input
                maxLength={20}
                placeholder="Телефон"
                value={applicantForm.phone ?? ''}
                onChange={(event) => setApplicantForm({ ...applicantForm, phone: event.target.value })}
              />
              <input
                type="number"
                placeholder="Telegram Chat ID"
                value={applicantForm.telegram_chat_id ?? ''}
                onChange={(event) =>
                  setApplicantForm({
                    ...applicantForm,
                    telegram_chat_id: event.target.value ? Number(event.target.value) : null,
                  })
                }
              />
              <ModalActions
                onCancel={closeFormModal}
                submitText={editingApplicantId === null ? 'Создать' : 'Сохранить'}
              />
            </form>
          )}

          {formModal === 'ticketEvents' && (
            <form className="admin-form modal-form" onSubmit={submitTicketEvent}>
              <input
                type="text"
                placeholder="ID талона"
                value={ticketEventForm.ticket_id ?? ''}
                onChange={(event) =>
                  setTicketEventForm({
                    ...ticketEventForm,
                    ticket_id: event.target.value || null,
                  })
                }
              />
              <select
                value={ticketEventForm.event_type ?? ''}
                onChange={(event) =>
                  setTicketEventForm({
                    ...ticketEventForm,
                    event_type: event.target.value || null,
                  })
                }
              >
                <option value="">Выберите тип события</option>
                <option value="TICKET_CREATED">TICKET_CREATED</option>
                <option value="TICKET_CALLED">TICKET_CALLED</option>
                <option value="TICKET_DECLINED">TICKET_DECLINED</option>
                <option value="TICKET_SKIPPED">TICKET_SKIPPED</option>
                <option value="TICKET_COMPLETED">TICKET_COMPLETED</option>
                <option value="STATUS_CHANGED">STATUS_CHANGED</option>
              </select>
              <input
                maxLength={50}
                placeholder="Старый статус"
                value={ticketEventForm.old_status ?? ''}
                onChange={(event) =>
                  setTicketEventForm({
                    ...ticketEventForm,
                    old_status: event.target.value || null,
                  })
                }
              />
              <input
                maxLength={50}
                placeholder="Новый статус"
                value={ticketEventForm.new_status ?? ''}
                onChange={(event) =>
                  setTicketEventForm({
                    ...ticketEventForm,
                    new_status: event.target.value || null,
                  })
                }
              />
              <select
                value={ticketEventForm.operator_id ?? ''}
                onChange={(event) =>
                  setTicketEventForm({
                    ...ticketEventForm,
                    operator_id: event.target.value || null,
                  })
                }
              >
                <option value="">Оператор не указан</option>
                {operators.map((operator) => (
                  <option value={operator.id} key={operator.id}>
                    {getUserLabel(users, operator.user_id)}
                  </option>
                ))}
              </select>
              <textarea
                placeholder='Metadata JSON, например {"source":"operator-panel"}'
                value={ticketEventMetadataText}
                onChange={(event) => setTicketEventMetadataText(event.target.value)}
              />
              <ModalActions
                onCancel={closeFormModal}
                submitText={editingTicketEventId === null ? 'Создать' : 'Сохранить'}
              />
            </form>
          )}
        </AdminModal>
      )}

      {selectedMyWindowTicket !== null && (
        <AdminModal title={`Талон ${selectedMyWindowTicket.ticket_number}`} onClose={closeMyWindowTicketDetails} size="wide">
          <div className="ticket-detail-grid">
            <div>
              <span className="profile-label">Абитуриент</span>
              <strong>{selectedMyWindowTicket.full_name ?? 'Не указано'}</strong>
              <p>{selectedMyWindowTicket.iin ?? 'ИИН не указан'}</p>
            </div>
            <div>
              <span className="profile-label">Текущая услуга</span>
              <strong>{selectedMyWindowTicket.service_name ?? selectedMyWindowTicket.service_id}</strong>
              <p>{getEducationalProgramDisplayLabel(selectedMyWindowTicket)}</p>
            </div>
            <div>
              <span className="profile-label">Язык обучения</span>
              <strong>{getStudyLanguageLabel(selectedMyWindowTicket.study_language)}</strong>
            </div>
            <div>
              <span className="profile-label">Статус</span>
              <strong>{getTicketStatusLabel(selectedMyWindowTicket.status)}</strong>
              <p>Создан: {new Date(selectedMyWindowTicket.created_at).toLocaleString()}</p>
            </div>
            <div>
              <span className="profile-label">Ответственный оператор</span>
              <strong>
                {selectedMyWindowTicket.operator_name ??
                  selectedMyWindowTicket.operator_email ??
                  selectedMyWindowTicket.operator_id ??
                  'Не назначен'}
              </strong>
              <p>Окно: {selectedMyWindowTicket.window_id ?? 'Не указано'}</p>
            </div>
          </div>

          {selectedMyWindowTicket.status === 'CALLED' && (
            <form className="admin-form modal-form ticket-admission-form" onSubmit={saveMyWindowTicketApplicantData}>
              <div className="ticket-form-grid">
                <input
                  required
                  autoFocus
                  inputMode="numeric"
                  pattern="[0-9]{12}"
                  maxLength={12}
                  minLength={12}
                  placeholder="ИИН абитуриента"
                  value={acceptIin}
                  onChange={(event) => setAcceptIin(event.target.value.replace(/\D/g, '').slice(0, 12))}
                />
                <select
                  required
                  value={acceptStudyLanguage}
                  onChange={(event) => setAcceptStudyLanguage(parseStudyLanguage(event.target.value) ?? '')}
                >
                  <option value="">Выберите язык обучения</option>
                  {studyLanguageOptions.map((option) => (
                    <option value={option.value} key={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button className="secondary-action compact" type="submit" disabled={ticketActionSaving}>
                  Сохранить данные
                </button>
              </div>
            </form>
          )}

          <form className="admin-form modal-form touch-reassign-form" onSubmit={reassignMyWindowTicket}>
            <div className="touch-choice-field">
              <span className="profile-label">Новая услуга</span>
              <button
                className="touch-choice-trigger"
                type="button"
                aria-expanded={reassignServiceListOpen}
                onClick={() => setReassignServiceListOpen((isOpen) => !isOpen)}
              >
                <span>
                  <strong>{selectedReassignService?.name ?? 'Выберите услугу'}</strong>
                  <small>
                    {selectedReassignService
                      ? `${selectedReassignService.code} · приоритет ${selectedReassignService.priority}`
                      : 'Нажмите, чтобы открыть список услуг'}
                  </small>
                </span>
              </button>
              {reassignServiceListOpen && (
                <div className="touch-choice-popover">
                  <input
                    className="touch-choice-search"
                    placeholder="Найти услугу"
                    value={reassignServiceQuery}
                    onChange={(event) => setReassignServiceQuery(event.target.value)}
                  />
                  <div className="touch-choice-list" role="radiogroup" aria-label="Новая услуга">
                    {activeServices.length === 0 && <div className="touch-choice-empty">Активных услуг пока нет</div>}
                    {activeServices.length > 0 && filteredReassignServices.length === 0 && (
                      <div className="touch-choice-empty">Услуги не найдены</div>
                    )}
                    {filteredReassignServices.map((service) => {
                      const selected = reassignServiceId === String(service.id)

                      return (
                        <button
                          className={selected ? 'touch-choice selected' : 'touch-choice'}
                          disabled={ticketActionSaving}
                          key={service.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => {
                            const nextServiceId = String(service.id)
                            const currentProgramId =
                              selectedMyWindowTicket.educational_program_id === null
                                ? ''
                                : String(selectedMyWindowTicket.educational_program_id)

                            setReassignServiceId(nextServiceId)
                            setReassignServiceLanguage('')
                            setReassignProgramQuery('')
                            setReassignProgramListOpen(false)
                            setReassignServiceListOpen(false)
                            setReassignProgramId(
                              service.requires_educational_program ? reassignProgramId || currentProgramId : '',
                            )
                          }}
                        >
                          <span>
                            <strong>{service.name}</strong>
                            <small>
                              {service.code} · приоритет {service.priority}
                              {service.requires_educational_program ? ' · нужна ОП' : ''}
                            </small>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
                )}
            </div>
            <div className="touch-choice-field">
              <span className="profile-label">ОП</span>
              {selectedReassignService?.requires_educational_program ? (
                <>
                  <button
                    className="touch-choice-trigger"
                    type="button"
                    aria-expanded={reassignProgramListOpen}
                    onClick={() => setReassignProgramListOpen((isOpen) => !isOpen)}
                  >
                    <span>
                      <strong>{selectedReassignProgram?.name ?? 'Выберите ОП'}</strong>
                      <small>
                        {selectedReassignProgram
                          ? `${selectedReassignProgram.code} · ${getDegreeLabel(academicDegrees, selectedReassignProgram.academic_degree_id)}`
                          : 'Нажмите, чтобы открыть список ОП'}
                      </small>
                    </span>
                  </button>
                  {reassignProgramListOpen && (
                    <div className="touch-choice-popover">
                      <input
                        className="touch-choice-search"
                        placeholder="Найти ОП"
                        value={reassignProgramQuery}
                        onChange={(event) => setReassignProgramQuery(event.target.value)}
                      />
                      <div className="touch-choice-list" role="radiogroup" aria-label="ОП">
                        {activeEducationalPrograms.length === 0 && (
                          <div className="touch-choice-empty">Активных ОП пока нет</div>
                        )}
                        {activeEducationalPrograms.length > 0 && filteredReassignPrograms.length === 0 && (
                          <div className="touch-choice-empty">ОП не найдены</div>
                        )}
                        {filteredReassignPrograms.map((program) => {
                          const selected = reassignProgramId === String(program.id)

                          return (
                            <button
                              className={selected ? 'touch-choice selected' : 'touch-choice'}
                              disabled={ticketActionSaving}
                              key={program.id}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => {
                                setReassignProgramId(String(program.id))
                                setReassignProgramListOpen(false)
                              }}
                            >
                              <span>
                                <strong>{program.name}</strong>
                                <small>
                                  {program.code} · {getDegreeLabel(academicDegrees, program.academic_degree_id)}
                                </small>
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="touch-choice-empty">ОП не требуется</div>
              )}
            </div>
            {selectedReassignService?.requires_service_language ? (
              <div className="touch-choice-field">
                <span className="profile-label">Язык обслуживания</span>
                <select
                  className="reassign-select"
                  disabled={ticketActionSaving}
                  required={selectedReassignService.requires_service_language}
                  value={reassignServiceLanguage}
                  onChange={(event) => setReassignServiceLanguage(event.target.value as ServiceLanguage | '')}
                >
                  <option value="">Выберите язык обслуживания</option>
                  {serviceLanguageOptions.map((option) => (
                    <option value={option.value} key={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="modal-actions">
              <button
                className="primary-action compact"
                type="button"
                disabled={ticketActionSaving || selectedMyWindowTicket.status !== 'CALLED'}
                onClick={() => completeMyWindowTicket(selectedMyWindowTicket)}
              >
                Завершить
              </button>
              <button
                className="danger-action"
                type="button"
                disabled={ticketActionSaving || selectedMyWindowTicket.status !== 'CALLED'}
                onClick={() => skipMyWindowTicket(selectedMyWindowTicket)}
              >
                Не явился
              </button>
              <button className="primary-action compact" type="submit" disabled={ticketActionSaving}>
                Переназначить услугу
              </button>
            </div>
          </form>
        </AdminModal>
      )}

      {selectedReceptionTicket !== null && (
        <AdminModal title={`Регистратура: талон ${selectedReceptionTicket.ticket_number}`} onClose={closeReceptionTicketDetails} size="wide">
          <div className="ticket-detail-grid">
            <div>
              <span className="profile-label">Абитуриент</span>
              <strong>{selectedReceptionTicket.full_name ?? 'Не указано'}</strong>
              <p>{selectedReceptionTicket.iin ?? 'ИИН не указан'}</p>
            </div>
            <div>
              <span className="profile-label">Текущая услуга</span>
              <strong>{selectedReceptionTicket.service_name ?? selectedReceptionTicket.service_id}</strong>
              <p>{getEducationalProgramDisplayLabel(selectedReceptionTicket)}</p>
            </div>
            <div>
              <span className="profile-label">Язык обучения</span>
              <strong>{getStudyLanguageLabel(selectedReceptionTicket.study_language)}</strong>
            </div>
            <div>
              <span className="profile-label">Статус</span>
              <strong>{getTicketStatusLabel(selectedReceptionTicket.status)}</strong>
              <p>Создан: {new Date(selectedReceptionTicket.created_at).toLocaleString()}</p>
            </div>
            <div>
              <span className="profile-label">Ответственный оператор</span>
              <strong>
                {selectedReceptionTicket.operator_name ??
                  selectedReceptionTicket.operator_email ??
                  selectedReceptionTicket.operator_id ??
                  'Не назначен'}
              </strong>
              <p>Окно: {selectedReceptionTicket.window_name ?? selectedReceptionTicket.window_id ?? 'Не указано'}</p>
            </div>
          </div>

          <form className="admin-form modal-form ticket-admission-form" onSubmit={saveReceptionTicketApplicantData}>
            <div className="ticket-form-grid">
              <input
                required
                autoFocus
                inputMode="numeric"
                pattern="[0-9]{12}"
                maxLength={12}
                minLength={12}
                placeholder="ИИН абитуриента"
                value={acceptIin}
                onChange={(event) => setAcceptIin(event.target.value.replace(/\D/g, '').slice(0, 12))}
              />
              <select
                required
                value={acceptStudyLanguage}
                onChange={(event) => setAcceptStudyLanguage(parseStudyLanguage(event.target.value) ?? '')}
              >
                <option value="">Выберите язык обучения</option>
                {studyLanguageOptions.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button className="secondary-action compact" type="submit" disabled={ticketActionSaving}>
                Сохранить данные
              </button>
            </div>
          </form>

          <form className="admin-form modal-form touch-reassign-form" onSubmit={reassignReceptionTicket}>
            <div className="touch-choice-field">
              <span className="profile-label">Новая услуга</span>
              <button
                className="touch-choice-trigger"
                type="button"
                aria-expanded={reassignServiceListOpen}
                onClick={() => setReassignServiceListOpen((isOpen) => !isOpen)}
              >
                <span>
                  <strong>{selectedReassignService?.name ?? 'Выберите услугу'}</strong>
                  <small>
                    {selectedReassignService
                      ? `${selectedReassignService.code} · приоритет ${selectedReassignService.priority}`
                      : 'Нажмите, чтобы открыть список услуг'}
                  </small>
                </span>
              </button>
              {reassignServiceListOpen && (
                <div className="touch-choice-popover">
                  <input
                    className="touch-choice-search"
                    placeholder="Найти услугу"
                    value={reassignServiceQuery}
                    onChange={(event) => setReassignServiceQuery(event.target.value)}
                  />
                  <div className="touch-choice-list" role="radiogroup" aria-label="Новая услуга">
                    {activeServices.length === 0 && <div className="touch-choice-empty">Активных услуг пока нет</div>}
                    {activeServices.length > 0 && filteredReassignServices.length === 0 && (
                      <div className="touch-choice-empty">Услуги не найдены</div>
                    )}
                    {filteredReassignServices.map((service) => {
                      const selected = reassignServiceId === String(service.id)

                      return (
                        <button
                          className={selected ? 'touch-choice selected' : 'touch-choice'}
                          disabled={ticketActionSaving}
                          key={service.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => {
                            const currentProgramId =
                              selectedReceptionTicket.educational_program_id === null
                                ? ''
                                : String(selectedReceptionTicket.educational_program_id)

                            setReassignServiceId(String(service.id))
                            setReassignServiceLanguage('')
                            setReassignProgramQuery('')
                            setReassignProgramListOpen(false)
                            setReassignServiceListOpen(false)
                            setReassignProgramId(
                              service.requires_educational_program ? reassignProgramId || currentProgramId : '',
                            )
                          }}
                        >
                          <span>
                            <strong>{service.name}</strong>
                            <small>
                              {service.code} · приоритет {service.priority}
                              {service.requires_educational_program ? ' · нужна ОП' : ''}
                            </small>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
                )}
            </div>
            <div className="touch-choice-field">
              <span className="profile-label">ОП</span>
              {selectedReassignService?.requires_educational_program ? (
                <>
                  <button
                    className="touch-choice-trigger"
                    type="button"
                    aria-expanded={reassignProgramListOpen}
                    onClick={() => setReassignProgramListOpen((isOpen) => !isOpen)}
                  >
                    <span>
                      <strong>{selectedReassignProgram?.name ?? 'Выберите ОП'}</strong>
                      <small>
                        {selectedReassignProgram
                          ? `${selectedReassignProgram.code} · ${getDegreeLabel(academicDegrees, selectedReassignProgram.academic_degree_id)}`
                          : 'Нажмите, чтобы открыть список ОП'}
                      </small>
                    </span>
                  </button>
                  {reassignProgramListOpen && (
                    <div className="touch-choice-popover">
                      <input
                        className="touch-choice-search"
                        placeholder="Найти ОП"
                        value={reassignProgramQuery}
                        onChange={(event) => setReassignProgramQuery(event.target.value)}
                      />
                      <div className="touch-choice-list" role="radiogroup" aria-label="ОП">
                        {activeEducationalPrograms.length === 0 && (
                          <div className="touch-choice-empty">Активных ОП пока нет</div>
                        )}
                        {activeEducationalPrograms.length > 0 && filteredReassignPrograms.length === 0 && (
                          <div className="touch-choice-empty">ОП не найдены</div>
                        )}
                        {filteredReassignPrograms.map((program) => {
                          const selected = reassignProgramId === String(program.id)

                          return (
                            <button
                              className={selected ? 'touch-choice selected' : 'touch-choice'}
                              disabled={ticketActionSaving}
                              key={program.id}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => {
                                setReassignProgramId(String(program.id))
                                setReassignProgramListOpen(false)
                              }}
                            >
                              <span>
                                <strong>{program.name}</strong>
                                <small>
                                  {program.code} · {getDegreeLabel(academicDegrees, program.academic_degree_id)}
                                </small>
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="touch-choice-empty">ОП не требуется</div>
              )}
            </div>
            <div className="modal-actions">
              <button className="primary-action compact" type="submit" disabled={ticketActionSaving}>
                Переназначить услугу
              </button>
            </div>
          </form>

          {selectedReassignService?.requires_service_language ? (
            <div className="touch-choice-field">
              <span className="profile-label">Язык обслуживания</span>
              <select
                className="reassign-select"
                disabled={ticketActionSaving}
                required={selectedReassignService.requires_service_language}
                value={reassignServiceLanguage}
                onChange={(event) => setReassignServiceLanguage(event.target.value as ServiceLanguage | '')}
              >
                <option value="">Выберите язык обслуживания</option>
                {serviceLanguageOptions.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="modal-actions">
            <button
              className="primary-action compact"
              type="button"
              disabled={ticketActionSaving}
              onClick={() => completeReceptionTicket(selectedReceptionTicket)}
            >
              Завершить
            </button>
            <button
              className="danger-action"
              type="button"
              disabled={ticketActionSaving}
              onClick={() => skipReceptionTicket(selectedReceptionTicket)}
            >
              Не явился
            </button>
          </div>
        </AdminModal>
      )}

      {receptionError && activeSection !== 'reception' && (
        <AdminModal title="Ошибка" onClose={() => setReceptionError('')} size="small">
          <div className="error-dialog">
            <div className="error-dialog-icon" aria-hidden="true">
              !
            </div>
            <div>
              <strong>Не удалось выполнить действие</strong>
              <p>{receptionError}</p>
            </div>
          </div>
          <div className="modal-actions">
            <button className="primary-action compact" type="button" onClick={() => setReceptionError('')}>
              Понятно
            </button>
          </div>
        </AdminModal>
      )}

      {myWindowError && (
        <AdminModal title="Ошибка" onClose={() => setMyWindowError('')} size="small">
          <div className="error-dialog">
            <div className="error-dialog-icon" aria-hidden="true">
              !
            </div>
            <div>
              <strong>Не удалось выполнить действие</strong>
              <p>{myWindowError}</p>
            </div>
          </div>
          <div className="modal-actions">
            <button className="primary-action compact" type="button" onClick={() => setMyWindowError('')}>
              Понятно
            </button>
          </div>
        </AdminModal>
      )}

      {deleteTarget !== null && (
        <AdminModal title="Подтверждение удаления" onClose={() => setDeleteTarget(null)} size="small">
          <div className="delete-confirmation">
            <p>Вы действительно хотите удалить запись?</p>
            <strong>{deleteTarget.label}</strong>
          </div>
          <div className="modal-actions">
            <button className="secondary-action compact" type="button" onClick={() => setDeleteTarget(null)}>
              Отмена
            </button>
            <button className="danger-action" type="button" onClick={confirmDelete}>
              Удалить
            </button>
          </div>
        </AdminModal>
      )}
    </div>
  )
}

function CrudTable({
  columns,
  loading,
  rowClassNames,
  rowKeys,
  rows,
}: {
  columns: string[]
  loading: boolean
  rowClassNames?: string[]
  rowKeys?: Array<string | number>
  rows: Array<Array<string | number | ReactNode>>
}) {
  return (
    <div className="queue-panel">
      <div className="queue-table-wrap">
        <table className="queue-table admin-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={columns.length}>Загрузка...</td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={columns.length}>Данных пока нет</td>
              </tr>
            )}
            {!loading &&
              rows.map((row, rowIndex) => (
                <tr className={rowClassNames?.[rowIndex]} key={rowKeys?.[rowIndex] ?? rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>{cell}</td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
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

function AdminModal({
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

function ModalActions({ onCancel, submitText }: { onCancel: () => void; submitText: string }) {
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
