import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  adminApi,
  type MyWindowTickets,
  type TicketItem,
} from '../../features/admin/api/adminApi'
import type { AuthUser } from '../../features/auth/model/types'
import { refreshAuthTokens } from '../../shared/api/httpClient'
import { env } from '../../shared/config/env'
import { useTicketCallSound } from '../../shared/hooks/useTicketCallSound'
import { tokenStorage } from '../../shared/lib/tokenStorage'
import logoUrl from '../../assets/Logo+RGB.png'
import './operator-second-display-page.css'

type RealtimeState = 'connecting' | 'connected' | 'disconnected'
type DisplayLanguage = 'ru' | 'kk' | 'en'

const displayLanguages: DisplayLanguage[] = ['ru', 'kk', 'en']

const displayCopy: Record<
  DisplayLanguage,
  {
    locale: string
    windowTitle: string
    windowUnassigned: string
    windowStatusUnknown: string
    waitingCall: string
    serviceFallback: string
    loading: string
    ticketInvited: string
    noTicket: string
    noTicketDescription: string
    operator: string
    enableSound: string
    fullscreen: string
  }
> = {
  ru: {
    locale: 'ru-RU',
    windowTitle: 'Окно',
    windowUnassigned: 'Окно не назначено',
    windowStatusUnknown: 'Статус окна не определен',
    waitingCall: 'Ожидание вызова',
    serviceFallback: 'Услуга',
    loading: 'Загрузка...',
    ticketInvited: 'Приглашается талон',
    noTicket: 'Талон не вызван',
    noTicketDescription: 'После вызова следующего клиента номер появится здесь.',
    operator: 'Оператор',
    enableSound: 'Включить звук',
    fullscreen: 'На весь экран',
  },
  kk: {
    locale: 'kk-KZ',
    windowTitle: 'Терезе',
    windowUnassigned: 'Терезе тағайындалмаған',
    windowStatusUnknown: 'Терезе мәртебесі анықталмаған',
    waitingCall: 'Шақыруды күту',
    serviceFallback: 'Қызмет',
    loading: 'Жүктелуде...',
    ticketInvited: 'Талон шақырылады',
    noTicket: 'Талон шақырылған жоқ',
    noTicketDescription: 'Келесі клиент шақырылғаннан кейін нөмір осында шығады.',
    operator: 'Оператор',
    enableSound: 'Дыбысты қосу',
    fullscreen: 'Толық экран',
  },
  en: {
    locale: 'en-US',
    windowTitle: 'Window',
    windowUnassigned: 'Window is not assigned',
    windowStatusUnknown: 'Window status is unknown',
    waitingCall: 'Waiting for a call',
    serviceFallback: 'Service',
    loading: 'Loading...',
    ticketInvited: 'Ticket is invited',
    noTicket: 'No ticket called',
    noTicketDescription: 'The number will appear here after the next client is called.',
    operator: 'Operator',
    enableSound: 'Enable sound',
    fullscreen: 'Fullscreen',
  },
}

const windowStatusLabels: Record<DisplayLanguage, Record<string, string>> = {
  ru: {
    OPEN: 'Окно открыто',
    BUSY: 'Окно занято',
    CLOSED: 'Окно закрыто',
  },
  kk: {
    OPEN: 'Терезе ашық',
    BUSY: 'Терезе бос емес',
    CLOSED: 'Терезе жабық',
  },
  en: {
    OPEN: 'Window open',
    BUSY: 'Window busy',
    CLOSED: 'Window closed',
  },
}

function getMyWindowWebSocketUrl(token: string) {
  const baseUrl = env.apiWsBaseUrl.replace(/\/$/, '')
  const url = new URL(`${baseUrl}/ws/my-window`)
  url.searchParams.set('token', token)
  return url.toString()
}

function getCurrentTicket(data: MyWindowTickets | null) {
  if (!data) {
    return null
  }

  return data.tickets.find((ticket) => ticket.status === 'CALLED' && ticket.window_id === data.window_id) ?? null
}

