import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BellRing,
  CalendarClock,
  Check,
  Clock3,
  DoorOpen,
  ExternalLink,
  Loader2,
  LogOut,
  MonitorUp,
  Play,
  RefreshCw,
  Search,
  Settings2,
  SkipForward,
  Timer,
  X,
} from 'lucide-react'
import { api, ApiError } from './api/client'
import { tokenStorage } from './api/tokenStorage'
import type {
  AuthTokens,
  AuthUser,
  EducationalProgramItem,
  MyWindowTickets,
  OperatorConfig,
  ServiceItem,
  StudyLanguage,
  TicketItem,
  WindowStatus,
} from './types/domain'

type View = 'window' | 'profile'
type RealtimeState = 'connecting' | 'connected' | 'disconnected'

const realtimeStatusLabels: Record<RealtimeState, string> = {
  connected: 'Realtime WebSocket',
  connecting: 'WebSocket connecting',
  disconnected: 'WebSocket offline',
}

const windowStatusLabels: Record<WindowStatus, string> = {
  OPEN: 'Открыто',
  BUSY: 'Занято',
  CLOSED: 'Закрыто',
}

const ticketStatusLabels: Record<string, string> = {
  WAITING: 'Ожидает',
  CALLED: 'Вызван',
  COMPLETED: 'Завершен',
  SKIPPED: 'Пропущен',
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

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return 'Неизвестная ошибка'
}

