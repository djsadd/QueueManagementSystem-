import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'
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
import { useTicketCallSound } from './hooks/useTicketCallSound'
import platonusLogoUrl from '../platonus logo.png'
import type {
  AuthTokens,
  AuthUser,
  EducationalProgramItem,
  MyWindowTickets,
  OperatorConfig,
  ServiceLanguage,
  ServiceItem,
  StudyLanguage,
  TicketItem,
  WindowStatus,
} from './types/domain'

type View = 'window' | 'profile' | 'platonus'
type RealtimeState = 'connecting' | 'connected' | 'disconnected'
type PlatonusWebviewElement = HTMLElement & {
  getURL?: () => string
  reload?: () => void
  loadURL?: (url: string) => void
  capturePage?: () => Promise<PlatonusCaptureImage>
}
type PlatonusCaptureImage = {
  getSize?: () => { width: number; height: number }
  resize?: (options: { width?: number; height?: number }) => PlatonusCaptureImage
  toJPEG?: (quality: number) => { toString: (encoding: string) => string }
  toDataURL?: () => string
}
type PlatonusInputEvent =
  | { type: 'mouseMove' | 'mouseDown' | 'mouseUp'; x: number; y: number; button?: 'left' | 'right' | 'middle'; clickCount?: number }
  | { type: 'mouseWheel'; deltaX?: number; deltaY?: number }
  | { type: 'keyDown' | 'keyUp' | 'char'; keyCode: string }

const PLATONUS_URL = 'https://platonus.tau-edu.kz'
const serviceLanguageOptions: Array<{ value: ServiceLanguage; label: string }> = [
  { value: 'KAZAKH', label: 'KAZ' },
  { value: 'RUSSIAN', label: 'RUS' },
  { value: 'ENGLISH', label: 'ENG' },
]
const defaultServiceLanguages: ServiceLanguage[] = serviceLanguageOptions.map((option) => option.value)
const defaultStudyLanguages: StudyLanguage[] = serviceLanguageOptions.map((option) => option.value)
const PLATONUS_REMOTE_PREVIEW_MS = 90
const PLATONUS_STREAM_FRAME_MS = 33
const PLATONUS_STREAM_MAX_WIDTH = 1920
const PLATONUS_STREAM_JPEG_QUALITY = 92

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

function isAuthFailure(error: unknown) {
  return error instanceof ApiError && (error.status === 401 || error.status === 403)
}

function parseApiDate(value: string) {
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value)
  return new Date(hasTimezone ? value : `${value}Z`)
}

