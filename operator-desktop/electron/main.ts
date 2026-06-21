import { app, BrowserWindow, ipcMain, screen, session, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { pathToFileURL } from 'node:url'

type OperatorConfig = {
  serverUrl: string
  apiBaseUrl: string
  displayUrl: string
  monitorIndex: number
  displayMode: 'Kiosk' | 'Fullscreen' | 'Window'
  displayScale: number
  displayAutoFit: boolean
  fullScreen: boolean
  refreshSeconds: number
  rememberEmail: boolean
}

type ApiRequest = {
  path: string
  method?: string
  body?: unknown
  accessToken?: string | null
}

type DisplayAuthTokens = {
  accessToken?: string | null
  refreshToken?: string | null
}

type DisplayOpenOptions = DisplayAuthTokens & {
  url?: string
}

type PlatonusDisplayOptions = {
  url?: string
}

type CaptureAreaOptions = {
  x: number
  y: number
  width: number
  height: number
  maxWidth?: number
  quality?: number
}

type PlatonusInputEvent =
  | { type: 'mouseMove' | 'mouseDown' | 'mouseUp'; x: number; y: number; button?: 'left' | 'right' | 'middle'; clickCount?: number }
  | { type: 'mouseWheel'; deltaX?: number; deltaY?: number }
  | { type: 'keyDown' | 'keyUp' | 'char'; keyCode: string }

function isKeyboardInputEvent(event: PlatonusInputEvent): event is Extract<PlatonusInputEvent, { type: 'keyDown' | 'keyUp' | 'char' }> {
  return event.type === 'keyDown' || event.type === 'keyUp' || event.type === 'char'
}

const PLATONUS_URL = 'https://platonus.tau-edu.kz'
const PLATONUS_PARTITION = 'persist:platonus'
const DEFAULT_SERVER_URL = 'http://192.168.115.12'
const ADMIN_SETTINGS_PASSWORD = 'TuranTAU1998!@#$%'
const isDev = !app.isPackaged && process.env.npm_lifecycle_event === 'dev'
const devServerUrl = process.env.OPERATOR_DEV_URL ?? 'http://192.168.115.12'

let mainWindow: BrowserWindow | null = null
let displayWindow: BrowserWindow | null = null
let displayWindowMode: 'queue' | 'platonus' | 'platonus-stream' | null = null
let platonusStreamReady = false
let lastPlatonusStreamFrame: string | null = null
let config: OperatorConfig = readConfig()
let adminSettingsTokens = new Set<string>()
let platonusDownloadPrintHandlerInstalled = false

function parseBool(value: string | undefined, fallback: boolean) {
  if (!value) return fallback
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function parseScale(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0.65, Math.min(1.15, parsed))
}

function parseConfigFile(filePath: string) {
  const values = new Map<string, string>()
  const content = fs.readFileSync(filePath, 'utf8')

  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return

    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex === -1) return

    values.set(trimmed.slice(0, separatorIndex).trim(), trimmed.slice(separatorIndex + 1).trim())
  })

  return values
}

function getConfigCandidates() {
  const appPath = app.getAppPath()
  const exeDir = path.dirname(app.getPath('exe'))
  const portableExeDir = process.env.PORTABLE_EXECUTABLE_DIR

  return [
    path.join(app.getPath('userData'), 'operator.config'),
    ...(portableExeDir ? [path.join(portableExeDir, 'operator.config')] : []),
    path.join(exeDir, 'operator.config'),
    path.join(process.resourcesPath, 'operator.config'),
    path.join(appPath, 'operator.config'),
    path.join(appPath, 'bin', 'operator.config'),
    path.join(process.cwd(), 'bin', 'operator.config'),
    path.join(process.cwd(), 'operator.config.example'),
  ]
}

function getUserConfigPath() {
  return path.join(app.getPath('userData'), 'operator.config')
}

function getMergedConfigValues() {
  const values = new Map<string, string>()

  getConfigCandidates()
    .slice()
    .reverse()
    .forEach((candidate) => {
      if (!fs.existsSync(candidate)) return

      parseConfigFile(candidate).forEach((value, key) => {
        values.set(key, value)
      })
    })

  return values
}

function normalizeServerUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) throw new Error('Server URL is empty')

  const withProtocol = /^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
  const url = new URL(withProtocol)

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Server URL must use http or https')
  }

  const pathname = url.pathname.replace(/\/+$/, '')
  if (pathname === '/api') {
    url.pathname = '/'
  }

  url.search = ''
  url.hash = ''

  return url.toString().replace(/\/+$/, '')
}

function getServerUrlFromApiBaseUrl(apiBaseUrl: string) {
  const normalized = normalizeServerUrl(apiBaseUrl)
  return normalized.endsWith('/api') ? normalized.slice(0, -4) : normalized
}

function buildApiBaseUrl(serverUrl: string) {
  return `${serverUrl.replace(/\/+$/, '')}/api`
}

function buildDisplayUrl(serverUrl: string) {
  return `${serverUrl.replace(/\/+$/, '')}/ru/admin/operator-display?fullscreen=1`
}

function writeConfigValues(filePath: string, updates: Record<string, string>) {
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').split(/\r?\n/) : []
  const pending = new Map(Object.entries(updates))
  const lines = existing.map((line) => {
    const separatorIndex = line.indexOf('=')
    if (separatorIndex === -1) return line

    const key = line.slice(0, separatorIndex).trim()
    if (!pending.has(key)) return line

    const value = pending.get(key) ?? ''
    pending.delete(key)
    return `${key}=${value}`
  })

  pending.forEach((value, key) => {
    lines.push(`${key}=${value}`)
  })

  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${lines.filter((line, index) => line !== '' || index < lines.length - 1).join('\n')}\n`, 'utf8')
}

function readConfig(): OperatorConfig {
  const values = getMergedConfigValues()
  const displayMode = values.get('DisplayMode') ?? 'Kiosk'
  const serverUrl = normalizeServerUrl(values.get('ServerUrl') ?? getServerUrlFromApiBaseUrl(values.get('ApiBaseUrl') ?? `${DEFAULT_SERVER_URL}/api`))

  return {
    serverUrl,
    apiBaseUrl: values.get('ApiBaseUrl') ?? buildApiBaseUrl(serverUrl),
    displayUrl: values.get('DisplayUrl') ?? buildDisplayUrl(serverUrl),
    monitorIndex: Number(values.get('MonitorIndex') ?? '2') || 2,
    displayMode: displayMode === 'Fullscreen' || displayMode === 'Window' ? displayMode : 'Kiosk',
    displayScale: parseScale(values.get('DisplayScale'), 0.9),
    displayAutoFit: parseBool(values.get('DisplayAutoFit'), true),
    fullScreen: parseBool(values.get('FullScreen'), false),
    refreshSeconds: Number(values.get('RefreshSeconds') ?? '5') || 5,
    rememberEmail: parseBool(values.get('RememberEmail'), true),
  }
}

function saveServerUrl(value: string, adminToken: unknown) {
  if (typeof adminToken !== 'string' || !adminSettingsTokens.has(adminToken)) {
    throw new Error('Admin password is required')
  }

  const serverUrl = normalizeServerUrl(value)

  writeConfigValues(getUserConfigPath(), {
    ServerUrl: serverUrl,
    ApiBaseUrl: buildApiBaseUrl(serverUrl),
    DisplayUrl: buildDisplayUrl(serverUrl),
  })

  config = readConfig()
  return config
}

function verifyAdminPassword(value: unknown) {
  if (value !== ADMIN_SETTINGS_PASSWORD) {
    return { ok: false }
  }

  const token = crypto.randomUUID()
  adminSettingsTokens.add(token)
  return { ok: true, token }
}

function getDisplayUrl(options?: DisplayOpenOptions) {
  if (options?.url) {
    return options.url
  }

  if (!options?.accessToken || !options.refreshToken) {
    return config.displayUrl
  }

  const url = new URL(config.displayUrl)
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''))
  hashParams.set('access_token', options.accessToken)
  hashParams.set('refresh_token', options.refreshToken)
  url.hash = hashParams.toString()
  return url.toString()
}

function getPlatonusUrl(options?: PlatonusDisplayOptions) {
  if (!options?.url) return PLATONUS_URL

  try {
    const url = new URL(options.url)
    if (url.protocol === 'https:' && url.hostname === 'platonus.tau-edu.kz') {
      return url.toString()
    }
  } catch {
    return PLATONUS_URL
  }

  return PLATONUS_URL
}

function getTargetDisplayWindow() {
  const displays = screen.getAllDisplays()
  const selectedDisplay = displays[Math.max(0, Math.min(displays.length - 1, config.monitorIndex - 1))] ?? displays[0]
  const bounds = selectedDisplay.bounds
  const workArea = selectedDisplay.workArea
  const windowBounds = config.displayMode === 'Window' ? workArea : bounds
  const autoFitScale = Math.min(1, Math.max(0.72, Math.min(windowBounds.width / 1600, windowBounds.height / 900)))
  const displayZoom = config.displayAutoFit ? Math.min(config.displayScale, autoFitScale) : config.displayScale

  return { windowBounds, displayZoom }
}

function getPlatonusStreamHtml() {
  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
    <style>
      html,
      body {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: #000;
      }

      #frame {
        width: 100vw;
        height: 100vh;
        object-fit: contain;
        display: block;
        background: #000;
      }

      #status {
        position: fixed;
        inset: 0;
        display: grid;
        place-items: center;
        color: rgba(255, 255, 255, 0.72);
        font: 600 18px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
    </style>
  </head>
  <body>
    <img id="frame" alt="" />
    <div id="status">Platonus stream is starting...</div>
    <script>
      var queuedFrame = null;
      var animationFrame = 0;

      function renderFrame() {
        var image = document.getElementById('frame');
        var status = document.getElementById('status');
        image.src = queuedFrame;
        status.style.display = 'none';
        animationFrame = 0;
      }

      function setFrame(frame) {
        queuedFrame = frame;
        if (!animationFrame) {
          animationFrame = requestAnimationFrame(renderFrame);
        }
      }

      try {
        var electron = require('electron');
        electron.ipcRenderer.on('operator:platonus-stream-frame', function(_event, frame) {
          if (typeof frame === 'string') setFrame(frame);
        });
        electron.ipcRenderer.send('operator:platonus-stream-ready');
      } catch (err) {
        document.getElementById('status').textContent = 'Platonus stream waiting for Electron IPC...';
      }

      window.__setPlatonusFrame = function(frame) {
        setFrame(frame);
      };
    </script>
  </body>
</html>`
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1120,
    minHeight: 720,
    show: false,
    title: 'Queue Operator CRM',
    backgroundColor: '#F4F7FB',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    if (config.fullScreen) mainWindow?.setFullScreen(true)
  })

  if (isDev) {
    mainWindow.loadURL(devServerUrl)
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

function openDisplayWindow(options?: DisplayOpenOptions) {
  config = readConfig()
  const displayUrl = getDisplayUrl(options)

  const { windowBounds, displayZoom } = getTargetDisplayWindow()

  if (displayWindow && !displayWindow.isDestroyed() && displayWindowMode === 'queue') {
    displayWindow.focus()
    displayWindow.webContents.setZoomFactor(displayZoom)
    displayWindow.loadURL(displayUrl)
    return { ok: true, reused: true }
  }

  if (displayWindow && !displayWindow.isDestroyed()) {
    displayWindow.close()
  }

  platonusStreamReady = false
  lastPlatonusStreamFrame = null

  displayWindow = new BrowserWindow({
    x: windowBounds.x,
    y: windowBounds.y,
    width: windowBounds.width,
    height: windowBounds.height,
    frame: config.displayMode === 'Window',
    kiosk: config.displayMode === 'Kiosk',
    fullscreen: config.displayMode !== 'Window',
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  displayWindowMode = 'queue'
  const createdDisplayWindow = displayWindow
  createdDisplayWindow.on('closed', () => {
    if (displayWindow === createdDisplayWindow) {
      displayWindow = null
      displayWindowMode = null
    }
  })
  displayWindow.webContents.setZoomFactor(displayZoom)
  displayWindow.loadURL(displayUrl)

  return { ok: true, reused: false }
}

async function openPlatonusDisplayWindow(options?: PlatonusDisplayOptions) {
  config = readConfig()
  const { windowBounds } = getTargetDisplayWindow()
  const platonusUrl = getPlatonusUrl(options)

  if (displayWindow && !displayWindow.isDestroyed() && displayWindowMode === 'platonus') {
    displayWindow.focus()
    displayWindow.webContents.setZoomFactor(1)
    await displayWindow.loadURL(platonusUrl)
    return { ok: true, reused: true }
  }

  if (displayWindow && !displayWindow.isDestroyed()) {
    displayWindow.close()
  }

  displayWindow = new BrowserWindow({
    x: windowBounds.x,
    y: windowBounds.y,
    width: windowBounds.width,
    height: windowBounds.height,
    frame: config.displayMode === 'Window',
    kiosk: config.displayMode === 'Kiosk',
    fullscreen: config.displayMode !== 'Window',
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
      partition: PLATONUS_PARTITION,
    },
  })

  displayWindowMode = 'platonus'
  const createdDisplayWindow = displayWindow
  createdDisplayWindow.on('closed', () => {
    if (displayWindow === createdDisplayWindow) {
      displayWindow = null
      displayWindowMode = null
    }
  })
  displayWindow.webContents.setZoomFactor(1)
  await displayWindow.loadURL(platonusUrl)

  return { ok: true, reused: false }
}

async function openPlatonusStreamDisplayWindow() {
  config = readConfig()
  const { windowBounds } = getTargetDisplayWindow()

  if (displayWindow && !displayWindow.isDestroyed() && displayWindowMode === 'platonus-stream') {
    displayWindow.focus()
    displayWindow.setBounds(windowBounds)
    return { ok: true, reused: true }
  }

  if (displayWindow && !displayWindow.isDestroyed()) {
    displayWindow.close()
  }

  displayWindow = new BrowserWindow({
    x: windowBounds.x,
    y: windowBounds.y,
    width: windowBounds.width,
    height: windowBounds.height,
    frame: config.displayMode === 'Window',
    kiosk: config.displayMode === 'Kiosk',
    fullscreen: config.displayMode !== 'Window',
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  })

  displayWindowMode = 'platonus-stream'
  const createdDisplayWindow = displayWindow
  createdDisplayWindow.on('closed', () => {
    if (displayWindow === createdDisplayWindow) {
      displayWindow = null
      displayWindowMode = null
    }
  })

  await displayWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(getPlatonusStreamHtml())}`)
  return { ok: true, reused: false }
}

function updatePlatonusStreamFrame(frame: unknown) {
  if (
    typeof frame !== 'string' ||
    !frame.startsWith('data:image/') ||
    !displayWindow ||
    displayWindow.isDestroyed() ||
    displayWindowMode !== 'platonus-stream'
  ) {
    return { ok: false }
  }

  lastPlatonusStreamFrame = frame
  displayWindow.webContents.send('operator:platonus-stream-frame', frame)

  return { ok: true }
}

function closePlatonusStreamDisplayWindow() {
  if (displayWindow && !displayWindow.isDestroyed() && displayWindowMode === 'platonus-stream') {
    displayWindow.close()
    platonusStreamReady = false
    lastPlatonusStreamFrame = null
    return { ok: true }
  }

  return { ok: false }
}

async function capturePlatonusDisplayFrame() {
  if (!displayWindow || displayWindow.isDestroyed() || displayWindowMode !== 'platonus') {
    return { ok: false, frame: null }
  }

  const image = await displayWindow.webContents.capturePage()
  const size = image.getSize()
  const preview = size.width > 1280 ? image.resize({ width: 1280 }) : image
  const frame = `data:image/jpeg;base64,${preview.toJPEG(76).toString('base64')}`
  return { ok: true, frame }
}

async function streamMainWindowArea(options: CaptureAreaOptions) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { ok: false }
  }

  const x = Math.max(0, Math.floor(options.x))
  const y = Math.max(0, Math.floor(options.y))
  const width = Math.max(1, Math.floor(options.width))
  const height = Math.max(1, Math.floor(options.height))
  const maxWidth = Math.max(320, Math.min(3840, Math.floor(options.maxWidth ?? 1920)))
  const quality = Math.max(45, Math.min(100, Math.floor(options.quality ?? 90)))

  const image = await mainWindow.webContents.capturePage({ x, y, width, height })
  const size = image.getSize()
  const preview = size.width > maxWidth ? image.resize({ width: maxWidth }) : image
  const frame = `data:image/jpeg;base64,${preview.toJPEG(quality).toString('base64')}`

  return updatePlatonusStreamFrame(frame)
}

function sendPlatonusInput(event: PlatonusInputEvent) {
  if (!displayWindow || displayWindow.isDestroyed() || displayWindowMode !== 'platonus') {
    return { ok: false }
  }

  const bounds = displayWindow.getBounds()

  if (event.type === 'mouseWheel') {
    displayWindow.webContents.sendInputEvent({
      type: 'mouseWheel',
      x: Math.round(bounds.width / 2),
      y: Math.round(bounds.height / 2),
      deltaX: event.deltaX ?? 0,
      deltaY: event.deltaY ?? 0,
    })
    return { ok: true }
  }

  if (isKeyboardInputEvent(event)) {
    displayWindow.webContents.sendInputEvent({
      type: event.type,
      keyCode: event.keyCode,
    })
    return { ok: true }
  }

  displayWindow.webContents.sendInputEvent({
    type: event.type,
    x: Math.max(0, Math.min(bounds.width - 1, Math.round(event.x * bounds.width))),
    y: Math.max(0, Math.min(bounds.height - 1, Math.round(event.y * bounds.height))),
    button: event.button ?? 'left',
    clickCount: event.clickCount ?? 1,
  })

  return { ok: true }
}

function normalizeApiBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, '')
}

async function apiRequest({ path: requestPath, method = 'GET', body, accessToken }: ApiRequest) {
  config = readConfig()

  const response = await fetch(`${normalizeApiBaseUrl(config.apiBaseUrl)}${requestPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: body === undefined || body === null ? undefined : JSON.stringify(body),
  })

  const contentType = response.headers.get('content-type')
  const payload = contentType?.includes('application/json') ? await response.json() : await response.text()

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      payload,
    }
  }

  return {
    ok: true,
    status: response.status,
    payload,
  }
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function waitForDownloadedFile(filePath: string) {
  let previousSize = -1
  let stableChecks = 0
  const startedAt = Date.now()

  while (Date.now() - startedAt < 12000) {
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath)

      if (stats.size > 0 && stats.size === previousSize) {
        stableChecks += 1
        if (stableChecks >= 2) return true
      } else {
        stableChecks = 0
      }

      previousSize = stats.size
    }

    await delay(350)
  }

  return fs.existsSync(filePath) && fs.statSync(filePath).size > 0
}

