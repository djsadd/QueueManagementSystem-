import { app, BrowserWindow, ipcMain, net } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

type TerminalConfig = {
  apiBaseUrl: string
  printerName: string
  fullScreen: boolean
  receiptWidthMm: number
  receiptBottomFeedMm: number
  autoResetSeconds: number
}

type ApiRequest = {
  path: string
  method?: string
  body?: unknown
}

type TerminalLanguage = 'kk' | 'ru' | 'en'

type TerminalTicket = {
  id: string
  service_id: number
  educational_program_id: number | null
  service_name: string | null
  service_name_kk: string | null
  service_name_en: string | null
  educational_program_name: string | null
  educational_program_name_kk: string | null
  educational_program_name_en: string | null
  ticket_number: string
  created_at: string
}

const isDev = !app.isPackaged && process.env.npm_lifecycle_event === 'dev'
const devServerUrl = process.env.TERMINAL_DEV_URL ?? 'http://127.0.0.1:5175'

let mainWindow: BrowserWindow | null = null
let config: TerminalConfig = getDefaultConfig()

function getDefaultConfig(): TerminalConfig {
  return {
    apiBaseUrl: 'http://192.168.115.12:8000',
    printerName: '',
    fullScreen: true,
    receiptWidthMm: 80,
    receiptBottomFeedMm: 5,
    autoResetSeconds: 10,
  }
}

function parseBool(value: string | undefined, fallback: boolean) {
  if (!value) return fallback
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function parsePositiveInt(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.round(parsed)))
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
    path.join(app.getPath('userData'), 'terminal.config'),
    path.join(exeDir, 'terminal.config'),
    path.join(process.resourcesPath, 'terminal.config'),
    path.join(appPath, 'terminal.config'),
    path.join(appPath, 'bin', 'terminal.config'),
    path.join(process.cwd(), 'bin', 'terminal.config'),
    path.join(process.cwd(), 'terminal.config'),
    path.join(process.cwd(), 'terminal.config.example'),
  ]
}

function readConfig(): TerminalConfig {
  const defaults = getDefaultConfig()
  const configPath = getConfigCandidates().find((candidate) => fs.existsSync(candidate))
  const values = configPath ? parseConfigFile(configPath) : new Map<string, string>()

  return {
    apiBaseUrl: (values.get('ApiBaseUrl') || defaults.apiBaseUrl).replace(/\/+$/, ''),
    printerName: values.get('PrinterName') ?? defaults.printerName,
    fullScreen: parseBool(values.get('FullScreen'), defaults.fullScreen),
    receiptWidthMm: parsePositiveInt(values.get('ReceiptWidthMm'), defaults.receiptWidthMm, 40, 120),
    receiptBottomFeedMm: parsePositiveInt(values.get('ReceiptBottomFeedMm'), defaults.receiptBottomFeedMm, 0, 40),
    autoResetSeconds: parsePositiveInt(values.get('AutoResetSeconds'), defaults.autoResetSeconds, 3, 120),
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: !config.fullScreen,
    kiosk: config.fullScreen,
    fullscreen: config.fullScreen,
    autoHideMenuBar: true,
    title: 'Queue Terminal Kiosk',
    backgroundColor: '#F7FAFC',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  if (isDev) {
    mainWindow.loadURL(devServerUrl)
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

function apiRequest({ path: requestPath, method = 'GET', body }: ApiRequest) {
  config = readConfig()
  const bodyText = body === undefined || body === null ? null : JSON.stringify(body)

  return new Promise<{ ok: boolean; status: number; payload: unknown }>((resolve) => {
    const request = net.request({
      method,
      url: `${config.apiBaseUrl}${requestPath}`,
    })
    const chunks: Buffer[] = []

    request.setHeader('Accept', 'application/json')
    request.setHeader('X-Queue-Client', 'electron-terminal')
    if (bodyText) request.setHeader('Content-Type', 'application/json; charset=utf-8')

    request.on('response', (response) => {
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        const contentType = response.headers['content-type']
        const isJson = Array.isArray(contentType)
          ? contentType.some((value) => value.includes('application/json'))
          : String(contentType ?? '').includes('application/json')
        let payload: unknown = text

        if (isJson && text) {
          try {
            payload = JSON.parse(text)
          } catch {
            payload = text
          }
        }

        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode,
          payload,
        })
      })
    })

    request.on('error', (error) => {
      resolve({
        ok: false,
        status: 0,
        payload: { detail: `Нет связи с сервером: ${error.message}` },
      })
    })

    if (bodyText) request.write(bodyText)
    request.end()
  })
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function getLocalizedValue(language: TerminalLanguage, kk: string | null, ru: string | null, en: string | null) {
  const preferred = language === 'kk' ? kk : language === 'en' ? en : ru
  return preferred || ru || kk || en || '-'
}