function getServiceLabel(
  ticket: TicketItem | null,
  language: DisplayLanguage,
  copy: (typeof displayCopy)[DisplayLanguage],
) {
  if (!ticket) {
    return copy.waitingCall
  }

  const localizedName =
    language === 'kk'
      ? ticket.service_name_kk
      : language === 'en'
        ? ticket.service_name_en
        : ticket.service_name

  return localizedName ?? ticket.service_name ?? `${copy.serviceFallback} #${ticket.service_id}`
}

function getProgramLabel(ticket: TicketItem | null, language: DisplayLanguage) {
  if (!ticket) {
    return null
  }

  const localizedName =
    language === 'kk'
      ? ticket.educational_program_name_kk
      : language === 'en'
        ? ticket.educational_program_name_en
        : ticket.educational_program_name

  return localizedName ?? ticket.educational_program_name
}

function getWindowName(data: MyWindowTickets | null, copy: (typeof displayCopy)[DisplayLanguage]) {
  if (!data) {
    return copy.windowUnassigned
  }

  const sourceName = data.window_name?.trim()

  if (sourceName) {
    const commonName = sourceName.match(/^(?:Окно|Терезе|Window)\s*(.+)$/i)
    return commonName?.[1] ? `${copy.windowTitle} ${commonName[1]}` : sourceName
  }

  return `${copy.windowTitle} #${data.window_id}`
}

function getFullscreenSupported() {
  return Boolean(document.fullscreenEnabled && document.documentElement.requestFullscreen)
}

function getTicketCallKey(ticket: TicketItem | null) {
  if (!ticket) {
    return ''
  }

  return `${ticket.id}:${ticket.window_id ?? ''}:${ticket.called_at ?? ''}`
}

