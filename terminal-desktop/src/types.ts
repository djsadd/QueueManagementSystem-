export type TerminalLanguage = 'kk' | 'ru' | 'en'
export type ServiceLanguage = 'KAZAKH' | 'RUSSIAN' | 'ENGLISH'

export type TerminalConfig = {
  apiBaseUrl: string
  printerName: string
  fullScreen: boolean
  receiptWidthMm: number
  receiptBottomFeedMm: number
  autoResetSeconds: number
}

export type TerminalService = {
  id: number
  name: string
  name_kk: string | null
  name_en: string | null
  code: string
  display_name?: string | null
  priority: number
  is_active: boolean
  requires_educational_program: boolean
  requires_service_language: boolean
  requires_reception_desk: boolean
}

export type TerminalProgram = {
  id: number
  name: string
  name_kk: string | null
  name_en: string | null
  code: string
  display_name?: string | null
  is_active: boolean
}

export type TerminalTicket = {
  id: string
  service_id: number
  educational_program_id: number | null
  service_language: ServiceLanguage | null
  service_name: string | null
  service_name_kk: string | null
  service_name_en: string | null
  educational_program_name: string | null
  educational_program_name_kk: string | null
  educational_program_name_en: string | null
  ticket_number: string
  created_at: string
}