function formatTicketDate(value: string, language: TerminalLanguage) {
  const locale = language === 'kk' ? 'kk-KZ' : language === 'en' ? 'en-US' : 'ru-RU'
  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) return value

  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed)
}

function imageDataUriFromCandidates(candidates: string[]) {
  const imagePath = candidates.find((candidate) => fs.existsSync(candidate))
  if (!imagePath) return ''

  const extension = path.extname(imagePath).toLowerCase()
  const mimeType = extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : 'image/png'
  return `data:${mimeType};base64,${fs.readFileSync(imagePath).toString('base64')}`
}

function getBundledImageDataUri(fileName: string, extraCandidates: string[] = []) {
  const appPath = app.getAppPath()
  const candidates = [
    path.join(process.resourcesPath, fileName),
    path.join(process.resourcesPath, 'assets', fileName),
    path.join(appPath, fileName),
    path.join(appPath, 'assets', fileName),
    path.join(process.cwd(), fileName),
    path.join(process.cwd(), 'assets', fileName),
    path.join(process.cwd(), 'bin', fileName),
    ...extraCandidates,
  ]

  return imageDataUriFromCandidates(candidates)
}

function getLogoDataUri() {
  const appPath = app.getAppPath()
  return getBundledImageDataUri('logo.png', [
    path.join(appPath, '..', 'frontend', 'src', 'assets', 'Logo+RGB.png'),
    path.join(process.cwd(), '..', 'frontend', 'src', 'assets', 'Logo+RGB.png'),
  ])
}

function getTicketNumberFontSize(ticketNumber: string, contentWidthMm: number) {
  const widthPt = contentWidthMm * 2.83465
  const estimatedSize = widthPt / Math.max(1, ticketNumber.length) / 0.62
  return Math.max(24, Math.min(43, Math.floor(estimatedSize)))
}

