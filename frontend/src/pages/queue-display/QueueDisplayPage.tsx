import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  publicApi,
  type PublicTicketItem,
  type QueueDisplayPayload,
} from '../../features/public/api/publicApi'
import notificationSoundUrl from '../../assets/message-notification-sound-imassage-on-iphone.mp3'
import { env } from '../../shared/config/env'
import './queue-display-page.css'

type Lang = 'kk' | 'ru' | 'en'
type AnimationState = 'entering' | 'present' | 'exiting'
type AnimatedTicket = PublicTicketItem & { animationState: AnimationState }

const animationDuration = 420

const ticketLabels: Record<Lang, string> = {
  kk: 'Талон',
  ru: 'Талон',
  en: 'Ticket',
}

const windowLabels: Record<Lang, string> = {
  kk: 'Терезе',
  ru: 'Окно',
  en: 'Window',
}

const displayLangOrder: Lang[] = ['ru', 'kk', 'en']
const languageRotationMs = 3000

const translations = {
  kk: {
    locale: 'kk-KZ',
    currentTime: 'Ағымдағы уақыт',
    serving: 'Қазір қызмет көрсетілуде',
    next: 'Келесі кезекте',
    emptyServing: 'Қазір шақырылған талон жоқ',
    emptyNext: 'Кезекте талон жоқ',
    unknown: 'Көрсетілмеген',
  },
  ru: {
    locale: 'ru-RU',
    currentTime: 'Текущее время',
    serving: 'Сейчас обслуживаются',
    next: 'Следующие в очереди',
    emptyServing: 'Сейчас нет вызванных талонов',
    emptyNext: 'В очереди нет талонов',
    unknown: 'Не указано',
  },
  en: {
    locale: 'en-US',
    currentTime: 'Current Time',
    serving: 'Currently Being Served',
    next: 'Next in Queue',
    emptyServing: 'No tickets are being served',
    emptyNext: 'No tickets in queue',
    unknown: 'Not specified',
  },
} satisfies Record<Lang, Record<string, string>>

function getInitialLang(): Lang {
  const pathLang = window.location.pathname.split('/').filter(Boolean)[0]
  return pathLang === 'kk' || pathLang === 'ru' || pathLang === 'en' ? pathLang : 'ru'
}

function buildDisplayPath(lang: Lang) {
  return `/${lang}/queue-display`
}

function getQueueDisplayWebSocketUrl() {
  const baseUrl = env.apiWsBaseUrl.replace(/\/$/, '')
  return `${baseUrl}/ws/queue-display`
}

function getDesk(ticket: PublicTicketItem, unknown: string) {
  return ticket.window_name ?? (ticket.window_id ? `#${ticket.window_id}` : unknown)
}

function getAnimationClass(state: AnimationState) {
  return `display-ticket-${state}`
}

function getServingCallKey(ticket: PublicTicketItem) {
  return `${ticket.id}:${ticket.window_id ?? ticket.window_name ?? ''}:${ticket.called_at ?? ''}`
}

function hasAssignedDesk(ticket: PublicTicketItem) {
  return ticket.window_id !== null || Boolean(ticket.window_name)
}

async function playTicketCallSound() {
  const audio = new Audio(notificationSoundUrl)
  audio.preload = 'auto'
  audio.currentTime = 0

  try {
    await audio.play()
  } catch {
    // Browser autoplay policy can block sound until the display page receives a user gesture.
  }
}

function useAnimatedTickets(tickets: PublicTicketItem[]) {
  const [items, setItems] = useState<AnimatedTicket[]>([])
  const itemsRef = useRef<AnimatedTicket[]>([])
  const removalTimers = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    const nextIds = new Set(tickets.map((ticket) => ticket.id))
    const currentItems = itemsRef.current
    const currentById = new Map(currentItems.map((ticket) => [ticket.id, ticket]))
    const removedIds: string[] = []
    const nextItems = tickets.map<AnimatedTicket>((ticket) => {
      const current = currentById.get(ticket.id)
      const timer = removalTimers.current.get(ticket.id)

      if (timer) {
        window.clearTimeout(timer)
        removalTimers.current.delete(ticket.id)
      }

      return {
        ...ticket,
        animationState: current && current.animationState !== 'exiting' ? 'present' : 'entering',
      }
    })

    const exitingItems = currentItems
      .filter((ticket) => !nextIds.has(ticket.id))
      .map<AnimatedTicket>((ticket) => {
        if (ticket.animationState !== 'exiting') {
          removedIds.push(ticket.id)
        }

        return { ...ticket, animationState: 'exiting' }
      })
    const mergedItems = [...nextItems, ...exitingItems]
    itemsRef.current = mergedItems
    setItems(mergedItems)

    removedIds.forEach((ticketId) => {
      const timer = window.setTimeout(() => {
        removalTimers.current.delete(ticketId)
        const nextCurrentItems = itemsRef.current.filter((ticket) => ticket.id !== ticketId)
        itemsRef.current = nextCurrentItems
        setItems(nextCurrentItems)
      }, animationDuration)

      removalTimers.current.set(ticketId, timer)
    })
  }, [tickets])

  useEffect(() => {
    return () => {
      removalTimers.current.forEach((timer) => window.clearTimeout(timer))
      removalTimers.current.clear()
    }
  }, [])

  return items
}