function formatDateTime(value: string | null) {
  if (!value) return 'Нет времени'
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getWaitMinutes(ticket: TicketItem) {
  const createdAt = new Date(ticket.created_at).getTime()
  if (Number.isNaN(createdAt)) return 0
  return Math.max(0, Math.round((Date.now() - createdAt) / 60000))
}

function formatWaitMinutes(ticket: TicketItem) {
  const minutes = getWaitMinutes(ticket)
  if (minutes < 1) return 'меньше минуты'
  return `${minutes} мин`
}

function getStudyLanguageLabel(value: StudyLanguage | null) {
  return value ? studyLanguageLabels[value] : 'Не указан'
}

function parseStudyLanguage(value: string): StudyLanguage | '' {
  return studyLanguageOptions.some((option) => option.value === value) ? (value as StudyLanguage) : ''
}

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

function getWebSocketBaseUrl(apiBaseUrl: string) {
  const normalizedBaseUrl = apiBaseUrl.replace(/\/+$/, '')

  if (normalizedBaseUrl.startsWith('ws://') || normalizedBaseUrl.startsWith('wss://')) {
    return normalizedBaseUrl
  }

  if (normalizedBaseUrl.startsWith('http://') || normalizedBaseUrl.startsWith('https://')) {
    return normalizedBaseUrl.replace(/^http/, 'ws')
  }

  const relativeBaseUrl = normalizedBaseUrl.startsWith('/') ? normalizedBaseUrl : `/${normalizedBaseUrl}`
  return `${window.location.origin.replace(/^http/, 'ws')}${relativeBaseUrl}`
}

function getMyWindowWebSocketUrl(config: OperatorConfig, token: string) {
  const url = new URL(`${getWebSocketBaseUrl(config.apiBaseUrl)}/ws/my-window`)
  url.searchParams.set('token', token)
  return url.toString()
}

function EmptyState({ title }: { title: string }) {
  return (
    <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-dashed border-line bg-white/70 text-sm font-medium text-muted">
      {title}
    </div>
  )
}

function App() {
  const [config, setConfig] = useState<OperatorConfig | null>(null)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [myWindow, setMyWindow] = useState<MyWindowTickets | null>(null)
  const [services, setServices] = useState<ServiceItem[]>([])
  const [selectedServices, setSelectedServices] = useState<number[]>([])
  const [programs, setPrograms] = useState<EducationalProgramItem[]>([])
  const [selectedPrograms, setSelectedPrograms] = useState<number[]>([])
  const [view, setView] = useState<View>('window')
  const [email, setEmail] = useState(tokenStorage.getEmail())
  const [password, setPassword] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedTicket, setSelectedTicket] = useState<TicketItem | null>(null)
  const [acceptIin, setAcceptIin] = useState('')
  const [acceptStudyLanguage, setAcceptStudyLanguage] = useState<StudyLanguage | ''>('')
  const [reassignServiceId, setReassignServiceId] = useState('')
  const [reassignProgramId, setReassignProgramId] = useState('')
  const [reassignServiceQuery, setReassignServiceQuery] = useState('')
  const [reassignProgramQuery, setReassignProgramQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [realtimeState, setRealtimeState] = useState<RealtimeState>('disconnected')

  const currentTicket = useMemo(
    () => myWindow?.tickets.find((ticket) => ticket.status === 'CALLED' && ticket.window_id === myWindow.window_id) ?? null,
    [myWindow],
  )
  const waitingTickets = useMemo(
    () => myWindow?.tickets.filter((ticket) => ticket.status === 'WAITING') ?? [],
    [myWindow],
  )
  const activeServices = useMemo(() => services.filter((service) => service.is_active), [services])
  const activePrograms = useMemo(() => programs.filter((program) => program.is_active), [programs])
  const selectedReassignService = useMemo(
    () => activeServices.find((service) => String(service.id) === reassignServiceId) ?? null,
    [activeServices, reassignServiceId],
  )
  const selectedReassignProgram = useMemo(
    () => activePrograms.find((program) => String(program.id) === reassignProgramId) ?? null,
    [activePrograms, reassignProgramId],
  )
  const filteredReassignServices = useMemo(() => {
    const query = reassignServiceQuery.trim().toLowerCase()
    if (!query) return activeServices
    return activeServices.filter((service) =>
      `${service.name} ${service.code}`.toLowerCase().includes(query),
    )
  }, [activeServices, reassignServiceQuery])
  const filteredReassignPrograms = useMemo(() => {
    const query = reassignProgramQuery.trim().toLowerCase()
    if (!query) return activePrograms
    return activePrograms.filter((program) =>
      `${program.name} ${program.code}`.toLowerCase().includes(query),
    )
  }, [activePrograms, reassignProgramQuery])
  const canCallNext = Boolean(myWindow && myWindow.window_status === 'OPEN')

  const refreshWorkspace = useCallback(
    async (silent = false) => {
      if (!tokenStorage.getAccessToken()) {
        setLoading(false)
        return
      }

      if (!silent) setLoading(true)
      try {
        const data = await api.tickets.myWindow({
          search,
          status: statusFilter || undefined,
          page: 1,
          page_size: 50,
        })
        setMyWindow(data)
        setLastRefresh(new Date())
        setError('')
      } catch (err) {
        setError(getErrorMessage(err))
      } finally {
        setLoading(false)
      }
    },
    [search, statusFilter],
  )
  const refreshWorkspaceRef = useRef(refreshWorkspace)

  useEffect(() => {
    refreshWorkspaceRef.current = refreshWorkspace
  }, [refreshWorkspace])

  const loadProfile = useCallback(async () => {
    const [availableServices, myServices, availablePrograms, myPrograms] = await Promise.all([
      api.operator.availableServices(),
      api.operator.services(),
      api.operator.availablePrograms(),
      api.operator.programs(),
    ])

    setServices(availableServices)
    setSelectedServices(myServices.map((service) => service.id))
    setPrograms(availablePrograms)
    setSelectedPrograms(myPrograms.map((program) => program.id))
  }, [])

  const restoreSession = useCallback(async () => {
    setLoading(true)
    try {
      const loadedConfig = await window.operatorBridge.getConfig()
      setConfig(loadedConfig)

      if (!tokenStorage.getAccessToken()) return

      const [me] = await Promise.all([api.auth.me(), refreshWorkspace(true)])
      setUser(me)
      await loadProfile().catch(() => undefined)
    } catch {
      tokenStorage.clearTokens()
    } finally {
      setLoading(false)
    }
  }, [loadProfile, refreshWorkspace])

  useEffect(() => {
    restoreSession()
  }, [restoreSession])

  useEffect(() => {
    if (!user || !config) return
    const interval = window.setInterval(() => refreshWorkspace(true), Math.max(2, config.refreshSeconds) * 1000)
    return () => window.clearInterval(interval)
  }, [config, refreshWorkspace, user])

  useEffect(() => {
    if (!user || !config) {
      setRealtimeState('disconnected')
      return
    }

    const realtimeConfig = config
    let socket: WebSocket | null = null
    let reconnectTimer: number | undefined
    let refreshTimer: number | undefined
    let closed = false

    async function refreshRealtimeToken() {
      const refreshToken = tokenStorage.getRefreshToken()
      if (!refreshToken) return null

      const response = await window.operatorBridge.apiRequest<AuthTokens>({
        path: '/auth/refresh',
        method: 'POST',
        body: { refresh_token: refreshToken },
      })

      if (!response.ok) {
        tokenStorage.clearTokens()
        return null
      }

      tokenStorage.setTokens(response.payload.access_token, response.payload.refresh_token)
      return response.payload.access_token
    }

    async function connect(forceTokenRefresh = false) {
      setRealtimeState('connecting')

      let accessToken = tokenStorage.getAccessToken()
      if (forceTokenRefresh || !accessToken) {
        accessToken = await refreshRealtimeToken()
      }

      if (!accessToken || closed) {
        setRealtimeState('disconnected')
        return
      }

      socket = new WebSocket(getMyWindowWebSocketUrl(realtimeConfig, accessToken))

      socket.onopen = () => setRealtimeState('connected')
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as { type?: string }
          if (message.type !== 'my_window.updated') return
        } catch {
          return
        }

        window.clearTimeout(refreshTimer)
        refreshTimer = window.setTimeout(() => void refreshWorkspaceRef.current(true), 120)
      }
      socket.onclose = (event) => {
        if (closed) return

        setRealtimeState('disconnected')
        reconnectTimer = window.setTimeout(() => void connect(event.code === 1008), 2500)
      }
      socket.onerror = () => socket?.close()
    }

    void connect()

    return () => {
      closed = true
      window.clearTimeout(reconnectTimer)
      window.clearTimeout(refreshTimer)
      socket?.close()
    }
  }, [config, user])

  async function login(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')

    try {
      const tokens = await api.auth.login(email.trim(), password)
      tokenStorage.setTokens(tokens.access_token, tokens.refresh_token)
      if (config?.rememberEmail) tokenStorage.setEmail(email.trim())
      const me = await api.auth.me()
      setUser(me)
      setPassword('')
      await Promise.all([refreshWorkspace(true), loadProfile().catch(() => undefined)])
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
      setLoading(false)
    }
  }

  function logout() {
    tokenStorage.clearTokens()
    if (!config?.rememberEmail) tokenStorage.clearEmail()
    setRealtimeState('disconnected')
    setUser(null)
    setMyWindow(null)
    setPassword('')
    setView('window')
  }

  async function runAction(action: () => Promise<unknown>, successText: string) {
    setSaving(true)
    setMessage('')
    setError('')

    try {
      await action()
      setMessage(successText)
      await refreshWorkspace(true)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  function updateTicketInState(updatedTicket: TicketItem) {
    setMyWindow((current) => {
      if (!current) return current

      return {
        ...current,
        tickets: current.tickets.map((ticket) => (ticket.id === updatedTicket.id ? updatedTicket : ticket)),
      }
    })

    setSelectedTicket((current) => (current?.id === updatedTicket.id ? updatedTicket : current))
  }

  function openTicketDetails(ticket: TicketItem) {
    setSelectedTicket(ticket)
    setAcceptIin(ticket.iin ?? '')
    setAcceptStudyLanguage(ticket.study_language ?? '')
    setReassignServiceId(String(ticket.service_id))
    setReassignProgramId(ticket.educational_program_id === null ? '' : String(ticket.educational_program_id))
    setReassignServiceQuery('')
    setReassignProgramQuery('')
  }

  function closeTicketDetails() {
    setSelectedTicket(null)
    setAcceptIin('')
    setAcceptStudyLanguage('')
    setReassignServiceId('')
    setReassignProgramId('')
    setReassignServiceQuery('')
    setReassignProgramQuery('')
  }

  async function persistTicketApplicantData(ticket: TicketItem) {
    const normalizedIin = acceptIin.trim()

    if (!/^\d{12}$/.test(normalizedIin)) {
      throw new Error('ИИН должен состоять из 12 цифр')
    }

    if (!acceptStudyLanguage) {
      throw new Error('Выберите язык обучения')
    }

    let updatedTicket = await api.tickets.accept(ticket.id, normalizedIin)
    updatedTicket = await api.tickets.updateStudyLanguage(updatedTicket.id, acceptStudyLanguage)
    updateTicketInState(updatedTicket)
    return updatedTicket
  }

  async function callNextTicket() {
    setSaving(true)
    setMessage('')
    setError('')
    setActionError('')

    try {
      const nextTicket = await api.tickets.callNext()
      await refreshWorkspace(true)
      openTicketDetails(nextTicket)
    } catch (err) {
      setActionError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function saveTicketApplicantData(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedTicket) return

    setSaving(true)
    setMessage('')
    setActionError('')

    try {
      await persistTicketApplicantData(selectedTicket)
      setMessage('Данные талона сохранены')
    } catch (err) {
      setActionError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function completeTicket(ticket: TicketItem) {
    setSaving(true)
    setMessage('')
    setActionError('')

    try {
      const ticketToComplete = selectedTicket?.id === ticket.id ? await persistTicketApplicantData(ticket) : ticket
      await api.tickets.complete(ticketToComplete.id)
      closeTicketDetails()
      setMessage('Талон завершен')
      await refreshWorkspace(true)
    } catch (err) {
      setActionError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function skipTicket(ticket: TicketItem) {
    const confirmed = window.confirm(`Отметить талон ${ticket.ticket_number} как "Не явился"?`)
    if (!confirmed) return

    setSaving(true)
    setMessage('')
    setActionError('')

    try {
      await api.tickets.skip(ticket.id)
      closeTicketDetails()
      setMessage('Талон отмечен как не явившийся')
      await refreshWorkspace(true)
    } catch (err) {
      setActionError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function reassignTicket(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedTicket || !reassignServiceId) return

    if (!selectedReassignService) {
      setActionError('Выберите услугу')
      return
    }

    if (selectedReassignService?.requires_educational_program && !reassignProgramId) {
      setActionError('Выберите образовательную программу')
      return
    }

    setSaving(true)
    setMessage('')
    setActionError('')

    try {
      const ticketToReassign = await persistTicketApplicantData(selectedTicket)
      await api.tickets.reassignService(ticketToReassign.id, {
        service_id: Number(reassignServiceId),
        educational_program_id: reassignProgramId ? Number(reassignProgramId) : null,
      })
      closeTicketDetails()
      setMessage('Услуга талона переназначена')
      await refreshWorkspace(true)
    } catch (err) {
      setActionError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function saveServices() {
    await runAction(async () => {
      const updated = await api.operator.setServices(selectedServices)
      setSelectedServices(updated.map((service) => service.id))
    }, 'Услуги обновлены')
  }

  async function savePrograms() {
    await runAction(async () => {
      const updated = await api.operator.setPrograms(selectedPrograms)
      setSelectedPrograms(updated.map((program) => program.id))
    }, 'Образовательные программы обновлены')
  }

  if (loading && !user) {
    return (
      <div className="grid min-h-screen place-items-center bg-shell text-ink">
        <Loader2 className="h-9 w-9 animate-spin text-brand" />
      </div>
    )
  }

  if (!user) {
    return (
      <main className="grid min-h-screen place-items-center bg-shell px-6 text-ink">
        <form onSubmit={login} className="w-full max-w-[430px] rounded-lg border border-line bg-white p-8 shadow-panel">
          <div className="mb-8 flex items-center gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-lg bg-brand text-white">
              <DoorOpen className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-normal">Оператор CRM</h1>
              <p className="mt-1 text-sm text-muted">{config?.apiBaseUrl ?? 'API загружается'}</p>
            </div>
          </div>

          <label className="field-label" htmlFor="email">
            Email
          </label>
          <input id="email" className="text-input" value={email} onChange={(event) => setEmail(event.target.value)} />

          <label className="field-label mt-5" htmlFor="password">
            Пароль
          </label>
          <input
            id="password"
            type="password"
            className="text-input"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          {error && <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          <button className="primary-button mt-6 w-full" disabled={saving}>
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
            Войти
          </button>
        </form>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-shell text-ink">
      <aside className="fixed inset-y-0 left-0 z-10 flex w-[86px] flex-col items-center border-r border-line bg-white py-5">
        <div className="grid h-12 w-12 place-items-center rounded-lg bg-brand text-white">
          <DoorOpen className="h-7 w-7" />
        </div>
        <nav className="mt-8 flex flex-1 flex-col gap-3">
          <button
            className={classNames('rail-button', view === 'window' && 'rail-button-active')}
            title="Мое окно"
            onClick={() => setView('window')}
          >
            <BellRing className="h-6 w-6" />
          </button>
          <button
            className={classNames('rail-button', view === 'profile' && 'rail-button-active')}
            title="Профиль"
            onClick={() => setView('profile')}
          >
            <Settings2 className="h-6 w-6" />
          </button>
        </nav>
        <button className="rail-button" title="Выйти" onClick={logout}>
          <LogOut className="h-6 w-6" />
        </button>
      </aside>

      <section className="ml-[86px] min-h-screen">
        <header className="sticky top-0 z-[5] flex min-h-[82px] items-center justify-between border-b border-line bg-white/95 px-8 backdrop-blur">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-normal">{view === 'window' ? 'Мое окно' : 'Профиль оператора'}</h1>
              <span className="status-pill status-pill-neutral">{user.role}</span>
            </div>
            <p className="mt-1 text-sm text-muted">{user.full_name} · {user.email}</p>
          </div>

          <div className="flex items-center gap-3">
            {lastRefresh && (
              <span className="inline-flex items-center gap-2 text-sm font-medium text-muted">
                <Clock3 className="h-4 w-4" />
                Обновлено {lastRefresh.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <span className={classNames('realtime-badge', `realtime-badge-${realtimeState}`)}>
              <span className="realtime-dot" aria-hidden="true" />
              {realtimeStatusLabels[realtimeState]}
            </span>
            <button className="ghost-button" onClick={() => refreshWorkspace()} disabled={saving}>
              <RefreshCw className="h-5 w-5" />
              Обновить
            </button>
            <button
              className="primary-button"
              onClick={() =>
                window.operatorBridge.openDisplay({
                  accessToken: tokenStorage.getAccessToken(),
                  refreshToken: tokenStorage.getRefreshToken(),
                })
              }
            >
              <MonitorUp className="h-5 w-5" />
              Второй экран
            </button>
          </div>
        </header>

        <div className="p-8">
          {(error || message) && (
            <div
              className={classNames(
                'mb-6 rounded-lg border px-4 py-3 text-sm font-medium',
                error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800',
              )}
            >
              {error || message}
            </div>
          )}

          {view === 'window' ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
              <section className="space-y-6">
                <div className="panel p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="section-label">Рабочее место</span>
                      <h2 className="mt-2 text-4xl font-semibold tracking-normal">
                        {myWindow?.window_name ?? (myWindow ? `Окно #${myWindow.window_id}` : 'Окно')}
                      </h2>
                    </div>
                    <span className={classNames('status-pill', myWindow?.window_status === 'OPEN' ? 'status-pill-good' : 'status-pill-warn')}>
                      {myWindow?.window_status ? windowStatusLabels[myWindow.window_status] : 'Нет данных'}
                    </span>
                  </div>

                  <div className="mt-6 grid grid-cols-2 gap-3">
                    <div className="metric-tile">
                      <span>Очередь</span>
                      <strong>{myWindow?.global_waiting_count ?? 0}</strong>
                    </div>
                    <div className="metric-tile">
                      <span>В списке</span>
                      <strong>{myWindow?.total ?? 0}</strong>
                    </div>
                  </div>

                  <div className="mt-6 grid grid-cols-3 gap-3">
                    {(['OPEN', 'BUSY', 'CLOSED'] as WindowStatus[]).map((status) => (
                      <button
                        key={status}
                        className={classNames('segmented-button', myWindow?.window_status === status && 'segmented-button-active')}
                        disabled={saving || !myWindow}
                        onClick={() => runAction(() => api.tickets.setWindowStatus(status), 'Статус окна обновлен')}
                      >
                        {windowStatusLabels[status]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="panel p-6">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <span className="section-label">Сейчас у окна</span>
                      <h2 className="mt-2 text-5xl font-semibold tracking-normal">{currentTicket?.ticket_number ?? 'Нет талона'}</h2>
                    </div>
                    <Clock3 className="h-9 w-9 text-signal" />
                  </div>

                  {currentTicket ? (
                    <div className="mt-6 space-y-4">
                      <div>
                        <p className="text-sm font-semibold text-muted">{currentTicket.service_name ?? 'Услуга'}</p>
                        <p className="mt-1 text-lg font-semibold">{currentTicket.full_name ?? 'Клиент без ФИО'}</p>
                      </div>
                      <button className="primary-button h-12 w-full" disabled={saving} onClick={() => openTicketDetails(currentTicket)}>
                        <ExternalLink className="h-5 w-5" />
                        Открыть талон
                      </button>
                    </div>
                  ) : (
                    <div className="mt-6">
                      <button
                        className="primary-button h-14 w-full text-base"
                        disabled={saving || !canCallNext}
                        onClick={callNextTicket}
                      >
                        <BellRing className="h-6 w-6" />
                        Вызвать следующего
                      </button>
                    </div>
                  )}
                </div>
              </section>

              <section className="panel overflow-hidden">
                <div className="flex items-center justify-between gap-4 border-b border-line p-5">
                  <div className="relative min-w-[280px] flex-1">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
                    <input className="search-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск" />
                  </div>
                  <select className="select-input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                    <option value="">Все статусы</option>
                    <option value="WAITING">Ожидает</option>
                    <option value="CALLED">Вызван</option>
                    <option value="COMPLETED">Завершен</option>
                    <option value="SKIPPED">Пропущен</option>
                  </select>
                </div>

                {myWindow && myWindow.tickets.length > 0 ? (
                  <div className="divide-y divide-line">
                    {[...myWindow.tickets]
                      .sort((a, b) => (a.status === 'CALLED' ? -1 : b.status === 'CALLED' ? 1 : new Date(a.created_at).getTime() - new Date(b.created_at).getTime()))
                      .map((ticket) => (
                        <article key={ticket.id} className="ticket-row">
                          <div className="ticket-number">{ticket.ticket_number}</div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="truncate text-base font-semibold">{ticket.service_name ?? 'Услуга'}</h3>
                              <span className={classNames('status-pill', ticket.status === 'WAITING' ? 'status-pill-warn' : ticket.status === 'CALLED' ? 'status-pill-live' : 'status-pill-neutral')}>
                                {ticketStatusLabels[ticket.status] ?? ticket.status}
                              </span>
                            </div>
                            <p className="mt-1 truncate text-sm text-muted">{ticket.educational_program_name ?? ticket.full_name ?? 'Без дополнительной информации'}</p>
                          </div>
                          <div className="ticket-time">
                            <div className="ticket-time-main">
                              <Timer className="h-4 w-4" />
                              <strong>{formatWaitMinutes(ticket)}</strong>
                            </div>
                            <div className="ticket-time-sub">
                              <CalendarClock className="h-4 w-4" />
                              <span>{formatDateTime(ticket.created_at)}</span>
                            </div>
                          </div>
                          {ticket.status === 'CALLED' && (
                            <button className="ghost-button shrink-0" disabled={saving} onClick={() => openTicketDetails(ticket)}>
                              <ExternalLink className="h-5 w-5" />
                              Открыть
                            </button>
                          )}
                        </article>
                      ))}
                  </div>
                ) : (
                  <div className="p-5">
                    <EmptyState title="Талонов нет" />
                  </div>
                )}

                {waitingTickets.length > 0 && !currentTicket && (
                  <div className="border-t border-line bg-white p-5">
                    <button className="primary-button h-12 w-full" disabled={saving || !canCallNext} onClick={callNextTicket}>
                      <BellRing className="h-5 w-5" />
                      Вызвать следующий талон
                    </button>
                  </div>
                )}
              </section>
            </div>
          ) : (
            <div className="grid gap-6 xl:grid-cols-2">
              <ProfileList
                title="Услуги"
                items={services}
                selectedIds={selectedServices}
                onChange={setSelectedServices}
                onSave={saveServices}
                saving={saving}
              />
              <ProfileList
                title="Образовательные программы"
                items={programs}
                selectedIds={selectedPrograms}
                onChange={setSelectedPrograms}
                onSave={savePrograms}
                saving={saving}
              />
              <section className="panel p-6 xl:col-span-2">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="info-line">
                    <span>API</span>
                    <strong>{config?.apiBaseUrl}</strong>
                  </div>
                  <div className="info-line">
                    <span>Экран</span>
                    <strong>
                      {config?.monitorIndex} · {config?.displayMode} · {config?.displayAutoFit ? 'auto' : 'manual'}{' '}
                      {config?.displayScale}
                    </strong>
                  </div>
                  <div className="info-line">
                    <span>Display URL</span>
                    <strong className="flex items-center gap-2 truncate">
                      <ExternalLink className="h-4 w-4 shrink-0" />
                      {config?.displayUrl}
                    </strong>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      </section>

      {selectedTicket && (
        <AdminModal title={`Талон ${selectedTicket.ticket_number}`} onClose={closeTicketDetails} size="wide">
          <div className="ticket-detail-grid">
            <div>
              <span className="profile-label">Абитуриент</span>
              <strong>{selectedTicket.full_name ?? 'Не указано'}</strong>
              <p>{selectedTicket.iin ?? 'ИИН не указан'}</p>
            </div>
            <div>
              <span className="profile-label">Текущая услуга</span>
              <strong>{selectedTicket.service_name ?? selectedTicket.service_id}</strong>
              <p>{selectedTicket.educational_program_name ?? 'ОП не указана'}</p>
            </div>
            <div>
              <span className="profile-label">Язык обучения</span>
              <strong>{getStudyLanguageLabel(selectedTicket.study_language)}</strong>
            </div>
            <div>
              <span className="profile-label">Статус</span>
              <strong>{ticketStatusLabels[selectedTicket.status] ?? selectedTicket.status}</strong>
              <p>Создан: {new Date(selectedTicket.created_at).toLocaleString('ru-RU')}</p>
            </div>
            <div>
              <span className="profile-label">Ответственный оператор</span>
              <strong>{selectedTicket.operator_name ?? selectedTicket.operator_email ?? selectedTicket.operator_id ?? 'Не назначен'}</strong>
              <p>Окно: {selectedTicket.window_id ?? 'Не указано'}</p>
            </div>
          </div>

          {selectedTicket.status === 'CALLED' && (
            <form className="modal-form ticket-admission-form" onSubmit={saveTicketApplicantData}>
              <div className="ticket-form-grid">
                <input
                  required
                  autoFocus
                  className="text-input"
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
                  className="text-input"
                  value={acceptStudyLanguage}
                  onChange={(event) => setAcceptStudyLanguage(parseStudyLanguage(event.target.value))}
                >
                  <option value="">Выберите язык обучения</option>
                  {studyLanguageOptions.map((option) => (
                    <option value={option.value} key={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button className="ghost-button h-12" type="submit" disabled={saving}>
                  <Check className="h-5 w-5" />
                  Сохранить данные
                </button>
              </div>
            </form>
          )}

          <form className="modal-form touch-reassign-form" onSubmit={reassignTicket}>
            <div className="reassign-select-grid">
              <div className="touch-choice-field">
              <span className="profile-label">Новая услуга</span>
                <input
                  className="touch-choice-search"
                  placeholder="Поиск по услуге или коду"
                  value={reassignServiceQuery}
                  onChange={(event) => setReassignServiceQuery(event.target.value)}
                />
                <select
                  className="reassign-select"
                  disabled={saving || activeServices.length === 0}
                  value={reassignServiceId}
                  onChange={(event) => {
                    const nextServiceId = event.target.value
                    const service = activeServices.find((item) => String(item.id) === nextServiceId)
                    const currentProgramId =
                      selectedTicket.educational_program_id === null ? '' : String(selectedTicket.educational_program_id)

                    setReassignServiceId(nextServiceId)
                    setReassignProgramQuery('')
                    setReassignProgramId(service?.requires_educational_program ? reassignProgramId || currentProgramId : '')
                  }}
                >
                  <option value="">Выберите услугу</option>
                  {filteredReassignServices.map((service) => (
                    <option value={service.id} key={service.id}>
                      {service.name}
                    </option>
                  ))}
                </select>
                {activeServices.length === 0 && <div className="touch-choice-empty">Активных услуг пока нет</div>}
                {activeServices.length > 0 && filteredReassignServices.length === 0 && (
                  <div className="touch-choice-empty">Услуги не найдены</div>
                )}
              </div>

              <div className="touch-choice-field">
              <span className="profile-label">Образовательная программа</span>
              {selectedReassignService?.requires_educational_program ? (
                <>
                  <input
                    className="touch-choice-search"
                    placeholder="Поиск по ОП или коду"
                    value={reassignProgramQuery}
                    onChange={(event) => setReassignProgramQuery(event.target.value)}
                  />
                  <select
                    className="reassign-select"
                    disabled={saving || activePrograms.length === 0}
                    required={selectedReassignService.requires_educational_program}
                    value={reassignProgramId}
                    onChange={(event) => setReassignProgramId(event.target.value)}
                  >
                    <option value="">Выберите ОП</option>
                    {filteredReassignPrograms.map((program) => (
                      <option value={program.id} key={program.id}>
                        {program.name}
                      </option>
                    ))}
                  </select>
                  {activePrograms.length === 0 && <div className="touch-choice-empty">Активных ОП пока нет</div>}
                  {activePrograms.length > 0 && filteredReassignPrograms.length === 0 && (
                    <div className="touch-choice-empty">ОП не найдены</div>
                  )}
                </>
              ) : (
                <div className="touch-choice-empty">ОП не требуется</div>
              )}
              </div>
            </div>

            <div className="modal-actions">
              <button
                className="success-button"
                type="button"
                disabled={saving || selectedTicket.status !== 'CALLED'}
                onClick={() => completeTicket(selectedTicket)}
              >
                <Check className="h-5 w-5" />
                Завершить талон
              </button>
              <button
                className="danger-button"
                type="button"
                disabled={saving || selectedTicket.status !== 'CALLED'}
                onClick={() => skipTicket(selectedTicket)}
              >
                <SkipForward className="h-5 w-5" />
                Талон не явился
              </button>
              <button className="primary-button" type="submit" disabled={saving || selectedTicket.status !== 'CALLED'}>
                <RefreshCw className="h-5 w-5" />
                Переназначить услугу
              </button>
            </div>
          </form>
        </AdminModal>
      )}

      {actionError && (
        <AdminModal title="Ошибка" onClose={() => setActionError('')} size="small">
          <div className="error-dialog">
            <div className="error-dialog-icon" aria-hidden="true">
              !
            </div>
            <div>
              <strong>Не удалось выполнить действие</strong>
              <p>{actionError}</p>
            </div>
          </div>
          <div className="modal-actions">
            <button className="primary-button" type="button" onClick={() => setActionError('')}>
              Понятно
            </button>
          </div>
        </AdminModal>
      )}
    </main>
  )
}

function ProfileList<T extends { id: number; name: string; code: string; is_active: boolean }>({
  title,
  items,
  selectedIds,
  onChange,
  onSave,
  saving,
}: {
  title: string
  items: T[]
  selectedIds: number[]
  onChange: (ids: number[]) => void
  onSave: () => void
  saving: boolean
}) {
  function toggle(id: number) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id])
  }

  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between gap-4 border-b border-line p-5">
        <div>
          <span className="section-label">Назначения</span>
          <h2 className="mt-1 text-xl font-semibold tracking-normal">{title}</h2>
        </div>
        <button className="primary-button" disabled={saving} onClick={onSave}>
          <Check className="h-5 w-5" />
          Сохранить
        </button>
      </div>

      <div className="max-h-[580px] divide-y divide-line overflow-auto">
        {items.map((item) => (
          <label key={item.id} className="check-row">
            <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggle(item.id)} />
            <span className="min-w-0 flex-1">
              <strong className="block truncate">{item.name}</strong>
              <span className="text-sm text-muted">{item.code} · {item.is_active ? 'Активно' : 'Отключено'}</span>
            </span>
          </label>
        ))}
        {items.length === 0 && (
          <div className="p-5">
            <EmptyState title="Нет доступных записей" />
          </div>
        )}
      </div>
    </section>
  )
}

function AdminModal({
  children,
  onClose,
  size = 'default',
  title,
}: {
  children: React.ReactNode
  onClose: () => void
  size?: 'default' | 'small' | 'wide'
  title: string
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={classNames('admin-modal', size === 'small' && 'admin-modal-small', size === 'wide' && 'admin-modal-wide')}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" type="button" aria-label="Закрыть" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  )
}

export default App
