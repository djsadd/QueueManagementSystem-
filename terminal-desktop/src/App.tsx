import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  GraduationCap,
  Languages,
  Loader2,
  Printer,
  RefreshCw,
  Search,
  Ticket,
  X,
} from 'lucide-react'
import logoUrl from '../../frontend/src/assets/Logo+RGB.png'
import type { TerminalConfig, TerminalLanguage, TerminalProgram, TerminalService, TerminalTicket } from './types'

type ModalKind = 'programs' | null

const languages: Array<{ value: TerminalLanguage; label: string }> = [
  { value: 'kk', label: 'Қаз' },
  { value: 'ru', label: 'Рус' },
  { value: 'en', label: 'Eng' },
]

const translations = {
  kk: {
    locale: 'kk-KZ',
    title: 'Электрондық кезек',
    subtitle: 'Қызметті таңдаңыз',
    services: 'Қызметтер',
    program: 'Білім беру бағдарламасы',
    chooseProgram: 'Бағдарламаны таңдаңыз',
    searchProgram: 'Бағдарлама немесе код',
    issue: 'Талон алу',
    issuing: 'Тіркелуде...',
    loading: 'Жүктелуде...',
    reload: 'Жаңарту',
    noServices: 'Белсенді қызметтер жоқ',
    noPrograms: 'Бағдарламалар табылмады',
    printAgain: 'Қайта басып шығару',
    newTicket: 'Жаңа талон',
    ticketReady: 'Талон дайын',
    ticketLabel: 'Сіздің талоныңыз',
    printerOk: 'Талон басып шығаруға жіберілді',
    printerFail: 'Талон жасалды, бірақ басып шығару орындалмады',
    serviceRequired: 'Қызметті таңдаңыз',
    programRequired: 'Бұл қызмет үшін бағдарламаны таңдаңыз',
    serverError: 'Серверге қосылу мүмкін болмады',
    api: 'Сервер',
    printer: 'Принтер',
    defaultPrinter: 'Windows бойынша',
  },
  ru: {
    locale: 'ru-RU',
    title: 'Электронная очередь',
    subtitle: 'Выберите услугу',
    services: 'Услуги',
    program: 'Образовательная программа',
    chooseProgram: 'Образовательная программа',
    searchProgram: 'Программа или код',
    issue: 'Получить талон',
    issuing: 'Регистрация...',
    loading: 'Загрузка...',
    reload: 'Обновить',
    noServices: 'Нет активных услуг',
    noPrograms: 'Программы не найдены',
    printAgain: 'Повторить печать',
    newTicket: 'Новый талон',
    ticketReady: 'Талон готов',
    ticketLabel: 'Ваш талон',
    printerOk: 'Талон отправлен на печать',
    printerFail: 'Талон создан, но печать не выполнена',
    serviceRequired: 'Выберите услугу',
    programRequired: 'Для этой услуги нужна образовательная программа',
    serverError: 'Не удалось подключиться к серверу',
    api: 'Сервер',
    printer: 'Принтер',
    defaultPrinter: 'По умолчанию Windows',
  },
  en: {
    locale: 'en-US',
    title: 'Digital queue',
    subtitle: 'Choose a service',
    services: 'Services',
    program: 'Educational program',
    chooseProgram: 'Choose a program',
    searchProgram: 'Program or code',
    issue: 'Get ticket',
    issuing: 'Registering...',
    loading: 'Loading...',
    reload: 'Reload',
    noServices: 'No active services',
    noPrograms: 'No programs found',
    printAgain: 'Print again',
    newTicket: 'New ticket',
    ticketReady: 'Ticket ready',
    ticketLabel: 'Your ticket',
    printerOk: 'Ticket sent to printer',
    printerFail: 'Ticket created, but printing failed',
    serviceRequired: 'Choose a service',
    programRequired: 'Choose a program for this service',
    serverError: 'Could not connect to the server',
    api: 'Server',
    printer: 'Printer',
    defaultPrinter: 'Windows default',
  },
} as const

const defaultConfig: TerminalConfig = {
  apiBaseUrl: 'http://192.168.115.12:8000',
  printerName: '',
  fullScreen: true,
  receiptWidthMm: 80,
  receiptBottomFeedMm: 5,
  autoResetSeconds: 10,
}

function getLocalizedName(item: { name: string; name_kk?: string | null; name_en?: string | null; display_name?: string | null }, language: TerminalLanguage) {
  if (language === 'kk') return item.name_kk || item.display_name || item.name
  if (language === 'en') return item.name_en || item.display_name || item.name
  return item.display_name || item.name
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object' && 'detail' in payload) {
    const detail = (payload as { detail?: unknown }).detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) return detail.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join('\n')
  }

  if (typeof payload === 'string' && payload.trim()) return payload

  return fallback
}