function sanitizeDownloadFilename(filename: string) {
  const sanitized = filename.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim()
  return sanitized || `platonus-${Date.now()}`
}

function getPlatonusPrintTempPath(filename: string) {
  const tempDir = path.join(app.getPath('temp'), 'queue-operator-platonus-print')
  fs.mkdirSync(tempDir, { recursive: true })

  return path.join(tempDir, `${Date.now()}-${sanitizeDownloadFilename(filename)}`)
}

function printDownloadedFileDirectly(filePath: string) {
  return new Promise<void>((resolve, reject) => {
    const printWindow = new BrowserWindow({
      width: 1024,
      height: 768,
      show: true,
      title: path.basename(filePath),
      autoHideMenuBar: true,
      webPreferences: {
        sandbox: true,
        nodeIntegration: false,
        contextIsolation: true,
      },
    })

    printWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        if (printWindow.isDestroyed()) return

        printWindow.focus()
        printWindow.webContents.print(
          { silent: false, printBackground: true },
          (success, failureReason) => {
            if (!success) {
              reject(new Error(failureReason || 'Electron direct file print failed'))
              return
            }

            resolve()
          },
        )
      }, 2200)
    })

    printWindow.webContents.once('did-fail-load', (_event, _code, description) => {
      if (!printWindow.isDestroyed()) printWindow.destroy()
      reject(new Error(description))
    })

    printWindow.loadURL(pathToFileURL(filePath).toString()).catch((err) => {
      if (!printWindow.isDestroyed()) printWindow.destroy()
      reject(err)
    })
  })
}

