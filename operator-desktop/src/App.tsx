import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BellRing,
  Check,
  Clock3,
  DoorOpen,
  ExternalLink,
  Loader2,
  LogOut,
  MonitorUp,
  Pause,
  Play,
  RefreshCw,
  Search,
  Settings2,
  SkipForward,
  UserRound,
  X,
} from 'lucide-react'
import { api, ApiError } from './api/client'
import { tokenStorage } from './api/tokenStorage'
import type {
  AuthUser,
  EducationalProgramItem,
  MyWindowTickets,
  OperatorConfig,
  OperatorStatus,
  ServiceItem,
  TicketItem,
  WindowStatus,
} from './types/domain'

type View = 'window' | 'profile'

const operatorStatusLabels: Record<OperatorStatus, string> = {
  ONLINE: 'Онлайн',
  OFFLINE: 'Офлайн',
  BUSY: 'Занят',
  BREAK: 'Перерыв',
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

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return 'Неизвестная ошибка'
}

function formatDateTime(value: string | null) {
  if (!value) return '—'
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

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
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
  const [iin, setIin] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const currentTicket = useMemo(
    () => myWindow?.tickets.find((ticket) => ticket.status === 'CALLED' && ticket.window_id === myWindow.window_id) ?? null,
    [myWindow],
  )
  const waitingTickets = useMemo(
    () => myWindow?.tickets.filter((ticket) => ticket.status === 'WAITING') ?? [],
    [myWindow],
  )
  const canCallNext = Boolean(myWindow && myWindow.operator_status === 'ONLINE' && myWindow.window_status === 'OPEN')

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
            {lastRefresh && <span className="text-sm text-muted">Обновлено {lastRefresh.toLocaleTimeString('ru-RU')}</span>}
            <button className="ghost-button" onClick={() => refreshWorkspace()} disabled={saving}>
              <RefreshCw className="h-5 w-5" />
              Обновить
            </button>
            <button className="primary-button" onClick={() => window.operatorBridge.openDisplay()}>
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

                  <div className="mt-6 grid grid-cols-2 gap-3">
                    {(['ONLINE', 'BREAK', 'OFFLINE', 'BUSY'] as OperatorStatus[]).map((status) => (
                      <button
                        key={status}
                        className={classNames('segmented-button', myWindow?.operator_status === status && 'segmented-button-active')}
                        disabled={saving || !myWindow}
                        onClick={() => runAction(() => api.tickets.setOperatorStatus(status), 'Статус оператора обновлен')}
                      >
                        {status === 'ONLINE' ? <Play className="h-4 w-4" /> : status === 'BREAK' ? <Pause className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
                        {operatorStatusLabels[status]}
                      </button>
                    ))}
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
                      <h2 className="mt-2 text-5xl font-semibold tracking-normal">{currentTicket?.ticket_number ?? '—'}</h2>
                    </div>
                    <Clock3 className="h-9 w-9 text-signal" />
                  </div>

                  {currentTicket ? (
                    <div className="mt-6 space-y-4">
                      <div>
                        <p className="text-sm font-semibold text-muted">{currentTicket.service_name ?? 'Услуга'}</p>
                        <p className="mt-1 text-lg font-semibold">{currentTicket.full_name ?? 'Клиент без ФИО'}</p>
                      </div>
                      <input
                        className="text-input"
                        placeholder="ИИН, если нужно"
                        maxLength={12}
                        value={iin}
                        onChange={(event) => setIin(event.target.value.replace(/\D/g, ''))}
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <button className="primary-button" disabled={saving} onClick={() => runAction(() => api.tickets.accept(currentTicket.id, iin), 'Клиент принят')}>
                          <Check className="h-5 w-5" />
                          Принять
                        </button>
                        <button className="success-button" disabled={saving} onClick={() => runAction(() => api.tickets.complete(currentTicket.id), 'Талон завершен')}>
                          <Check className="h-5 w-5" />
                          Завершить
                        </button>
                        <button className="ghost-button" disabled={saving} onClick={() => runAction(() => api.tickets.skip(currentTicket.id), 'Талон пропущен')}>
                          <SkipForward className="h-5 w-5" />
                          Пропустить
                        </button>
                        <button className="danger-button" disabled={saving} onClick={() => runAction(() => api.tickets.decline(currentTicket.id), 'Талон отклонен')}>
                          <X className="h-5 w-5" />
                          Отклонить
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-6">
                      <button
                        className="primary-button h-14 w-full text-base"
                        disabled={saving || !canCallNext}
                        onClick={() => runAction(() => api.tickets.callNext(), 'Следующий талон вызван')}
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
                          <div className="w-[170px] text-right text-sm text-muted">
                            <strong className="block text-ink">{getWaitMinutes(ticket)} мин</strong>
                            {formatDateTime(ticket.created_at)}
                          </div>
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
                    <button className="primary-button h-12 w-full" disabled={saving || !canCallNext} onClick={() => runAction(() => api.tickets.callNext(), 'Следующий талон вызван')}>
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

export default App