function formatDateTime(value: string | null) {
  if (!value) return 'Нет времени'
  const date = parseApiDate(value)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getWaitMinutes(ticket: TicketItem) {
  const createdAt = parseApiDate(ticket.created_at).getTime()
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

function normalizeServiceLanguages(languages: ServiceLanguage[] | undefined) {
  if (!languages || languages.length === 0) return defaultServiceLanguages

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
  if (!languages || languages.length === 0) return defaultStudyLanguages

  const selected = defaultStudyLanguages.filter((language) => languages.includes(language))
  return selected.length > 0 ? selected : defaultStudyLanguages
}

function buildStudyLanguagesPayload(
  programIds: number[],
  programLanguages: Record<number, StudyLanguage[]>,
  programs: EducationalProgramItem[],
) {
  const programById = new Map(programs.map((program) => [program.id, program]))

  return Object.fromEntries(
    programIds.map((programId) => [
      programId,
      programById.get(programId)?.requires_service_language
        ? normalizeStudyLanguages(programLanguages[programId])
        : [],
    ]),
  )
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

function getKeyboardCode(event: ReactKeyboardEvent<HTMLElement>) {
  const keyMap: Record<string, string> = {
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    ArrowUp: 'Up',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Enter: 'Enter',
    Escape: 'Escape',
    Tab: 'Tab',
  }

  return keyMap[event.key] ?? event.key
}

function getPointerButton(button: number): 'left' | 'right' | 'middle' {
  if (button === 1) return 'middle'
  if (button === 2) return 'right'
  return 'left'
}

function getPlatonusCaptureFrame(
  image: PlatonusCaptureImage,
  maxWidth = 1280,
  jpegQuality = 76,
) {
  const size = image.getSize?.()
  const preview = size && size.width > maxWidth && image.resize ? image.resize({ width: maxWidth }) : image
  if (preview.toJPEG) {
    return `data:image/jpeg;base64,${preview.toJPEG(jpegQuality).toString('base64')}`
  }
  return preview.toDataURL?.() ?? null
}

function PlatonusRemoteController({ url }: { url: string }) {
  const controllerRef = useRef<HTMLDivElement | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const [frame, setFrame] = useState<string | null>(null)

  const sendInput = useCallback((event: PlatonusInputEvent) => {
    window.operatorBridge.sendPlatonusInput(event).catch((err) => {
      console.error('Platonus remote input failed', err)
    })
  }, [])

  const getNormalizedPoint = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const controller = controllerRef.current
    const image = imageRef.current
    if (!controller || !image?.naturalWidth || !image.naturalHeight) return null

    const rect = controller.getBoundingClientRect()
    const imageRatio = image.naturalWidth / image.naturalHeight
    const containerRatio = rect.width / rect.height
    const renderWidth = containerRatio > imageRatio ? rect.height * imageRatio : rect.width
    const renderHeight = containerRatio > imageRatio ? rect.height : rect.width / imageRatio
    const offsetX = rect.left + (rect.width - renderWidth) / 2
    const offsetY = rect.top + (rect.height - renderHeight) / 2
    const x = (event.clientX - offsetX) / renderWidth
    const y = (event.clientY - offsetY) / renderHeight

    if (x < 0 || x > 1 || y < 0 || y > 1) return null
    return { x, y }
  }, [])

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined

    const capture = async () => {
      try {
        const result = await window.operatorBridge.capturePlatonusDisplay()
        if (!cancelled && result.ok && result.frame) {
          setFrame(result.frame)
        }
      } catch (err) {
        console.error('Platonus remote preview failed', err)
      } finally {
        if (!cancelled) {
          timer = window.setTimeout(capture, PLATONUS_REMOTE_PREVIEW_MS)
        }
      }
    }

    window.operatorBridge
      .openPlatonusDisplay({ url })
      .then(() => {
        if (!cancelled) capture()
      })
      .catch((err) => {
        console.error('Platonus remote display failed', err)
      })

    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [url])

  const handlePointer = (type: 'mouseMove' | 'mouseDown' | 'mouseUp', event: ReactPointerEvent<HTMLElement>) => {
    const point = getNormalizedPoint(event)
    if (!point) return

    controllerRef.current?.focus()
    event.preventDefault()
    sendInput({
      type,
      ...point,
      button: getPointerButton(event.button),
      clickCount: event.detail || 1,
    })
  }

  const handleWheel = (event: ReactWheelEvent<HTMLElement>) => {
    event.preventDefault()
    sendInput({
      type: 'mouseWheel',
      deltaX: -event.deltaX,
      deltaY: -event.deltaY,
    })
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    event.preventDefault()
    const keyCode = getKeyboardCode(event)
    sendInput({ type: 'keyDown', keyCode })
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      sendInput({ type: 'char', keyCode: event.key })
    }
  }

  const handleKeyUp = (event: ReactKeyboardEvent<HTMLElement>) => {
    event.preventDefault()
    sendInput({ type: 'keyUp', keyCode: getKeyboardCode(event) })
  }

  return (
    <section
      ref={controllerRef}
      className="platonus-remote-controller"
      tabIndex={0}
      onPointerMove={(event) => handlePointer('mouseMove', event)}
      onPointerDown={(event) => handlePointer('mouseDown', event)}
      onPointerUp={(event) => handlePointer('mouseUp', event)}
      onWheel={handleWheel}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
    >
      {frame ? (
        <img ref={imageRef} className="platonus-remote-frame" src={frame} alt="" draggable={false} />
      ) : (
        <div className="platonus-remote-status">Открываю Platonus на втором экране...</div>
      )}
    </section>
  )
}

