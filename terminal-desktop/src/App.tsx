import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  ChevronDown,
  ChevronUp,
  Clock3,
  Languages,
  Loader2,
  Printer,
  RefreshCw,
  X,
} from 'lucide-react'
import logoUrl from '../../frontend/src/assets/Logo+RGB.png'
import type { ServiceLanguage, StudyLanguage, TerminalConfig, TerminalLanguage, TerminalProgram, TerminalService, TerminalTicket } from './types'

type ModalKind = 'programs' | 'service-language' | 'study-language' | null

type TicketDraft = {
  service?: TerminalService | null
  program?: TerminalProgram | null
  studyLanguage?: StudyLanguage | null
  serviceLanguage?: ServiceLanguage | null
}

const languages: Array<{ value: TerminalLanguage; label: string }> = [
  { value: 'kk', label: 'Қаз' },
  { value: 'ru', label: 'Рус' },
  { value: 'en', label: 'Eng' },
]

const serviceLanguageOptions: Array<{ value: ServiceLanguage; label: string }> = [
  { value: 'KAZAKH', label: 'Қазақ тілі' },
  { value: 'RUSSIAN', label: 'Русский' },
  { value: 'ENGLISH', label: 'English' },
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
  autoResetSeconds: 30,
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

function getTicketResultCopy(language: TerminalLanguage) {
  if (language === 'kk') {
    return {
      title: 'Фото',
      subtitle: '',
      ticketLabel: 'Сіздің талоныңыз',
      serviceLabel: 'Қызмет',
      programLabel: 'Бағдарлама',
      printing: 'Талон басып шығарылуда...',
      returnButton: 'Қайту',
    }
  }

  if (language === 'en') {
    return {
      title: 'Photo',
      subtitle: '',
      ticketLabel: 'Your ticket',
      serviceLabel: 'Service',
      programLabel: 'Program',
      printing: 'Printing ticket...',
      returnButton: 'Back',
    }
  }

  return {
    title: 'Фото',
    subtitle: '',
    ticketLabel: 'Ваш талон',
    serviceLabel: 'Услуга',
    programLabel: 'Программа',
    printing: 'Печать талона...',
    returnButton: 'Вернуться',
  }
}

function getTicketServiceName(ticket: TerminalTicket, language: TerminalLanguage) {
  if (language === 'kk') return ticket.service_name_kk || ticket.service_name || ticket.service_name_en || '-'
  if (language === 'en') return ticket.service_name_en || ticket.service_name || ticket.service_name_kk || '-'
  return ticket.service_name || ticket.service_name_kk || ticket.service_name_en || '-'
}

function getTicketProgramName(ticket: TerminalTicket, language: TerminalLanguage) {
  if (language === 'kk') return ticket.educational_program_name_kk || ticket.educational_program_name || ticket.educational_program_name_en || ''
  if (language === 'en') return ticket.educational_program_name_en || ticket.educational_program_name || ticket.educational_program_name_kk || ''
  return ticket.educational_program_name || ticket.educational_program_name_kk || ticket.educational_program_name_en || ''
}

function getProgramChoiceTitle(language: TerminalLanguage) {
  if (language === 'kk') return 'Білім беру бағдарламасын таңдаңыз'
  if (language === 'en') return 'Choose an educational program'
  return 'Выберите образовательную программу'
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
  const [selectedStudyLanguage, setSelectedStudyLanguage] = useState<StudyLanguage | null>(null)
  const [selectedServiceLanguage, setSelectedServiceLanguage] = useState<ServiceLanguage | null>(null)
  const [modal, setModal] = useState<ModalKind>(null)
  const [lastTicket, setLastTicket] = useState<TerminalTicket | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const modalListRef = useRef<HTMLDivElement | null>(null)
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
  const mustSelectStudyLanguage = mustSelectProgram && Boolean(selectedProgram?.requires_service_language)
  const mustSelectServiceLanguage = Boolean(selectedService?.requires_service_language)
  const programChoiceTitle = getProgramChoiceTitle(language)

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
      resetTicket()
    }, config.autoResetSeconds * 1000)

    return () => window.clearTimeout(timeout)
  }, [config.autoResetSeconds, lastTicket])

  useEffect(() => {
    modalListRef.current?.scrollTo({ top: 0 })
  }, [modal])

  function scrollModalList(direction: -1 | 1) {
    const list = modalListRef.current
    if (!list) return

    list.scrollBy({
      top: direction * Math.max(280, Math.floor(list.clientHeight * 0.72)),
      behavior: 'smooth',
    })
  }

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
    setSelectedStudyLanguage(null)
    setSelectedServiceLanguage(null)
    setLastTicket(null)
    setMessage('')
    setError('')
    if (service.requires_service_language) setModal('service-language')
    else if (service.requires_educational_program) setModal('programs')
  }

  async function createTicket(draft: TicketDraft = {}) {
    setError('')
    setMessage('')

    const serviceForTicket = draft.service ?? selectedService
    const programForTicket = draft.program ?? selectedProgram
    const studyLanguageForTicket = draft.studyLanguage ?? selectedStudyLanguage
    const serviceLanguageForTicket = draft.serviceLanguage ?? selectedServiceLanguage
    const needsProgram = Boolean(serviceForTicket?.requires_educational_program)
    const needsStudyLanguage = needsProgram && Boolean(programForTicket?.requires_service_language)
    const needsServiceLanguage = Boolean(serviceForTicket?.requires_service_language)

    if (!serviceForTicket) {
      setError(t.serviceRequired)
      return
    }

    if (needsProgram && !programForTicket) {
      setError(t.programRequired)
      setModal('programs')
      return
    }

    if (needsStudyLanguage && !studyLanguageForTicket) {
      setError('Выберите язык консультации')
      setModal('study-language')
      return
    }

    if (needsServiceLanguage && !serviceLanguageForTicket) {
      setError('Выберите язык обслуживания')
      setModal('service-language')
      return
    }

    setModal(null)
    setBusy(true)

    try {
      const response = await window.terminalBridge.apiRequest<TerminalTicket>({
        path: '/public/tickets',
        method: 'POST',
        body: {
          service_id: serviceForTicket.id,
          educational_program_id: needsProgram ? programForTicket?.id ?? null : null,
          study_language: needsStudyLanguage ? studyLanguageForTicket : null,
          service_language: needsServiceLanguage ? serviceLanguageForTicket : null,
        },
      })

      if (!response.ok) throw new Error(getErrorMessage(response.payload, t.serverError))

      setLastTicket(response.payload)
      const printResult = await window.terminalBridge.printTicket(response.payload, language)

      setMessage(printResult.ok ? '' : `${t.printerFail}: ${printResult.message ?? ''}`)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : t.serverError)
    } finally {
      setBusy(false)
    }
  }

  function resetTicket() {
    setSelectedServiceId(null)
    setSelectedProgramId(null)
    setSelectedStudyLanguage(null)
    setSelectedServiceLanguage(null)
    setModal(null)
    setLastTicket(null)
    setMessage('')
    setError('')
  }

  if (lastTicket) {
    return (
      <TicketResultPage
        autoResetSeconds={config.autoResetSeconds}
        busy={busy}
        language={language}
        locale={t.locale}
        message={message}
        onBack={resetTicket}
        ticket={lastTicket}
      />
    )
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
                </button>
              ))}
            </div>
          )}
        </div>

        <aside className="ticket-panel">
          <div className="selection-summary">
            <span>{t.services}</span>
            <strong>{selectedService ? getLocalizedName(selectedService, language) : '-'}</strong>
            {mustSelectProgram ? (
              <button type="button" disabled={busy} onClick={() => setModal('programs')}>
                {selectedProgram ? getLocalizedName(selectedProgram, language) : t.chooseProgram}
              </button>
            ) : null}
            {mustSelectStudyLanguage ? (
              <button type="button" disabled={busy} onClick={() => setModal('study-language')}>
                {selectedStudyLanguage ?? 'Выберите язык консультации'}
              </button>
            ) : null}
            {mustSelectServiceLanguage ? (
              <button type="button" disabled={busy} onClick={() => setModal('service-language')}>
                {selectedServiceLanguage ?? 'Выберите язык обслуживания'}
              </button>
            ) : null}
          </div>

          {error ? <div className="notice error">{error}</div> : null}
          {message ? <div className="notice success">{message}</div> : null}
        </aside>
      </section>

      <footer className="kiosk-action-bar">
        <button className="issue-button" type="button" disabled={busy || loading || !selectedService} onClick={() => void createTicket()}>
          {busy ? <Loader2 className="spin" size={30} /> : <Printer size={30} />}
          {busy ? t.issuing : t.issue}
        </button>
      </footer>

      {modal === 'programs' ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setModal(null)}>
          <section className="choice-modal" role="dialog" aria-modal="true" aria-label={programChoiceTitle} onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <h2>{programChoiceTitle}</h2>
              <button type="button" aria-label="Close" onClick={() => setModal(null)}>
                <X size={26} />
              </button>
            </header>

            <div className="modal-scroll-shell">
              <div className="program-list" ref={modalListRef}>
                {programs.length === 0 ? <div className="empty-state small">{t.noPrograms}</div> : null}
                {programs.map((program) => (
                  <button
                    className={selectedProgramId === program.id ? 'selected' : ''}
                    key={program.id}
                    type="button"
                    onClick={() => {
                      setSelectedProgramId(program.id)
                      setSelectedStudyLanguage(null)
                      if (program.requires_service_language) {
                        setModal('study-language')
                      } else {
                        void createTicket({ program, studyLanguage: null })
                      }
                    }}
                  >
                    <strong>{getLocalizedName(program, language)}</strong>
                  </button>
                ))}
              </div>
              <div className="modal-scroll-controls" aria-label="Прокрутка списка">
                <button type="button" aria-label="Прокрутить вверх" onClick={() => scrollModalList(-1)}>
                  <ChevronUp size={42} />
                </button>
                <button type="button" aria-label="Прокрутить вниз" onClick={() => scrollModalList(1)}>
                  <ChevronDown size={42} />
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {modal === 'service-language' ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setModal(null)}>
          <section className="choice-modal" role="dialog" aria-modal="true" aria-label="Service language" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <h2>Выберите язык обслуживания</h2>
              <button type="button" aria-label="Close" onClick={() => setModal(null)}>
                <X size={26} />
              </button>
            </header>
            <div className="program-list">
              {serviceLanguageOptions.map((option) => (
                <button
                  className={selectedServiceLanguage === option.value ? 'selected' : ''}
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setSelectedServiceLanguage(option.value)
                    if (selectedService?.requires_educational_program) {
                      setModal('programs')
                    } else {
                      void createTicket({ serviceLanguage: option.value })
                    }
                  }}
                >
                  <strong>{option.label}</strong>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}
      {modal === 'study-language' ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setModal(null)}>
          <section className="choice-modal" role="dialog" aria-modal="true" aria-label="Consultation language" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <h2>Выберите язык консультации</h2>
              <button type="button" aria-label="Close" onClick={() => setModal(null)}>
                <X size={26} />
              </button>
            </header>
            <div className="program-list">
              {serviceLanguageOptions.map((option) => (
                <button
                  className={selectedStudyLanguage === option.value ? 'selected' : ''}
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setSelectedStudyLanguage(option.value)
                    void createTicket({ studyLanguage: option.value })
                  }}
                >
                  <strong>{option.label}</strong>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  )
}