function buildReceiptHtmlLegacy(ticket: TerminalTicket, language: TerminalLanguage) {
  const labels = {
    kk: {
      title: 'Сіздің талоныңыз',
      service: 'Қызмет',
      program: 'Білім беру бағдарламасы',
    },
    ru: {
      title: 'Ваш талон',
      service: 'Услуга',
      program: 'Образовательная программа',
    },
    en: {
      title: 'Your ticket',
      service: 'Service',
      program: 'Educational program',
    },
  }[language]
  const logo = getLogoDataUri()
  const serviceName = getLocalizedValue(language, ticket.service_name_kk, ticket.service_name, ticket.service_name_en)
  const programName = getLocalizedValue(
    language,
    ticket.educational_program_name_kk,
    ticket.educational_program_name,
    ticket.educational_program_name_en,
  )
  const programBlock = ticket.educational_program_name
    ? `<section><span>${labels.program}</span><strong>${escapeHtml(programName)}</strong></section>`
    : ''

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      @page { size: ${config.receiptWidthMm}mm auto; margin: 0; }
      * { box-sizing: border-box; }
      body {
        width: ${config.receiptWidthMm}mm;
        margin: 0;
        background: #fff;
        color: #000;
        font-family: Arial, "Segoe UI", sans-serif;
      }
      .receipt {
        width: ${Math.max(40, config.receiptWidthMm - 6)}mm;
        margin: 0 auto;
        padding: 4mm 0 ${config.receiptBottomFeedMm}mm;
        text-align: center;
      }
      .logo {
        max-width: 40mm;
        max-height: 18mm;
        object-fit: contain;
        filter: grayscale(1);
      }
      .brand {
        font-size: 22pt;
        font-weight: 800;
        letter-spacing: 0;
      }
      .title {
        margin: 4mm 0 1mm;
        font-size: 11pt;
      }
      .number {
        display: block;
        margin: 0 0 5mm;
        font-size: 42pt;
        font-weight: 800;
        line-height: 1;
      }
      section {
        border-top: 1px dashed #000;
        padding: 3mm 0;
      }
      section span {
        display: block;
        margin-bottom: 1mm;
        font-size: 9pt;
      }
      section strong {
        display: block;
        overflow-wrap: anywhere;
        font-size: 11pt;
        line-height: 1.25;
      }
      .date {
        border-top: 1px dashed #000;
        padding-top: 3mm;
        font-size: 9pt;
      }
    </style>
  </head>
  <body>
    <main class="receipt">
      ${logo ? `<img class="logo" src="${logo}" alt="TAU" />` : '<div class="brand">TAU</div>'}
      <p class="title">${labels.title}</p>
      <strong class="number">${escapeHtml(ticket.ticket_number)}</strong>
      <section>
        <span>${labels.service}</span>
        <strong>${escapeHtml(serviceName)}</strong>
      </section>
      ${programBlock}
      <p class="date">${escapeHtml(formatTicketDate(ticket.created_at, language))}</p>
    </main>
  </body>
</html>`
}

function buildReceiptHtml(ticket: TerminalTicket, language: TerminalLanguage) {
  const labels = {
    kk: {
      title: '\u0421\u0456\u0437\u0434\u0456\u04a3 \u0442\u0430\u043b\u043e\u043d\u044b\u04a3\u044b\u0437',
    },
    ru: {
      title: '\u0412\u0430\u0448 \u0442\u0430\u043b\u043e\u043d',
    },
    en: {
      title: 'Your ticket',
    },
  }[language]
  const receiptWidthMm = Math.max(40, config.receiptWidthMm)
  const contentPaddingMm = 8.6
  const contentWidthMm = Math.max(24, receiptWidthMm - contentPaddingMm * 2)
  const numberFontSize = getTicketNumberFontSize(ticket.ticket_number, contentWidthMm)
  const logo = getBundledImageDataUri('receipt-logo.png') || getLogoDataUri()
  const leftTop = getBundledImageDataUri('left-top.png')
  const rightTop = getBundledImageDataUri('right-top.png')
  const serviceName = getLocalizedValue(language, ticket.service_name_kk, ticket.service_name, ticket.service_name_en)
  const programName = getLocalizedValue(
    language,
    ticket.educational_program_name_kk,
    ticket.educational_program_name,
    ticket.educational_program_name_en,
  )
  const programBlock = ticket.educational_program_name
    ? `<p class="program-name">${escapeHtml(programName)}</p>`
    : ''

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      @page { size: ${receiptWidthMm}mm auto; margin: 0; }
      * { box-sizing: border-box; }
      body {
        width: ${receiptWidthMm}mm;
        margin: 0;
        background: #fff;
        color: #000;
        font-family: Arial, "Segoe UI", sans-serif;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .receipt {
        position: relative;
        width: ${receiptWidthMm}mm;
        min-height: 70mm;
        margin: 0;
        padding: 0.5mm ${contentPaddingMm}mm ${config.receiptBottomFeedMm}mm;
        text-align: center;
        overflow: hidden;
      }
      .receipt::before,
      .receipt::after {
        content: "";
        position: absolute;
        top: 13.2mm;
        bottom: 13.2mm;
        width: 0;
        border-left: 0.24mm solid #000;
      }
      .receipt::before {
        left: 4.1mm;
      }
      .receipt::after {
        right: 4.1mm;
      }
      .receipt-content {
        position: relative;
        z-index: 1;
      }
      .logo {
        display: block;
        max-width: ${contentWidthMm}mm;
        max-height: 15.7mm;
        margin: 0 auto;
        object-fit: contain;
      }
      .brand {
        height: 15.7mm;
        font-size: 31pt;
        font-weight: 800;
        letter-spacing: 0;
        line-height: 15.7mm;
      }
      .title {
        margin: 5.1mm 0 0.7mm;
        font-size: 13pt;
        line-height: 1.2;
      }
      .number {
        display: block;
        margin: 0 0 6.1mm;
        color: #000;
        font-size: ${numberFontSize}pt;
        font-weight: 800;
        line-height: 16mm;
        white-space: nowrap;
      }
      .service-name,
      .program-name {
        margin: 0;
        overflow-wrap: anywhere;
        word-break: normal;
        hyphens: auto;
      }
      .service-name {
        font-size: 13pt;
        font-weight: 800;
        line-height: 1.22;
      }
      .program-name {
        margin-top: 1.8mm;
        font-size: 11pt;
        line-height: 1.24;
      }
      .divider {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 16mm minmax(0, 1fr);
        align-items: center;
        gap: 1.8mm;
        margin: 4.2mm 0 3.1mm;
      }
      .divider::before,
      .divider::after {
        content: "";
        border-top: 0.32mm solid #000;
      }
      .divider span {
        position: relative;
        display: block;
        height: 3.8mm;
      }
      .divider span::before {
        content: "";
        position: absolute;
        left: 50%;
        top: 50%;
        width: 2.6mm;
        height: 2.6mm;
        background: #000;
        transform: translate(-50%, -50%) rotate(45deg);
      }
      .date {
        margin: 0;
        font-size: 12pt;
        line-height: 1.2;
      }
      .corner {
        position: absolute;
        z-index: 2;
        object-fit: fill;
      }
      .corner-left {
        left: 0;
        top: 0;
        width: 11.7mm;
        height: 10.9mm;
      }
      .corner-right {
        right: 2mm;
        top: 0;
        width: 10.9mm;
        height: 13mm;
      }
      .corner.fallback {
        border-top: 0.38mm solid #000;
        border-left: 0.38mm solid #000;
      }
      .corner-right.fallback {
        right: 0;
        border-left: 0;
        border-right: 0.38mm solid #000;
      }
    </style>
  </head>
  <body>
    <main class="receipt">
      ${leftTop ? `<img class="corner corner-left" src="${leftTop}" alt="" />` : '<span class="corner corner-left fallback"></span>'}
      ${rightTop ? `<img class="corner corner-right" src="${rightTop}" alt="" />` : '<span class="corner corner-right fallback"></span>'}
      <div class="receipt-content">
        ${logo ? `<img class="logo" src="${logo}" alt="TAU" />` : '<div class="brand">TAU</div>'}
        <p class="title">${labels.title}</p>
        <strong class="number">${escapeHtml(ticket.ticket_number)}</strong>
        <p class="service-name">${escapeHtml(serviceName)}</p>
        ${programBlock}
        <div class="divider"><span></span></div>
        <p class="date">${escapeHtml(formatTicketDate(ticket.created_at, language))}</p>
      </div>
    </main>
  </body>
</html>`
}