function PlatonusView({
  onUrlChange,
  streamActive,
  visible,
}: {
  onUrlChange: (url: string) => void
  streamActive: boolean
  visible: boolean
}) {
  const shellRef = useRef<HTMLElement | null>(null)
  const webviewRef = useRef<HTMLElement | null>(null)
  const retryRef = useRef(false)
  const visibleRef = useRef(visible)

  useEffect(() => {
    visibleRef.current = visible
  }, [visible])

  useEffect(() => {
    const shell = shellRef.current
    const webview = webviewRef.current
    if (!shell || !webview) return

    const syncWebviewSize = () => {
      const { width, height } = shell.getBoundingClientRect()
      webview.style.width = `${Math.max(1, Math.floor(width))}px`
      webview.style.height = `${Math.max(1, Math.floor(height))}px`
    }

    syncWebviewSize()
    const resizeObserver = new ResizeObserver(syncWebviewSize)
    resizeObserver.observe(shell)
    window.addEventListener('resize', syncWebviewSize)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', syncWebviewSize)
    }
  }, [])

  useEffect(() => {
    const webview = webviewRef.current as PlatonusWebviewElement | null
    if (!webview) return

    const syncUrl = () => {
      try {
        const url = webview.getURL?.()
        if (url) onUrlChange(url)
      } catch {
        onUrlChange(PLATONUS_URL)
      }
    }

    webview.addEventListener('dom-ready', syncUrl)
    webview.addEventListener('did-navigate', syncUrl)
    webview.addEventListener('did-navigate-in-page', syncUrl)

    return () => {
      webview.removeEventListener('dom-ready', syncUrl)
      webview.removeEventListener('did-navigate', syncUrl)
      webview.removeEventListener('did-navigate-in-page', syncUrl)
    }
  }, [onUrlChange])

  useEffect(() => {
    const webview = webviewRef.current as PlatonusWebviewElement | null
    if (!webview) return

    const handleReady = () => {
      retryRef.current = false
    }
    const handleFail = (event: Event) => {
      const errorCode = 'errorCode' in event ? Number(event.errorCode) : 0
      const validatedUrl = 'validatedURL' in event ? String(event.validatedURL) : ''

      if (retryRef.current || errorCode === -3 || (validatedUrl && !validatedUrl.startsWith(PLATONUS_URL))) {
        return
      }

      retryRef.current = true
      window.setTimeout(() => {
        webview.loadURL?.(PLATONUS_URL)
        webview.reload?.()
      }, 500)
    }

    webview.addEventListener('dom-ready', handleReady)
    webview.addEventListener('did-fail-load', handleFail)

    return () => {
      webview.removeEventListener('dom-ready', handleReady)
      webview.removeEventListener('did-fail-load', handleFail)
    }
  }, [])

  useEffect(() => {
    if (!streamActive) {
      window.operatorBridge.closePlatonusStreamDisplay().catch((err) => {
        console.error('Platonus stream close failed', err)
      })
      return
    }

    let cancelled = false
    let timer: number | undefined

    const capture = async () => {
      const startedAt = performance.now()

      try {
        const shell = shellRef.current
        const webview = webviewRef.current as PlatonusWebviewElement | null
        const rect = shell?.getBoundingClientRect()

        if (!cancelled && visibleRef.current && rect && rect.width > 1 && rect.height > 1) {
          await window.operatorBridge.streamMainWindowArea({
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            maxWidth: PLATONUS_STREAM_MAX_WIDTH,
            quality: PLATONUS_STREAM_JPEG_QUALITY,
          })
        } else if (!cancelled) {
          const image = await webview?.capturePage?.()
          const frame = image
            ? getPlatonusCaptureFrame(image, PLATONUS_STREAM_MAX_WIDTH, PLATONUS_STREAM_JPEG_QUALITY)
            : null

          if (frame) {
            window.operatorBridge.updatePlatonusStreamFrame(frame)
          }
        }
      } catch (err) {
        console.error('Platonus stream capture failed', err)
      } finally {
        if (!cancelled) {
          timer = window.setTimeout(capture, Math.max(0, PLATONUS_STREAM_FRAME_MS - (performance.now() - startedAt)))
        }
      }
    }

    window.operatorBridge
      .openPlatonusStreamDisplay()
      .then(() => {
        if (!cancelled) capture()
      })
      .catch((err) => {
        console.error('Platonus stream display failed', err)
      })

    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
      window.operatorBridge.closePlatonusStreamDisplay().catch((err) => {
        console.error('Platonus stream close failed', err)
      })
    }
  }, [streamActive])

  return (
    <section ref={shellRef} className={classNames('platonus-shell', !visible && 'platonus-shell-parked')}>
      <webview
        ref={webviewRef}
        className="platonus-webview"
        style={{ width: '100%', height: '100%' }}
        src={PLATONUS_URL}
        partition="persist:platonus"
        webpreferences="backgroundThrottling=no"
        allowpopups={true}
      />
    </section>
  )
}

