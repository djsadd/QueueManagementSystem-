import { app, BrowserWindow, ipcMain, screen } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

type OperatorConfig = {
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

const isDev = !app.isPackaged && process.env.npm_lifecycle_event === 'dev'
const devServerUrl = process.env.OPERATOR_DEV_URL ?? 'http://192.168.115.12'

let mainWindow: BrowserWindow | null = null
let displayWindow: BrowserWindow | null = null
let config: OperatorConfig = readConfig()

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

  return [
    path.join(app.getPath('userData'), 'operator.config'),
    path.join(exeDir, 'operator.config'),
    path.join(process.resourcesPath, 'operator.config'),
    path.join(appPath, 'operator.config'),
    path.join(appPath, 'bin', 'operator.config'),
    path.join(process.cwd(), 'bin', 'operator.config'),
    path.join(process.cwd(), 'operator.config.example'),
  ]
}

function readConfig(): OperatorConfig {
  const configPath = getConfigCandidates().find((candidate) => fs.existsSync(candidate))
  const values = configPath ? parseConfigFile(configPath) : new Map<string, string>()
  const displayMode = values.get('DisplayMode') ?? 'Kiosk'

  return {
    apiBaseUrl: values.get('ApiBaseUrl') ?? 'http://192.168.115.12/api',
    displayUrl: values.get('DisplayUrl') ?? 'http://192.168.115.12/ru/admin/operator-display?fullscreen=1',
    monitorIndex: Number(values.get('MonitorIndex') ?? '2') || 2,
    displayMode: displayMode === 'Fullscreen' || displayMode === 'Window' ? displayMode : 'Kiosk',
    displayScale: parseScale(values.get('DisplayScale'), 0.9),
    displayAutoFit: parseBool(values.get('DisplayAutoFit'), true),
    fullScreen: parseBool(values.get('FullScreen'), false),
    refreshSeconds: Number(values.get('RefreshSeconds') ?? '5') || 5,
    rememberEmail: parseBool(values.get('RememberEmail'), true),
  }
}

function getDisplayUrl(authTokens?: DisplayAuthTokens) {
  if (!authTokens?.accessToken || !authTokens.refreshToken) {
    return config.displayUrl
  }

  const url = new URL(config.displayUrl)
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''))
  hashParams.set('access_token', authTokens.accessToken)
  hashParams.set('refresh_token', authTokens.refreshToken)
  url.hash = hashParams.toString()
  return url.toString()
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

function openDisplayWindow(authTokens?: DisplayAuthTokens) {
  config = readConfig()
  const displayUrl = getDisplayUrl(authTokens)

  const displays = screen.getAllDisplays()
  const selectedDisplay = displays[Math.max(0, Math.min(displays.length - 1, config.monitorIndex - 1))] ?? displays[0]
  const bounds = selectedDisplay.bounds
  const workArea = selectedDisplay.workArea
  const windowBounds = config.displayMode === 'Window' ? workArea : bounds
  const autoFitScale = Math.min(1, Math.max(0.72, Math.min(windowBounds.width / 1600, windowBounds.height / 900)))
  const displayZoom = config.displayAutoFit ? Math.min(config.displayScale, autoFitScale) : config.displayScale

  if (displayWindow && !displayWindow.isDestroyed()) {
    displayWindow.focus()
    displayWindow.webContents.setZoomFactor(displayZoom)
    displayWindow.loadURL(displayUrl)
    return { ok: true, reused: true }
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
    },
  })

  displayWindow.on('closed', () => {
    displayWindow = null
  })
  displayWindow.webContents.setZoomFactor(displayZoom)
  displayWindow.loadURL(displayUrl)

  return { ok: true, reused: false }
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

app.whenReady().then(() => {
  config = readConfig()

  ipcMain.handle('operator:get-config', () => config)
  ipcMain.handle('operator:reload-config', () => {
    config = readConfig()
    return config
  })
  ipcMain.handle('operator:api-request', (_event, request: ApiRequest) => apiRequest(request))
  ipcMain.handle('operator:open-display', (_event, authTokens?: DisplayAuthTokens) => openDisplayWindow(authTokens))

  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