function formatDateTime(value: string, locale: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function sortServices(services: TerminalService[]) {
  return [...services]
    .filter((service) => service.is_active)
    .sort((left, right) => right.priority - left.priority || left.name.localeCompare(right.name))
}

function sortPrograms(programs: TerminalProgram[]) {
  return [...programs].filter((program) => program.is_active).sort((left, right) => left.name.localeCompare(right.name))
}

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

function App() {
  const [config, setConfig] = useState<TerminalConfig>(defaultConfig)
  const [language, setLanguage] = useState<TerminalLanguage>(() => (localStorage.getItem('terminal-language') as TerminalLanguage) || 'ru')
  const [services, setServices] = useState<TerminalService[]>([])
  const [programs, setPrograms] = useState<TerminalProgram[]>([])
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null)
  const [selectedProgramId, setSelectedProgramId] = useState<number | null>(null)
  const [programQuery, setProgramQuery] = useState('')
  const [modal, setModal] = useState<ModalKind>(null)
  const [lastTicket, setLastTicket] = useState<TerminalTicket | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const t = translations[language]

  const selectedService = useMemo(
    () => services.find((service) => service.id === selectedServiceId) ?? null,
    [selectedServiceId, services],
  )
  const selectedProgram = useMemo(
    () => programs.find((program) => program.id === selectedProgramId) ?? null,
    [programs, selectedProgramId],
  )
  const mustSelectProgram = Boolean(selectedService?.requires_educational_program)
  const filteredPrograms = useMemo(() => {
    const query = programQuery.trim().toLowerCase()
    if (!query) return programs

    return programs.filter((program) => `${program.name} ${program.name_kk ?? ''} ${program.name_en ?? ''} ${program.code}`.toLowerCase().includes(query))
  }, [programQuery, programs])

  useEffect(() => {
    localStorage.setItem('terminal-language', language)
    document.documentElement.lang = language
  }, [language])

  useEffect(() => {
    void loadCatalogs()
  }, [])

  useEffect(() => {
    if (!lastTicket) return

    const timeout = window.setTimeout(() => {
      setLastTicket(null)
      setMessage('')
    }, config.autoResetSeconds * 1000)

    return () => window.clearTimeout(timeout)
  }, [config.autoResetSeconds, lastTicket])

  async function loadCatalogs() {
    setLoading(true)
    setError('')

    try {
      const loadedConfig = await window.terminalBridge.getConfig()
      const [serviceResponse, programResponse] = await Promise.all([
        window.terminalBridge.apiRequest<TerminalService[]>({ path: '/public/services' }),
        window.terminalBridge.apiRequest<TerminalProgram[]>({ path: '/public/educational-programs' }),
      ])

      if (!serviceResponse.ok) throw new Error(getErrorMessage(serviceResponse.payload, t.serverError))
      if (!programResponse.ok) throw new Error(getErrorMessage(programResponse.payload, t.serverError))

      const activeServices = sortServices(serviceResponse.payload)
      const activePrograms = sortPrograms(programResponse.payload)

      setConfig(loadedConfig)
      setServices(activeServices)
      setPrograms(activePrograms)
      setSelectedServiceId((current) => current && activeServices.some((service) => service.id === current) ? current : activeServices[0]?.id ?? null)
      setSelectedProgramId((current) => current && activePrograms.some((program) => program.id === current) ? current : null)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : t.serverError)
    } finally {
      setLoading(false)
    }
  }

  function selectService(service: TerminalService) {
    setSelectedServiceId(service.id)
    setSelectedProgramId(null)
    setLastTicket(null)
    setMessage('')
    setError('')
    if (service.requires_educational_program) setModal('programs')
  }

  async function createTicket() {
    setError('')
    setMessage('')

    if (!selectedService) {
      setError(t.serviceRequired)
      return
    }

    if (mustSelectProgram && !selectedProgram) {
      setError(t.programRequired)
      setModal('programs')
      return
    }

    setBusy(true)

    try {
      const response = await window.terminalBridge.apiRequest<TerminalTicket>({
        path: '/public/tickets',
        method: 'POST',
        body: {
          service_id: selectedService.id,
          educational_program_id: mustSelectProgram ? selectedProgram?.id ?? null : null,
        },
      })

      if (!response.ok) throw new Error(getErrorMessage(response.payload, t.serverError))

      setLastTicket(response.payload)
      const printResult = await window.terminalBridge.printTicket(response.payload, language)

      setMessage(printResult.ok ? t.printerOk : `${t.printerFail}: ${printResult.message ?? ''}`)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : t.serverError)
    } finally {
      setBusy(false)
    }
  }

  async function reprintTicket() {
    if (!lastTicket) return

    setBusy(true)
    setMessage('')
    setError('')

    try {
      const printResult = await window.terminalBridge.printTicket(lastTicket, language)
      setMessage(printResult.ok ? t.printerOk : `${t.printerFail}: ${printResult.message ?? ''}`)
    } finally {
      setBusy(false)
    }
  }

  function resetTicket() {
    setLastTicket(null)
    setMessage('')
    setError('')
  }

  return (
    <main className="kiosk-shell">
      <header className="kiosk-header">
        <div className="brand-block">
          <img src={logoUrl} alt="Turan Astana University" />
          <div>
            <h1>{t.title}</h1>
            <p>{t.subtitle}</p>
          </div>
        </div>

        <div className="header-actions">
          <div className="clock-chip">
            <Clock3 size={22} />
            <LiveClock locale={t.locale} />
          </div>
          <button className="header-refresh" type="button" onClick={loadCatalogs} disabled={loading || busy} aria-label={t.reload}>
            {loading ? <Loader2 className="spin" size={22} /> : <RefreshCw size={22} />}
          </button>
          <div className="language-switcher" aria-label="Language">
            <Languages size={22} />
            {languages.map((item) => (
              <button
                className={language === item.value ? 'active' : ''}
                key={item.value}
                type="button"
                onClick={() => setLanguage(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <section className="kiosk-grid">
        <div className="service-panel">
          <div className="section-heading">
            <span>{t.services}</span>
            <strong>{services.length}</strong>
          </div>

          {loading ? (
            <div className="empty-state">
              <Loader2 className="spin" size={38} />
              {t.loading}
            </div>
          ) : services.length === 0 ? (
            <div className="empty-state">
              <AlertTriangle size={38} />
              {error || t.noServices}
            </div>
          ) : (
            <div className="service-grid">
              {services.map((service) => (
                <button
                  className={classNames('service-button', selectedServiceId === service.id && 'selected')}
                  key={service.id}
                  type="button"
                  disabled={busy}
                  onClick={() => selectService(service)}
                >
                  <strong>{getLocalizedName(service, language)}</strong>
                  <small>
                    {service.requires_educational_program ? t.program : t.issue}
                    <ChevronRight size={18} />
                  </small>
                </button>
              ))}
            </div>
          )}
        </div>

        <aside className="ticket-panel">
          <div className="ticket-preview">
            {lastTicket ? (
              <div className="ticket-success">
                <CheckCircle2 size={54} />
                <span>{t.ticketReady}</span>
                <strong>{lastTicket.ticket_number}</strong>
                <p>{formatDateTime(lastTicket.created_at, t.locale)}</p>
              </div>
            ) : (
              <div className="ticket-idle">
                <Ticket size={72} />
                <span>{t.ticketLabel}</span>
                <strong>---</strong>
              </div>
            )}
          </div>

          <div className="selection-summary">
            <span>{t.services}</span>
            <strong>{selectedService ? getLocalizedName(selectedService, language) : '-'}</strong>
            {mustSelectProgram ? (
              <button type="button" disabled={busy} onClick={() => setModal('programs')}>
                {selectedProgram ? getLocalizedName(selectedProgram, language) : t.chooseProgram}
              </button>
            ) : null}
          </div>

          {error ? <div className="notice error">{error}</div> : null}
          {message ? <div className="notice success">{message}</div> : null}

          <div className="ticket-actions">
            <button className="issue-button" type="button" disabled={busy || loading || !selectedService} onClick={createTicket}>
              {busy ? <Loader2 className="spin" size={30} /> : <Printer size={30} />}
              {busy ? t.issuing : t.issue}
            </button>

            <div className="secondary-actions">
              <button type="button" disabled={busy || !lastTicket} onClick={reprintTicket}>
                <Printer size={22} />
                {t.printAgain}
              </button>
              <button type="button" disabled={busy} onClick={resetTicket}>
                <RefreshCw size={22} />
                {t.newTicket}
              </button>
            </div>
          </div>
        </aside>
      </section>

      {modal === 'programs' ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setModal(null)}>
          <section className="choice-modal" role="dialog" aria-modal="true" aria-label={t.chooseProgram} onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <h2>{t.chooseProgram}</h2>
              <button type="button" aria-label="Close" onClick={() => setModal(null)}>
                <X size={26} />
              </button>
            </header>

            <div className="program-search">
              <Search size={24} />
              <input value={programQuery} placeholder={t.searchProgram} onChange={(event) => setProgramQuery(event.target.value)} autoFocus />
            </div>

            <div className="program-list">
              {filteredPrograms.length === 0 ? <div className="empty-state small">{t.noPrograms}</div> : null}
              {filteredPrograms.map((program) => (
                <button
                  className={selectedProgramId === program.id ? 'selected' : ''}
                  key={program.id}
                  type="button"
                  onClick={() => {
                    setSelectedProgramId(program.id)
                    setModal(null)
                    setProgramQuery('')
                  }}
                >
                  <span>
                    <GraduationCap size={20} />
                    {program.code}
                  </span>
                  <strong>{getLocalizedName(program, language)}</strong>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  )
}

function LiveClock({ locale }: { locale: string }) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 30000)
    return () => window.clearInterval(interval)
  }, [])

  return (
    <span>
      {new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
      }).format(now)}
    </span>
  )
}

export default App