export function OperatorSecondDisplayPage({ authUser }: { authUser: AuthUser }) {
  const [data, setData] = useState<MyWindowTickets | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(() => new Date())
  const [languageIndex, setLanguageIndex] = useState(0)
  const [realtimeState, setRealtimeState] = useState<RealtimeState>('disconnected')
  const [fullscreenError, setFullscreenError] = useState('')
  const observedDisplayRef = useRef(false)
  const lastTicketCallKeyRef = useRef('')
  const { enableSound, isSoundBlocked, isSoundReady, playSound } = useTicketCallSound()
  const currentTicket = getCurrentTicket(data)
  const currentTicketCallKey = getTicketCallKey(currentTicket)
  const displayLanguage = displayLanguages[languageIndex] ?? 'ru'
  const copy = displayCopy[displayLanguage]
  const programLabel = getProgramLabel(currentTicket, displayLanguage)
  const windowName = getWindowName(data, copy)
  const windowStatusText = data?.window_status
    ? windowStatusLabels[displayLanguage][data.window_status] ?? data.window_status
    : copy.windowStatusUnknown
  const timeText = useMemo(
    () => now.toLocaleTimeString(copy.locale, { hour: '2-digit', minute: '2-digit' }),
    [copy.locale, now],
  )

  const loadDisplay = useCallback(async () => {
    try {
      const nextData = await adminApi.tickets.myWindow({ page_size: 20 })
      setData(nextData)
      setError('')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось загрузить второй дисплей')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const enterFullscreen = useCallback(async () => {
    setFullscreenError('')

    if (!getFullscreenSupported()) {
      setFullscreenError('Браузер не поддерживает полноэкранный режим для этой страницы.')
      return
    }

    try {
      await document.documentElement.requestFullscreen()
    } catch {
      setFullscreenError('Нажмите кнопку еще раз в этом окне, если браузер заблокировал автозапуск.')
    }
  }, [])

  useEffect(() => {
    const localizedPath = `/${window.location.pathname.split('/').filter(Boolean)[0] || 'ru'}/admin/operator-display`
    if (!window.location.pathname.endsWith('/admin/operator-display')) {
      window.history.replaceState(null, '', `${localizedPath}${window.location.search}${window.location.hash}`)
    }
  }, [])

  useEffect(() => {
    void loadDisplay()
    const refreshId = window.setInterval(() => void loadDisplay(), 30000)

    return () => window.clearInterval(refreshId)
  }, [loadDisplay])

  useEffect(() => {
    const clockId = window.setInterval(() => setNow(new Date()), 1000)

    return () => window.clearInterval(clockId)
  }, [])

  useEffect(() => {
    const languageId = window.setInterval(
      () => setLanguageIndex((currentIndex) => (currentIndex + 1) % displayLanguages.length),
      6000,
    )

    return () => window.clearInterval(languageId)
  }, [])

  useEffect(() => {
    if (!data) {
      return
    }

    const previousTicketCallKey = lastTicketCallKeyRef.current
    if (
      observedDisplayRef.current &&
      currentTicketCallKey &&
      currentTicketCallKey !== previousTicketCallKey
    ) {
      void playSound()
    }

    lastTicketCallKeyRef.current = currentTicketCallKey
    observedDisplayRef.current = true
  }, [currentTicketCallKey, data, playSound])

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('fullscreen') === '1') {
      window.setTimeout(() => void enterFullscreen(), 200)
    }
  }, [enterFullscreen])

  useEffect(() => {
    if (!tokenStorage.hasTokens()) {
      setRealtimeState('disconnected')
      return
    }

    let socket: WebSocket | null = null
    let reconnectTimer: number | undefined
    let refreshTimer: number | undefined
    let closed = false

    async function connect(forceTokenRefresh = false) {
      setRealtimeState('connecting')
      let accessToken = tokenStorage.getAccessToken()

      if (forceTokenRefresh || !accessToken) {
        const tokens = await refreshAuthTokens().catch(() => null)
        accessToken = tokens?.access_token ?? tokenStorage.getAccessToken()
      }

      if (!accessToken || closed) {
        setRealtimeState('disconnected')
        return
      }

      socket = new WebSocket(getMyWindowWebSocketUrl(accessToken))

      socket.onopen = () => setRealtimeState('connected')
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
        refreshTimer = window.setTimeout(() => void loadDisplay(), 120)
      }
      socket.onclose = (event) => {
        if (closed) {
          return
        }

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
  }, [loadDisplay])

  return (
    <main className="operator-display-shell">
      <header className="operator-display-header">
        <img src={logoUrl} alt="Turan Astana University" />
        <div className="operator-display-status">
          <span className={`operator-display-realtime ${realtimeState}`} aria-hidden="true" />
          <strong>{timeText}</strong>
        </div>
      </header>

      <section className="operator-display-stage" aria-live="polite">
        <div className="operator-window-label">{copy.windowTitle}</div>
        <h1>{windowName}</h1>
        <div className={`operator-display-window-state ${data?.window_status?.toLowerCase() ?? 'unknown'}`}>
          {windowStatusText}
        </div>

        {loading ? (
          <div className="operator-display-placeholder">{copy.loading}</div>
        ) : currentTicket ? (
          <div className="operator-ticket-call">
            <span>{copy.ticketInvited}</span>
            <strong>{currentTicket.ticket_number}</strong>
            <p>{getServiceLabel(currentTicket, displayLanguage, copy)}</p>
            {programLabel && <small>{programLabel}</small>}
          </div>
        ) : (
          <div className="operator-display-placeholder">
            <strong>В ожидании следующего</strong>
          </div>
        )}
      </section>

      <footer className="operator-display-footer">
        <div>
          <span>{copy.operator}</span>
          <strong>{authUser.full_name}</strong>
        </div>
        <div className="operator-display-actions">
          {!isSoundReady && (
            <button
              className={isSoundBlocked ? 'blocked' : ''}
              type="button"
              onClick={() => void enableSound()}
            >
              {copy.enableSound}
            </button>
          )}
          <button type="button" onClick={enterFullscreen}>
            {copy.fullscreen}
          </button>
        </div>
      </footer>

      {(error || fullscreenError) && (
        <div className="operator-display-alert">
          {error || fullscreenError}
        </div>
      )}
    </main>
  )
}