function printTicket(ticket: TerminalTicket, language: TerminalLanguage) {
  config = readConfig()

  return new Promise<{ ok: boolean; message?: string }>((resolve) => {
    const printWindow = new BrowserWindow({
      show: false,
      width: 420,
      height: 720,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    })
    let settled = false

    function finish(result: { ok: boolean; message?: string }) {
      if (settled) return
      settled = true
      if (!printWindow.isDestroyed()) printWindow.destroy()
      resolve(result)
    }

    printWindow.webContents.once('did-finish-load', () => {
      printWindow.webContents.print(
        {
          silent: true,
          printBackground: true,
          deviceName: config.printerName || undefined,
          margins: {
            marginType: 'none',
          },
        },
        (success, failureReason) => {
          finish(success ? { ok: true } : { ok: false, message: failureReason || 'Печать не выполнена' })
        },
      )
    })

    printWindow.webContents.once('did-fail-load', (_event, _code, description) => {
      finish({ ok: false, message: description })
    })

    const html = buildReceiptHtml(ticket, language)
    printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  })
}

app.whenReady().then(() => {
  config = readConfig()

  ipcMain.handle('terminal:get-config', () => config)
  ipcMain.handle('terminal:reload-config', () => {
    config = readConfig()
    return config
  })
  ipcMain.handle('terminal:api-request', (_event, request: ApiRequest) => apiRequest(request))
  ipcMain.handle('terminal:print-ticket', (_event, ticket: TerminalTicket, language: TerminalLanguage) => printTicket(ticket, language))

  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