function ServerSettingsForm({
  apiBaseUrl,
  displayUrl,
  onChange,
  onUnlock,
  onSubmit,
  saving,
  value,
}: {
  apiBaseUrl?: string
  displayUrl?: string
  onChange: (value: string) => void
  onUnlock: (token: string) => void
  onSubmit: (event: React.FormEvent) => void
  saving: boolean
  value: string
}) {
  const [unlocked, setUnlocked] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [unlocking, setUnlocking] = useState(false)

  async function unlockSettings(event: React.FormEvent) {
    event.preventDefault()
    setUnlocking(true)
    setPasswordError('')

    try {
      const result = await window.operatorBridge.verifyAdminPassword(password)
      if (!result.ok) {
        setPasswordError('Неверный пароль администратора')
        return
      }

      if (result.token) onUnlock(result.token)
      setUnlocked(true)
      setPassword('')
    } catch (err) {
      setPasswordError(getErrorMessage(err))
    } finally {
      setUnlocking(false)
    }
  }

  if (!unlocked) {
    return (
      <form className="server-settings-form" onSubmit={unlockSettings}>
        <label className="field-label" htmlFor="server-admin-password">
          Пароль администратора
        </label>
        <div className="server-settings-row">
          <input
            id="server-admin-password"
            className="text-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button className="primary-button h-12" type="submit" disabled={unlocking}>
            {unlocking ? <Loader2 className="h-5 w-5 animate-spin" /> : <Settings2 className="h-5 w-5" />}
            Открыть
          </button>
        </div>
        {passwordError ? <div className="server-settings-error">{passwordError}</div> : null}
      </form>
    )
  }

  return (
    <form className="server-settings-form" onSubmit={onSubmit}>
      <label className="field-label" htmlFor="server-url">
        Адрес сервера
      </label>
      <div className="server-settings-row">
        <input
          id="server-url"
          className="text-input"
          placeholder="http://192.168.115.12"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button className="primary-button h-12" type="submit" disabled={saving}>
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
          Сохранить
        </button>
      </div>
      <div className="server-settings-meta">
        <span>API: {apiBaseUrl || 'загружается'}</span>
        {displayUrl ? <span>Display: {displayUrl}</span> : null}
      </div>
    </form>
  )
}

