import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, MouseEvent } from 'react'
import {
  adminApi,
  type AcademicDegreeItem,
  type AcademicDegreePayload,
  type ApplicantItem,
  type ApplicantPayload,
  type ApplicantReportItem,
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
  type TicketCreatePayload,
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
import {
  loadAdminCrudPageData,
  loadAdminProfilePageData,
  type AdminDashboardPageData,
} from './dashboard-loaders'
import { AdminModal } from './components/AdminModal'
import { CrudTable } from './components/CrudTable'
import { ModalActions } from './components/ModalActions'
import {
  boolLabel,
  getDegreeLabel,
  getUserLabel,
  getWindowLabel,
  operatorStatusLabels,
} from './dashboard-formatters'
import {
  ANALYTICS_SELECTION_STORAGE_KEY,
  LANG_STORAGE_KEY,
  buildAnalyticsDataScopeKey,
  buildOperatorDisplayPath,
  buildSectionPath,
  canUseOperatorSection,
  getAnalyticsSelectionFromPath,
  getInitialAnalyticsSelection,
  getInitialLang,
  getSavedAnalyticsSelection,
  getSectionFromPath,
  isCrudSection,
  isSpecificAnalyticsOperatorSelection,
  languages,
  sectionLabels,
  type AnalyticsSelection,
  type CrudSection,
  type DashboardSection,
  type Lang,
} from './dashboard-routing'
import {
  getTicketEventChangeRows,
  getTicketEventDetailRows,
  getTicketEventMetadataText,
  getTicketEventTicketLabel,
} from './dashboard-ticket-events'
import {
  AcademicDegreesRoute,
  ApplicantsRoute,
  EducationalProgramsRoute,
  OperatorsRoute,
  ServicesRoute,
  TicketEventsRoute,
  UsersRoute,
  WindowsRoute,
} from './routes'
import './dashboard-page.css'

type MyWindowRealtimeStatus = 'connecting' | 'connected' | 'disconnected'
type MyWindowTicketHighlight = 'new' | 'updated'
type AnalyticsTimeGrouping = 'day' | 'month'
type AnalyticsPieSegment = {
  color: string
  detail: string
  label: string
  value: number
}
type AnalyticsVisiblePieSegment = {
  currentOffset: number
  midpointRadians: number
  percent: number
  segment: AnalyticsPieSegment
}
type AnalyticsDistributionItem = {
  id: string
  label: string
  value: number
}
type TicketEventActionBreakdownRow = {
  id: string
  label: string
  total: number
}
type ApplicantReportStageId =
  | 'saved_not_submitted'
  | 'accepted_unconfirmed'
  | 'accepted_confirmed'
  | 'unknown'
type ApplicantReportRecord = {
  documentsAccepted: string
  documentsReturned: string
  fullName: string
  iin: string | null
  stage: ApplicantReportStageId
  status: string
}
type ApplicantReportFunnelStage = {
  color: string
  id: Exclude<ApplicantReportStageId, 'unknown'>
  label: string
  percentOfMatched: number
  percentOfTickets: number
  value: number
}
type ApplicantReportAnalysis = {
  duplicateReportIinCount: number
  fileName: string
  isLatestFallback: boolean
  matchedIinCount: number
  matchedTicketCount: number
  matchPercent: number
  reportDate: string
  reportIinCount: number
  recognizedMatchedCount: number
  rowCount: number
  rowsWithoutIinCount: number
  stages: ApplicantReportFunnelStage[]
  ticketsWithIinCount: number
  uniqueTicketIinCount: number
  unmatchedReportIinCount: number
  unmatchedTicketIinCount: number
  unknownMatchedCount: number
}
type ApplicantReportFunnelItem = {
  color: string
  detail: string
  id: string
  label: string
  value: number
  widthPercent: number
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
type TicketCreateFormState = {
  service_id: string
  educational_program_id: string
  study_language: StudyLanguage | ''
  service_language: ServiceLanguage | ''
}

const ANALYTICS_OPERATORS_SELECTION = 'operators'
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
const WAITING_TICKET_EVENT_STATUSES = new Set(['WAITING'])
const APPLICANT_REPORT_STAGE_DEFINITIONS: Array<{
  color: string
  id: Exclude<ApplicantReportStageId, 'unknown'>
  label: string
}> = [
  {
    color: '#b45309',
    id: 'saved_not_submitted',
    label: 'Сохранено, не подано',
  },
  {
    color: '#2563eb',
    id: 'accepted_unconfirmed',
    label: 'Принято, не подтверждено оригиналами документов',
  },
  {
    color: '#0f766e',
    id: 'accepted_confirmed',
    label: 'Принято и подтверждено оригиналами документов',
  },
]
const APPLICANT_REPORT_STATUS_ALIASES: Record<Exclude<ApplicantReportStageId, 'unknown'>, string[]> = {
  accepted_confirmed: [
    'Принято и подтверждено оригиналами документов',
    'Принято, подтверждено оригиналами документов',
    'Принято подтверждено оригиналами документов',
  ],
  accepted_unconfirmed: [
    'Принято, не подтверждено оригиналами документов',
    'Принято не подтверждено оригиналами документов',
    'Принято, не подтверждено оригиналами',
  ],
  saved_not_submitted: ['Сохранено, не подано', 'Сохранено не подано', 'Не подано'],
}
const APPLICANT_REPORT_HEADER_ALIASES = {
  documentsAccepted: ['документы приняты', 'документы принятые', 'оригиналы документов приняты'],
  documentsReturned: ['документы возвращены', 'документы возвращенные', 'оригиналы документов возвращены'],
  fullName: ['полное имя', 'фио', 'ф.и.о.', 'фамилия имя отчество'],
  iin: ['иин', 'жсн', 'iin', 'иин абитуриента', 'жсн абитуриента'],
  status: ['статус', 'статус заявления', 'status', 'application status'],
}
const ANALYTICS_QUICK_MONTHS = [
  { label: 'Июнь', month: 6 },
  { label: 'Июль', month: 7 },
  { label: 'Август', month: 8 },
]
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
const emptyTicketCreateForm: TicketCreateFormState = {
  service_id: '',
  educational_program_id: '',
  study_language: '',
  service_language: '',
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
const ticketEventStatusLabels: Record<string, string> = {
  DECLINED: 'Отказано',
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
      {name === 'upload' && <path d="M12 20V10M8 14l4-4 4 4M5 4h14v4M5 20h14" />}
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
  const visibleSegments = segments.filter((segment) => segment.value > 0)
  const visibleSegmentsWithGeometry = visibleSegments.reduce<{
    offset: number
    rows: AnalyticsVisiblePieSegment[]
  }>(
    (result, segment) => {
      const percent = total > 0 ? (segment.value / total) * 100 : 0
      const currentOffset = result.offset
      const midpoint = currentOffset + percent / 2
      const midpointRadians = (midpoint / 100) * Math.PI * 2 - Math.PI / 2

      return {
        offset: result.offset + percent,
        rows: [
          ...result.rows,
          {
            currentOffset,
            midpointRadians,
            percent,
            segment,
          },
        ],
      }
    },
    { offset: 0, rows: [] },
  ).rows

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
        {visibleSegmentsWithGeometry.map(({ currentOffset, midpointRadians, percent, segment }) => {
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

function ApplicantReportFunnel({ analysis }: { analysis: ApplicantReportAnalysis }) {
  return (
    <div className="applicant-funnel-visual">
      {buildApplicantReportFunnelItems(analysis).map((item) => (
        <div className="applicant-funnel-step" key={item.id}>
          <div
            className={`applicant-funnel-block${item.value === 0 ? ' empty' : ''}`}
            style={{
              background: item.color,
              width: item.value > 0 ? `${item.widthPercent}%` : '44px',
            }}
          >
            <strong>{item.value}</strong>
          </div>
          <div className="applicant-funnel-caption">
            <strong>{item.label}</strong>
            <span>{item.detail}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function TicketEventActionDonutPanel({
  eyebrow = 'Действия без ожидания',
  emptyLabel,
  segments,
  title,
  total,
}: {
  eyebrow?: string
  emptyLabel: string
  segments: AnalyticsPieSegment[]
  title: string
  total: number
}) {
  return (
    <div className="analytics-event-donut-panel">
      <div className="analytics-card-header">
        <div>
          <span className="profile-label">{eyebrow}</span>
          <h3>{title}</h3>
        </div>
        <span className="analytics-status">{total} действий</span>
      </div>

      {segments.length === 0 ? (
        <div className="analytics-empty">{emptyLabel}</div>
      ) : (
        <div className="analytics-event-donut-content">
          <AnalyticsDonutChart
            centerLabel="действий"
            centerValue={total}
            segments={segments}
            total={total}
          />
        </div>
      )}
    </div>
  )
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

function normalizeReportValue(value: string) {
  return value
    .replace(/\uFEFF/g, '')
    .replace(/\u00a0/g, ' ')
    .trim()
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
}

function normalizeReportStatus(value: string) {
  return normalizeReportValue(value)
    .replace(/[.,:;()[\]{}"']/g, '')
    .replace(/\s+/g, ' ')
}

function normalizeReportHeader(value: string) {
  return normalizeReportValue(value)
    .replace(/[.,:;()[\]{}"']/g, '')
    .replace(/\s+/g, ' ')
}

function findApplicantReportColumn(headers: string[], aliases: string[]) {
  const normalizedAliases = aliases.map(normalizeReportHeader)
  return headers.findIndex((header) => normalizedAliases.includes(header))
}

function getDelimitedSeparatorCount(line: string, separator: string) {
  let count = 0
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]

    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (!inQuotes && character === separator) {
      count += 1
    }
  }

  return count
}

function detectApplicantReportSeparator(text: string) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim()).slice(0, 10)
  const separators = ['\t', ';', ',']

  return separators
    .map((separator) => ({
      separator,
      score: lines.reduce((total, line) => total + getDelimitedSeparatorCount(line, separator), 0),
    }))
    .sort((firstItem, secondItem) => secondItem.score - firstItem.score)[0].separator
}

function parseDelimitedApplicantReportRows(text: string) {
  const separator = detectApplicantReportSeparator(text)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  function pushRow() {
    row.push(cell)
    if (row.some((value) => value.trim())) {
      rows.push(row)
    }
    row = []
    cell = ''
  }

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]

    if (character === '"') {
      if (inQuotes && text[index + 1] === '"') {
        cell += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (!inQuotes && character === separator) {
      row.push(cell)
      cell = ''
      continue
    }

    if (!inQuotes && (character === '\n' || character === '\r')) {
      pushRow()
      if (character === '\r' && text[index + 1] === '\n') {
        index += 1
      }
      continue
    }

    cell += character
  }

  if (cell || row.length > 0) {
    pushRow()
  }

  return rows
}

function parseHtmlApplicantReportRows(text: string) {
  if (!/<table[\s>]/i.test(text)) {
    return null
  }

  const parsedDocument = new DOMParser().parseFromString(text, 'text/html')
  const table = parsedDocument.querySelector('table')

  if (!table) {
    return null
  }

  const rows = Array.from(table.querySelectorAll('tr')).map((tableRow) =>
    Array.from(tableRow.querySelectorAll('th,td')).map((cell) => cell.textContent?.trim() ?? ''),
  )

  return rows.filter((row) => row.some((cell) => cell.trim()))
}

function getApplicantReportHeaderScore(row: string[]) {
  const headers = row.map(normalizeReportHeader)

  return Object.values(APPLICANT_REPORT_HEADER_ALIASES).reduce((score, aliases) => {
    return score + (findApplicantReportColumn(headers, aliases) >= 0 ? 1 : 0)
  }, 0)
}

function getApplicantReportCell(row: string[], index: number) {
  return index >= 0 ? row[index]?.trim() ?? '' : ''
}

function normalizeIin(value: string | null | undefined) {
  const digits = (value ?? '').replace(/\D/g, '')
  return /^\d{12}$/.test(digits) ? digits : null
}

function extractIinFromApplicantReportRow(row: string[]) {
  for (const cell of row) {
    const matches = cell.match(/\d{12}/g) ?? []
    const normalizedMatch = matches.map(normalizeIin).find(Boolean)

    if (normalizedMatch) {
      return normalizedMatch
    }
  }

  return null
}

function hasPositiveApplicantReportValue(value: string) {
  const normalizedValue = normalizeReportValue(value)

  if (!normalizedValue) {
    return false
  }

  return ![
    '-',
    '0',
    'false',
    'no',
    'none',
    'нет',
    'не принят',
    'не принято',
    'не приняты',
    'не подтверждено',
  ].includes(normalizedValue)
}

function getApplicantReportStageByStatus(status: string): ApplicantReportStageId | null {
  const normalizedStatus = normalizeReportStatus(status)

  for (const [stage, aliases] of Object.entries(APPLICANT_REPORT_STATUS_ALIASES) as Array<
    [Exclude<ApplicantReportStageId, 'unknown'>, string[]]
  >) {
    const hasMatchingAlias = aliases.some((alias) => {
      const normalizedAlias = normalizeReportStatus(alias)
      return normalizedStatus === normalizedAlias || normalizedStatus.includes(normalizedAlias)
    })

    if (hasMatchingAlias) {
      return stage
    }
  }

  return null
}

function classifyApplicantReportStage(
  status: string,
  documentsAccepted: string,
  documentsReturned: string,
): ApplicantReportStageId {
  const normalizedStatus = normalizeReportValue(status)
  const exactStatusStage = getApplicantReportStageByStatus(status)
  const documentsAreAccepted = hasPositiveApplicantReportValue(documentsAccepted)
  const documentsAreReturned = hasPositiveApplicantReportValue(documentsReturned)
  const isSaved = normalizedStatus.includes('сохран') || normalizedStatus.includes('saved')
  const isNotSubmitted =
    normalizedStatus.includes('не подан') ||
    normalizedStatus.includes('не подано') ||
    normalizedStatus.includes('not submitted')
  const isAccepted = normalizedStatus.includes('принят') || normalizedStatus.includes('accepted')
  const isNotConfirmed =
    normalizedStatus.includes('не подтвержден') ||
    normalizedStatus.includes('неподтвержден') ||
    normalizedStatus.includes('not confirmed')
  const isConfirmed =
    (normalizedStatus.includes('подтвержден') && !isNotConfirmed) ||
    normalizedStatus.includes('confirmed') ||
    documentsAreAccepted

  if (exactStatusStage) {
    return exactStatusStage
  }

  if (isSaved && (isNotSubmitted || !isAccepted)) {
    return 'saved_not_submitted'
  }

  if ((isAccepted || documentsAreAccepted) && isConfirmed && !isNotConfirmed && !documentsAreReturned) {
    return 'accepted_confirmed'
  }

  if (isAccepted || isNotConfirmed || documentsAreReturned) {
    return 'accepted_unconfirmed'
  }

  if (isSaved || isNotSubmitted) {
    return 'saved_not_submitted'
  }

  return 'unknown'
}

function getApplicantReportStageRank(stage: ApplicantReportStageId) {
  if (stage === 'accepted_confirmed') {
    return 3
  }

  if (stage === 'accepted_unconfirmed') {
    return 2
  }

  if (stage === 'saved_not_submitted') {
    return 1
  }

  return 0
}

function parseApplicantReportRecords(text: string) {
  const rows = parseHtmlApplicantReportRows(text) ?? parseDelimitedApplicantReportRows(text)

  if (rows.length < 2) {
    throw new Error('В файле не найдена таблица отчета')
  }

  const headerIndex = rows.reduce(
    (bestIndex, row, index) =>
      getApplicantReportHeaderScore(row) > getApplicantReportHeaderScore(rows[bestIndex]) ? index : bestIndex,
    0,
  )
  const headers = rows[headerIndex].map(normalizeReportHeader)
  const fullNameIndex = findApplicantReportColumn(headers, APPLICANT_REPORT_HEADER_ALIASES.fullName)
  const iinIndex = findApplicantReportColumn(headers, APPLICANT_REPORT_HEADER_ALIASES.iin)
  const statusIndex = findApplicantReportColumn(headers, APPLICANT_REPORT_HEADER_ALIASES.status)
  const documentsAcceptedIndex = findApplicantReportColumn(
    headers,
    APPLICANT_REPORT_HEADER_ALIASES.documentsAccepted,
  )
  const documentsReturnedIndex = findApplicantReportColumn(
    headers,
    APPLICANT_REPORT_HEADER_ALIASES.documentsReturned,
  )
  const dataRows = rows.slice(headerIndex + 1).filter((row) => row.some((cell) => cell.trim()))

  if (dataRows.length === 0) {
    throw new Error('В отчете нет строк с абитуриентами')
  }

  return dataRows.map<ApplicantReportRecord>((row) => {
    const documentsAccepted = getApplicantReportCell(row, documentsAcceptedIndex)
    const documentsReturned = getApplicantReportCell(row, documentsReturnedIndex)
    const status = getApplicantReportCell(row, statusIndex)

    return {
      documentsAccepted,
      documentsReturned,
      fullName: getApplicantReportCell(row, fullNameIndex),
      iin: normalizeIin(getApplicantReportCell(row, iinIndex)) ?? extractIinFromApplicantReportRow(row),
      stage: classifyApplicantReportStage(status, documentsAccepted, documentsReturned),
      status,
    }
  })
}

function buildApplicantReportAnalysis(
  fileName: string,
  text: string,
  tickets: TicketItem[],
  reportDate: string,
  isLatestFallback = false,
): ApplicantReportAnalysis {
  const records = parseApplicantReportRecords(text)
  const ticketCountsByIin = new Map<string, number>()
  let ticketsWithIinCount = 0

  tickets.forEach((ticket) => {
    const iin = normalizeIin(ticket.iin)

    if (!iin) {
      return
    }

    ticketsWithIinCount += 1
    ticketCountsByIin.set(iin, (ticketCountsByIin.get(iin) ?? 0) + 1)
  })

  const reportRowsByIin = new Map<string, ApplicantReportRecord>()
  const reportIinOccurrences = new Map<string, number>()
  let rowsWithoutIinCount = 0

  records.forEach((record) => {
    if (!record.iin) {
      rowsWithoutIinCount += 1
      return
    }

    const currentRecord = reportRowsByIin.get(record.iin)
    reportIinOccurrences.set(record.iin, (reportIinOccurrences.get(record.iin) ?? 0) + 1)

    if (!currentRecord || getApplicantReportStageRank(record.stage) > getApplicantReportStageRank(currentRecord.stage)) {
      reportRowsByIin.set(record.iin, record)
    }
  })

  const stageCounts: Record<ApplicantReportStageId, number> = {
    accepted_confirmed: 0,
    accepted_unconfirmed: 0,
    saved_not_submitted: 0,
    unknown: 0,
  }
  let matchedIinCount = 0
  let matchedTicketCount = 0
  let unmatchedTicketIinCount = 0

  ticketCountsByIin.forEach((ticketCount, iin) => {
    const reportRecord = reportRowsByIin.get(iin)

    if (!reportRecord) {
      unmatchedTicketIinCount += 1
      return
    }

    matchedIinCount += 1
    matchedTicketCount += ticketCount
    stageCounts[reportRecord.stage] += 1
  })

  let unmatchedReportIinCount = 0
  reportRowsByIin.forEach((_record, iin) => {
    if (!ticketCountsByIin.has(iin)) {
      unmatchedReportIinCount += 1
    }
  })

  const uniqueTicketIinCount = ticketCountsByIin.size
  const recognizedMatchedCount =
    stageCounts.saved_not_submitted + stageCounts.accepted_unconfirmed + stageCounts.accepted_confirmed

  return {
    duplicateReportIinCount: [...reportIinOccurrences.values()].filter((count) => count > 1).length,
    fileName,
    isLatestFallback,
    matchedIinCount,
    matchedTicketCount,
    matchPercent: uniqueTicketIinCount > 0 ? Math.round((matchedIinCount / uniqueTicketIinCount) * 100) : 0,
    reportDate,
    recognizedMatchedCount,
    reportIinCount: reportRowsByIin.size,
    rowCount: records.length,
    rowsWithoutIinCount,
    stages: APPLICANT_REPORT_STAGE_DEFINITIONS.map((stage) => ({
      ...stage,
      percentOfMatched: matchedIinCount > 0 ? Math.round((stageCounts[stage.id] / matchedIinCount) * 100) : 0,
      percentOfTickets: uniqueTicketIinCount > 0 ? Math.round((stageCounts[stage.id] / uniqueTicketIinCount) * 100) : 0,
      value: stageCounts[stage.id],
    })),
    ticketsWithIinCount,
    uniqueTicketIinCount,
    unmatchedReportIinCount,
    unmatchedTicketIinCount,
    unknownMatchedCount: stageCounts.unknown,
  }
}

function countReplacementCharacters(value: string) {
  return (value.match(/\uFFFD/g) ?? []).length
}

function decodeApplicantReportText(buffer: ArrayBuffer) {
  const utf8Text = new TextDecoder('utf-8').decode(buffer)

  if (countReplacementCharacters(utf8Text) === 0) {
    return utf8Text
  }

  try {
    const windowsText = new TextDecoder('windows-1251').decode(buffer)
    return countReplacementCharacters(windowsText) < countReplacementCharacters(utf8Text)
      ? windowsText
      : utf8Text
  } catch {
    return utf8Text
  }
}

function isUnsupportedSpreadsheetFile(fileName: string, buffer: ArrayBuffer) {
  const lowerFileName = fileName.toLowerCase()
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 4))

  return (
    lowerFileName.endsWith('.xlsx') ||
    lowerFileName.endsWith('.xlsm') ||
    lowerFileName.endsWith('.xlsb') ||
    (bytes[0] === 0x50 && bytes[1] === 0x4b)
  )
}

function getApplicantFunnelStepWidth(value: number, total: number) {
  if (value <= 0 || total <= 0) {
    return 0
  }

  return Math.max(6, Math.round((value / total) * 100))
}

function buildApplicantReportFunnelItems(analysis: ApplicantReportAnalysis): ApplicantReportFunnelItem[] {
  return [
    {
      color: '#b8bec8',
      detail: `${analysis.ticketsWithIinCount} талонов с ИИН`,
      id: 'ticket-iin-total',
      label: 'Уникальные ИИН по талонам',
      value: analysis.uniqueTicketIinCount,
    },
    {
      color: '#6fac95',
      detail: `${analysis.matchPercent}% от уникальных ИИН по талонам`,
      id: 'matched-iin',
      label: 'Сопоставлено по ИИН',
      value: analysis.matchedIinCount,
    },
    ...analysis.stages.map((stage) => ({
      color: stage.color,
      detail: `${stage.percentOfTickets}% от уникальных ИИН по талонам`,
      id: stage.id,
      label: stage.label,
      value: stage.value,
    })),
  ].map((item) => ({
    ...item,
    widthPercent: getApplicantFunnelStepWidth(item.value, analysis.uniqueTicketIinCount),
  }))
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

function getServiceLanguageLabel(serviceLanguage: ServiceLanguage | null) {
  return serviceLanguage ? studyLanguageLabels[serviceLanguage] : 'Не указан'
}

function parseStudyLanguage(value: string): StudyLanguage | null {
  return studyLanguageOptions.some((option) => option.value === value) ? (value as StudyLanguage) : null
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

function getAnalyticsStatusColor(status: string, index: number) {
  if (status === 'COMPLETED') {
    return ANALYTICS_STATUS_COLORS.completed
  }

  if (status === 'SKIPPED') {
    return ANALYTICS_STATUS_COLORS.skipped
  }

  if (status === 'WAITING' || status === 'CALLED') {
    return ANALYTICS_STATUS_COLORS.active
  }

  if (status === 'DECLINED' || status === 'CANCELLED') {
    return '#be123c'
  }

  return getAnalyticsServiceColor(index)
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

function getAnalyticsMonthDateRange(year: number, month: number) {
  return {
    from: formatDateInputValue(new Date(year, month - 1, 1)),
    to: formatDateInputValue(new Date(year, month, 0)),
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

function getTicketEventStatusLabel(status: string) {
  return ticketEventStatusLabels[status] ?? getTicketStatusLabel(status)
}

function getTicketEventActionStatus(ticketEvent: TicketEventItem) {
  if (ticketEvent.ticket_id === null || ticketEvent.event_type === 'OPERATOR_STATUS_CHANGED') {
    return null
  }

  if (ticketEvent.event_type === 'TICKET_DECLINED') {
    return 'DECLINED'
  }

  if (ticketEvent.new_status === null) {
    return null
  }

  if (ticketEvent.event_type === 'TICKET_CREATED') {
    return ticketEvent.new_status
  }

  if (
    ticketEvent.event_type === 'TICKET_CALLED' ||
    ticketEvent.event_type === 'TICKET_COMPLETED' ||
    ticketEvent.event_type === 'TICKET_SKIPPED'
  ) {
    return ticketEvent.new_status
  }

  if (ticketEvent.old_status !== ticketEvent.new_status) {
    return ticketEvent.new_status
  }

  return null
}

function buildTicketEventStatusDistribution(ticketEvents: TicketEventItem[]) {
  const rowsByStatus = new Map<string, AnalyticsDistributionItem>()

  ticketEvents.forEach((ticketEvent) => {
    const status = getTicketEventActionStatus(ticketEvent)

    if (status === null) {
      return
    }

    const current = rowsByStatus.get(status)

    if (current) {
      current.value += 1
      return
    }

    rowsByStatus.set(status, {
      id: status,
      label: getTicketEventStatusLabel(status),
      value: 1,
    })
  })

  return [...rowsByStatus.values()].sort((firstItem, secondItem) => secondItem.value - firstItem.value)
}

function buildTicketEventActionBreakdown(
  ticketEvents: TicketEventItem[],
  getGroup: (ticketEvent: TicketEventItem) => AnalyticsDistributionItem,
  excludedStatuses = new Set<string>(),
) {
  const rowsByGroup = new Map<string, TicketEventActionBreakdownRow>()

  ticketEvents.forEach((ticketEvent) => {
    const status = getTicketEventActionStatus(ticketEvent)

    if (status === null || excludedStatuses.has(status)) {
      return
    }

    const group = getGroup(ticketEvent)
    const current = rowsByGroup.get(group.id)

    if (current) {
      current.total += 1
      return
    }

    rowsByGroup.set(group.id, {
      id: group.id,
      label: group.label,
      total: 1,
    })
  })

  return [...rowsByGroup.values()].sort(
    (firstItem, secondItem) =>
      secondItem.total - firstItem.total || firstItem.label.localeCompare(secondItem.label, 'ru-RU'),
  )
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

function normalizeChoiceSearch(value: string) {
  return value.trim().toLowerCase()
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
  const [operatorAnalyticsTickets, setOperatorAnalyticsTickets] = useState<TicketItem[]>([])
  const [operatorAnalyticsTicketsScope, setOperatorAnalyticsTicketsScope] = useState<string | null>(null)
  const [analyticsBaseLoaded, setAnalyticsBaseLoaded] = useState(false)
  const [analyticsBaseLoading, setAnalyticsBaseLoading] = useState(false)
  const [analyticsDataScope, setAnalyticsDataScope] = useState<string | null>(null)
  const [analyticsDataLoading, setAnalyticsDataLoading] = useState(false)
  const [analyticsDataError, setAnalyticsDataError] = useState('')
  const [ticketExportingKey, setTicketExportingKey] = useState<string | null>(null)
  const [applicantReportAnalysis, setApplicantReportAnalysis] =
    useState<ApplicantReportAnalysis | null>(null)
  const [operatorApplicantReportAnalysis, setOperatorApplicantReportAnalysis] =
    useState<ApplicantReportAnalysis | null>(null)
  const [savedApplicantReport, setSavedApplicantReport] = useState<ApplicantReportItem | null>(null)
  const [applicantReportDate, setApplicantReportDate] = useState(() => formatDateInputValue(new Date()))
  const [applicantReportError, setApplicantReportError] = useState('')
  const [applicantReportLoading, setApplicantReportLoading] = useState(false)
  const [applicantReportParsing, setApplicantReportParsing] = useState(false)
  const [analyticsDateFrom, setAnalyticsDateFrom] = useState(() => getDefaultSummerDateRange().from)
  const [analyticsDateTo, setAnalyticsDateTo] = useState(() => getDefaultSummerDateRange().to)
  const [analyticsTimeGrouping, setAnalyticsTimeGrouping] = useState<AnalyticsTimeGrouping>('day')
  const [selectedAnalyticsOperatorId, setSelectedAnalyticsOperatorId] = useState<AnalyticsSelection>(() =>
    getInitialAnalyticsSelection(isAdminUser),
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
  const [ticketCreateModalOpen, setTicketCreateModalOpen] = useState(false)
  const [ticketCreateForm, setTicketCreateForm] = useState<TicketCreateFormState>(emptyTicketCreateForm)
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
  const analyticsRequestIdRef = useRef(0)

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
    if (!isAdminUser || activeSection !== 'analytics') {
      return
    }

    if (selectedAnalyticsOperatorId) {
      localStorage.setItem(ANALYTICS_SELECTION_STORAGE_KEY, selectedAnalyticsOperatorId)
    } else {
      localStorage.removeItem(ANALYTICS_SELECTION_STORAGE_KEY)
    }
  }, [activeSection, isAdminUser, selectedAnalyticsOperatorId])

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
      setSelectedAnalyticsOperatorId(nextSection === 'analytics' ? getAnalyticsSelectionFromPath() : null)
    }

    window.addEventListener('popstate', syncSectionFromPath)

    return () => window.removeEventListener('popstate', syncSectionFromPath)
  }, [isAdminUser])

  function navigateToSection(section: DashboardSection, analyticsSelection: AnalyticsSelection = null) {
    if (!isAdminUser && !canUseOperatorSection(section)) {
      section = 'myWindow'
    }

    const nextAnalyticsSelection = section === 'analytics' && isAdminUser ? analyticsSelection : null
    setActiveSection(section)
    setSelectedAnalyticsOperatorId(nextAnalyticsSelection)
    closeFormModal()
    setDeleteTarget(null)
    setProfileMenuOpen(false)

    const sectionPath = buildSectionPath(
      lang,
      section,
      nextAnalyticsSelection,
    )
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`

    if (sectionPath !== currentPath) {
      window.history.pushState(null, '', sectionPath)
    }
  }

  function getAnalyticsDateParams() {
    return {
      date_from: analyticsDateFrom || undefined,
      date_to: analyticsDateTo || undefined,
    }
  }

  function getAnalyticsFilterYear() {
    return (
      parseDateInputValue(analyticsDateFrom)?.getFullYear() ??
      parseDateInputValue(analyticsDateTo)?.getFullYear() ??
      new Date().getFullYear()
    )
  }

  function selectAnalyticsMonth(month: number) {
    const monthRange = getAnalyticsMonthDateRange(getAnalyticsFilterYear(), month)
    setAnalyticsDateFrom(monthRange.from)
    setAnalyticsDateTo(monthRange.to)
  }

  function getSelectedAnalyticsMonth() {
    const fromDate = parseDateInputValue(analyticsDateFrom)
    const toDate = parseDateInputValue(analyticsDateTo)

    if (!fromDate || !toDate || fromDate.getFullYear() !== toDate.getFullYear()) {
      return null
    }

    const month = fromDate.getMonth() + 1
    const monthRange = getAnalyticsMonthDateRange(fromDate.getFullYear(), month)

    return analyticsDateFrom === monthRange.from && analyticsDateTo === monthRange.to ? month : null
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

  function applyAdminDashboardPageData(data: AdminDashboardPageData) {
    if (data.services) {
      setServices(data.services)
    }

    if (data.windows) {
      setWindows(data.windows)
    }

    if (data.users) {
      setUsers(data.users)
    }

    if (data.operators) {
      setOperators(data.operators)
    }

    if (data.academicDegrees) {
      setAcademicDegrees(data.academicDegrees)
    }

    if (data.educationalPrograms) {
      setEducationalPrograms(data.educationalPrograms)
    }

    if (data.applicants) {
      setApplicants(data.applicants)
    }

    if (data.ticketEvents) {
      setTicketEvents(data.ticketEvents)
    }

    if (data.operatorProgramsRows) {
      setOperatorProgramIds(
        Object.fromEntries(
          data.operatorProgramsRows.map((row) => [
            row.operatorId,
            row.programs.map((program) => program.id),
          ]),
        ),
      )
      setOperatorProgramLanguages(
        Object.fromEntries(
          data.operatorProgramsRows.map((row) => [
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
    }

    if (data.operatorServicesRows) {
      setOperatorServiceIds(
        Object.fromEntries(
          data.operatorServicesRows.map((row) => [
            row.operatorId,
            row.services.map((service) => service.id),
          ]),
        ),
      )
      setOperatorServiceLanguages(
        Object.fromEntries(
          data.operatorServicesRows.map((row) => [
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
    }
  }

  async function loadAdminSectionData(section: DashboardSection) {
    if (section === 'analytics' || section === 'myWindow' || section === 'reception') {
      return
    }

    setLoading(true)
    setError('')

    try {
      const data =
        section === 'profile'
          ? await loadAdminProfilePageData(currentUserId)
          : isCrudSection(section)
            ? await loadAdminCrudPageData(section)
            : null

      if (data) {
        applyAdminDashboardPageData(data)

        if (section === 'profile') {
          const currentOperator = data.operators?.find((operator) => operator.user_id === currentUserId)
          const currentOperatorPrograms = data.operatorProgramsRows?.find((row) => row.operatorId === currentOperator?.id)
          const currentOperatorServices = data.operatorServicesRows?.find((row) => row.operatorId === currentOperator?.id)

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
        }
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось загрузить данные')
    } finally {
      setLoading(false)
    }
  }

  async function loadAdminAnalyticsBaseData() {
    if (analyticsBaseLoaded || analyticsBaseLoading) {
      return
    }

    setAnalyticsBaseLoading(true)
    setError('')

    try {
      const [userRows, operatorRows] = await Promise.all([
        adminApi.users.list(),
        adminApi.operators.list(),
      ])

      setUsers(userRows)
      setOperators(operatorRows)
      setAnalyticsBaseLoaded(true)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось загрузить операторов')
    } finally {
      setAnalyticsBaseLoading(false)
    }
  }

  function hasAnalyticsDataForSelection(selection: AnalyticsSelection) {
    if (selection === null) {
      return true
    }

    const requestedScope = buildAnalyticsDataScopeKey(selection, analyticsDateFrom, analyticsDateTo)
    const generalScope = buildAnalyticsDataScopeKey('general', analyticsDateFrom, analyticsDateTo)
    const operatorsScope = buildAnalyticsDataScopeKey(
      ANALYTICS_OPERATORS_SELECTION,
      analyticsDateFrom,
      analyticsDateTo,
    )

    if (selection === 'general') {
      return analyticsDataScope === requestedScope
    }

    if (selection === ANALYTICS_OPERATORS_SELECTION) {
      return analyticsDataScope === operatorsScope || analyticsDataScope === generalScope
    }

    const hasOperatorStats =
      analyticsDataScope === requestedScope ||
      ((analyticsDataScope === generalScope || analyticsDataScope === operatorsScope) &&
        operatorAnalytics.some((stats) => stats.operator_id === selection))

    return hasOperatorStats && operatorAnalyticsTicketsScope === requestedScope
  }

  async function loadAdminAnalyticsData(selection: AnalyticsSelection) {
    if (selection === null || hasAnalyticsDataForSelection(selection)) {
      return
    }

    const requestId = analyticsRequestIdRef.current + 1
    analyticsRequestIdRef.current = requestId
    setAnalyticsDataLoading(true)
    setAnalyticsDataError('')

    try {
      const analyticsDateParams = getAnalyticsDateParams()

      if (selection === 'general') {
        const [analyticsRows, ticketRows, ticketEventRows] = await Promise.all([
          adminApi.ticketEvents.analytics(analyticsDateParams),
          adminApi.tickets.export(analyticsDateParams),
          adminApi.ticketEvents.list({ ...analyticsDateParams, include_metadata: false }),
        ])

        if (analyticsRequestIdRef.current !== requestId) {
          return
        }

        setOperatorAnalytics(analyticsRows)
        setAnalyticsTickets(ticketRows)
        setTicketEvents(ticketEventRows)
        setAnalyticsDataScope(buildAnalyticsDataScopeKey(selection, analyticsDateFrom, analyticsDateTo))
        return
      }

      if (selection === ANALYTICS_OPERATORS_SELECTION) {
        const analyticsRows = await adminApi.ticketEvents.analytics(analyticsDateParams)

        if (analyticsRequestIdRef.current !== requestId) {
          return
        }

        setOperatorAnalytics(analyticsRows)
        setAnalyticsDataScope(buildAnalyticsDataScopeKey(selection, analyticsDateFrom, analyticsDateTo))
        return
      }

      const [analyticsRows, ticketRows] = await Promise.all([
        adminApi.ticketEvents.analytics({
          ...analyticsDateParams,
          operator_id: selection,
        }),
        adminApi.tickets.export({
          ...analyticsDateParams,
          operator_id: selection,
        }),
      ])

      if (analyticsRequestIdRef.current !== requestId) {
        return
      }

      const requestedScope = buildAnalyticsDataScopeKey(selection, analyticsDateFrom, analyticsDateTo)

      setOperatorAnalyticsTickets(ticketRows)
      setOperatorAnalyticsTicketsScope(requestedScope)
      setOperatorAnalytics((currentRows) => {
        const nextRowsByOperatorId = new Map(currentRows.map((row) => [row.operator_id, row]))
        analyticsRows.forEach((row) => nextRowsByOperatorId.set(row.operator_id, row))
        return Array.from(nextRowsByOperatorId.values())
      })
      setAnalyticsDataScope(requestedScope)
    } catch (requestError) {
      if (analyticsRequestIdRef.current === requestId) {
        setAnalyticsDataError(
          requestError instanceof Error ? requestError.message : 'Не удалось загрузить аналитику',
        )
      }
    } finally {
      if (analyticsRequestIdRef.current === requestId) {
        setAnalyticsDataLoading(false)
      }
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
      const [myWindowRows, serviceRows, programRows, degreeRows] = await Promise.all([
        adminApi.tickets.myWindow({
          page: myWindowPage,
          page_size: MY_WINDOW_PAGE_SIZE,
        }),
        adminApi.operators.availableServices(),
        adminApi.operators.availablePrograms(),
        adminApi.operators.availableDegrees(),
      ])

      applyMyWindowData(myWindowRows, animate)
      setMyWindowPage(myWindowRows.page)
      setServices(serviceRows)
      setEducationalPrograms(programRows)
      setAcademicDegrees(degreeRows)
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
      const [receptionRows, serviceRows, programRows, degreeRows] = await Promise.all([
        adminApi.tickets.reception({
          search: receptionSearch,
          service_id: receptionServiceId ? Number(receptionServiceId) : undefined,
          page: receptionPage,
          page_size: MY_WINDOW_PAGE_SIZE,
        }),
        adminApi.services.list(),
        adminApi.educationalPrograms.list(),
        adminApi.academicDegrees.list(),
      ])

      applyReceptionData(receptionRows)
      setReceptionPage(receptionRows.page)
      setServices(serviceRows)
      setEducationalPrograms(programRows)
      setAcademicDegrees(degreeRows)
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
        adminApi.ticketEvents.myAnalytics(getAnalyticsDateParams()),
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
    if (
      !isAdminUser ||
      activeSection === 'analytics' ||
      activeSection === 'myWindow' ||
      activeSection === 'reception'
    ) {
      return
    }

    const timerId = window.setTimeout(() => {
      void loadAdminSectionData(activeSection)
    }, 0)

    return () => window.clearTimeout(timerId)
  }, [activeSection, isAdminUser])

  useEffect(() => {
    if (isAdminUser && activeSection === 'analytics') {
      void loadAdminAnalyticsBaseData()
    }
  }, [activeSection, analyticsBaseLoaded, analyticsBaseLoading, isAdminUser])

  useEffect(() => {
    if (
      isAdminUser &&
      activeSection === 'analytics' &&
      analyticsBaseLoaded &&
      selectedAnalyticsOperatorId !== null
    ) {
      void loadAdminAnalyticsData(selectedAnalyticsOperatorId)
    }
  }, [
    activeSection,
    analyticsBaseLoaded,
    analyticsDataScope,
    analyticsDateFrom,
    analyticsDateTo,
    isAdminUser,
    selectedAnalyticsOperatorId,
  ])

  useEffect(() => {
    const canBuildApplicantReport =
      selectedAnalyticsOperatorId === 'general'
        ? analyticsDataScope === buildAnalyticsDataScopeKey('general', analyticsDateFrom, analyticsDateTo)
        : isSpecificAnalyticsOperatorSelection(selectedAnalyticsOperatorId) &&
          hasAnalyticsDataForSelection(selectedAnalyticsOperatorId)

    if (isAdminUser && activeSection === 'analytics' && canBuildApplicantReport) {
      void loadSavedApplicantReport(applicantReportDate)
    }
  }, [
    activeSection,
    analyticsDataScope,
    analyticsDateFrom,
    analyticsDateTo,
    operatorAnalytics,
    operatorAnalyticsTicketsScope,
    isAdminUser,
    applicantReportDate,
    selectedAnalyticsOperatorId,
  ])

  useEffect(() => {
    if (!savedApplicantReport) {
      return
    }

    try {
      setApplicantReportAnalysis(
        buildApplicantReportAnalysis(
          savedApplicantReport.file_name,
          savedApplicantReport.content,
          analyticsTickets,
          savedApplicantReport.report_date,
          savedApplicantReport.is_latest_fallback,
        ),
      )
      setApplicantReportError('')
    } catch (requestError) {
      setApplicantReportAnalysis(null)
      setApplicantReportError(requestError instanceof Error ? requestError.message : 'Не удалось прочитать сохраненный отчет')
    }
  }, [savedApplicantReport, analyticsTickets])

  useEffect(() => {
    const requestedScope = buildAnalyticsDataScopeKey(
      selectedAnalyticsOperatorId,
      analyticsDateFrom,
      analyticsDateTo,
    )

    if (
      !savedApplicantReport ||
      !isSpecificAnalyticsOperatorSelection(selectedAnalyticsOperatorId) ||
      operatorAnalyticsTicketsScope !== requestedScope
    ) {
      setOperatorApplicantReportAnalysis(null)
      return
    }

    try {
      setOperatorApplicantReportAnalysis(
        buildApplicantReportAnalysis(
          savedApplicantReport.file_name,
          savedApplicantReport.content,
          operatorAnalyticsTickets,
          savedApplicantReport.report_date,
          savedApplicantReport.is_latest_fallback,
        ),
      )
      setApplicantReportError('')
    } catch (requestError) {
      setOperatorApplicantReportAnalysis(null)
      setApplicantReportError(requestError instanceof Error ? requestError.message : 'Не удалось прочитать сохраненный отчет')
    }
  }, [
    analyticsDateFrom,
    analyticsDateTo,
    operatorAnalyticsTickets,
    operatorAnalyticsTicketsScope,
    savedApplicantReport,
    selectedAnalyticsOperatorId,
  ])

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
  }, [activeSection, analyticsDateFrom, analyticsDateTo, isAdminUser])

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

  function closeTicketCreateModal() {
    setTicketCreateModalOpen(false)
    setTicketCreateForm(emptyTicketCreateForm)
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
      await loadAdminSectionData('services')
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
      await loadAdminSectionData('windows')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось сохранить окно')
    }
  }

  async function submitTicketCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setReceptionError('')

    const selectedService = services.find((service) => String(service.id) === ticketCreateForm.service_id)
    const selectedProgram = educationalPrograms.find(
      (program) => String(program.id) === ticketCreateForm.educational_program_id,
    )

    if (!selectedService) {
      setError('Выберите услугу')
      return
    }

    if (selectedService.requires_educational_program && !selectedProgram) {
      setError('Для этой услуги нужно выбрать образовательную программу')
      return
    }

    if (selectedProgram?.requires_service_language && !ticketCreateForm.study_language) {
      setError('Для выбранной ОП нужно выбрать язык обучения')
      return
    }

    if (selectedService.requires_service_language && !ticketCreateForm.service_language) {
      setError('Для этой услуги нужно выбрать язык обслуживания')
      return
    }

    const payload: TicketCreatePayload = {
      service_id: selectedService.id,
      educational_program_id: selectedService.requires_educational_program ? selectedProgram?.id ?? null : null,
      study_language: selectedProgram?.requires_service_language ? ticketCreateForm.study_language || null : null,
      service_language: selectedService.requires_service_language ? ticketCreateForm.service_language || null : null,
    }

    try {
      await adminApi.tickets.create(payload)
      closeTicketCreateModal()
      setReceptionPage(1)

      if (activeSection === 'reception') {
        await loadReceptionData({ silent: true })
      }

      if (activeSection === 'myWindow') {
        await loadMyWindowData({ animate: true, silent: true })
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось создать талон')
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
      await loadAdminSectionData('users')
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
      await loadAdminSectionData('operators')
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
      await loadAdminSectionData('academicDegrees')
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
      await loadAdminSectionData('educationalPrograms')
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
      await loadAdminSectionData('applicants')
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
      await loadAdminSectionData('ticketEvents')
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

      const deletedSection = deleteTarget.section
      setDeleteTarget(null)
      await loadAdminSectionData(deletedSection)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось удалить запись')
    }
  }

  async function exportTicketsCsv(operatorId: string | null, scopeLabel: string) {
    const exportKey = operatorId ?? 'all'

    setTicketExportingKey(exportKey)
    setError('')

    try {
      const tickets = await adminApi.tickets.export({
        ...getAnalyticsDateParams(),
        ...(operatorId ? { operator_id: operatorId } : {}),
      })
      downloadTicketExport(tickets, scopeLabel)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось выгрузить талоны')
    } finally {
      setTicketExportingKey(null)
    }
  }

  async function loadSavedApplicantReport(reportDate = applicantReportDate) {
    setApplicantReportLoading(true)
    setApplicantReportError('')

    try {
      const report = await adminApi.applicantReports.current(reportDate)
      setSavedApplicantReport(report)
    } catch (requestError) {
      setSavedApplicantReport(null)
      setApplicantReportAnalysis(null)
      setOperatorApplicantReportAnalysis(null)

      if (requestError && typeof requestError === 'object' && 'status' in requestError && requestError.status === 404) {
        return
      }

      setApplicantReportError(requestError instanceof Error ? requestError.message : 'Не удалось загрузить сохраненный отчет')
    } finally {
      setApplicantReportLoading(false)
    }
  }

  async function uploadApplicantReport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]

    if (!file) {
      return
    }

    setApplicantReportParsing(true)
    setApplicantReportError('')

    try {
      if (!applicantReportDate) {
        throw new Error('Select report date')
      }

      const buffer = await file.arrayBuffer()

      if (isUnsupportedSpreadsheetFile(file.name, buffer)) {
        throw new Error('Формат .xlsx не поддерживается. Сохраните отчет как CSV, TSV или Excel 97-2003 .xls')
      }

      const text = decodeApplicantReportText(buffer)
      const analysis = buildApplicantReportAnalysis(file.name, text, analyticsTickets, applicantReportDate)
      const savedReport = await adminApi.applicantReports.save({
        content: text,
        file_name: file.name,
        report_date: applicantReportDate,
      })

      setSavedApplicantReport(savedReport)
      setApplicantReportAnalysis(analysis)
    } catch (requestError) {
      setApplicantReportAnalysis(null)
      setApplicantReportError(requestError instanceof Error ? requestError.message : 'Не удалось загрузить отчет')
    } finally {
      setApplicantReportParsing(false)
      event.currentTarget.value = ''
    }
  }

  const selectedTicketEvent =
    editingTicketEventId !== null
      ? ticketEvents.find((ticketEvent) => ticketEvent.id === editingTicketEventId) ?? null
      : null
  const selectedTicketEventDetailRows = selectedTicketEvent
    ? getTicketEventDetailRows(selectedTicketEvent)
    : []
  const selectedTicketEventChangeRows = selectedTicketEvent
    ? getTicketEventChangeRows(selectedTicketEvent)
    : []
  const selectedTicketEventMetadataText = selectedTicketEvent
    ? getTicketEventMetadataText(selectedTicketEvent)
    : ''
  const isEditing =
    (formModal === 'services' && editingServiceId !== null) ||
    (formModal === 'windows' && editingWindowId !== null) ||
    (formModal === 'users' && editingUserId !== null) ||
    (formModal === 'operators' && editingOperatorId !== null) ||
    (formModal === 'academicDegrees' && editingAcademicDegreeId !== null) ||
    (formModal === 'educationalPrograms' && editingEducationalProgramId !== null) ||
    (formModal === 'applicants' && editingApplicantId !== null) ||
    (formModal === 'ticketEvents' && editingTicketEventId !== null)
  const modalTitle =
    formModal === 'ticketEvents' && selectedTicketEvent
      ? `Детали события: ${getTicketEventTicketLabel(selectedTicketEvent)}`
      : formModal === null
        ? ''
        : `${isEditing ? 'Изменить' : 'Создать'}: ${sectionLabels[formModal]}`
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
  const onlineOperatorCount = operators.filter((operator) => operator.status === 'ONLINE').length
  const busyOperatorCount = operators.filter((operator) => operator.status === 'BUSY').length
  const operatorAnalyticsRows = operatorAnalytics.map((stats) => ({
    operator: operators.find((operator) => operator.id === stats.operator_id),
    stats,
  }))
  const operatorAnalyticsRowsByOperatorId = new Map(
    operatorAnalyticsRows.map((row) => [row.stats.operator_id, row]),
  )
  const analyticsOperatorCards = operators.map((operator) => ({
    operator,
    stats: operatorAnalyticsRowsByOperatorId.get(operator.id)?.stats ?? null,
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
  const selectedGeneralAnalytics = isAdminUser && selectedAnalyticsOperatorId === 'general'
  const selectedOperatorsAnalytics = isAdminUser && selectedAnalyticsOperatorId === ANALYTICS_OPERATORS_SELECTION
  const selectedAnalyticsDataReady = hasAnalyticsDataForSelection(selectedAnalyticsOperatorId)
  const selectedOperatorAnalyticsCandidate = selectedAnalyticsOperatorId
    ? selectedAnalyticsOperatorId === 'general' || selectedAnalyticsOperatorId === ANALYTICS_OPERATORS_SELECTION
      ? null
      : operatorAnalyticsRows.find((row) => row.stats.operator_id === selectedAnalyticsOperatorId) ?? null
    : isAdminUser
      ? null
      : operatorAnalyticsRows[0] ?? null
  const selectedOperatorAnalyticsRow =
    isAdminUser && selectedAnalyticsOperatorId !== null && !selectedAnalyticsDataReady
      ? null
      : selectedOperatorAnalyticsCandidate
  const selectedOperatorAnalyticsIsLoading =
    isAdminUser &&
    activeSection === 'analytics' &&
    isSpecificAnalyticsOperatorSelection(selectedAnalyticsOperatorId) &&
    !selectedOperatorAnalyticsRow &&
    !selectedAnalyticsDataReady &&
    !analyticsDataError
  const analyticsExportOperatorId =
    isSpecificAnalyticsOperatorSelection(selectedAnalyticsOperatorId) ? selectedAnalyticsOperatorId : null
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
  const generalServiceLanguageRows = buildTicketDistribution(
    analyticsTickets,
    (ticket) => ticket.service_language ?? 'none',
    (ticket) => getServiceLanguageLabel(ticket.service_language),
  )
  const generalStudyLanguageRows = buildTicketDistribution(
    analyticsTickets,
    (ticket) => ticket.study_language ?? 'none',
    (ticket) => getStudyLanguageLabel(ticket.study_language),
  )
  const generalServicePieSegments = distributionToPieSegments(generalServiceRows, generalTicketsTotal)
  const generalProgramPieSegments = distributionToPieSegments(generalProgramRows, generalTicketsTotal)
  const generalOperatorPieSegments = distributionToPieSegments(generalOperatorRows, generalTicketsTotal)
  const generalServiceLanguagePieSegments = distributionToPieSegments(generalServiceLanguageRows, generalTicketsTotal)
  const generalStudyLanguagePieSegments = distributionToPieSegments(generalStudyLanguageRows, generalTicketsTotal)
  const generalStatusPieSegments = generalStatusRows.map((item, index) => ({
    color: getAnalyticsStatusColor(item.id, index),
    detail: `${generalTicketsTotal > 0 ? Math.round((item.value / generalTicketsTotal) * 100) : 0}% от всех талонов`,
    label: item.label,
    value: item.value,
  }))
  const generalEventStatusRows = buildTicketEventStatusDistribution(ticketEvents)
  const generalEventStatusActionsTotal = generalEventStatusRows.reduce((total, item) => total + item.value, 0)
  const generalEventStatusPieSegments = generalEventStatusRows.map((item, index) => ({
    color: getAnalyticsStatusColor(item.id, index),
    detail: `${generalEventStatusActionsTotal > 0 ? Math.round((item.value / generalEventStatusActionsTotal) * 100) : 0}% от действий талонов`,
    label: item.label,
    value: item.value,
  }))
  const generalTicketById = new Map(analyticsTickets.map((ticket) => [ticket.id, ticket]))
  const generalEventOperatorRows = buildTicketEventActionBreakdown(
    ticketEvents,
    (ticketEvent) => ({
      id: ticketEvent.operator_id ?? 'none',
      label:
        ticketEvent.operator_name ??
        ticketEvent.operator_email ??
        (ticketEvent.operator_id ? ticketEvent.operator_id.slice(0, 8) : 'Регистратура / без оператора'),
      value: 0,
    }),
    WAITING_TICKET_EVENT_STATUSES,
  )
  const generalEventProgramRows = buildTicketEventActionBreakdown(
    ticketEvents,
    (ticketEvent) => {
      const ticket = ticketEvent.ticket_id ? generalTicketById.get(ticketEvent.ticket_id) : undefined

      if (!ticket) {
        return {
          id: 'unknown',
          label: 'Без данных по талону',
          value: 0,
        }
      }

      return {
        id: ticket.educational_program_id === null ? 'none' : String(ticket.educational_program_id),
        label:
          ticket.educational_program_name ??
          ticket.educational_program_code ??
          (ticket.educational_program_id === null
            ? 'Без образовательной программы'
            : `ОП ${ticket.educational_program_id}`),
        value: 0,
      }
    },
    WAITING_TICKET_EVENT_STATUSES,
  )
  const generalEventOperatorActionsTotal = generalEventOperatorRows.reduce((total, item) => total + item.total, 0)
  const generalEventProgramActionsTotal = generalEventProgramRows.reduce((total, item) => total + item.total, 0)
  const generalEventOperatorPieSegments = generalEventOperatorRows.map((item, index) => ({
    color: getAnalyticsServiceColor(index),
    detail: `${generalEventOperatorActionsTotal > 0 ? Math.round((item.total / generalEventOperatorActionsTotal) * 100) : 0}% от действий без ожидания`,
    label: item.label,
    value: item.total,
  }))
  const generalEventProgramPieSegments = generalEventProgramRows.map((item, index) => ({
    color: getAnalyticsServiceColor(index),
    detail: `${generalEventProgramActionsTotal > 0 ? Math.round((item.total / generalEventProgramActionsTotal) * 100) : 0}% от действий без ожидания`,
    label: item.label,
    value: item.total,
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
  const selectedTicketCreateService = activeServices.find(
    (service) => String(service.id) === ticketCreateForm.service_id,
  )
  const selectedTicketCreateProgram = activeEducationalPrograms.find(
    (program) => String(program.id) === ticketCreateForm.educational_program_id,
  )
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
  const selectedAnalyticsMonth = getSelectedAnalyticsMonth()
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
  const analyticsNavSelection = isAdminUser
    ? activeSection === 'analytics'
      ? selectedAnalyticsOperatorId
      : getSavedAnalyticsSelection()
    : null

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
              href={buildSectionPath(lang, section, section === 'analytics' ? analyticsNavSelection : null)}
              key={section}
              onClick={(event) => {
                event.preventDefault()
                navigateToSection(section, section === 'analytics' ? analyticsNavSelection : null)
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
              <button
                className="primary-action compact"
                type="button"
                onClick={() => setTicketCreateModalOpen(true)}
              >
                <Icon name="plus" />
                Создать талон
              </button>
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
          <ServicesRoute
            loading={loading}
            services={services}
            onEdit={(service) => {
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
            onDelete={(service) => setDeleteTarget({ section: 'services', id: service.id, label: service.name })}
          />
        )}

        {activeSection === 'windows' && (
          <WindowsRoute
            loading={loading}
            operators={operators}
            users={users}
            windows={windows}
            onEdit={(windowItem, assignedOperatorId) => {
              setEditingWindowId(windowItem.id)
              setWindowForm({
                name: windowItem.name,
                floor: windowItem.floor ?? '',
                status: windowItem.status,
                current_operator_id: windowItem.current_operator_id,
              })
              setSelectedWindowOperatorId(assignedOperatorId)
              setFormModal('windows')
            }}
            onDelete={(windowItem) =>
              setDeleteTarget({ section: 'windows', id: windowItem.id, label: windowItem.name })
            }
          />
        )}

        {activeSection === 'users' && (
          <UsersRoute
            loading={loading}
            users={users}
            onEdit={(user) => {
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
            onDelete={(user) => setDeleteTarget({ section: 'users', id: user.id, label: user.full_name })}
          />
        )}

        {activeSection === 'operators' && (
          <OperatorsRoute
            analyticsHref={(currentLang, operatorId) => buildSectionPath(currentLang as Lang, 'analytics', operatorId)}
            educationalPrograms={educationalPrograms}
            lang={lang}
            loading={loading}
            operatorProgramIds={operatorProgramIds}
            operatorServiceIds={operatorServiceIds}
            operators={operators}
            services={services}
            users={users}
            windows={windows}
            onOpenAnalytics={(operatorId) => navigateToSection('analytics', operatorId)}
            onEdit={(operator) => {
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
            onDelete={(operator) =>
              setDeleteTarget({
                section: 'operators',
                id: operator.id,
                label: getUserLabel(users, operator.user_id),
              })
            }
          />
        )}

        {activeSection === 'analytics' && (
          <section className="admin-panel tab-panel analytics-section" key="analytics">
            {isAdminUser && (
              <div className="analytics-master">
                {selectedAnalyticsOperatorId ? (
                  <a
                    className="secondary-action compact"
                    href={buildSectionPath(lang, 'analytics')}
                    onClick={(event) => {
                      event.preventDefault()
                      navigateToSection('analytics')
                    }}
                  >
                    <Icon name="grid" />
                    Разделы аналитики
                  </a>
                ) : (
                  <span className="profile-label">Разделы аналитики</span>
                )}
                {selectedAnalyticsOperatorId && (
                  <button
                    className="secondary-action compact"
                    type="button"
                    disabled={ticketExportingKey !== null || loading || analyticsDataLoading}
                    onClick={() => exportTicketsCsv(analyticsExportOperatorId, analyticsExportLabel)}
                  >
                    <Icon name="download" />
                    {ticketExportingKey === analyticsExportKey
                      ? 'Выгрузка...'
                      : analyticsExportOperatorId
                        ? 'Выгрузить талоны'
                        : 'Выгрузить все талоны'}
                  </button>
                )}
              </div>
            )}

            <div className="analytics-date-filter analytics-date-filter-top">
              <div className="analytics-grouping-toggle" role="group" aria-label="Группировка аналитики">
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
              <div className="analytics-month-filter" role="group" aria-label="Быстрый выбор месяца">
                {ANALYTICS_QUICK_MONTHS.map((monthOption) => (
                  <button
                    className={selectedAnalyticsMonth === monthOption.month ? 'selected' : ''}
                    key={monthOption.month}
                    type="button"
                    onClick={() => selectAnalyticsMonth(monthOption.month)}
                  >
                    {monthOption.label}
                  </button>
                ))}
              </div>
            </div>

            {isAdminUser && !selectedOperatorAnalyticsRow && (
              <>
                {!selectedAnalyticsOperatorId && (
                  <div className="analytics-entry-grid">
                    <a
                      className="analytics-employee-card analytics-section-card"
                      href={buildSectionPath(lang, 'analytics', 'general')}
                      onClick={(event) => {
                        event.preventDefault()
                        navigateToSection('analytics', 'general')
                      }}
                    >
                      <div className="analytics-section-card-icon">
                        <Icon name="chart" />
                      </div>
                      <div className="analytics-card-header">
                        <div>
                          <span className="profile-label">Раздел</span>
                          <strong>Общая аналитика</strong>
                        </div>
                        <span className="analytics-status">{operators.length} операторов</span>
                      </div>
                      <div className="analytics-employee-metrics">
                        <span>
                          Операторов
                          <strong>{operators.length}</strong>
                        </span>
                        <span>
                          Готовы
                          <strong>{onlineOperatorCount}</strong>
                        </span>
                        <span>
                          Заняты
                          <strong>{busyOperatorCount}</strong>
                        </span>
                      </div>
                    </a>

                    <a
                      className="analytics-employee-card analytics-section-card"
                      href={buildSectionPath(lang, 'analytics', ANALYTICS_OPERATORS_SELECTION)}
                      onClick={(event) => {
                        event.preventDefault()
                        navigateToSection('analytics', ANALYTICS_OPERATORS_SELECTION)
                      }}
                    >
                      <div className="analytics-section-card-icon">
                        <Icon name="users" />
                      </div>
                      <div className="analytics-card-header">
                        <div>
                          <span className="profile-label">Раздел</span>
                          <strong>Аналитика по операторам</strong>
                        </div>
                        <span className="analytics-status">{operatorAnalyticsProcessedTotal} талонов</span>
                      </div>
                      <div className="analytics-employee-metrics">
                        <span>
                          Операторов
                          <strong>{operators.length}</strong>
                        </span>
                        <span>
                          Готовы
                          <strong>{onlineOperatorCount}</strong>
                        </span>
                        <span>
                          Заняты
                          <strong>{busyOperatorCount}</strong>
                        </span>
                      </div>
                    </a>
                  </div>
                )}

                {selectedGeneralAnalytics && !selectedAnalyticsDataReady && !analyticsDataError && (
                  <div className="analytics-empty">Загрузка общей аналитики...</div>
                )}

                {selectedGeneralAnalytics && analyticsDataError && (
                  <div className="admin-alert">{analyticsDataError}</div>
                )}

                {selectedGeneralAnalytics && selectedAnalyticsDataReady && !analyticsDataError && (
                  <div className="analytics-dashboard-section analytics-general-section">
                    <div className="analytics-section-heading">
                      <div>
                        <span className="profile-label">Раздел</span>
                        <h2>Общая аналитика</h2>
                      </div>
                      <span className="analytics-status">{operators.length} операторов</span>
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

                    <div className="applicant-report-panel">
                      <div className="analytics-card-header">
                        <div>
                          <span className="profile-label">Отчет абитуриентов</span>
                          <h3>Воронка по ИИН</h3>
                        </div>
                        <div className="applicant-report-actions">
                          {applicantReportAnalysis && (
                            <span className="analytics-status">
                              {applicantReportAnalysis.isLatestFallback
                                ? `Latest report: ${applicantReportAnalysis.reportDate}`
                                : applicantReportAnalysis.fileName}
                            </span>
                          )}
                          <label className="applicant-report-date">
                            <span>Report date</span>
                            <input
                              disabled={applicantReportLoading || applicantReportParsing}
                              type="date"
                              value={applicantReportDate}
                              onChange={(event) => setApplicantReportDate(event.currentTarget.value)}
                            />
                          </label>
                          <label
                            className={`secondary-action compact applicant-report-upload${
                              applicantReportParsing || applicantReportLoading || !applicantReportDate || loading ? ' disabled' : ''
                            }`}
                            aria-disabled={applicantReportParsing || applicantReportLoading || !applicantReportDate || loading}
                          >
                            <Icon name="upload" />
                            {applicantReportParsing ? 'Загрузка...' : 'Загрузить отчет'}
                            <input
                              accept=".csv,.tsv,.txt,.xls,text/csv,text/tab-separated-values,application/vnd.ms-excel"
                              disabled={applicantReportParsing || applicantReportLoading || !applicantReportDate || loading}
                              type="file"
                              onChange={uploadApplicantReport}
                            />
                          </label>
                        </div>
                      </div>

                      {applicantReportError && <div className="admin-alert">{applicantReportError}</div>}

                      {applicantReportAnalysis ? (
                        <>
                          {applicantReportAnalysis.reportIinCount === 0 && (
                            <div className="admin-alert">В отчете не найден ИИН для сопоставления с талонами</div>
                          )}

                          <ApplicantReportFunnel analysis={applicantReportAnalysis} />

                          <div className="applicant-report-details">
                            <span>Распознано в этапах: {applicantReportAnalysis.recognizedMatchedCount}</span>
                            <span>Не распознано: {applicantReportAnalysis.unknownMatchedCount}</span>
                            <span>Без ИИН в отчете: {applicantReportAnalysis.rowsWithoutIinCount}</span>
                            <span>Дубликаты ИИН: {applicantReportAnalysis.duplicateReportIinCount}</span>
                            <span>ИИН отчета без талона: {applicantReportAnalysis.unmatchedReportIinCount}</span>
                            <span>Совпавших талонов: {applicantReportAnalysis.matchedTicketCount}</span>
                          </div>
                        </>
                      ) : (
                        <div className="analytics-empty">Отчет абитуриентов пока не загружен</div>
                      )}
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
                        segments={generalServiceLanguagePieSegments}
                        title="Язык обслуживания"
                        total={generalTicketsTotal}
                      />
                      <AnalyticsDonutPanel
                        centerLabel="талонов"
                        centerValue={generalTicketsTotal}
                        segments={generalStudyLanguagePieSegments}
                        title="Язык обучения"
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

                    <div className="analytics-event-donut-grid">
                      <TicketEventActionDonutPanel
                        emptyLabel="В истории талонов пока нет действий со статусами"
                        eyebrow="История талонов"
                        segments={generalEventStatusPieSegments}
                        title="Статусы по действиям"
                        total={generalEventStatusActionsTotal}
                      />
                      <TicketEventActionDonutPanel
                        emptyLabel="Нет действий талонов по операторам без ожидания"
                        segments={generalEventOperatorPieSegments}
                        title="Действия по операторам"
                        total={generalEventOperatorActionsTotal}
                      />
                      <TicketEventActionDonutPanel
                        emptyLabel="Нет действий талонов по образовательным программам без ожидания"
                        segments={generalEventProgramPieSegments}
                        title="Действия по образовательным программам"
                        total={generalEventProgramActionsTotal}
                      />
                    </div>
                  </div>
                )}

                {selectedOperatorsAnalytics && (
                  <div className="analytics-employee-grid">
                    {analyticsBaseLoading && <div className="analytics-empty">Загрузка операторов...</div>}
                    {analyticsDataLoading && <div className="analytics-empty">Загрузка аналитики операторов...</div>}
                    {analyticsDataError && <div className="admin-alert">{analyticsDataError}</div>}
                    {!analyticsBaseLoading && analyticsOperatorCards.length === 0 && (
                      <div className="analytics-empty">Данных по операторам пока нет</div>
                    )}
                    {!analyticsBaseLoading && selectedAnalyticsDataReady && analyticsOperatorCards.map(({ operator, stats }) => (
                      <a
                        className="analytics-employee-card"
                        href={buildSectionPath(lang, 'analytics', operator.id)}
                        key={operator.id}
                        onClick={(event) => {
                          event.preventDefault()
                          navigateToSection('analytics', operator.id)
                        }}
                      >
                        <div className="analytics-card-header">
                          <div>
                            <span className="profile-label">Сотрудник</span>
                            <strong>
                              {stats
                                ? getAnalyticsOperatorLabel(stats, operator, users)
                                : getUserLabel(users, operator.user_id)}
                            </strong>
                          </div>
                          <span className="analytics-status">
                            {operatorStatusLabels[operator.status]}
                          </span>
                        </div>
                        <div className="analytics-employee-metrics">
                          <span>
                            Клиентов/час
                            <strong>{stats ? formatDecimal(getOperatorClientsPerHour(stats)) : '-'}</strong>
                          </span>
                          <span>
                            Эфф. время
                            <strong>{stats ? formatDuration(stats.total_processing_seconds) : '-'}</strong>
                          </span>
                          <span>
                            Загрузка
                            <strong>{stats ? `${getOperatorUtilizationPercent(stats)}%` : '-'}</strong>
                          </span>
                        </div>
                      </a>
                    ))}
                  </div>
                )}

                {selectedOperatorAnalyticsIsLoading && (
                  <div className="analytics-empty">Загрузка отчета оператора...</div>
                )}

                {isSpecificAnalyticsOperatorSelection(selectedAnalyticsOperatorId) &&
                  analyticsDataError && (
                    <div className="admin-alert">{analyticsDataError}</div>
                  )}

                {isSpecificAnalyticsOperatorSelection(selectedAnalyticsOperatorId) &&
                  selectedAnalyticsDataReady &&
                  !selectedOperatorAnalyticsRow &&
                  !analyticsDataError && (
                    <div className="analytics-empty">Данных по оператору пока нет</div>
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
                      <p>Все талоны по событиям сотрудника</p>
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

                  <div className="applicant-report-panel">
                    <div className="analytics-card-header">
                      <div>
                        <span className="profile-label">Отчет абитуриентов</span>
                        <h3>Воронка по ИИН оператора</h3>
                      </div>
                      <div className="applicant-report-actions">
                        {operatorApplicantReportAnalysis && (
                          <span className="analytics-status">
                            {operatorApplicantReportAnalysis.isLatestFallback
                              ? `Latest report: ${operatorApplicantReportAnalysis.reportDate}`
                              : operatorApplicantReportAnalysis.fileName}
                          </span>
                        )}
                        <label className="applicant-report-date">
                          <span>Report date</span>
                          <input
                            disabled={applicantReportLoading || applicantReportParsing}
                            type="date"
                            value={applicantReportDate}
                            onChange={(event) => setApplicantReportDate(event.currentTarget.value)}
                          />
                        </label>
                      </div>
                    </div>

                    {applicantReportError && <div className="admin-alert">{applicantReportError}</div>}

                    {applicantReportLoading ? (
                      <div className="analytics-empty">Загрузка отчета абитуриентов...</div>
                    ) : operatorApplicantReportAnalysis ? (
                      <>
                        {operatorApplicantReportAnalysis.reportIinCount === 0 && (
                          <div className="admin-alert">В отчете не найден ИИН для сопоставления с талонами</div>
                        )}

                        <ApplicantReportFunnel analysis={operatorApplicantReportAnalysis} />

                        <div className="applicant-report-details">
                          <span>Распознано в этапах: {operatorApplicantReportAnalysis.recognizedMatchedCount}</span>
                          <span>Не распознано: {operatorApplicantReportAnalysis.unknownMatchedCount}</span>
                          <span>Без ИИН в отчете: {operatorApplicantReportAnalysis.rowsWithoutIinCount}</span>
                          <span>Дубликаты ИИН: {operatorApplicantReportAnalysis.duplicateReportIinCount}</span>
                          <span>ИИН отчета без талона оператора: {operatorApplicantReportAnalysis.unmatchedReportIinCount}</span>
                          <span>Совпавших талонов оператора: {operatorApplicantReportAnalysis.matchedTicketCount}</span>
                        </div>
                      </>
                    ) : (
                      <div className="analytics-empty">Отчет абитуриентов пока не загружен</div>
                    )}
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
          <AcademicDegreesRoute
            academicDegrees={academicDegrees}
            loading={loading}
            onEdit={(degree) => {
              setEditingAcademicDegreeId(degree.id)
              setAcademicDegreeForm({
                name: degree.name,
                code: degree.code,
                is_active: degree.is_active,
              })
              setFormModal('academicDegrees')
            }}
            onDelete={(degree) =>
              setDeleteTarget({
                section: 'academicDegrees',
                id: degree.id,
                label: degree.name,
              })
            }
          />
        )}

        {activeSection === 'educationalPrograms' && (
          <EducationalProgramsRoute
            academicDegrees={academicDegrees}
            educationalPrograms={educationalPrograms}
            loading={loading}
            onEdit={(program) => {
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
            onDelete={(program) =>
              setDeleteTarget({
                section: 'educationalPrograms',
                id: program.id,
                label: program.name,
              })
            }
          />
        )}

        {activeSection === 'applicants' && (
          <ApplicantsRoute
            applicants={applicants}
            loading={loading}
            onEdit={(applicant) => {
              setEditingApplicantId(applicant.id)
              setApplicantForm({
                full_name: applicant.full_name ?? '',
                iin: applicant.iin ?? '',
                phone: applicant.phone ?? '',
                telegram_chat_id: applicant.telegram_chat_id,
              })
              setFormModal('applicants')
            }}
            onDelete={(applicant) =>
              setDeleteTarget({
                section: 'applicants',
                id: applicant.id,
                label: applicant.full_name ?? applicant.iin ?? applicant.id,
              })
            }
          />
        )}

        {activeSection === 'ticketEvents' && (
          <TicketEventsRoute
            loading={loading}
            ticketEvents={ticketEvents}
            onEdit={(ticketEvent) => {
              setEditingTicketEventId(ticketEvent.id)
              setTicketEventForm({
                ticket_id: ticketEvent.ticket_id,
                event_type: ticketEvent.event_type,
                old_status: ticketEvent.old_status,
                new_status: ticketEvent.new_status,
                operator_id: ticketEvent.operator_id,
                metadata: ticketEvent.metadata,
              })
              setTicketEventMetadataText(getTicketEventMetadataText(ticketEvent))
              setFormModal('ticketEvents')
            }}
            onDelete={(ticketEvent) =>
              setDeleteTarget({
                section: 'ticketEvents',
                id: ticketEvent.id,
                label: ticketEvent.event_type ?? ticketEvent.id,
              })
            }
          />
        )}
      </main>

      {formModal !== null && (
        <AdminModal
          title={modalTitle}
          onClose={closeFormModal}
          size={formModal === 'ticketEvents' ? 'wide' : 'default'}
        >
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
              {selectedTicketEvent && (
                <div className="ticket-event-details">
                  <div className="ticket-event-detail-grid">
                    {selectedTicketEventDetailRows.map((row) => (
                      <div key={row.label}>
                        <span className="profile-label">{row.label}</span>
                        <strong>{row.value}</strong>
                      </div>
                    ))}
                  </div>

                  {selectedTicketEventChangeRows.length > 0 && (
                    <div className="ticket-event-change-panel">
                      <h3>Изменения</h3>
                      {selectedTicketEventChangeRows.map((row) => (
                        <div className="ticket-event-change-row" key={row.field}>
                          <span>{row.field}</span>
                          <strong>{row.oldValue}</strong>
                          <strong>{row.newValue}</strong>
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedTicketEventMetadataText && (
                    <details className="ticket-event-metadata">
                      <summary>Metadata JSON</summary>
                      <pre>{selectedTicketEventMetadataText}</pre>
                    </details>
                  )}
                </div>
              )}

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

      {ticketCreateModalOpen && (
        <AdminModal title="Создать талон" onClose={closeTicketCreateModal}>
          <form className="admin-form modal-form" onSubmit={submitTicketCreate}>
            <select
              required
              value={ticketCreateForm.service_id}
              onChange={(event) =>
                setTicketCreateForm({
                  ...ticketCreateForm,
                  service_id: event.target.value,
                  educational_program_id: '',
                  study_language: '',
                  service_language: '',
                })
              }
            >
              <option value="">Выберите услугу</option>
              {activeServices.map((service) => (
                <option value={service.id} key={service.id}>
                  {service.name} ({service.code})
                </option>
              ))}
            </select>

            {selectedTicketCreateService?.requires_educational_program && (
              <select
                required
                value={ticketCreateForm.educational_program_id}
                onChange={(event) =>
                  setTicketCreateForm({
                    ...ticketCreateForm,
                    educational_program_id: event.target.value,
                    study_language: '',
                  })
                }
              >
                <option value="">Выберите образовательную программу</option>
                {activeEducationalPrograms.map((program) => (
                  <option value={program.id} key={program.id}>
                    {program.name} ({program.code})
                  </option>
                ))}
              </select>
            )}

            {selectedTicketCreateProgram?.requires_service_language && (
              <select
                required
                value={ticketCreateForm.study_language}
                onChange={(event) =>
                  setTicketCreateForm({
                    ...ticketCreateForm,
                    study_language: event.target.value as StudyLanguage | '',
                  })
                }
              >
                <option value="">Выберите язык обучения</option>
                {studyLanguageOptions.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}

            {selectedTicketCreateService?.requires_service_language && (
              <select
                required
                value={ticketCreateForm.service_language}
                onChange={(event) =>
                  setTicketCreateForm({
                    ...ticketCreateForm,
                    service_language: event.target.value as ServiceLanguage | '',
                  })
                }
              >
                <option value="">Выберите язык обслуживания</option>
                {serviceLanguageOptions.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}

            <ModalActions onCancel={closeTicketCreateModal} submitText="Создать талон" />
          </form>
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
