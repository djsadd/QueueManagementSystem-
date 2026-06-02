import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
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
  type StudyLanguage,
  type ServiceItem,
  type ServicePayload,
  type MyWindowTickets,
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
type DashboardSection = CrudSection | 'profile' | 'myWindow' | 'analytics'
type OperatorAnalytics = {
  accepted: number
  completed: number
  skipped: number
  declined: number
  totalActions: number
  completionRate: number
  lastActivity: string | null
}
type MyWindowRealtimeStatus = 'connecting' | 'connected' | 'disconnected'
type MyWindowTicketHighlight = 'new' | 'updated'
type DeleteTarget = {
  section: CrudSection
  id: number | string
  label: string
}

const LANG_STORAGE_KEY = 'queueflow-language'
const MY_WINDOW_PAGE_SIZE = 10
const languages = ['ru', 'kk', 'en'] as const
const emptyService: ServicePayload = {
  name: '',
  name_kk: '',
  name_en: '',
  code: '',
  priority: 0,
  is_active: true,
  requires_educational_program: false,
}
const emptyWindow: WindowPayload = { name: '', status: 'OPEN', current_operator_id: null }
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

  return isDashboardSection(sectionCandidate) ? sectionCandidate : 'services'
}

function canUseOperatorSection(section: DashboardSection) {
  return section === 'myWindow' || section === 'profile' || section === 'analytics'
}

function buildSectionPath(lang: Lang, section: DashboardSection) {
  return `/${lang}/admin/${sectionPaths[section]}${window.location.search}${window.location.hash}`
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
      {name === 'plus' && <path d="M12 5v14M5 12h14" />}
      {name === 'refresh' && <path d="M20 12a8 8 0 0 1-13.7 5.7M4 12A8 8 0 0 1 17.7 6.3M18 3v4h-4M6 21v-4h4" />}
    </svg>
  )
}