function App() {
  const [config, setConfig] = useState<OperatorConfig | null>(null)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [myWindow, setMyWindow] = useState<MyWindowTickets | null>(null)
  const [services, setServices] = useState<ServiceItem[]>([])
  const [selectedServices, setSelectedServices] = useState<number[]>([])
  const [selectedServiceLanguages, setSelectedServiceLanguages] = useState<Record<number, ServiceLanguage[]>>({})
  const [programs, setPrograms] = useState<EducationalProgramItem[]>([])
  const [selectedPrograms, setSelectedPrograms] = useState<number[]>([])
  const [selectedProgramLanguages, setSelectedProgramLanguages] = useState<Record<number, StudyLanguage[]>>({})
  const [view, setView] = useState<View>('window')
  const [email, setEmail] = useState(tokenStorage.getEmail())
  const [password, setPassword] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [serverUrlInput, setServerUrlInput] = useState('')
  const [platonusDisplayUrl, setPlatonusDisplayUrl] = useState(PLATONUS_URL)
  const [platonusRemoteActive, setPlatonusRemoteActive] = useState(false)
  const [selectedTicket, setSelectedTicket] = useState<TicketItem | null>(null)
  const [acceptIin, setAcceptIin] = useState('')
  const [acceptStudyLanguage, setAcceptStudyLanguage] = useState<StudyLanguage | ''>('')
  const [reassignServiceId, setReassignServiceId] = useState('')
  const [reassignProgramId, setReassignProgramId] = useState('')
  const [reassignServiceLanguage, setReassignServiceLanguage] = useState<ServiceLanguage | ''>('')
  const [reassignServiceQuery, setReassignServiceQuery] = useState('')
  const [reassignProgramQuery, setReassignProgramQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [configSaving, setConfigSaving] = useState(false)
  const [adminSettingsToken, setAdminSettingsToken] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [realtimeState, setRealtimeState] = useState<RealtimeState>('disconnected')
  const observedTicketIdsRef = useRef<Set<string> | null>(null)
  const { enableSound, isSoundBlocked, isSoundReady, playSound } = useTicketCallSound()

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
  const selectedReassignProgramRequiresLanguage = Boolean(selectedReassignProgram?.requires_service_language)
  const mustChooseReassignStudyLanguage = Boolean(
    selectedReassignService?.requires_educational_program && selectedReassignProgramRequiresLanguage,
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
  const activeViewTitle = view === 'window' ? 'Мое окно' : view === 'profile' ? 'Профиль оператора' : 'Platonus'

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
        const observedTicketIds = observedTicketIdsRef.current
        const hasNewActiveTicket = Boolean(
          observedTicketIds &&
            data.tickets.some(
              (ticket) =>
                (ticket.status === 'WAITING' || ticket.status === 'CALLED') &&
                !observedTicketIds.has(ticket.id),
            ),
        )

        observedTicketIdsRef.current = observedTicketIds ?? new Set()
        data.tickets.forEach((ticket) => observedTicketIdsRef.current?.add(ticket.id))
        if (hasNewActiveTicket) {
          void playSound()
        }

        setMyWindow(data)
        setLastRefresh(new Date())
        setError('')
      } catch (err) {
        setError(getErrorMessage(err))
      } finally {
        setLoading(false)
      }
    },
    [playSound, search, statusFilter],
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
    setSelectedServiceLanguages(
      Object.fromEntries(
        myServices.map((service) => [
          service.id,
          normalizeServiceLanguages(service.service_languages),
        ]),
      ),
    )
    setPrograms(availablePrograms)
    setSelectedPrograms(myPrograms.map((program) => program.id))
    setSelectedProgramLanguages(
      Object.fromEntries(
        myPrograms.map((program) => [
          program.id,
          program.requires_service_language ? normalizeStudyLanguages(program.study_languages) : [],
        ]),
      ),
    )
  }, [])

  const restoreSession = useCallback(async () => {
    setLoading(true)
    try {
      const loadedConfig = await window.operatorBridge.getConfig()
      setConfig(loadedConfig)
      setServerUrlInput(loadedConfig.serverUrl)

      if (!tokenStorage.getAccessToken()) return

      const cachedUser = tokenStorage.getUser()
      if (cachedUser) setUser(cachedUser)

      const me = await api.auth.me()
      tokenStorage.setUser(me)
      setUser(me)
      await refreshWorkspace(true)
      await loadProfile().catch(() => undefined)
    } catch (err) {
      if (isAuthFailure(err)) {
        tokenStorage.clearTokens()
        tokenStorage.clearUser()
        setUser(null)
        setMyWindow(null)
        return
      }

      if (tokenStorage.getAccessToken() && tokenStorage.getUser()) {
        setError('Сервер временно недоступен. Сессия сохранена, ожидание подключения.')
      }
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

      try {
        const response = await window.operatorBridge.apiRequest<AuthTokens>({
          path: '/auth/refresh',
          method: 'POST',
          body: { refresh_token: refreshToken },
        })

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            tokenStorage.clearTokens()
            tokenStorage.clearUser()
          }
          return null
        }

        tokenStorage.setTokens(response.payload.access_token, response.payload.refresh_token)
        return response.payload.access_token
      } catch {
        return null
      }
    }

    async function connect(forceTokenRefresh = false) {
      setRealtimeState('connecting')

      let accessToken = tokenStorage.getAccessToken()
      if (forceTokenRefresh || !accessToken) {
        accessToken = await refreshRealtimeToken()
      }

      if (!accessToken || closed) {
        setRealtimeState('disconnected')
        if (!closed) {
          reconnectTimer = window.setTimeout(() => void connect(true), 2500)
        }
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
      tokenStorage.setUser(me)
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
    tokenStorage.clearUser()
    if (!config?.rememberEmail) tokenStorage.clearEmail()
    setRealtimeState('disconnected')
    setUser(null)
    setMyWindow(null)
    observedTicketIdsRef.current = null
    setPassword('')
    setView('window')
  }

  function togglePlatonusStream() {
    if (!platonusRemoteActive) {
      setPlatonusRemoteActive(true)
      return
    }

    setPlatonusRemoteActive(false)
    window.operatorBridge
      .openDisplay({
        accessToken: tokenStorage.getAccessToken(),
        refreshToken: tokenStorage.getRefreshToken(),
      })
      .catch((err) => {
        console.error('Queue display restore failed', err)
      })
  }

  async function saveServerSettings(event: React.FormEvent) {
    event.preventDefault()
    setConfigSaving(true)
    setMessage('')
    setError('')

    try {
      const updatedConfig = await window.operatorBridge.saveServerUrl(serverUrlInput, adminSettingsToken)
      setConfig(updatedConfig)
      setServerUrlInput(updatedConfig.serverUrl)
      setMessage('Адрес сервера обновлен')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setConfigSaving(false)
    }
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

  async function persistTicketApplicantData(ticket: TicketItem, requireStudyLanguage = true) {
    const normalizedIin = acceptIin.trim()

    if (!/^\d{12}$/.test(normalizedIin)) {
      throw new Error('ИИН должен состоять из 12 цифр')
    }

    if (requireStudyLanguage && !acceptStudyLanguage) {
      throw new Error('Выберите язык обучения')
    }

    let updatedTicket = await api.tickets.accept(ticket.id, normalizedIin)
    if (acceptStudyLanguage) {
      updatedTicket = await api.tickets.updateStudyLanguage(updatedTicket.id, acceptStudyLanguage)
    }
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

    if (mustChooseReassignStudyLanguage && !acceptStudyLanguage) {
      setActionError('Выберите язык ОП')
      return
    }

    if (selectedReassignService?.requires_service_language && !reassignServiceLanguage) {
      setActionError('Выберите язык обслуживания')
      return
    }

    setSaving(true)
    setMessage('')
    setActionError('')

    try {
      const ticketToReassign = await persistTicketApplicantData(selectedTicket, mustChooseReassignStudyLanguage)
      await api.tickets.reassignService(ticketToReassign.id, {
        service_id: Number(reassignServiceId),
        educational_program_id: reassignProgramId ? Number(reassignProgramId) : null,
        study_language: mustChooseReassignStudyLanguage
          ? acceptStudyLanguage || null
          : null,
        service_language: selectedReassignService.requires_service_language
          ? (reassignServiceLanguage || null)
          : null,
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
      const updated = await api.operator.setServices(
        selectedServices,
        buildServiceLanguagesPayload(selectedServices, selectedServiceLanguages),
      )
      setSelectedServices(updated.map((service) => service.id))
      setSelectedServiceLanguages(
        Object.fromEntries(
          updated.map((service) => [
            service.id,
            normalizeServiceLanguages(service.service_languages),
          ]),
        ),
      )
    }, 'Услуги обновлены')
  }

  async function savePrograms() {
    await runAction(async () => {
      const updated = await api.operator.setPrograms(
        selectedPrograms,
        buildStudyLanguagesPayload(selectedPrograms, selectedProgramLanguages, programs),
      )
      setSelectedPrograms(updated.map((program) => program.id))
      setSelectedProgramLanguages(
        Object.fromEntries(
          updated.map((program) => [
            program.id,
            program.requires_service_language ? normalizeStudyLanguages(program.study_languages) : [],
          ]),
        ),
      )
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
        <div className="w-full max-w-[430px] space-y-4">
          <form onSubmit={login} className="rounded-lg border border-line bg-white p-8 shadow-panel">
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

            {(error || message) && (
              <div
                className={classNames(
                  'mt-5 rounded-lg border px-4 py-3 text-sm font-medium',
                  error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800',
                )}
              >
                {error || message}
              </div>
            )}

            <button className="primary-button mt-6 w-full" disabled={saving}>
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
              Войти
            </button>
          </form>
          <section className="rounded-lg border border-line bg-white p-5 shadow-panel">
            <ServerSettingsForm
              apiBaseUrl={config?.apiBaseUrl}
              displayUrl={config?.displayUrl}
              onChange={setServerUrlInput}
              onUnlock={setAdminSettingsToken}
              onSubmit={saveServerSettings}
              saving={configSaving}
              value={serverUrlInput}
            />
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className="h-screen overflow-hidden bg-shell text-ink">
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
          <button
            className={classNames('rail-button', view === 'platonus' && 'rail-button-active')}
            title="Platonus"
            onClick={() => setView('platonus')}
          >
            <img className="h-7 w-7 rounded-sm bg-white object-contain p-0.5" src={platonusLogoUrl} alt="" />
          </button>
        </nav>
        <button className="rail-button" title="Выйти" onClick={logout}>
          <LogOut className="h-6 w-6" />
        </button>
      </aside>

      <section className="ml-[86px] flex h-screen min-w-0 flex-col">
        <header className="z-[5] flex min-h-[82px] shrink-0 items-center justify-between border-b border-line bg-white/95 px-8 backdrop-blur">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-normal">{activeViewTitle}</h1>
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
            {!isSoundReady && (
              <button className={isSoundBlocked ? 'danger-button' : 'ghost-button'} onClick={() => void enableSound()}>
                <BellRing className="h-5 w-5" />
                {isSoundBlocked ? 'Включить звук' : 'Звук'}
              </button>
            )}
            <button className="ghost-button" onClick={() => refreshWorkspace()} disabled={saving}>
              <RefreshCw className="h-5 w-5" />
              Обновить
            </button>
            {(view === 'platonus' || platonusRemoteActive) && (
              <button
                className={platonusRemoteActive ? 'danger-button' : 'primary-button'}
                onClick={togglePlatonusStream}
              >
                <MonitorUp className="h-5 w-5" />
                {platonusRemoteActive ? 'Остановить трансляцию Platonus' : 'Транслировать Platonus'}
              </button>
            )}
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

        <div className={classNames('relative min-h-0 flex-1', view === 'platonus' ? 'overflow-hidden p-0' : 'overflow-auto p-8')}>
          {view !== 'platonus' && (error || message) && (
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
                      .sort((a, b) => (a.status === 'CALLED' ? -1 : b.status === 'CALLED' ? 1 : parseApiDate(a.created_at).getTime() - parseApiDate(b.created_at).getTime()))
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
          ) : view === 'profile' ? (
            <div className="grid gap-6 xl:grid-cols-2">
              <ProfileList
                title="Услуги"
                items={services}
                selectedIds={selectedServices}
                onChange={(nextServiceIds) => {
                  setSelectedServices(nextServiceIds)
                  setSelectedServiceLanguages((current) =>
                    Object.fromEntries(
                      nextServiceIds.map((serviceId) => [
                        serviceId,
                        normalizeServiceLanguages(current[serviceId]),
                      ]),
                    ),
                  )
                }}
                onSave={saveServices}
                saving={saving}
              />
              {selectedServices.some((serviceId) => services.find((service) => service.id === serviceId)?.requires_service_language) ? (
                <section className="panel p-6">
                  <h2 className="mb-4 text-xl font-semibold tracking-normal">Языки обслуживания</h2>
                  <div className="space-y-3">
                    {selectedServices
                      .map((serviceId) => services.find((service) => service.id === serviceId))
                      .filter((service): service is ServiceItem => Boolean(service?.requires_service_language))
                      .map((service) => (
                        <div className="rounded-lg border border-line bg-slate-50 p-4" key={service.id}>
                          <strong className="block">{service.name}</strong>
                          <div className="mt-3 flex flex-wrap gap-3">
                            {serviceLanguageOptions.map((option) => {
                              const checked = normalizeServiceLanguages(selectedServiceLanguages[service.id]).includes(option.value)

                              return (
                                <label className="inline-flex items-center gap-2 text-sm font-semibold" key={option.value}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(event) => {
                                      const current = normalizeServiceLanguages(selectedServiceLanguages[service.id])
                                      setSelectedServiceLanguages({
                                        ...selectedServiceLanguages,
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
                          </div>
                        </div>
                      ))}
                  </div>
                </section>
              ) : null}
              <ProgramLanguageTable
                programs={programs}
                selectedIds={selectedPrograms}
                selectedLanguages={selectedProgramLanguages}
                onSelectedIdsChange={setSelectedPrograms}
                onSelectedLanguagesChange={setSelectedProgramLanguages}
                onSave={savePrograms}
                saving={saving}
              />
              <section className="panel p-6 xl:col-span-2">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <span className="section-label">Настройки</span>
                    <h2 className="mt-1 text-xl font-semibold tracking-normal">Сервер оператора</h2>
                  </div>
                </div>
                <ServerSettingsForm
                  apiBaseUrl={config?.apiBaseUrl}
                  displayUrl={config?.displayUrl}
                  onChange={setServerUrlInput}
                  onUnlock={setAdminSettingsToken}
                  onSubmit={saveServerSettings}
                  saving={configSaving}
                  value={serverUrlInput}
                />
                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  <div className="info-line">
                    <span>Сервер</span>
                    <strong>{config?.serverUrl}</strong>
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
          ) : null}

          <PlatonusView
            onUrlChange={setPlatonusDisplayUrl}
            streamActive={platonusRemoteActive}
            visible={view === 'platonus'}
          />
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
              <p>Создан: {formatDateTime(selectedTicket.created_at)}</p>
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
                    setReassignServiceLanguage('')
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
                <span className="profile-label">Язык обслуживания</span>
                {selectedReassignService?.requires_service_language ? (
                  <select
                    className="reassign-select"
                    disabled={saving}
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
                ) : (
                  <div className="touch-choice-empty">Не требуется</div>
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

function ProgramLanguageTable({
  onSave,
  onSelectedIdsChange,
  onSelectedLanguagesChange,
  programs,
  saving,
  selectedIds,
  selectedLanguages,
}: {
  programs: EducationalProgramItem[]
  selectedIds: number[]
  selectedLanguages: Record<number, StudyLanguage[]>
  onSelectedIdsChange: (ids: number[]) => void
  onSelectedLanguagesChange: (languages: Record<number, StudyLanguage[]>) => void
  onSave: () => void
  saving: boolean
}) {
  function setProgramSelected(programId: number, selected: boolean) {
    const program = programs.find((item) => item.id === programId)
    const nextSelectedIds = selected
      ? [...selectedIds, programId].filter((id, index, ids) => ids.indexOf(id) === index)
      : selectedIds.filter((id) => id !== programId)

    onSelectedIdsChange(nextSelectedIds)
    onSelectedLanguagesChange(
      Object.fromEntries(
        nextSelectedIds.map((id) => {
          const nextProgram = id === programId ? program : programs.find((item) => item.id === id)
          return [
            id,
            nextProgram?.requires_service_language ? normalizeStudyLanguages(selectedLanguages[id]) : [],
          ]
        }),
      ),
    )
  }

  function setProgramLanguage(programId: number, language: StudyLanguage, selected: boolean) {
    const program = programs.find((item) => item.id === programId)
    if (!program?.requires_service_language) return

    const programWasSelected = selectedIds.includes(programId)
    const currentLanguages = programWasSelected ? normalizeStudyLanguages(selectedLanguages[programId]) : []
    const nextLanguages = selected
      ? [...currentLanguages, language].filter((item, index, languages) => languages.indexOf(item) === index)
      : currentLanguages.filter((item) => item !== language)
    const nextSelectedIds = nextLanguages.length > 0
      ? (programWasSelected ? selectedIds : [...selectedIds, programId])
      : selectedIds.filter((id) => id !== programId)

    onSelectedIdsChange(nextSelectedIds)
    onSelectedLanguagesChange(
      Object.fromEntries(
        nextSelectedIds.map((id) => [
          id,
          id === programId
            ? nextLanguages
            : programs.find((program) => program.id === id)?.requires_service_language
              ? normalizeStudyLanguages(selectedLanguages[id])
              : [],
        ]),
      ),
    )
  }

  return (
    <section className="panel overflow-hidden xl:col-span-2">
      <div className="flex items-center justify-between gap-4 border-b border-line p-5">
        <div>
          <span className="section-label">Назначения</span>
          <h2 className="mt-1 text-xl font-semibold tracking-normal">Образовательные программы</h2>
        </div>
        <button className="primary-button" disabled={saving} onClick={onSave}>
          <Check className="h-5 w-5" />
          Сохранить
        </button>
      </div>

      <div className="program-language-table-wrap">
        <table className="program-language-table">
          <thead>
            <tr>
              <th>ОП</th>
              <th>Статус</th>
              <th>Назначить</th>
              {serviceLanguageOptions.map((option) => (
                <th key={option.value}>{option.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {programs.map((program) => {
              const selected = selectedIds.includes(program.id)
              const languages = normalizeStudyLanguages(selectedLanguages[program.id])
              const languageSelectionEnabled = program.requires_service_language

              return (
                <tr className={selected ? 'program-language-row-selected' : ''} key={program.id}>
                  <td>
                    <strong>{program.name}</strong>
                    <span>{program.code}</span>
                  </td>
                  <td>
                    <span className={classNames('program-status-chip', program.is_active ? 'program-status-active' : 'program-status-disabled')}>
                      {program.is_active ? 'Активно' : 'Отключено'}
                    </span>
                  </td>
                  <td>
                    <label className="program-table-check" aria-label={`Назначить ${program.name}`}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(event) => setProgramSelected(program.id, event.target.checked)}
                      />
                      <span />
                    </label>
                  </td>
                  {serviceLanguageOptions.map((option) => (
                    <td className="program-language-cell" key={option.value}>
                      {languageSelectionEnabled ? (
                        <label className="program-table-check" aria-label={`${program.name}: ${option.label}`}>
                          <input
                            type="checkbox"
                            checked={selected && languages.includes(option.value)}
                            disabled={!program.is_active}
                            onChange={(event) => setProgramLanguage(program.id, option.value, event.target.checked)}
                          />
                          <span />
                        </label>
                      ) : (
                        <span className="program-language-muted">-</span>
                      )}
                    </td>
                  ))}
                </tr>
              )
            })}
            {programs.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState title="Нет доступных записей" />
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
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
