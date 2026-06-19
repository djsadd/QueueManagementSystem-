import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import logoUrl from '../../assets/Logo+RGB.png'
import { ApiError } from '../../shared/api/httpClient'
import { Button } from '../../shared/ui/Button'
import {
  publicApi,
  type PublicEducationalProgramItem,
  type PublicServiceItem,
  type PublicTicketItem,
  type TicketCreatePayload,
} from '../../features/public/api/publicApi'
import './public-ticket-page.css'

type Lang = 'kk' | 'ru' | 'en'
type ServiceLanguage = 'KAZAKH' | 'RUSSIAN' | 'ENGLISH'
type TicketFormState = TicketCreatePayload
type ChoiceModalKind = 'services' | 'programs' | 'service-language' | 'study-language' | null

const LANG_STORAGE_KEY = 'public-ticket-language'
const languages: Array<{ value: Lang; label: string }> = [
  { value: 'kk', label: 'Қаз' },
  { value: 'ru', label: 'Рус' },
  { value: 'en', label: 'Eng' },
]
const serviceLanguageOptions: Array<{ value: ServiceLanguage; label: string }> = [
  { value: 'KAZAKH', label: 'KAZ' },
  { value: 'RUSSIAN', label: 'RUS' },
  { value: 'ENGLISH', label: 'ENG' },
]

const initialForm: TicketFormState = {
  service_id: 0,
  educational_program_id: null,
  study_language: null,
  service_language: null,
}