async function printDownloadedFile(filePath: string) {
  const fileReady = await waitForDownloadedFile(filePath)
  if (!fileReady) {
    console.error('Downloaded Platonus file is not ready for printing', filePath)
    return
  }

  try {
    await printDownloadedFileDirectly(filePath)
    return
  } catch (err) {
    console.error('Electron direct file print failed for downloaded Platonus file', err)
  }

  shell.openPath(filePath).catch((err) => {
    console.error('Failed to open downloaded Platonus file', err)
  })
}

function installPlatonusDownloadPrintHandler() {
  if (platonusDownloadPrintHandlerInstalled) return
  platonusDownloadPrintHandlerInstalled = true

  session.fromPartition(PLATONUS_PARTITION).on('will-download', (_event, item) => {
    const tempFilePath = getPlatonusPrintTempPath(item.getFilename())
    item.setSavePath(tempFilePath)

    item.once('done', (_doneEvent, state) => {
      if (state !== 'completed') return

      const filePath = item.getSavePath() || tempFilePath
      if (!filePath) return

      void printDownloadedFile(filePath)
    })
  })
}

app.whenReady().then(() => {
  config = readConfig()
  installPlatonusDownloadPrintHandler()

  ipcMain.handle('operator:get-config', () => config)
  ipcMain.handle('operator:reload-config', () => {
    config = readConfig()
    return config
  })
  ipcMain.handle('operator:verify-admin-password', (_event, value: unknown) => verifyAdminPassword(value))
  ipcMain.handle('operator:save-server-url', (_event, value: string, adminToken: unknown) => saveServerUrl(value, adminToken))
  ipcMain.handle('operator:api-request', (_event, request: ApiRequest) => apiRequest(request))
  ipcMain.handle('operator:open-display', (_event, options?: DisplayOpenOptions) => openDisplayWindow(options))
  ipcMain.handle('operator:open-platonus-display', (_event, options?: PlatonusDisplayOptions) => openPlatonusDisplayWindow(options))
  ipcMain.handle('operator:open-platonus-stream-display', () => openPlatonusStreamDisplayWindow())
  ipcMain.handle('operator:update-platonus-stream-frame', (_event, frame: unknown) => updatePlatonusStreamFrame(frame))
  ipcMain.on('operator:update-platonus-stream-frame', (_event, frame: unknown) => updatePlatonusStreamFrame(frame))
  ipcMain.handle('operator:stream-main-window-area', (_event, options: CaptureAreaOptions) => streamMainWindowArea(options))
  ipcMain.on('operator:platonus-stream-ready', () => {
    platonusStreamReady = true
    if (
      lastPlatonusStreamFrame &&
      displayWindow &&
      !displayWindow.isDestroyed() &&
      displayWindowMode === 'platonus-stream'
    ) {
      displayWindow.webContents.send('operator:platonus-stream-frame', lastPlatonusStreamFrame)
    }
  })
  ipcMain.handle('operator:close-platonus-stream-display', () => closePlatonusStreamDisplayWindow())
  ipcMain.handle('operator:capture-platonus-display', () => capturePlatonusDisplayFrame())
  ipcMain.handle('operator:send-platonus-input', (_event, event: PlatonusInputEvent) => sendPlatonusInput(event))

  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
