import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BellRing,
  CalendarClock,
  Check,
  ClipboardList,
  Clock3,
  Download,
  DoorOpen,
  ExternalLink,
  Globe,
  Loader2,
  LogOut,
  MonitorUp,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  SkipForward,
  Timer,
  Trash2,
  X,
} from 'lucide-react'
import { api, ApiError } from './api/client'
import { tokenStorage } from './api/tokenStorage'
import { useTicketCallSound } from './hooks/useTicketCallSound'
import type {
  AuthTokens,
  AuthUser,
  EducationalProgramItem,
  MyWindowTickets,
  OperatorConfig,
  ReceptionTickets,
  ServiceLanguage,
  ServiceItem,
  StudyLanguage,
  TicketItem,
  WindowStatus,
} from './types/domain'

type View = 'window' | 'reception' | 'profile' | 'browser'
type TicketSource = 'window' | 'reception'
type RealtimeState = 'connecting' | 'connected' | 'disconnected'
type QuickAction = {
  id: string
  label: string
  serviceId: string
}
type TicketConfirmation = {
  action: 'complete' | 'skip'
  source: TicketSource
  ticket: TicketItem
}
type PlatonusWebviewElement = HTMLElement & {
  canGoBack?: () => boolean
  canGoForward?: () => boolean
  getURL?: () => string
  getTitle?: () => string
  goBack?: () => void
  goForward?: () => void
  reload?: () => void
  loadURL?: (url: string) => void
  stop?: () => void
  capturePage?: () => Promise<PlatonusCaptureImage>
}
type BrowserTab = {
  address: string
  canGoBack: boolean
  canGoForward: boolean
  id: string
  isLoading: boolean
  title: string
  url: string
}
type BrowserDownloadState = {
  id: string
  fileName: string
  filePath: string
  receivedBytes: number
  state: 'progressing' | 'completed' | 'cancelled' | 'interrupted'
  totalBytes: number
  url: string
}
type BrowserShortcut = {
  accent: string
  description: string
  label: string
  url: string
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
const BROWSER_HOME_URL = 'operator://home'
const BROWSER_PARTITION = 'persist:operator-browser'
const GOOGLE_SEARCH_BASE_URL = 'https://www.google.com/search?q='
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const BROWSER_HOME_SHORTCUTS: BrowserShortcut[] = [
  {
    accent: '#25d366',
    description: 'web.whatsapp.com',
    label: 'WhatsApp Web',
    url: 'https://web.whatsapp.com/',
  },
  {
    accent: '#2563eb',
    description: 'konkurs-ent.testcenter.kz',
    label: 'Konkurs ENT',
    url: 'https://konkurs-ent.testcenter.kz/#/auth/univercity',
  },
  {
    accent: '#9a002d',
    description: 'platonus.tau-edu.kz',
    label: 'Platonus',
    url: PLATONUS_URL,
  },
]
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
const QUICK_ACTIONS_STORAGE_KEY = 'operatorDesktop.quickActions'
const MAX_QUICK_ACTIONS = 6

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

function createBrowserTab(url = BROWSER_HOME_URL): BrowserTab {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const home = isBrowserHomeUrl(url)

  return {
    address: home ? '' : url,
    canGoBack: false,
    canGoForward: false,
    id,
    isLoading: false,
    title: home ? 'Главная' : getBrowserUrlLabel(url),
    url,
  }
}

function isBrowserHomeUrl(value: string) {
  return value === BROWSER_HOME_URL
}

function normalizeBrowserUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return BROWSER_HOME_URL

  if (isBrowserHomeUrl(trimmed)) {
    return BROWSER_HOME_URL
  }

  if (/^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed)) {
    return trimmed
  }

  if (trimmed.includes('.') && !trimmed.includes(' ')) {
    return `https://${trimmed}`
  }

  return `${GOOGLE_SEARCH_BASE_URL}${encodeURIComponent(trimmed)}`
}

function getBrowserUrlLabel(value: string) {
  if (isBrowserHomeUrl(value)) {
    return 'Главная'
  }

  try {
    const url = new URL(value)
    return url.hostname.replace(/^www\./, '')
  } catch {
    return value
  }
}

function formatDownloadBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function getDownloadProgress(download: BrowserDownloadState) {
  if (download.totalBytes <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((download.receivedBytes / download.totalBytes) * 100)))
}