function boolLabel(value: boolean) {
  return value ? 'Активно' : 'Выключено'
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

function sortMyWindowTickets(tickets: TicketItem[]) {
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

function eventMatches(ticketEvent: TicketEventItem, eventType: string, newStatus: string) {
  return ticketEvent.event_type === eventType || ticketEvent.new_status === newStatus
}

function getOperatorAnalytics(operatorId: string, ticketEvents: TicketEventItem[]): OperatorAnalytics {
  const operatorEvents = ticketEvents.filter((ticketEvent) => ticketEvent.operator_id === operatorId)
  const accepted = operatorEvents.filter((ticketEvent) => eventMatches(ticketEvent, 'TICKET_CALLED', 'CALLED')).length
  const completed = operatorEvents.filter((ticketEvent) =>
    eventMatches(ticketEvent, 'TICKET_COMPLETED', 'COMPLETED'),
  ).length
  const skipped = operatorEvents.filter((ticketEvent) => eventMatches(ticketEvent, 'TICKET_SKIPPED', 'SKIPPED')).length
  const declined = operatorEvents.filter((ticketEvent) => ticketEvent.event_type === 'TICKET_DECLINED').length
  const lastActivity = operatorEvents
    .map((ticketEvent) => ticketEvent.created_at)
    .sort((firstDate, secondDate) => parseApiDate(secondDate).getTime() - parseApiDate(firstDate).getTime())[0] ?? null

  return {
    accepted,
    completed,
    skipped,
    declined,
    totalActions: accepted + completed + skipped + declined,
    completionRate: accepted > 0 ? Math.round((completed / accepted) * 100) : 0,
    lastActivity,
  }
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
  return windowItem ? `${windowItem.name} (${windowItem.status})` : String(windowId)
}

function getOperatorLabel(operators: OperatorItem[], users: UserItem[], operatorId: string | null) {
  if (operatorId === null) {
    return 'Не назначен'
  }

  const operator = operators.find((item) => item.id === operatorId)
  return operator ? getUserLabel(users, operator.user_id) : operatorId
}

function getDegreeLabel(degrees: AcademicDegreeItem[], degreeId: number) {
  const degree = degrees.find((item) => item.id === degreeId)
  return degree ? `${degree.name} (${degree.code})` : String(degreeId)
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

function getMyWindowStatusOptions() {
  return Object.entries(ticketStatusLabels).map(([value, label]) => ({ value, label }))
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
  const [services, setServices] = useState<ServiceItem[]>([])
  const [windows, setWindows] = useState<WindowItem[]>([])
  const [users, setUsers] = useState<UserItem[]>([])
  const [operators, setOperators] = useState<OperatorItem[]>([])
  const [academicDegrees, setAcademicDegrees] = useState<AcademicDegreeItem[]>([])
  const [educationalPrograms, setEducationalPrograms] = useState<EducationalProgramItem[]>([])
  const [applicants, setApplicants] = useState<ApplicantItem[]>([])
  const [ticketEvents, setTicketEvents] = useState<TicketEventItem[]>([])
  const [myWindowTickets, setMyWindowTickets] = useState<MyWindowTickets | null>(null)
  const [myWindowRealtimeStatus, setMyWindowRealtimeStatus] =
    useState<MyWindowRealtimeStatus>('disconnected')
  const [myWindowRefreshing, setMyWindowRefreshing] = useState(false)
  const [myWindowTicketHighlights, setMyWindowTicketHighlights] = useState<
    Record<string, MyWindowTicketHighlight>
  >({})
  const myWindowTicketsRef = useRef<MyWindowTickets | null>(null)
  const [myWindowError, setMyWindowError] = useState('')
  const [myWindowSearch, setMyWindowSearch] = useState('')
  const [myWindowStatusFilter, setMyWindowStatusFilter] = useState('')
  const [myWindowServiceFilter, setMyWindowServiceFilter] = useState('')
  const [myWindowProgramFilter, setMyWindowProgramFilter] = useState('')
  const [myWindowPage, setMyWindowPage] = useState(1)
  const [selectedMyWindowTicket, setSelectedMyWindowTicket] = useState<TicketItem | null>(null)
  const [acceptTicketTarget, setAcceptTicketTarget] = useState<TicketItem | null>(null)
  const [acceptIin, setAcceptIin] = useState('')
  const [acceptStudyLanguage, setAcceptStudyLanguage] = useState<StudyLanguage | ''>('')
  const [ticketActionSaving, setTicketActionSaving] = useState(false)
  const [reassignServiceId, setReassignServiceId] = useState('')
  const [reassignProgramId, setReassignProgramId] = useState('')
  const [operatorProgramIds, setOperatorProgramIds] = useState<Record<string, number[]>>({})
  const [operatorServiceIds, setOperatorServiceIds] = useState<Record<string, number[]>>({})
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
  const [selectedOperatorServiceIds, setSelectedOperatorServiceIds] = useState<number[]>([])
  const [profileProgramIds, setProfileProgramIds] = useState<number[]>([])
  const [profileServiceIds, setProfileServiceIds] = useState<number[]>([])
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

    const localizedPath = buildSectionPath(lang, activeSection)
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`

    if (localizedPath !== currentPath) {
      window.history.replaceState(null, '', localizedPath)
    }
  }, [activeSection, lang])

  useEffect(() => {
    function syncSectionFromPath() {
      if (!isAdminUser) {
        const requestedSection = getSectionFromPath()
        setActiveSection(canUseOperatorSection(requestedSection) ? requestedSection : 'myWindow')
        return
      }

      setActiveSection(getSectionFromPath())
    }

    window.addEventListener('popstate', syncSectionFromPath)

    return () => window.removeEventListener('popstate', syncSectionFromPath)
  }, [isAdminUser])

  function navigateToSection(section: DashboardSection) {
    if (!isAdminUser && !canUseOperatorSection(section)) {
      section = 'myWindow'
    }

    setActiveSection(section)
    closeFormModal()
    setDeleteTarget(null)
    setProfileMenuOpen(false)

    const sectionPath = buildSectionPath(lang, section)
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`

    if (sectionPath !== currentPath) {
      window.history.pushState(null, '', sectionPath)
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
    if (animate) {
      highlightMyWindowChanges(nextRows)
    }

    myWindowTicketsRef.current = nextRows
    setMyWindowTickets(nextRows)
    setSelectedMyWindowTicket((current) =>
      current ? nextRows.tickets.find((ticket) => ticket.id === current.id) ?? current : current,
    )
  }

  async function refreshMyWindowFromRealtime() {
    setMyWindowRefreshing(true)

    try {
      const myWindowRows = await adminApi.tickets.myWindow({
        search: myWindowSearch.trim(),
        status: myWindowStatusFilter,
        service_id: myWindowServiceFilter ? Number(myWindowServiceFilter) : undefined,
        educational_program_id: myWindowProgramFilter,
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
      ] = await Promise.all([
        adminApi.services.list(),
        adminApi.windows.list(),
        adminApi.users.list(),
        adminApi.operators.list(),
        adminApi.academicDegrees.list(),
        adminApi.educationalPrograms.list(),
        adminApi.applicants.list(),
        adminApi.ticketEvents.list(),
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
      setOperatorProgramIds(
        Object.fromEntries(
          operatorProgramsRows.map((row) => [
            row.operatorId,
            row.programs.map((program) => program.id),
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
      const currentOperator = operatorRows.find((operator) => operator.user_id === currentUserId)
      const currentOperatorPrograms = operatorProgramsRows.find((row) => row.operatorId === currentOperator?.id)
      const currentOperatorServices = operatorServicesRows.find((row) => row.operatorId === currentOperator?.id)
      setProfileProgramIds(currentOperatorPrograms?.programs.map((program) => program.id) ?? [])
      setProfileServiceIds(currentOperatorServices?.services.map((service) => service.id) ?? [])
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
          search: myWindowSearch.trim(),
          status: myWindowStatusFilter,
          service_id: myWindowServiceFilter ? Number(myWindowServiceFilter) : undefined,
          educational_program_id: myWindowProgramFilter,
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
      const [operator, ticketEventRows] = await Promise.all([
        adminApi.operators.me(),
        adminApi.ticketEvents.me(),
      ])

      setOperators([operator])
      setUsers([authUser])
      setTicketEvents(ticketEventRows)
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
    }, myWindowSearch.trim() ? 300 : 0)

    return () => window.clearTimeout(timerId)
  }, [
    activeSection,
    myWindowPage,
    myWindowProgramFilter,
    myWindowSearch,
    myWindowServiceFilter,
    myWindowStatusFilter,
  ])

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
    setSelectedOperatorServiceIds([])
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
      const payload = { ...windowForm, current_operator_id: null }

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
        await adminApi.operators.setPrograms(operatorId, selectedOperatorProgramIds)
        await adminApi.operators.setServices(operatorId, selectedOperatorServiceIds)
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
        ? await adminApi.operators.setPrograms(currentOperator.id, profileProgramIds)
        : await adminApi.operators.setMyPrograms(profileProgramIds)
      setOperatorProgramIds({
        ...operatorProgramIds,
        [currentOperator.id]: savedPrograms.map((program) => program.id),
      })
      setProfileProgramIds(savedPrograms.map((program) => program.id))
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
        ? await adminApi.operators.setServices(currentOperator.id, profileServiceIds)
        : await adminApi.operators.setMyServices(profileServiceIds)
      setOperatorServiceIds({
        ...operatorServiceIds,
        [currentOperator.id]: savedServices.map((service) => service.id),
      })
      setProfileServiceIds(savedServices.map((service) => service.id))
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
      applyMyWindowData({
        ...currentRows,
        tickets: currentRows.tickets.map((item) => (item.id === updatedTicket.id ? updatedTicket : item)),
      })
    }
    setSelectedMyWindowTicket((current) => (current?.id === updatedTicket.id ? updatedTicket : current))
  }

  function closeAcceptTicketModal() {
    setAcceptTicketTarget(null)
    setAcceptIin('')
    setAcceptStudyLanguage('')
  }

  async function openAcceptMyWindowTicket(ticket: TicketItem) {
    setMyWindowError('')
    setTicketActionSaving(true)

    try {
      const acceptedTicket = await adminApi.tickets.acceptMyTicket(ticket.id, {})
      updateMyWindowTicketInState(acceptedTicket)
      setAcceptTicketTarget(acceptedTicket)
      setAcceptIin(acceptedTicket.iin ?? '')
      setAcceptStudyLanguage(acceptedTicket.study_language ?? '')
    } catch (requestError) {
      setMyWindowError(requestError instanceof Error ? requestError.message : 'Не удалось принять талон')
    } finally {
      setTicketActionSaving(false)
    }
  }

  async function acceptMyWindowTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (acceptTicketTarget === null) {
      return
    }

    setError('')
    setMyWindowError('')
    setTicketActionSaving(true)

    try {
      let acceptedTicket = await adminApi.tickets.acceptMyTicket(acceptTicketTarget.id, { iin: acceptIin })
      acceptedTicket = await adminApi.tickets.updateMyTicketStudyLanguage(acceptedTicket.id, {
        study_language: acceptStudyLanguage || null,
      })
      updateMyWindowTicketInState(acceptedTicket)
      closeAcceptTicketModal()
    } catch (requestError) {
      setMyWindowError(requestError instanceof Error ? requestError.message : 'Не удалось принять талон')
    } finally {
      setTicketActionSaving(false)
    }
  }

  async function updateMyWindowTicketStudyLanguage(ticket: TicketItem, studyLanguage: StudyLanguage | null) {
    setError('')
    setMyWindowError('')
    setTicketActionSaving(true)

    try {
      const updatedTicket = await adminApi.tickets.updateMyTicketStudyLanguage(ticket.id, { study_language: studyLanguage })
      updateMyWindowTicketInState(updatedTicket)
    } catch (requestError) {
      setMyWindowError(requestError instanceof Error ? requestError.message : 'Не удалось изменить язык обучения')
    } finally {
      setTicketActionSaving(false)
    }
  }

  async function completeMyWindowTicket(ticket: TicketItem) {
    setError('')
    setMyWindowError('')
    setTicketActionSaving(true)

    try {
      const completedTicket = await adminApi.tickets.completeMyTicket(ticket.id)
      updateMyWindowTicketInState(completedTicket)
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

  function openMyWindowTicketDetails(ticket: TicketItem) {
    setSelectedMyWindowTicket(ticket)
    setReassignServiceId(String(ticket.service_id))
    setReassignProgramId(ticket.educational_program_id === null ? '' : String(ticket.educational_program_id))
  }

  async function reassignMyWindowTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (selectedMyWindowTicket === null || !reassignServiceId) {
      return
    }

    setError('')
    setMyWindowError('')
    setTicketActionSaving(true)

    try {
      await adminApi.tickets.reassignMyTicketService(selectedMyWindowTicket.id, {
        service_id: Number(reassignServiceId),
        educational_program_id: reassignProgramId ? Number(reassignProgramId) : null,
      })
      setSelectedMyWindowTicket(null)
      await loadMyWindowData({ animate: true, silent: true })
    } catch (requestError) {
      setMyWindowError(requestError instanceof Error ? requestError.message : 'Не удалось переназначить услугу')
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
  const operatorAnalyticsRows = operators.map((operator) => ({
    operator,
    stats: getOperatorAnalytics(operator.id, ticketEvents),
  }))
  const operatorAnalyticsTotals = operatorAnalyticsRows.reduce(
    (totals, row) => ({
      accepted: totals.accepted + row.stats.accepted,
      completed: totals.completed + row.stats.completed,
      skipped: totals.skipped + row.stats.skipped,
      declined: totals.declined + row.stats.declined,
      totalActions: totals.totalActions + row.stats.totalActions,
    }),
    { accepted: 0, completed: 0, skipped: 0, declined: 0, totalActions: 0 },
  )
  const operatorAnalyticsMaxActions = Math.max(
    1,
    ...operatorAnalyticsRows.map((row) => row.stats.totalActions),
  )
  const sectionStats: Record<DashboardSection, { icon: string; label: string; value: number }> = {
    myWindow: { icon: 'monitor', label: 'Талонов в моем окне', value: myWindowTotal },
    profile: { icon: 'users', label: 'Выбранных программ', value: profileProgramIds.length },
    services: { icon: 'briefcase', label: 'Услуг', value: services.length },
    windows: { icon: 'monitor', label: 'Окон', value: windows.length },
    users: { icon: 'users', label: 'Пользователей', value: users.length },
    operators: { icon: 'badge', label: 'Операторов', value: operators.length },
    academicDegrees: { icon: 'award', label: 'Степеней', value: academicDegrees.length },
    educationalPrograms: { icon: 'book', label: 'Образовательных программ', value: educationalPrograms.length },
    applicants: { icon: 'id-card', label: 'Абитуриентов', value: applicants.length },
    analytics: { icon: 'chart', label: 'Действий операторов', value: operatorAnalyticsTotals.totalActions },
    ticketEvents: { icon: 'history', label: 'Событий талонов', value: ticketEvents.length },
  }
  const activeStat = sectionStats[activeSection]
  const activeStats =
    activeSection === 'myWindow'
      ? [
          activeStat,
          { icon: 'users', label: 'Человек в очереди', value: myWindowWaitingCount },
        ]
      : activeSection === 'analytics'
        ? [
            activeStat,
            { icon: 'history', label: 'Принято талонов', value: operatorAnalyticsTotals.accepted },
            { icon: 'award', label: 'Завершено талонов', value: operatorAnalyticsTotals.completed },
          ]
      : [activeStat]
  const currentUser = users.find((user) => user.id === currentUserId) ?? authUser
  const currentOperator = operators.find((operator) => operator.user_id === currentUserId)
  const activeServices = services.filter((service) => service.is_active)
  const activeEducationalPrograms = educationalPrograms.filter((program) => program.is_active)
  const selectedReassignService = services.find((service) => String(service.id) === reassignServiceId)
  const filteredMyWindowTickets = sortMyWindowTickets(myWindowTicketList)
  const myWindowStatusOptions = getMyWindowStatusOptions()
  const myWindowServiceOptions = activeServices
    .map((service) => [String(service.id), service.name] as const)
    .sort(([, firstName], [, secondName]) => firstName.localeCompare(secondName))
  const myWindowProgramOptions = activeEducationalPrograms
    .map((program) => [String(program.id), program.name] as const)
    .sort(([, firstName], [, secondName]) => firstName.localeCompare(secondName))
  const navSections: DashboardSection[] = isAdminUser
    ? [
        'myWindow',
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
    : ['myWindow', 'profile', 'analytics']

  return (
    <div className="dashboard-layout">
      <aside className="dashboard-sidebar">
        <div className="dashboard-brand">
          <img className="dashboard-brand-logo" src={logoUrl} alt="Turan Astana University" />
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
                  section === 'services'
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

        {activeSection !== 'profile' && activeSection !== 'myWindow' && activeSection !== 'analytics' && (
          <div className="dashboard-toolbar">
            <button className="primary-action" type="button" onClick={() => openCreateModal(activeSection)}>
              <Icon name="plus" />
              Создать
            </button>
          </div>
        )}

        {error && <div className="admin-alert">{error}</div>}

        {activeSection === 'myWindow' && (
          <section className="admin-panel tab-panel" key="myWindow">
            <div className="dashboard-toolbar">
              <button
                className="secondary-action compact"
                type="button"
                onClick={() => void loadMyWindowData({ animate: Boolean(myWindowTickets), silent: Boolean(myWindowTickets) })}
              >
                <Icon name="refresh" />
                Обновить
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

            {myWindowError && <div className="admin-alert">{myWindowError}</div>}

            <div className="queue-panel my-window-filters" aria-label="Фильтры талонов">
              <label>
                <span>Поиск</span>
                <input
                  placeholder="Талон, ФИО, ИИН, услуга, ОП"
                  value={myWindowSearch}
                  onChange={(event) => {
                    setMyWindowPage(1)
                    setMyWindowSearch(event.target.value)
                  }}
                />
              </label>
              <label>
                <span>Статус талона</span>
                <select
                  value={myWindowStatusFilter}
                  onChange={(event) => {
                    setMyWindowPage(1)
                    setMyWindowStatusFilter(event.target.value)
                  }}
                >
                  <option value="">Все статусы</option>
                  {myWindowStatusOptions.map((status) => (
                    <option value={status.value} key={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Услуга</span>
                <select
                  value={myWindowServiceFilter}
                  onChange={(event) => {
                    setMyWindowPage(1)
                    setMyWindowServiceFilter(event.target.value)
                  }}
                >
                  <option value="">Все услуги</option>
                  {myWindowServiceOptions.map(([serviceId, serviceName]) => (
                    <option value={serviceId} key={serviceId}>
                      {serviceName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>ОП</span>
                <select
                  value={myWindowProgramFilter}
                  onChange={(event) => {
                    setMyWindowPage(1)
                    setMyWindowProgramFilter(event.target.value)
                  }}
                >
                  <option value="">Все ОП</option>
                  {myWindowProgramOptions.map(([programId, programName]) => (
                    <option value={programId} key={programId}>
                      {programName}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="secondary-action compact"
                type="button"
                onClick={() => {
                  setMyWindowSearch('')
                  setMyWindowStatusFilter('')
                  setMyWindowServiceFilter('')
                  setMyWindowProgramFilter('')
                  setMyWindowPage(1)
                }}
              >
                Сбросить
              </button>
              <span className="filter-count">
                {filteredMyWindowTickets.length} из {myWindowTotal}
              </span>
            </div>

            <CrudTable
              columns={[
                'Талон',
                'ИИН',
                'Услуга',
                'ОП',
                'Язык обучения',
                'Ответственный оператор',
                'Статус',
                'Ожидание',
                'Действия',
              ]}
              loading={loading}
              rowClassNames={filteredMyWindowTickets.map((ticket) => {
                const highlight = myWindowTicketHighlights[ticket.id]
                return highlight ? `realtime-row realtime-row-${highlight}` : ''
              })}
              rowKeys={filteredMyWindowTickets.map((ticket) => ticket.id)}
              rows={filteredMyWindowTickets.map((ticket) => [
                ticket.ticket_number,
                ticket.iin ?? 'Не указано',
                ticket.service_name ?? ticket.service_id,
                getEducationalProgramDisplayLabel(ticket),
                getStudyLanguageLabel(ticket.study_language),
                ticket.operator_name ?? ticket.operator_email ?? ticket.operator_id ?? 'Не назначен',
                getTicketStatusLabel(ticket.status),
                getTicketQueueWaitLabel(ticket, currentTime),
                <div className="row-actions" key={ticket.id}>
                  {ticket.status === 'WAITING' && (
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
                  )}
                  {ticket.status === 'CALLED' && (
                    <button className="secondary-action compact" type="button" onClick={() => openMyWindowTicketDetails(ticket)}>
                      Детали
                    </button>
                  )}
                  {ticket.status !== 'WAITING' && ticket.status !== 'CALLED' && <span className="row-actions-empty">—</span>}
                </div>,
              ])}
            />
            <div className="queue-panel my-window-pagination" aria-label="Пагинация талонов">
              <span>
                Страница {myWindowCurrentPage} из {myWindowTotalPages}
              </span>
              <div>
                <button
                  className="secondary-action compact"
                  type="button"
                  disabled={myWindowRefreshing || myWindowCurrentPage <= 1}
                  onClick={() => setMyWindowPage((page) => Math.max(1, page - 1))}
                >
                  Назад
                </button>
                <button
                  className="secondary-action compact"
                  type="button"
                  disabled={myWindowRefreshing || myWindowCurrentPage >= myWindowTotalPages}
                  onClick={() => setMyWindowPage((page) => Math.min(myWindowTotalPages, page + 1))}
                >
                  Вперед
                </button>
              </div>
            </div>
          </section>
        )}

        {activeSection === 'profile' && (
          <section className="admin-panel tab-panel profile-section" key="profile">
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
                  <div className="program-choice-grid">
                    {activeServices.map((service) => {
                      const checked = profileServiceIds.includes(service.id)

                      return (
                        <label className="program-choice" key={service.id}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!currentOperator || profileSaving}
                            onChange={(event) => {
                              if (event.target.checked) {
                                setProfileServiceIds([...profileServiceIds, service.id])
                                return
                              }

                              setProfileServiceIds(profileServiceIds.filter((serviceId) => serviceId !== service.id))
                            }}
                          />
                          <span>
                            <strong>{service.name}</strong>
                            <small>
                              {service.code} - приоритет {service.priority}
                            </small>
                          </span>
                        </label>
                      )
                    })}
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
                  <div className="program-choice-grid">
                    {activeEducationalPrograms.map((program) => {
                      const checked = profileProgramIds.includes(program.id)

                      return (
                        <label className="program-choice" key={program.id}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!currentOperator || profileSaving}
                            onChange={(event) => {
                              if (event.target.checked) {
                                setProfileProgramIds([...profileProgramIds, program.id])
                                return
                              }

                              setProfileProgramIds(profileProgramIds.filter((programId) => programId !== program.id))
                            }}
                          />
                          <span>
                            <strong>{program.name}</strong>
                            <small>
                              {program.code} - {getDegreeLabel(academicDegrees, program.academic_degree_id)}
                            </small>
                          </span>
                        </label>
                      )
                    })}
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
              columns={['ID', 'Название (RU)', 'Название (KZ)', 'Название (EN)', 'Код', 'Приоритет', 'Обр. программа', 'Статус', 'Действия']}
              loading={loading}
              rows={services.map((service) => [
                service.id,
                service.name,
                service.name_kk,
                service.name_en,
                service.code,
                service.priority,
                boolLabel(service.requires_educational_program),
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
              columns={['ID', 'Название', 'Статус', 'Оператор', 'Действия']}
              loading={loading}
              rows={windows.map((windowItem) => [
                windowItem.id,
                windowItem.name,
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
                <RowActions
                  key={operator.id}
                  onEdit={() => {
                    setEditingOperatorId(operator.id)
                    setOperatorForm({
                      user_id: operator.user_id,
                      window_id: operator.window_id,
                      status: operator.status,
                    })
                    setSelectedOperatorProgramIds(operatorProgramIds[operator.id] ?? [])
                    setSelectedOperatorServiceIds(operatorServiceIds[operator.id] ?? [])
                    setFormModal('operators')
                  }}
                  onDelete={() =>
                    setDeleteTarget({
                      section: 'operators',
                      id: operator.id,
                      label: getUserLabel(users, operator.user_id),
                    })
                  }
                />,
              ])}
            />
          </section>
        )}

        {activeSection === 'analytics' && (
          <section className="admin-panel tab-panel analytics-section" key="analytics">
            <div className="analytics-grid">
              {operatorAnalyticsRows.map(({ operator, stats }) => {
                const activityPercent = Math.round((stats.totalActions / operatorAnalyticsMaxActions) * 100)

                return (
                  <article className="analytics-card" key={operator.id}>
                    <div className="analytics-card-header">
                      <div>
                        <span className="profile-label">Оператор</span>
                        <strong>{getUserLabel(users, operator.user_id)}</strong>
                      </div>
                      <span className="analytics-status">{operatorStatusLabels[operator.status]}</span>
                    </div>
                    <div className="analytics-bar" aria-hidden="true">
                      <span style={{ width: `${activityPercent}%` }} />
                    </div>
                    <div className="analytics-metrics">
                      <div>
                        <span>Принято</span>
                        <strong>{stats.accepted}</strong>
                      </div>
                      <div>
                        <span>Завершено</span>
                        <strong>{stats.completed}</strong>
                      </div>
                      <div>
                        <span>Не явился</span>
                        <strong>{stats.skipped}</strong>
                      </div>
                      <div>
                        <span>Отказано</span>
                        <strong>{stats.declined}</strong>
                      </div>
                    </div>
                    <div className="analytics-footer">
                      <span>Завершение: {stats.completionRate}%</span>
                      <span>
                        {stats.lastActivity ? new Date(stats.lastActivity).toLocaleString() : 'Активности нет'}
                      </span>
                    </div>
                  </article>
                )
              })}
            </div>

            <CrudTable
              columns={[
                'Оператор',
                'Окно',
                'Статус',
                'Принято',
                'Завершено',
                'Не явился',
                'Отказано',
                'Всего действий',
                'Завершение',
                'Последняя активность',
              ]}
              loading={loading}
              rows={operatorAnalyticsRows.map(({ operator, stats }) => [
                getUserLabel(users, operator.user_id),
                getWindowLabel(windows, operator.window_id),
                operatorStatusLabels[operator.status],
                stats.accepted,
                stats.completed,
                stats.skipped,
                stats.declined,
                stats.totalActions,
                `${stats.completionRate}%`,
                stats.lastActivity ? new Date(stats.lastActivity).toLocaleString() : 'Активности нет',
              ])}
            />
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
              columns={['ID', 'Название (RU)', 'Название (KZ)', 'Название (EN)', 'Код', 'Степень', 'Статус', 'Действия']}
              loading={loading}
              rows={educationalPrograms.map((program) => [
                program.id,
                program.name,
                program.name_kk,
                program.name_en,
                program.code,
                getDegreeLabel(academicDegrees, program.academic_degree_id),
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
              <ModalActions onCancel={closeFormModal} submitText={editingServiceId === null ? 'Создать' : 'Сохранить'} />
            </form>
          )}

          {formModal === 'windows' && (
            <form className="admin-form modal-form" onSubmit={submitWindow}>
              <input
                required
                placeholder="Название окна"
                value={windowForm.name}
                onChange={(event) => setWindowForm({ ...windowForm, name: event.target.value })}
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
                onChange={(event) =>
                  setSelectedOperatorServiceIds(
                    Array.from(event.target.selectedOptions, (option) => Number(option.value)),
                  )
                }
              >
                {services.map((service) => (
                  <option value={service.id} key={service.id}>
                    {service.name} ({service.code})
                  </option>
                ))}
              </select>
              <select
                multiple
                className="multi-select"
                value={selectedOperatorProgramIds.map(String)}
                onChange={(event) =>
                  setSelectedOperatorProgramIds(
                    Array.from(event.target.selectedOptions, (option) => Number(option.value)),
                  )
                }
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
        <AdminModal title={`Талон ${selectedMyWindowTicket.ticket_number}`} onClose={() => setSelectedMyWindowTicket(null)}>
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
              {selectedMyWindowTicket.status === 'CALLED' && (
                <select
                  aria-label="Язык обучения"
                  disabled={ticketActionSaving}
                  value={selectedMyWindowTicket.study_language ?? ''}
                  onChange={(event) => {
                    void updateMyWindowTicketStudyLanguage(
                      selectedMyWindowTicket,
                      parseStudyLanguage(event.target.value),
                    )
                  }}
                >
                  <option value="">Не указан</option>
                  {studyLanguageOptions.map((option) => (
                    <option value={option.value} key={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
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

          <form className="admin-form modal-form" onSubmit={reassignMyWindowTicket}>
            <select
              required
              value={reassignServiceId}
              onChange={(event) => {
                setReassignServiceId(event.target.value)
                setReassignProgramId('')
              }}
            >
              <option value="">Выберите новую услугу</option>
              {activeServices.map((service) => (
                <option value={service.id} key={service.id}>
                  {service.name} ({service.code})
                </option>
              ))}
            </select>
            <select
              disabled={!selectedReassignService?.requires_educational_program}
              required={Boolean(selectedReassignService?.requires_educational_program)}
              value={reassignProgramId}
              onChange={(event) => setReassignProgramId(event.target.value)}
            >
              <option value="">
                {selectedReassignService?.requires_educational_program ? 'Выберите ОП' : 'ОП не требуется'}
              </option>
              {activeEducationalPrograms.map((program) => (
                <option value={program.id} key={program.id}>
                  {program.name} ({program.code})
                </option>
              ))}
            </select>
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

      {acceptTicketTarget !== null && (
        <AdminModal
          title={`Данные талона ${acceptTicketTarget.ticket_number}`}
          onClose={closeAcceptTicketModal}
          size="small"
        >
          <form className="admin-form modal-form" onSubmit={acceptMyWindowTicket}>
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
            <div className="modal-actions">
              <button
                className="secondary-action compact"
                type="button"
                disabled={ticketActionSaving}
                onClick={closeAcceptTicketModal}
              >
                Отмена
              </button>
              <button className="primary-action compact" type="submit" disabled={ticketActionSaving}>
                Сохранить
              </button>
            </div>
          </form>
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
  size?: 'default' | 'small'
  title: string
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={size === 'small' ? 'admin-modal small' : 'admin-modal'}
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