const translations = {
  kk: {
    locale: 'kk-KZ',
    aria: 'Талонды тіркеу',
    eyebrow: 'Электрондық кезек',
    title: 'Талапкер талонын тіркеу',
    lead: 'Қызметті таңдаңыз және оператор шақырғанға дейін күтуге арналған талон нөмірін алыңыз.',
    adminLogin: 'Қызметкерлерге кіру',
    formTitle: 'Талон алу',
    fullName: 'Т.А.Ә.',
    fullNamePlaceholder: 'Мысалы, Иванов Иван Иванович',
    iin: 'ЖСН',
    iinPlaceholder: '12 сан',
    phone: 'Телефон',
    service: 'Қызмет',
    selectService: 'Қызметті таңдаңыз',
    educationalProgram: 'Білім беру бағдарламасы',
    selectEducationalProgram: 'Бағдарламаны таңдаңыз',
    programRequired: 'Бұл қызмет үшін білім беру бағдарламасын таңдаңыз',
    loadingError: 'Қызметтер тізімін жүктеу мүмкін болмады',
    iinError: 'ЖСН 12 саннан тұруы керек',
    validationError: 'Форманың дұрыс толтырылғанын тексеріңіз',
    serviceUnavailable: 'Таңдалған қызмет қолжетімсіз',
    submitError: 'Талонды тіркеу мүмкін болмады',
    submit: 'Талон алу',
    submitting: 'Тіркелуде...',
    goToTicket: 'Талонға өту',
    ticketLabel: 'Сіздің талоныңыз',
    ticketTitle: 'Талон тіркелді',
    ticketCreatedNote: 'Талон дайын. Оны бөлек бетте ашып, деректерді тексеріңіз.',
    queueNumber: 'Кезектегі нөмір',
    wait: 'Күту уақыты',
    minutes: 'мин.',
    waitUnknown: 'нақтылануда',
    createdAt: 'Тіркелген уақыты',
    applicantData: 'Талапкер деректері',
    downloadPdf: 'Басып шығару',
    reset: 'Жаңа талон тіркеу',
    pendingTitle: 'Талон нөмірі осы жерде пайда болады',
    pendingNote: 'Форманы жібергеннен кейін бөлек талон бетіне өтуге болады.',
    loadingTicket: 'Талон жүктелуде...',
    ticketNotFound: 'Талонды табу мүмкін болмады',
  },
  ru: {
    locale: 'ru-RU',
    aria: 'Регистрация талона',
    eyebrow: 'Электронная очередь',
    title: 'Регистрация талона абитуриента',
    lead: 'Выберите услугу и получите номер талона для ожидания вызова к оператору.',
    adminLogin: 'Вход для сотрудников',
    formTitle: 'Получение талона',
    fullName: 'ФИО',
    fullNamePlaceholder: 'Например, Иванов Иван Иванович',
    iin: 'ИИН',
    iinPlaceholder: '12 цифр',
    phone: 'Телефон',
    service: 'Услуга',
    selectService: 'Выберите услугу',
    educationalProgram: 'Образовательная программа',
    selectEducationalProgram: 'Выберите программу',
    programRequired: 'Для этой услуги выберите образовательную программу',
    loadingError: 'Не удалось загрузить список услуг',
    iinError: 'ИИН должен состоять из 12 цифр',
    validationError: 'Проверьте правильность заполнения формы',
    serviceUnavailable: 'Выбранная услуга недоступна',
    submitError: 'Не удалось зарегистрировать талон',
    submit: 'Получить талон',
    submitting: 'Регистрация...',
    goToTicket: 'Перейти к талону',
    ticketLabel: 'Ваш талон',
    ticketTitle: 'Талон зарегистрирован',
    ticketCreatedNote: 'Талон готов. Откройте отдельную страницу, чтобы проверить данные.',
    queueNumber: 'Номер в очереди',
    wait: 'Ожидание',
    minutes: 'мин.',
    waitUnknown: 'уточняется',
    createdAt: 'Дата регистрации',
    applicantData: 'Данные абитуриента',
    downloadPdf: 'Распечатать',
    reset: 'Зарегистрировать новый талон',
    pendingTitle: 'Здесь появится номер талона',
    pendingNote: 'После отправки формы можно будет перейти на отдельную страницу талона.',
    loadingTicket: 'Загрузка талона...',
    ticketNotFound: 'Не удалось найти талон',
  },
  en: {
    locale: 'en-US',
    aria: 'Ticket registration',
    eyebrow: 'Digital queue',
    title: 'Applicant ticket registration',
    lead: 'Choose a service and get a ticket number while you wait for an operator.',
    adminLogin: 'Staff sign in',
    formTitle: 'Get a ticket',
    fullName: 'Full name',
    fullNamePlaceholder: 'For example, Ivan Ivanov',
    iin: 'IIN',
    iinPlaceholder: '12 digits',
    phone: 'Phone',
    service: 'Service',
    selectService: 'Select a service',
    educationalProgram: 'Educational program',
    selectEducationalProgram: 'Select a program',
    programRequired: 'Select an educational program for this service',
    loadingError: 'Could not load services',
    iinError: 'IIN must contain 12 digits',
    validationError: 'Please check the form fields',
    serviceUnavailable: 'Selected service is unavailable',
    submitError: 'Could not register the ticket',
    submit: 'Get ticket',
    submitting: 'Registering...',
    goToTicket: 'Open ticket',
    ticketLabel: 'Your ticket',
    ticketTitle: 'Ticket registered',
    ticketCreatedNote: 'The ticket is ready. Open the separate page to check the details.',
    queueNumber: 'Queue number',
    wait: 'Wait time',
    minutes: 'min.',
    waitUnknown: 'to be confirmed',
    createdAt: 'Registered at',
    applicantData: 'Applicant details',
    downloadPdf: 'Print',
    reset: 'Register a new ticket',
    pendingTitle: 'Your ticket number will appear here',
    pendingNote: 'After submitting the form, you can open the separate ticket page.',
    loadingTicket: 'Loading ticket...',
    ticketNotFound: 'Could not find the ticket',
  },
} as const

function getInitialLang(): Lang {
  const savedLang = localStorage.getItem(LANG_STORAGE_KEY)

  return languages.some((language) => language.value === savedLang) ? (savedLang as Lang) : 'ru'
}

function getTicketIdFromPath() {
  const parts = window.location.pathname.split('/').filter(Boolean)

  return parts[0] === 'ticket' ? parts[1] ?? null : null
}

