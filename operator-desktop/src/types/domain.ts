export type OperatorStatus = 'ONLINE' | 'OFFLINE' | 'BUSY' | 'BREAK'
export type WindowStatus = 'OPEN' | 'BUSY' | 'CLOSED'
export type StudyLanguage = 'KAZAKH' | 'RUSSIAN' | 'ENGLISH'
export type ServiceLanguage = 'KAZAKH' | 'RUSSIAN' | 'ENGLISH'

export type OperatorConfig = {
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

export type AuthTokens = {
  access_token: string
  refresh_token: string
  token_type?: string
}

export type AuthUser = {
  id: string
  email: string
  full_name: string
  role: 'ADMIN' | 'OPERATOR' | 'MANAGER'
  is_active: boolean
}

export type OperatorItem = {
  id: string
  user_id: string
  window_id: number | null
  status: OperatorStatus
  created_at: string
}

export type ServiceItem = {
  id: number
  name: string
  name_kk: string
  name_en: string
  code: string
  priority: number
  is_active: boolean
  requires_educational_program: boolean
  requires_reception_desk: boolean
  requires_service_language: boolean
  service_languages?: ServiceLanguage[]
}

export type EducationalProgramItem = {
  id: number
  name: string
  name_kk: string
  name_en: string
  code: string
  academic_degree_id: number
  requires_service_language: boolean
  is_active: boolean
  created_at: string
  study_languages?: StudyLanguage[]
}

export type TicketItem = {
  id: string
  applicant_id: string | null
  service_id: number
  educational_program_id: number | null
  academic_degree_id?: number | null
  study_language: StudyLanguage | null
  service_language: ServiceLanguage | null
  full_name: string | null
  iin: string | null
  phone: string | null
  service_name: string | null
  service_name_kk: string | null
  service_name_en: string | null
  educational_program_name: string | null
  educational_program_name_kk: string | null
  educational_program_name_en: string | null
  educational_program_code: string | null
  academic_degree_name?: string | null
  academic_degree_code?: string | null
  operator_id: string | null
  operator_name: string | null
  operator_email: string | null
  window_id: number | null
  window_name: string | null
  window_floor: string | null
  ticket_number: string
  queue_number: number
  priority: number
  routing_key?: string | null
  assignment_score?: number | null
  status: string
  estimated_wait: number | null
  created_at: string
  called_at: string | null
  started_at: string | null
  completed_at: string | null
}

export type MyWindowTickets = {
  operator_id: string
  operator_status: OperatorStatus
  window_id: number
  window_name: string | null
  window_floor: string | null
  window_status: WindowStatus | null
  global_waiting_count: number
  page: number
  page_size: number
  total: number
  total_pages: number
  tickets: TicketItem[]
}