export function QueueDisplayPage() {
  const [lang, setLang] = useState<Lang>(getInitialLang)
  const [data, setData] = useState<QueueDisplayPayload>({ serving: [], next: [] })
  const [now, setNow] = useState(new Date())
  const observedDisplayRef = useRef(false)
  const servingCallKeysRef = useRef<Set<string>>(new Set())
  const t = translations[lang]

  const loadDisplay = useCallback(async () => {
    try {
      const payload = await publicApi.queueDisplay.get()
      const nextCallKeys = new Set(payload.serving.map(getServingCallKey))
      const hasNewCall = payload.serving.some(
        (ticket) => hasAssignedDesk(ticket) && !servingCallKeysRef.current.has(getServingCallKey(ticket)),
      )

      if (observedDisplayRef.current && hasNewCall) {
        void playTicketCallSound()
      }

      servingCallKeysRef.current = nextCallKeys
      observedDisplayRef.current = true
      setData(payload)
    } catch {
      setData({ serving: [], next: [] })
    }
  }, [])

  useEffect(() => {
    const localizedPath = buildDisplayPath(lang)
    if (window.location.pathname !== localizedPath) {
      window.history.replaceState(null, '', localizedPath)
    }
  }, [lang])

  useEffect(() => {
    void loadDisplay()
    const refreshId = window.setInterval(() => void loadDisplay(), 30000)

    return () => {
      window.clearInterval(refreshId)
    }
  }, [loadDisplay])

  useEffect(() => {
    let reconnectId: number | null = null
    let socket: WebSocket | null = null
    let closedByEffect = false

    function connect() {
      socket = new WebSocket(getQueueDisplayWebSocketUrl())

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as { type?: string }
          if (message.type === 'queue_display.updated') {
            void loadDisplay()
          }
        } catch {
          void loadDisplay()
        }
      }

      socket.onclose = () => {
        if (!closedByEffect) {
          reconnectId = window.setTimeout(connect, 3000)
        }
      }

      socket.onerror = () => {
        socket?.close()
      }
    }

    connect()

    return () => {
      closedByEffect = true
      if (reconnectId !== null) {
        window.clearTimeout(reconnectId)
      }
      socket?.close()
    }
  }, [loadDisplay])

  useEffect(() => {
    const clockId = window.setInterval(() => setNow(new Date()), 1000)

    return () => {
      window.clearInterval(clockId)
    }
  }, [])

  useEffect(() => {
    const rotationId = window.setInterval(() => {
      setLang((currentLang) => {
        const currentIndex = displayLangOrder.indexOf(currentLang)
        const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % displayLangOrder.length
        return displayLangOrder[nextIndex]
      })
    }, languageRotationMs)

    return () => {
      window.clearInterval(rotationId)
    }
  }, [])

  const timeText = useMemo(
    () => now.toLocaleTimeString(t.locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    [now, t.locale],
  )

  const animatedServing = useAnimatedTickets(data.serving)
  const animatedNext = useAnimatedTickets(data.next)

  return (
    <main className="queue-display-shell">
      <section className="queue-display-hero">
        <div className="queue-display-time">
          <span>{t.currentTime}</span>
          <strong>{timeText}</strong>
        </div>
      </section>

      <section className="display-card display-serving-card">
        <header>{t.serving}</header>
        {animatedServing.length === 0 ? (
          <p className="display-empty">{t.emptyServing}</p>
        ) : (
          <div className="display-table-wrap">
            <table className="display-ticket-table display-serving-table">
              <thead>
                <tr>
                  <th>{ticketLabels[lang]}</th>
                  <th>{windowLabels[lang]}</th>
                </tr>
              </thead>
              <tbody>
                {animatedServing.map((ticket) => (
                  <tr className={getAnimationClass(ticket.animationState)} key={ticket.id}>
                    <td>
                      <strong>{ticket.ticket_number}</strong>
                    </td>
                    <td>
                      <strong>{getDesk(ticket, t.unknown)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="display-card">
        <header>{t.next}</header>
        {animatedNext.length === 0 ? (
          <p className="display-empty">{t.emptyNext}</p>
        ) : (
          <div className="display-next-wrap">
            <div className="display-next-heading">{ticketLabels[lang]}</div>
            <div className="display-next-list" role="list">
              {animatedNext.map((ticket) => (
                <div className={`display-next-item ${getAnimationClass(ticket.animationState)}`} key={ticket.id} role="listitem">
                  <strong>{ticket.ticket_number}</strong>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