function formatDateTime(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function requiresEducationalProgram(service: PublicServiceItem | undefined) {
  return Boolean(service?.requires_educational_program)
}

function requiresServiceLanguage(service: PublicServiceItem | undefined) {
  return Boolean(service?.requires_service_language)
}

function getLocalizedName(item: { name: string; name_kk: string; name_en: string }, lang: Lang) {
  return lang === 'kk' ? item.name_kk : lang === 'en' ? item.name_en : item.name
}

function sanitizePdfFileName(value: string) {
  return Array.from(value, (character) => (character.charCodeAt(0) < 32 ? '' : character))
    .join('')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function printTicket(ticket: PublicTicketItem, serviceName: string | null) {
  const previousTitle = document.title
  const ticketServiceName = serviceName?.trim() || ticket.service_name?.trim() || `service-${ticket.service_id}`
  const printTitle = sanitizePdfFileName(`${ticket.ticket_number} _ ${ticketServiceName}`)

  document.title = printTitle || ticket.ticket_number
  window.print()
  window.setTimeout(() => {
    document.title = previousTitle
  }, 500)
}

export function PublicTicketPage() {
  const [lang, setLang] = useState<Lang>(getInitialLang)
  const [ticketId, setTicketId] = useState<string | null>(getTicketIdFromPath)
  const [services, setServices] = useState<PublicServiceItem[]>([])
  const [educationalPrograms, setEducationalPrograms] = useState<PublicEducationalProgramItem[]>([])
  const [form, setForm] = useState<TicketFormState>(initialForm)
  const [ticket, setTicket] = useState<PublicTicketItem | null>(null)
  const autoPrintTicketId = useRef<string | null>(null)
  const [isLoadingServices, setIsLoadingServices] = useState(true)
  const [isLoadingTicket, setIsLoadingTicket] = useState(Boolean(ticketId))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [choiceModal, setChoiceModal] = useState<ChoiceModalKind>(null)
  const t = translations[lang]

  useEffect(() => {
    localStorage.setItem(LANG_STORAGE_KEY, lang)
    document.documentElement.lang = lang
  }, [lang])

  useEffect(() => {
    function syncTicketRoute() {
      setTicketId(getTicketIdFromPath())
    }

    window.addEventListener('popstate', syncTicketRoute)

    return () => window.removeEventListener('popstate', syncTicketRoute)
  }, [])

  useEffect(() => {
    async function loadServices() {
      setIsLoadingServices(true)
      setError('')

      try {
        const [activeServices, activePrograms] = await Promise.all([
          publicApi.services.list(),
          publicApi.educationalPrograms.list(),
        ])
        setServices(activeServices)
        setEducationalPrograms(activePrograms)
        setForm((current) => ({
          ...current,
          service_id: current.service_id || activeServices[0]?.id || 0,
        }))
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : t.loadingError)
      } finally {
        setIsLoadingServices(false)
      }
    }

    void loadServices()
  }, [t.loadingError])

  useEffect(() => {
    async function loadTicket() {
      if (!ticketId) {
        setTicket(null)
        setIsLoadingTicket(false)
        return
      }

      if (ticket?.id === ticketId) {
        setIsLoadingTicket(false)
        return
      }

      setIsLoadingTicket(true)
      setError('')

      try {
        setTicket(await publicApi.tickets.get(ticketId))
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : t.ticketNotFound)
      } finally {
        setIsLoadingTicket(false)
      }
    }

    void loadTicket()
  }, [ticket?.id, ticketId, t.ticketNotFound])

  const selectedService = useMemo(
    () => services.find((service) => service.id === form.service_id || service.id === ticket?.service_id),
    [form.service_id, services, ticket?.service_id],
  )
  const selectedEducationalProgram = useMemo(
    () => educationalPrograms.find((program) => program.id === form.educational_program_id),
    [educationalPrograms, form.educational_program_id],
  )
  const mustSelectEducationalProgram = requiresEducationalProgram(selectedService)
  const mustSelectServiceLanguage = requiresServiceLanguage(selectedService)

  function selectService(service: PublicServiceItem) {
    setForm((current) => ({
      ...current,
      service_id: service.id,
      educational_program_id: null,
      study_language: null,
      service_language: null,
    }))
    setChoiceModal(null)
    if (service.requires_service_language) {
      setChoiceModal('service-language')
    }
  }

  function selectEducationalProgram(program: PublicEducationalProgramItem) {
    setForm((current) => ({
      ...current,
      educational_program_id: program.id,
      study_language: null,
    }))
    setChoiceModal(null)
  }

  useEffect(() => {
    if (!autoPrintTicketId.current || ticket?.id !== autoPrintTicketId.current || ticketId !== autoPrintTicketId.current || isLoadingTicket) {
      return
    }

    autoPrintTicketId.current = null
    window.requestAnimationFrame(() => printTicket(ticket, ticket.service_name ?? selectedService?.name ?? null))
  }, [isLoadingTicket, selectedService?.name, ticket, ticketId])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setTicket(null)

    if (mustSelectEducationalProgram && !form.educational_program_id) {
      setError(t.programRequired)
      return
    }

    if (mustSelectEducationalProgram && !form.study_language) {
      setError('Выберите язык ОП')
      return
    }

    if (mustSelectServiceLanguage && !form.service_language) {
      setError('Выберите язык обслуживания')
      return
    }

    if (!form.service_id) {
      setError(t.selectService)
      return
    }

    setIsSubmitting(true)

    try {
      const createdTicket = await publicApi.tickets.create({
        service_id: form.service_id,
        educational_program_id: mustSelectEducationalProgram ? form.educational_program_id : null,
        study_language: mustSelectEducationalProgram ? form.study_language : null,
        service_language: mustSelectServiceLanguage ? form.service_language : null,
      })

      setTicket(createdTicket)
      autoPrintTicketId.current = createdTicket.id
      window.history.pushState(null, '', `/ticket/${createdTicket.id}`)
      setTicketId(createdTicket.id)
    } catch (caughtError) {
      if (caughtError instanceof ApiError && caughtError.status === 422) {
        setError(t.validationError)
      } else if (caughtError instanceof ApiError && caughtError.status === 404) {
        setError(t.serviceUnavailable)
      } else {
        setError(caughtError instanceof Error ? caughtError.message : t.submitError)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  function resetTicket() {
    setTicket(null)
    setTicketId(null)
    setError('')
    setForm((current) => ({
      ...initialForm,
      service_id: current.service_id || services[0]?.id || 0,
    }))
    window.history.pushState(null, '', '/')
  }

  return (
    <main className={ticketId ? 'public-ticket-page ticket-page-only' : 'public-ticket-page'}>
      <section className="ticket-hero" aria-label={t.aria}>
        <div className="ticket-hero-main">
          <img className="ticket-logo" src={logoUrl} alt="Turan Astana University" />
          <div>
            <p className="ticket-eyebrow">{t.eyebrow}</p>
            <h1>{ticketId ? t.ticketTitle : t.title}</h1>
            {!ticketId ? <p className="ticket-lead">{t.lead}</p> : null}
          </div>
        </div>
        <div className="ticket-hero-actions">
          <div className="language-switcher" aria-label="Language switcher">
            {languages.map((language) => (
              <button
                className={language.value === lang ? 'is-active' : ''}
                key={language.value}
                onClick={() => setLang(language.value)}
                type="button"
              >
                {language.label}
              </button>
            ))}
          </div>
          <a className="admin-link" href="/ru/admin/services">
            {t.adminLogin}
          </a>
        </div>
      </section>

      {ticketId && window.location.pathname.startsWith('/ticket/') ? (
        <TicketSlip
          error={error}
          isLoading={isLoadingTicket}
          onReset={resetTicket}
          selectedService={selectedService}
          t={t}
          ticket={ticket}
        />
      ) : (
        <section className="ticket-workspace">
          <form className="ticket-form" onSubmit={handleSubmit}>
            <div className="form-section-header">
              <h2>{t.formTitle}</h2>
            </div>

            <div className="ticket-choice-field">
              <span>{t.service}</span>
              <button
                className="ticket-choice-trigger"
                disabled={isLoadingServices || services.length === 0}
                type="button"
                onClick={() => setChoiceModal('services')}
              >
                <strong>{selectedService ? getLocalizedName(selectedService, lang) : t.selectService}</strong>
              </button>
            </div>

            {mustSelectEducationalProgram ? (
              <div className="ticket-choice-field">
                <span>{t.educationalProgram}</span>
                <button
                  className="ticket-choice-trigger"
                  disabled={educationalPrograms.length === 0}
                  type="button"
                  onClick={() => setChoiceModal('programs')}
                >
                  <strong>
                    {selectedEducationalProgram
                      ? getLocalizedName(selectedEducationalProgram, lang)
                      : t.selectEducationalProgram}
                  </strong>
                </button>
              </div>
            ) : null}

            {mustSelectEducationalProgram ? (
              <div className="ticket-choice-field">
                <span>Язык ОП</span>
                <button
                  className="ticket-choice-trigger"
                  type="button"
                  onClick={() => setChoiceModal('study-language')}
                >
                  <strong>{form.study_language ?? 'Выберите язык ОП'}</strong>
                </button>
              </div>
            ) : null}

            {mustSelectServiceLanguage ? (
              <div className="ticket-choice-field">
                <span>Язык обслуживания</span>
                <button
                  className="ticket-choice-trigger"
                  type="button"
                  onClick={() => setChoiceModal('service-language')}
                >
                  <strong>{form.service_language ?? 'Выберите язык обслуживания'}</strong>
                </button>
              </div>
            ) : null}

            {error ? <div className="ticket-alert">{error}</div> : null}

            <Button disabled={isSubmitting || isLoadingServices || services.length === 0} type="submit">
              {isSubmitting ? t.submitting : t.submit}
            </Button>
          </form>

          <aside className="ticket-result" aria-live="polite">
            {ticket ? (
              <>
                <p className="result-label">{t.ticketLabel}</p>
                <strong className="ticket-number compact">{ticket.ticket_number}</strong>
                <p className="result-note">{t.ticketCreatedNote}</p>
                <Button
                  type="button"
                  onClick={() => {
                    window.history.pushState(null, '', `/ticket/${ticket.id}`)
                    setTicketId(ticket.id)
                  }}
                >
                  {t.goToTicket}
                </Button>
              </>
            ) : (
              <>
                <p className="result-label">{t.ticketLabel}</p>
                <strong className="result-placeholder">{t.pendingTitle}</strong>
                <p className="result-note">{t.pendingNote}</p>
              </>
            )}
          </aside>
        </section>
      )}

      {choiceModal === 'services' ? (
        <TicketChoiceModal
          emptyLabel={t.selectService}
          getLabel={(service) => getLocalizedName(service, lang)}
          items={services}
          onClose={() => setChoiceModal(null)}
          onSelect={selectService}
          selectedId={form.service_id}
          title={t.selectService}
        />
      ) : null}

      {choiceModal === 'programs' ? (
        <TicketChoiceModal
          emptyLabel={t.selectEducationalProgram}
          getLabel={(program) => getLocalizedName(program, lang)}
          items={educationalPrograms}
          onClose={() => setChoiceModal(null)}
          onSelect={selectEducationalProgram}
          selectedId={form.educational_program_id ?? null}
          title={t.selectEducationalProgram}
        />
      ) : null}

      {choiceModal === 'service-language' ? (
        <TicketChoiceModal
          emptyLabel="Выберите язык обслуживания"
          getLabel={(item) => item.label}
          items={serviceLanguageOptions.map((item, index) => ({ ...item, id: index + 1 }))}
          onClose={() => setChoiceModal(null)}
          onSelect={(item) => {
            setForm((current) => ({ ...current, service_language: item.value }))
            setChoiceModal(mustSelectEducationalProgram ? 'programs' : null)
          }}
          selectedId={
            serviceLanguageOptions.findIndex((item) => item.value === form.service_language) + 1 || null
          }
          title="Выберите язык обслуживания"
        />
      ) : null}

      {choiceModal === 'study-language' ? (
        <TicketChoiceModal
          emptyLabel="Выберите язык ОП"
          getLabel={(item) => item.label}
          items={serviceLanguageOptions.map((item, index) => ({ ...item, id: index + 1 }))}
          onClose={() => setChoiceModal(null)}
          onSelect={(item) => {
            setForm((current) => ({ ...current, study_language: item.value }))
            setChoiceModal(null)
          }}
          selectedId={serviceLanguageOptions.findIndex((item) => item.value === form.study_language) + 1 || null}
          title="Выберите язык ОП"
        />
      ) : null}
    </main>
  )
}

function TicketChoiceModal<TItem extends { id: number; code?: string }>({
  emptyLabel,
  getLabel,
  items,
  onClose,
  onSelect,
  selectedId,
  title,
}: {
  emptyLabel: string
  getLabel: (item: TItem) => string
  items: TItem[]
  onClose: () => void
  onSelect: (item: TItem) => void
  selectedId: number | null
  title: string
}) {
  return (
    <div className="ticket-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="ticket-choice-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="ticket-choice-modal-header">
          <h2>{title}</h2>
          <button className="ticket-choice-modal-close" type="button" aria-label="Close" onClick={onClose}>
            x
          </button>
        </header>

        <div className="ticket-choice-list modal-list" role="radiogroup" aria-label={title}>
          {items.length === 0 ? <p className="ticket-choice-empty">{emptyLabel}</p> : null}
          {items.map((item) => {
            const selected = selectedId === item.id

            return (
              <button
                className={selected ? 'ticket-choice selected' : 'ticket-choice'}
                key={item.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(item)}
              >
                <strong>{getLabel(item)}</strong>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function TicketSlip({
  error,
  isLoading,
  onReset,
  selectedService,
  t,
  ticket,
}: {
  error: string
  isLoading: boolean
  onReset: () => void
  selectedService: PublicServiceItem | undefined
  t: (typeof translations)[Lang]
  ticket: PublicTicketItem | null
}) {
  if (isLoading) {
    return <section className="ticket-slip loading">{t.loadingTicket}</section>
  }

  if (!ticket) {
    return (
      <section className="ticket-slip loading">
        <p>{error || t.ticketNotFound}</p>
        <Button type="button" onClick={onReset}>
          {t.reset}
        </Button>
      </section>
    )
  }

  const serviceNames = [
    ticket.service_name_kk ?? selectedService?.name_kk,
    ticket.service_name ?? selectedService?.name,
    ticket.service_name_en ?? selectedService?.name_en,
  ].filter((value): value is string => Boolean(value))
  const programNames = [
    ticket.educational_program_name_kk,
    ticket.educational_program_name,
    ticket.educational_program_name_en,
  ].filter((value): value is string => Boolean(value))

  return (
    <section className="ticket-slip" aria-live="polite">
      <div className="ticket-slip-header">
        <img className="ticket-slip-logo" src={logoUrl} alt="Turan Astana University" />
        <p className="result-label">{t.ticketLabel}</p>
        <strong className="ticket-number">{ticket.ticket_number}</strong>
      </div>

      <dl className="ticket-details ticket-slip-details">
        <div>
          <dt>{t.service}</dt>
          <dd className="ticket-service-name multilingual-value">
            {(serviceNames.length ? serviceNames : [`ID ${ticket.service_id}`]).map((name, index) => (
              <span key={`${name}-${index}`}>{name}</span>
            ))}
          </dd>
        </div>
        {ticket.educational_program_name ? (
          <div>
            <dt>{t.educationalProgram}</dt>
            <dd className="multilingual-value">
              {programNames.map((name, index) => (
                <span key={`${name}-${index}`}>{name}</span>
              ))}
            </dd>
          </div>
        ) : null}
      </dl>

      <p className="ticket-slip-date">
        <span>{t.createdAt}</span>
        {formatDateTime(ticket.created_at, t.locale)}
      </p>

      <div className="ticket-slip-actions">
        <Button type="button" onClick={() => printTicket(ticket, ticket.service_name ?? selectedService?.name ?? null)}>
          {t.downloadPdf}
        </Button>
        <Button type="button" variant="secondary" onClick={onReset}>
          {t.reset}
        </Button>
      </div>
    </section>
  )
}