function createQuickAction(): QuickAction {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`

  return {
    id,
    label: '',
    serviceId: '',
  }
}

function normalizeQuickAction(value: unknown): QuickAction | null {
  if (!value || typeof value !== 'object') return null

  const item = value as Partial<QuickAction>
  if (typeof item.id !== 'string') return null

  return {
    id: item.id,
    label: typeof item.label === 'string' ? item.label : '',
    serviceId: typeof item.serviceId === 'string' ? item.serviceId : '',
  }
}

function readQuickActions(): QuickAction[] {
  try {
    const raw = localStorage.getItem(QUICK_ACTIONS_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []

    return parsed
      .map(normalizeQuickAction)
      .filter((item): item is QuickAction => Boolean(item))
      .slice(0, MAX_QUICK_ACTIONS)
  } catch {
    return []
  }
}

function saveQuickActions(actions: QuickAction[]) {
  localStorage.setItem(QUICK_ACTIONS_STORAGE_KEY, JSON.stringify(actions.slice(0, MAX_QUICK_ACTIONS)))
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

function BrowserHomePage({
  onOpen,
  onSearch,
}: {
  onOpen: (url: string) => void
  onSearch: (query: string) => void
}) {
  const [query, setQuery] = useState('')

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSearch(query)
  }

  return (
    <section className="browser-home-page">
      <div className="browser-home-center">
        <div className="browser-google-wordmark" aria-label="Google">
          <span>G</span>
          <span>o</span>
          <span>o</span>
          <span>g</span>
          <span>l</span>
          <span>e</span>
        </div>
        <form className="browser-home-search" onSubmit={submitSearch}>
          <Search className="h-5 w-5 text-slate-400" />
          <input
            autoComplete="off"
            value={query}
            placeholder="Поиск в Google или URL"
            onChange={(event) => setQuery(event.target.value)}
          />
          <button type="submit">Найти</button>
        </form>
        <div className="browser-home-shortcuts">
          {BROWSER_HOME_SHORTCUTS.map((shortcut) => (
            <button
              className="browser-home-shortcut"
              type="button"
              key={shortcut.url}
              onClick={() => onOpen(shortcut.url)}
            >
              <span style={{ background: shortcut.accent }}>
                {shortcut.label.slice(0, 1)}
              </span>
              <strong>{shortcut.label}</strong>
              <small>{shortcut.description}</small>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

function BrowserView({
  onActiveUrlChange,
  streamActive,
  visible,
}: {
  onActiveUrlChange: (url: string) => void
  streamActive: boolean
  visible: boolean
}) {
  const shellRef = useRef<HTMLElement | null>(null)
  const webviewRefs = useRef<Record<string, HTMLElement | null>>({})
  const visibleRef = useRef(visible)
  const initialTab = useMemo(() => createBrowserTab(), [])
  const activeTabIdRef = useRef(initialTab.id)
  const [tabs, setTabs] = useState<BrowserTab[]>([initialTab])
  const [activeTabId, setActiveTabId] = useState(initialTab.id)
  const [downloads, setDownloads] = useState<BrowserDownloadState[]>([])
  const [downloadsOpen, setDownloadsOpen] = useState(false)
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0]
  const activeDownloadCount = downloads.filter((download) => download.state === 'progressing').length

  useEffect(() => {
    visibleRef.current = visible
  }, [visible])

  useEffect(() => {
    activeTabIdRef.current = activeTabId
  }, [activeTabId])

  useEffect(() => {
    return window.operatorBridge.onBrowserDownloadUpdated((download) => {
      setDownloadsOpen(true)
      setDownloads((current) => {
        const next = current.filter((item) => item.id !== download.id)
        return [download, ...next].slice(0, 20)
      })
    })
  }, [])

  useEffect(() => {
    if (activeTab?.url) {
      onActiveUrlChange(activeTab.url)
    }
  }, [activeTab?.url, onActiveUrlChange])

  const updateTab = useCallback((tabId: string, patch: Partial<BrowserTab>) => {
    setTabs((currentTabs) =>
      currentTabs.map((tab) => (tab.id === tabId ? { ...tab, ...patch } : tab)),
    )
  }, [])

  const getTabWebview = useCallback((tabId?: string) => {
    const resolvedTabId = tabId ?? activeTabIdRef.current
    return webviewRefs.current[resolvedTabId] as PlatonusWebviewElement | null
  }, [])

  const syncActiveTabRef = useCallback((tabId: string) => {
    activeTabIdRef.current = tabId
    setActiveTabId(tabId)
  }, [])

  const syncTabState = useCallback((tabId: string) => {
    const tab = tabs.find((item) => item.id === tabId)
    if (tab && isBrowserHomeUrl(tab.url)) return

    const webview = getTabWebview(tabId)
    if (!webview) return

    const url = webview.getURL?.() ?? ''
    const title = webview.getTitle?.() || getBrowserUrlLabel(url)
    updateTab(tabId, {
      address: url,
      canGoBack: Boolean(webview.canGoBack?.()),
      canGoForward: Boolean(webview.canGoForward?.()),
      title,
      url,
    })
  }, [getTabWebview, tabs, updateTab])

  const loadTabUrl = useCallback((tabId: string, value: string) => {
    const url = normalizeBrowserUrl(value)
    if (isBrowserHomeUrl(url)) {
      updateTab(tabId, {
        address: '',
        canGoBack: false,
        canGoForward: false,
        isLoading: false,
        title: 'Главная',
        url,
      })
      getTabWebview(tabId)?.stop?.()
      return
    }

    const webview = getTabWebview(tabId)
    updateTab(tabId, { address: url, isLoading: true, url })
    webview?.loadURL?.(url)
  }, [getTabWebview, updateTab])

  function addTab(url = BROWSER_HOME_URL) {
    const tab = createBrowserTab(url)
    setTabs((currentTabs) => [...currentTabs, tab])
    syncActiveTabRef(tab.id)
  }

  function closeTab(tabId: string) {
    setTabs((currentTabs) => {
      if (currentTabs.length === 1) {
        const resetTab = createBrowserTab()
        syncActiveTabRef(resetTab.id)
        webviewRefs.current = {}
        return [resetTab]
      }

      const closedIndex = currentTabs.findIndex((tab) => tab.id === tabId)
      const nextTabs = currentTabs.filter((tab) => tab.id !== tabId)
      delete webviewRefs.current[tabId]

      if (activeTabId === tabId) {
        syncActiveTabRef(nextTabs[Math.max(0, closedIndex - 1)]?.id ?? nextTabs[0].id)
      }

      return nextTabs
    })
  }

  function submitAddress(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeTab) return
    loadTabUrl(activeTab.id, activeTab.address)
  }

  function handleWebviewEvent(tabId: string, eventName: 'load-start' | 'load-stop' | 'navigate' | 'title') {
    const webview = getTabWebview(tabId)
    if (!webview) return

    if (eventName === 'load-start') {
      updateTab(tabId, { isLoading: true })
      return
    }

    if (eventName === 'load-stop') {
      updateTab(tabId, { isLoading: false })
    }

    syncTabState(tabId)
  }

  function goBack() {
    getTabWebview()?.goBack?.()
  }

  function goForward() {
    getTabWebview()?.goForward?.()
  }

  function reloadActiveTab() {
    const webview = getTabWebview()
    if (activeTab?.isLoading) {
      webview?.stop?.()
      return
    }

    webview?.reload?.()
  }

  function openDownload(download: BrowserDownloadState) {
    if (download.state !== 'completed') return
    window.operatorBridge.openBrowserDownload(download.id).catch((err) => {
      console.error('Open browser download failed', err)
    })
  }

  useEffect(() => {
    const cleanupByTabId = new Map<string, () => void>()

    tabs.forEach((tab) => {
      const webview = getTabWebview(tab.id)
      if (!webview || cleanupByTabId.has(tab.id)) return

      const handleDidStartLoading = () => handleWebviewEvent(tab.id, 'load-start')
      const handleDidStopLoading = () => handleWebviewEvent(tab.id, 'load-stop')
      const handleNavigate = () => handleWebviewEvent(tab.id, 'navigate')
      const handleTitleUpdated = () => handleWebviewEvent(tab.id, 'title')

      webview.addEventListener('did-start-loading', handleDidStartLoading)
      webview.addEventListener('did-stop-loading', handleDidStopLoading)
      webview.addEventListener('did-navigate', handleNavigate)
      webview.addEventListener('did-navigate-in-page', handleNavigate)
      webview.addEventListener('page-title-updated', handleTitleUpdated)

      cleanupByTabId.set(tab.id, () => {
        webview.removeEventListener('did-start-loading', handleDidStartLoading)
        webview.removeEventListener('did-stop-loading', handleDidStopLoading)
        webview.removeEventListener('did-navigate', handleNavigate)
        webview.removeEventListener('did-navigate-in-page', handleNavigate)
        webview.removeEventListener('page-title-updated', handleTitleUpdated)
      })
    })

    return () => {
      cleanupByTabId.forEach((cleanup) => cleanup())
    }
  }, [getTabWebview, syncTabState, tabs, updateTab])

  useEffect(() => {
    if (!streamActive) {
      window.operatorBridge.closePlatonusStreamDisplay().catch((err) => {
        console.error('Browser stream close failed', err)
      })
      return
    }

    let cancelled = false
    let timer: number | undefined

    const capture = async () => {
      const startedAt = performance.now()

      try {
        const shell = shellRef.current
        const webview = getTabWebview()
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
        console.error('Browser stream capture failed', err)
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
        console.error('Browser stream display failed', err)
      })

    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
      window.operatorBridge.closePlatonusStreamDisplay().catch((err) => {
        console.error('Browser stream close failed', err)
      })
    }
  }, [getTabWebview, streamActive])

  return (
    <section ref={shellRef} className={classNames('browser-shell', !visible && 'browser-shell-parked')}>
      <div className="browser-tabs">
        {tabs.map((tab) => (
          <div
            className={classNames('browser-tab', tab.id === activeTabId && 'browser-tab-active')}
            key={tab.id}
            role="button"
            tabIndex={0}
            onClick={() => syncActiveTabRef(tab.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                syncActiveTabRef(tab.id)
              }
            }}
          >
            <Globe className="h-4 w-4 shrink-0" />
            <span>{tab.title || getBrowserUrlLabel(tab.url)}</span>
            <button
              className="browser-tab-close"
              type="button"
              aria-label="Закрыть вкладку"
              onClick={(event) => {
                event.stopPropagation()
                closeTab(tab.id)
              }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button className="browser-new-tab" type="button" onClick={() => addTab()}>
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="browser-toolbar">
        <button className="browser-icon-button" type="button" disabled={!activeTab?.canGoBack} onClick={goBack}>
          <ArrowLeft className="h-5 w-5" />
        </button>
        <button className="browser-icon-button" type="button" disabled={!activeTab?.canGoForward} onClick={goForward}>
          <ArrowRight className="h-5 w-5" />
        </button>
        <button className="browser-icon-button" type="button" onClick={reloadActiveTab}>
          {activeTab?.isLoading ? <X className="h-5 w-5" /> : <RefreshCw className="h-5 w-5" />}
        </button>
        <form className="browser-address-form" onSubmit={submitAddress}>
          <input
            value={activeTab?.address ?? ''}
            onChange={(event) => activeTab && updateTab(activeTab.id, { address: event.target.value })}
            placeholder="Введите адрес или запрос"
          />
        </form>
        <button className="browser-home-button" type="button" onClick={() => activeTab && loadTabUrl(activeTab.id, BROWSER_HOME_URL)}>
          Главная
        </button>
        <button
          className={classNames('browser-download-button', downloadsOpen && 'browser-download-button-active')}
          type="button"
          onClick={() => setDownloadsOpen((isOpen) => !isOpen)}
        >
          <Download className="h-5 w-5" />
          {activeDownloadCount > 0 ? <span>{activeDownloadCount}</span> : null}
        </button>
      </div>

      <div className="browser-content">
        <div className="browser-webview-stack">
          {activeTab && isBrowserHomeUrl(activeTab.url) && (
            <BrowserHomePage
              onOpen={(url) => loadTabUrl(activeTab.id, url)}
              onSearch={(query) => loadTabUrl(activeTab.id, query)}
            />
          )}
          {tabs.filter((tab) => !isBrowserHomeUrl(tab.url)).map((tab) => (
            <webview
              ref={(element) => {
                webviewRefs.current[tab.id] = element
              }}
              className={classNames('browser-webview', tab.id !== activeTabId && 'browser-webview-hidden')}
              key={tab.id}
              src={tab.url}
              partition={BROWSER_PARTITION}
              useragent={BROWSER_USER_AGENT}
              webpreferences="backgroundThrottling=no"
              allowpopups={true}
            />
          ))}
        </div>

        {downloadsOpen && <div className="browser-downloads-backdrop" onClick={() => setDownloadsOpen(false)} />}
        <aside className={classNames('browser-downloads', downloadsOpen && 'browser-downloads-open')}>
          <div className="browser-downloads-header">
            <div>
              <Download className="h-4 w-4" />
              <span>Загрузки</span>
            </div>
            <button type="button" onClick={() => setDownloadsOpen(false)} aria-label="Закрыть загрузки">
              <X className="h-4 w-4" />
            </button>
          </div>
          {downloads.length === 0 ? (
            <div className="browser-download-empty">Файлов пока нет</div>
          ) : (
            downloads.map((download) => {
              const progress = getDownloadProgress(download)

              return (
                <article className="browser-download-item" key={download.id}>
                  <div>
                    <strong>{download.fileName}</strong>
                    <span>
                      {download.state === 'completed'
                        ? 'Готово'
                        : download.state === 'progressing'
                          ? `${progress}% · ${formatDownloadBytes(download.receivedBytes)}`
                          : download.state === 'cancelled'
                            ? 'Отменено'
                            : 'Прервано'}
                    </span>
                  </div>
                  {download.state === 'progressing' && (
                    <div className="browser-download-progress">
                      <span style={{ width: `${progress}%` }} />
                    </div>
                  )}
                  <button
                    className="ghost-button"
                    type="button"
                    disabled={download.state !== 'completed'}
                    onClick={() => openDownload(download)}
                  >
                    Открыть
                  </button>
                </article>
              )
            })
          )}
        </aside>
      </div>
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
  const [reception, setReception] = useState<ReceptionTickets | null>(null)
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
  const [receptionSearch, setReceptionSearch] = useState('')
  const [receptionServiceId, setReceptionServiceId] = useState('')
  const [receptionStatusFilter, setReceptionStatusFilter] = useState('')
  const [serverUrlInput, setServerUrlInput] = useState('')
  const [browserDisplayUrl, setBrowserDisplayUrl] = useState(BROWSER_HOME_URL)
  const [browserStreamActive, setBrowserStreamActive] = useState(false)
  const [selectedTicket, setSelectedTicket] = useState<TicketItem | null>(null)
  const [selectedTicketSource, setSelectedTicketSource] = useState<TicketSource>('window')
  const [acceptIin, setAcceptIin] = useState('')
  const [acceptStudyLanguage, setAcceptStudyLanguage] = useState<StudyLanguage | ''>('')
  const [reassignServiceId, setReassignServiceId] = useState('')
  const [reassignProgramId, setReassignProgramId] = useState('')
  const [reassignServiceLanguage, setReassignServiceLanguage] = useState<ServiceLanguage | ''>('')
  const [reassignServiceQuery, setReassignServiceQuery] = useState('')
  const [reassignProgramQuery, setReassignProgramQuery] = useState('')
  const [quickActions, setQuickActions] = useState<QuickAction[]>(readQuickActions)
  const [ticketConfirmation, setTicketConfirmation] = useState<TicketConfirmation | null>(null)
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
  const receptionServices = useMemo(
    () => activeServices.filter((service) => service.requires_reception_desk),
    [activeServices],
  )
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
  const configuredQuickActions = useMemo(
    () => quickActions.filter((action) => action.label.trim() && action.serviceId),
    [quickActions],
  )
  const receptionTickets = useMemo(
    () => reception?.tickets.filter((ticket) => !receptionStatusFilter || ticket.status === receptionStatusFilter) ?? [],
    [reception, receptionStatusFilter],
  )
  const canCallNext = Boolean(myWindow && myWindow.window_status === 'OPEN')
  const activeViewTitle = view === 'window'
    ? 'Мое окно'
    : view === 'reception'
      ? 'Регистратура'
      : view === 'profile'
        ? 'Профиль оператора'
        : 'Браузер'
  const canModifySelectedTicket = Boolean(
    selectedTicket && (selectedTicketSource === 'reception' || selectedTicket.status === 'CALLED'),
  )

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
  const refreshReception = useCallback(
    async (silent = false) => {
      if (!tokenStorage.getAccessToken()) {
        setLoading(false)
        return
      }

      if (!silent) setLoading(true)
      try {
        const data = await api.tickets.reception({
          search: receptionSearch,
          service_id: receptionServiceId ? Number(receptionServiceId) : undefined,
          page: 1,
          page_size: 50,
        })
        setReception(data)
        setLastRefresh(new Date())
        setError('')
      } catch (err) {
        setError(getErrorMessage(err))
      } finally {
        setLoading(false)
      }
    },
    [receptionSearch, receptionServiceId],
  )
  const refreshWorkspaceRef = useRef(refreshWorkspace)

  useEffect(() => {
    refreshWorkspaceRef.current = refreshWorkspace
  }, [refreshWorkspace])

  useEffect(() => {
    saveQuickActions(quickActions)
  }, [quickActions])

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
    if (!user || view !== 'reception') return
    void refreshReception(true)
  }, [refreshReception, user, view])

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
    setReception(null)
    observedTicketIdsRef.current = null
    setPassword('')
    setView('window')
  }

  function toggleBrowserStream() {
    if (!browserStreamActive) {
      setBrowserStreamActive(true)
      return
    }

    setBrowserStreamActive(false)
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

  function updateReceptionTicketInState(updatedTicket: TicketItem) {
    setReception((current) => {
      if (!current) return current

      const active = updatedTicket.status === 'WAITING' || updatedTicket.status === 'CALLED'
      const exists = current.tickets.some((ticket) => ticket.id === updatedTicket.id)
      const tickets = active
        ? exists
          ? current.tickets.map((ticket) => (ticket.id === updatedTicket.id ? updatedTicket : ticket))
          : [updatedTicket, ...current.tickets]
        : current.tickets.filter((ticket) => ticket.id !== updatedTicket.id)

      return {
        ...current,
        tickets,
      }
    })

    setSelectedTicket((current) => {
      if (current?.id !== updatedTicket.id) return current
      return updatedTicket.status === 'WAITING' || updatedTicket.status === 'CALLED' ? updatedTicket : null
    })
  }

  function updateSelectedTicketInState(updatedTicket: TicketItem) {
    if (selectedTicketSource === 'reception') {
      updateReceptionTicketInState(updatedTicket)
      return
    }

    updateTicketInState(updatedTicket)
  }

  function openTicketDetails(ticket: TicketItem, source: TicketSource = 'window') {
    setSelectedTicketSource(source)
    setSelectedTicket(ticket)
    setAcceptIin(ticket.iin ?? '')
    setAcceptStudyLanguage(ticket.study_language ?? '')
    setReassignServiceId(String(ticket.service_id))
    setReassignProgramId(ticket.educational_program_id === null ? '' : String(ticket.educational_program_id))
    setReassignServiceLanguage(ticket.service_language ?? '')
    setReassignServiceQuery('')
    setReassignProgramQuery('')
  }

  function closeTicketDetails() {
    setSelectedTicket(null)
    setSelectedTicketSource('window')
    setTicketConfirmation(null)
    setAcceptIin('')
    setAcceptStudyLanguage('')
    setReassignServiceId('')
    setReassignProgramId('')
    setReassignServiceLanguage('')
    setReassignServiceQuery('')
    setReassignProgramQuery('')
  }

  function addQuickAction() {
    setQuickActions((current) => [...current, createQuickAction()].slice(0, MAX_QUICK_ACTIONS))
  }

  function updateQuickAction(id: string, updates: Partial<Omit<QuickAction, 'id'>>) {
    setQuickActions((current) =>
      current.map((action) => (action.id === id ? { ...action, ...updates } : action)),
    )
  }

  function removeQuickAction(id: string) {
    setQuickActions((current) => current.filter((action) => action.id !== id))
  }

  async function persistTicketApplicantData(ticket: TicketItem, requireStudyLanguage = true) {
    const normalizedIin = acceptIin.trim()

    if (!/^\d{12}$/.test(normalizedIin)) {
      throw new Error('ИИН должен состоять из 12 цифр')
    }

    if (requireStudyLanguage && !acceptStudyLanguage) {
      throw new Error('Выберите язык обучения')
    }

    let updatedTicket = selectedTicketSource === 'reception'
      ? await api.tickets.acceptReception(ticket.id, normalizedIin)
      : await api.tickets.accept(ticket.id, normalizedIin)
    if (acceptStudyLanguage) {
      updatedTicket = selectedTicketSource === 'reception'
        ? await api.tickets.updateReceptionStudyLanguage(updatedTicket.id, acceptStudyLanguage)
        : await api.tickets.updateStudyLanguage(updatedTicket.id, acceptStudyLanguage)
    }
    updateSelectedTicketInState(updatedTicket)
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

  function completeTicket(ticket: TicketItem) {
    setTicketConfirmation({ action: 'complete', source: selectedTicketSource, ticket })
  }

  async function confirmCompleteTicket(ticket: TicketItem) {
    setSaving(true)
    setMessage('')
    setActionError('')

    try {
      const ticketToComplete = selectedTicket?.id === ticket.id ? await persistTicketApplicantData(ticket) : ticket
      if (ticketConfirmation?.source === 'reception') {
        await api.tickets.completeReception(ticketToComplete.id)
      } else {
        await api.tickets.complete(ticketToComplete.id)
      }
      closeTicketDetails()
      setTicketConfirmation(null)
      setMessage('Талон завершен')
      await (ticketConfirmation?.source === 'reception' ? refreshReception(true) : refreshWorkspace(true))
    } catch (err) {
      setActionError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  function skipTicket(ticket: TicketItem) {
    setTicketConfirmation({ action: 'skip', source: selectedTicketSource, ticket })
  }

  async function confirmSkipTicket(ticket: TicketItem) {
    setSaving(true)
    setMessage('')
    setActionError('')

    try {
      if (ticketConfirmation?.source === 'reception') {
        await api.tickets.skipReception(ticket.id)
      } else {
        await api.tickets.skip(ticket.id)
      }
      closeTicketDetails()
      setTicketConfirmation(null)
      setMessage('Талон отмечен как не явившийся')
      await (ticketConfirmation?.source === 'reception' ? refreshReception(true) : refreshWorkspace(true))
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
      await (selectedTicketSource === 'reception' ? api.tickets.reassignReceptionService : api.tickets.reassignService)(ticketToReassign.id, {
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
      await (selectedTicketSource === 'reception' ? refreshReception(true) : refreshWorkspace(true))
    } catch (err) {
      setActionError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function runQuickAction(action: QuickAction) {
    if (!selectedTicket) return

    const targetService = activeServices.find((service) => String(service.id) === action.serviceId)
    if (!targetService) {
      setActionError('Услуга быстрого действия не найдена или отключена')
      return
    }

    const needsModalOptions = targetService.requires_educational_program || targetService.requires_service_language
    const serviceSelectedInModal = reassignServiceId === action.serviceId

    if (needsModalOptions && !serviceSelectedInModal) {
      setReassignServiceId(action.serviceId)
      setReassignProgramId('')
      setReassignServiceLanguage('')
      setReassignProgramQuery('')
      setActionError('Выберите нужные параметры в модальном окне и нажмите быструю кнопку еще раз')
      return
    }

    const targetProgram = reassignProgramId
      ? activePrograms.find((program) => String(program.id) === reassignProgramId)
      : null

    if (targetService.requires_educational_program && !targetProgram) {
      setActionError('Выберите образовательную программу в модальном окне')
      return
    }

    const mustChooseStudyLanguage = Boolean(
      targetService.requires_educational_program && targetProgram?.requires_service_language,
    )

    if (mustChooseStudyLanguage && !acceptStudyLanguage) {
      setActionError('Выберите язык обучения перед быстрым действием')
      return
    }

    if (targetService.requires_service_language && !reassignServiceLanguage) {
      setActionError('Выберите язык обслуживания в модальном окне')
      return
    }

    setSaving(true)
    setMessage('')
    setActionError('')

    try {
      const ticketToReassign = await persistTicketApplicantData(selectedTicket, mustChooseStudyLanguage)
      await api.tickets.reassignService(ticketToReassign.id, {
        service_id: targetService.id,
        educational_program_id: targetService.requires_educational_program && targetProgram ? targetProgram.id : null,
        study_language: mustChooseStudyLanguage ? acceptStudyLanguage || null : null,
        service_language: targetService.requires_service_language ? reassignServiceLanguage || null : null,
      })
      closeTicketDetails()
      setMessage(`Быстрое действие "${action.label.trim()}" выполнено`)
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
            className={classNames('rail-button', view === 'reception' && 'rail-button-active')}
            title="Регистратура"
            onClick={() => setView('reception')}
          >
            <ClipboardList className="h-6 w-6" />
          </button>
          <button
            className={classNames('rail-button', view === 'profile' && 'rail-button-active')}
            title="Профиль"
            onClick={() => setView('profile')}
          >
            <Settings2 className="h-6 w-6" />
          </button>
          <button
            className={classNames('rail-button', view === 'browser' && 'rail-button-active')}
            title="Браузер"
            onClick={() => setView('browser')}
          >
            <Globe className="h-6 w-6" />
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
            <button
              className="ghost-button"
              onClick={() => (view === 'reception' ? refreshReception() : refreshWorkspace())}
              disabled={saving}
            >
              <RefreshCw className="h-5 w-5" />
              Обновить
            </button>
            {(view === 'browser' || browserStreamActive) && (
              <button
                className={browserStreamActive ? 'danger-button' : 'primary-button'}
                title={browserDisplayUrl}
                onClick={toggleBrowserStream}
              >
                <MonitorUp className="h-5 w-5" />
                {browserStreamActive ? 'Остановить трансляцию браузера' : 'Транслировать браузер'}
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

        <div className={classNames('relative min-h-0 flex-1', view === 'browser' ? 'overflow-hidden p-0' : 'overflow-auto p-8')}>
          {view !== 'browser' && (error || message) && (
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
          ) : view === 'reception' ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
              <section className="space-y-6">
                <div className="panel p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="section-label">Регистратура</span>
                      <h2 className="mt-2 text-4xl font-semibold tracking-normal">Талоны</h2>
                    </div>
                    <ClipboardList className="h-9 w-9 text-brand" />
                  </div>

                  <div className="mt-6 grid grid-cols-2 gap-3">
                    <div className="metric-tile">
                      <span>Ожидают</span>
                      <strong>{reception?.waiting_count ?? 0}</strong>
                    </div>
                    <div className="metric-tile">
                      <span>Приняты</span>
                      <strong>{reception?.called_count ?? 0}</strong>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-3">
                    <button className="primary-button h-12 w-full" disabled={saving} onClick={() => refreshReception()}>
                      <RefreshCw className="h-5 w-5" />
                      Обновить регистратуру
                    </button>
                    <div className="info-line">
                      <span>В списке</span>
                      <strong>{reception?.total ?? 0}</strong>
                    </div>
                  </div>
                </div>
              </section>

              <section className="panel overflow-hidden">
                <div className="grid gap-3 border-b border-line p-5 xl:grid-cols-[minmax(260px,1fr)_220px_220px]">
                  <div className="relative min-w-[260px]">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
                    <input
                      className="search-input"
                      value={receptionSearch}
                      onChange={(event) => setReceptionSearch(event.target.value)}
                      placeholder="Поиск по талону, ИИН, услуге или ОП"
                    />
                  </div>
                  <select
                    className="text-input"
                    value={receptionServiceId}
                    onChange={(event) => setReceptionServiceId(event.target.value)}
                  >
                    <option value="">Все услуги регистратуры</option>
                    {receptionServices.map((service) => (
                      <option value={service.id} key={service.id}>
                        {service.name}
                      </option>
                    ))}
                  </select>
                  <select className="text-input" value={receptionStatusFilter} onChange={(event) => setReceptionStatusFilter(event.target.value)}>
                    <option value="">Все статусы</option>
                    <option value="WAITING">Ожидает</option>
                    <option value="CALLED">Принят</option>
                  </select>
                </div>

                {receptionTickets.length > 0 ? (
                  <div className="divide-y divide-line">
                    {[...receptionTickets]
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
                            <p className="mt-1 truncate text-sm text-muted">
                              {ticket.educational_program_name ?? ticket.full_name ?? 'Без дополнительной информации'}
                            </p>
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
                          <button className="ghost-button shrink-0" disabled={saving} onClick={() => openTicketDetails(ticket, 'reception')}>
                            <ExternalLink className="h-5 w-5" />
                            Открыть
                          </button>
                        </article>
                      ))}
                  </div>
                ) : (
                  <div className="p-5">
                    <EmptyState title="Талонов регистратуры нет" />
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
                    <span className="section-label">Быстрые функции</span>
                    <h2 className="mt-1 text-xl font-semibold tracking-normal">Кнопки в карточке талона</h2>
                  </div>
                  <button
                    className="primary-button"
                    type="button"
                    disabled={quickActions.length >= MAX_QUICK_ACTIONS}
                    onClick={addQuickAction}
                  >
                    <Plus className="h-5 w-5" />
                    Добавить
                  </button>
                </div>

                <div className="quick-action-settings">
                  {quickActions.map((action) => (
                    <div className="quick-action-row" key={action.id}>
                      <div className="touch-choice-field">
                        <span className="profile-label">Название кнопки</span>
                        <input
                          className="touch-choice-search"
                          placeholder="Например: Отправить на сканирование"
                          value={action.label}
                          onChange={(event) => updateQuickAction(action.id, { label: event.target.value })}
                        />
                      </div>

                      <div className="touch-choice-field">
                        <span className="profile-label">Услуга</span>
                        <select
                          className="reassign-select"
                          value={action.serviceId}
                          onChange={(event) => updateQuickAction(action.id, { serviceId: event.target.value })}
                        >
                          <option value="">Выберите услугу</option>
                          {activeServices.map((service) => (
                            <option value={service.id} key={service.id}>
                              {service.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        className="ghost-button quick-action-remove"
                        type="button"
                        aria-label="Удалить быстрое действие"
                        onClick={() => removeQuickAction(action.id)}
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  ))}

                  {quickActions.length === 0 ? (
                    <div className="touch-choice-empty">
                      Добавьте кнопку, выберите целевую услугу, и она появится справа от модального окна талона.
                    </div>
                  ) : null}
                </div>
              </section>
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

          <BrowserView
            onActiveUrlChange={setBrowserDisplayUrl}
            streamActive={browserStreamActive}
            visible={view === 'browser'}
          />
        </div>
      </section>

      {selectedTicket && (
        <AdminModal
          title={`Талон ${selectedTicket.ticket_number}`}
          onClose={closeTicketDetails}
          size="wide"
          aside={
            selectedTicketSource === 'window' && configuredQuickActions.length > 0 ? (
              <div className="quick-action-panel">
                <span className="profile-label">Быстро</span>
                {configuredQuickActions.map((action) => {
                  const actionService = activeServices.find((service) => String(service.id) === action.serviceId)

                  return (
                    <button
                      className="quick-action-button"
                      type="button"
                      disabled={saving || selectedTicket.status !== 'CALLED'}
                      onClick={() => runQuickAction(action)}
                      key={action.id}
                    >
                      <RefreshCw className="h-5 w-5" />
                      <span>{action.label.trim()}</span>
                      <small>{actionService?.name ?? 'Услуга недоступна'}</small>
                    </button>
                  )
                })}
              </div>
            ) : null
          }
        >
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

          {canModifySelectedTicket && (
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
                disabled={saving || !canModifySelectedTicket}
                onClick={() => completeTicket(selectedTicket)}
              >
                <Check className="h-5 w-5" />
                Завершить талон
              </button>
              <button
                className="danger-button"
                type="button"
                disabled={saving || !canModifySelectedTicket}
                onClick={() => skipTicket(selectedTicket)}
              >
                <SkipForward className="h-5 w-5" />
                Талон не явился
              </button>
              <button className="primary-button" type="submit" disabled={saving || !canModifySelectedTicket}>
                <RefreshCw className="h-5 w-5" />
                Переназначить услугу
              </button>
            </div>
          </form>
        </AdminModal>
      )}

      {ticketConfirmation && (
        <AdminModal
          title={ticketConfirmation.action === 'complete' ? 'Завершить талон' : 'Талон не явился'}
          onClose={() => setTicketConfirmation(null)}
          size="small"
        >
          <div className="error-dialog">
            <div className="error-dialog-icon" aria-hidden="true">
              ?
            </div>
            <div>
              <strong>
                {ticketConfirmation.action === 'complete'
                  ? `Вы действительно хотите завершить талон ${ticketConfirmation.ticket.ticket_number}?`
                  : `Отметить талон ${ticketConfirmation.ticket.ticket_number} как "Не явился"?`}
              </strong>
              <p>
                {ticketConfirmation.action === 'complete'
                  ? 'Талон будет завершен и отозван из очереди.'
                  : 'Талон будет снят с текущего обслуживания.'}
              </p>
            </div>
          </div>
          <div className="modal-actions">
            <button className="ghost-button" type="button" disabled={saving} onClick={() => setTicketConfirmation(null)}>
              Отмена
            </button>
            <button
              className={ticketConfirmation.action === 'complete' ? 'success-button' : 'danger-button'}
              type="button"
              disabled={saving}
              onClick={() =>
                ticketConfirmation.action === 'complete'
                  ? confirmCompleteTicket(ticketConfirmation.ticket)
                  : confirmSkipTicket(ticketConfirmation.ticket)
              }
            >
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
              Подтвердить
            </button>
          </div>
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
  aside,
  children,
  onClose,
  size = 'default',
  title,
}: {
  aside?: React.ReactNode
  children: React.ReactNode
  onClose: () => void
  size?: 'default' | 'small' | 'wide'
  title: string
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="admin-modal-layout" onMouseDown={(event) => event.stopPropagation()}>
      <section
        className={classNames('admin-modal', size === 'small' && 'admin-modal-small', size === 'wide' && 'admin-modal-wide')}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" type="button" aria-label="Закрыть" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </section>
        {aside ? <aside className="admin-modal-aside">{aside}</aside> : null}
      </div>
    </div>
  )
}

export default App