function TicketResultPage({
  autoResetSeconds,
  busy,
  language,
  locale,
  message,
  onBack,
  ticket,
}: {
  autoResetSeconds: number
  busy: boolean
  language: TerminalLanguage
  locale: string
  message: string
  onBack: () => void
  ticket: TerminalTicket
}) {
  const copy = getTicketResultCopy(language)
  const programName = getTicketProgramName(ticket, language)

  return (
    <main className="ticket-result-page">
      <header className="ticket-result-header">
        <img src={logoUrl} alt="Turan Astana University" />
        <LiveClock locale={locale} />
      </header>

      <section className="ticket-result-content">
        <div className="ticket-result-instruction">
          <Camera size={72} />
          <h1>{copy.title}</h1>
          {copy.subtitle ? <p>{copy.subtitle}</p> : null}
        </div>

        <div className="ticket-result-status" aria-live="polite">
          {busy ? (
            <span>
              <Loader2 className="spin" size={24} />
              {copy.printing}
            </span>
          ) : message ? (
            <span>{message}</span>
          ) : null}
        </div>

        <article className="photo-ticket">
          <span>{copy.ticketLabel}</span>
          <strong>{ticket.ticket_number}</strong>
          <div className="photo-ticket-details">
            <p>
              <b>{copy.serviceLabel}</b>
              {getTicketServiceName(ticket, language)}
            </p>
            {programName ? (
              <p>
                <b>{copy.programLabel}</b>
                {programName}
              </p>
            ) : null}
            <time>{formatDateTime(ticket.created_at, locale)}</time>
          </div>
        </article>
      </section>

      <footer className="ticket-result-footer">
        <div className="ticket-return-progress" aria-hidden="true">
          <div
            key={ticket.id}
            style={{
              animationDuration: `${autoResetSeconds}s`,
              animationTimingFunction: `steps(${Math.max(1, autoResetSeconds)}, end)`,
            }}
          />
        </div>
        <button type="button" onClick={onBack}>
          <ArrowLeft size={28} />
          {copy.returnButton}
        </button>
      </footer>
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
