import { request } from '../../../shared/api/httpClient'

export type ServiceItem = {
  id: number
  name: string
  name_kk: string
  name_en: string
  code: string
  priority: number
  is_active: boolean
  requires_educational_program: boolean
}

export type ServicePayload = Omit<ServiceItem, 'id'>

export type WindowStatus = 'OPEN' | 'BUSY' | 'CLOSED'

export type WindowItem = {
  id: number
  name: string
  status: WindowStatus
  current_operator_id: number | null
}

export type WindowPayload = Omit<WindowItem, 'id'>

export type UserRole = 'ADMIN' | 'OPERATOR' | 'MANAGER'

export type UserItem = {
  id: string
  email: string
  full_name: string
  role: UserRole
  is_active: boolean
}

export type UserPayload = {
  email: string
  password?: string
  full_name: string
  role: UserRole
  is_active: boolean
}

export type OperatorStatus = 'ONLINE' | 'OFFLINE' | 'BUSY' | 'BREAK'
export type StudyLanguage = 'KAZAKH' | 'RUSSIAN' | 'ENGLISH'

export type OperatorItem = {
  id: string
  user_id: string
  window_id: number | null
  status: OperatorStatus
  created_at: string
}

export type OperatorPayload = {
  user_id: string
  window_id: number | null
  status: OperatorStatus
}

export type AcademicDegreeItem = {
  id: number
  name: string
  code: string
  is_active: boolean
  created_at: string
}

export type AcademicDegreePayload = {
  name: string
  code: string
  is_active: boolean
}

export type EducationalProgramItem = {
  id: number
  name: string
  name_kk: string
  name_en: string
  code: string
  academic_degree_id: number
  is_active: boolean
  created_at: string
}

export type EducationalProgramPayload = {
  name: string
  name_kk: string
  name_en: string
  code: string
  academic_degree_id: number
  is_active: boolean
}

export type ApplicantItem = {
  id: string
  full_name: string | null
  iin: string | null
  phone: string | null
  telegram_chat_id: number | null
  created_at: string
}

export type ApplicantPayload = {
  full_name: string | null
  iin: string | null
  phone: string | null
  telegram_chat_id: number | null
}

export type TicketEventType =
  | 'TICKET_CREATED'
  | 'TICKET_CALLED'
  | 'TICKET_DECLINED'
  | 'TICKET_SKIPPED'
  | 'TICKET_COMPLETED'
  | 'STATUS_CHANGED'

export type TicketEventItem = {
  id: string
  ticket_id: string | null
  event_type: string | null
  old_status: string | null
  new_status: string | null
  operator_id: string | null
  operator_name: string | null
  operator_email: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export type TicketEventPayload = {
  ticket_id: string | null
  event_type: string | null
  old_status: string | null
  new_status: string | null
  operator_id: string | null
  metadata: Record<string, unknown> | null
}

export type TicketItem = {
  id: string
  applicant_id: string | null
  service_id: number
  educational_program_id: number | null
  study_language: StudyLanguage | null
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
  operator_id: string | null
  operator_name: string | null
  operator_email: string | null
  window_id: number | null
  ticket_number: string
  queue_number: number
  priority: number
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
  window_status: WindowStatus | null
  global_waiting_count: number
  page: number
  page_size: number
  total: number
  total_pages: number
  tickets: TicketItem[]
}

export type MyWindowTicketParams = {
  search?: string
  status?: string
  service_id?: number
  educational_program_id?: string
  page?: number
  page_size?: number
}

export type TicketServiceReassignPayload = {
  service_id: number
  educational_program_id: number | null
}

export type TicketStudyLanguagePayload = {
  study_language: StudyLanguage | null
}

export type TicketAcceptPayload = {
  iin?: string
}

export const adminApi = {
  tickets: {
    myWindow: (params: MyWindowTicketParams = {}) => {
      const searchParams = new URLSearchParams()

      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          searchParams.set(key, String(value))
        }
      })

      const queryString = searchParams.toString()
      return request<MyWindowTickets>(`/tickets/my-window${queryString ? `?${queryString}` : ''}`)
    },
    updateMyStatus: (status: OperatorStatus) =>
      request<MyWindowTickets>('/tickets/my-window/status', { method: 'PATCH', body: { status } }),
    updateMyWindowStatus: (status: WindowStatus) =>
      request<MyWindowTickets>('/tickets/my-window/window-status', { method: 'PATCH', body: { status } }),
    acceptMyTicket: (id: string, payload: TicketAcceptPayload) =>
      request<TicketItem>(`/tickets/my-window/${id}/accept`, { method: 'PATCH', body: payload }),
    completeMyTicket: (id: string) =>
      request<TicketItem>(`/tickets/my-window/${id}/complete`, { method: 'PATCH' }),
    skipMyTicket: (id: string) =>
      request<TicketItem>(`/tickets/my-window/${id}/skip`, { method: 'PATCH' }),
    declineMyTicket: (id: string) =>
      request<TicketItem>(`/tickets/my-window/${id}/decline`, { method: 'PATCH' }),
    updateMyTicketStudyLanguage: (id: string, payload: TicketStudyLanguagePayload) =>
      request<TicketItem>(`/tickets/my-window/${id}/study-language`, { method: 'PATCH', body: payload }),
    reassignMyTicketService: (id: string, payload: TicketServiceReassignPayload) =>
      request<TicketItem>(`/tickets/my-window/${id}/service`, { method: 'PATCH', body: payload }),
  },
  services: {
    list: () => request<ServiceItem[]>('/services/'),
    create: (payload: ServicePayload) => request<ServiceItem>('/services/', { method: 'POST', body: payload }),
    update: (id: number, payload: Partial<ServicePayload>) =>
      request<ServiceItem>(`/services/${id}`, { method: 'PATCH', body: payload }),
    delete: (id: number) => request<void>(`/services/${id}`, { method: 'DELETE' }),
  },
  windows: {
    list: () => request<WindowItem[]>('/windows/'),
    create: (payload: WindowPayload) => request<WindowItem>('/windows/', { method: 'POST', body: payload }),
    update: (id: number, payload: Partial<WindowPayload>) =>
      request<WindowItem>(`/windows/${id}`, { method: 'PATCH', body: payload }),
    delete: (id: number) => request<void>(`/windows/${id}`, { method: 'DELETE' }),
  },
  users: {
    list: () => request<UserItem[]>('/users/'),
    create: (payload: UserPayload & { password: string }) =>
      request<UserItem>('/users/', { method: 'POST', body: payload }),
    update: (id: string, payload: Partial<UserPayload>) =>
      request<UserItem>(`/users/${id}`, { method: 'PATCH', body: payload }),
    delete: (id: string) => request<void>(`/users/${id}`, { method: 'DELETE' }),
  },
  operators: {
    list: () => request<OperatorItem[]>('/operators/'),
    me: () => request<OperatorItem>('/operators/me'),
    myPrograms: () => request<EducationalProgramItem[]>('/operators/me/educational-programs'),
    setMyPrograms: (educationalProgramIds: number[]) =>
      request<EducationalProgramItem[]>('/operators/me/educational-programs', {
        method: 'PUT',
        body: { educational_program_ids: educationalProgramIds },
      }),
    myServices: () => request<ServiceItem[]>('/operators/me/services'),
    setMyServices: (serviceIds: number[]) =>
      request<ServiceItem[]>('/operators/me/services', {
        method: 'PUT',
        body: { service_ids: serviceIds },
      }),
    availableServices: () => request<ServiceItem[]>('/operators/me/available-services'),
    availablePrograms: () =>
      request<EducationalProgramItem[]>('/operators/me/available-educational-programs'),
    availableDegrees: () => request<AcademicDegreeItem[]>('/operators/me/available-academic-degrees'),
    create: (payload: OperatorPayload) =>
      request<OperatorItem>('/operators/', { method: 'POST', body: payload }),
    update: (id: string, payload: Partial<OperatorPayload>) =>
      request<OperatorItem>(`/operators/${id}`, { method: 'PATCH', body: payload }),
    delete: (id: string) => request<void>(`/operators/${id}`, { method: 'DELETE' }),
    programs: (id: string) => request<EducationalProgramItem[]>(`/operators/${id}/educational-programs`),
    setPrograms: (id: string, educationalProgramIds: number[]) =>
      request<EducationalProgramItem[]>(`/operators/${id}/educational-programs`, {
        method: 'PUT',
        body: { educational_program_ids: educationalProgramIds },
      }),
    services: (id: string) => request<ServiceItem[]>(`/operators/${id}/services`),
    setServices: (id: string, serviceIds: number[]) =>
      request<ServiceItem[]>(`/operators/${id}/services`, {
        method: 'PUT',
        body: { service_ids: serviceIds },
      }),
  },
  academicDegrees: {
    list: () => request<AcademicDegreeItem[]>('/academic-degrees/'),
    create: (payload: AcademicDegreePayload) =>
      request<AcademicDegreeItem>('/academic-degrees/', { method: 'POST', body: payload }),
    update: (id: number, payload: Partial<AcademicDegreePayload>) =>
      request<AcademicDegreeItem>(`/academic-degrees/${id}`, { method: 'PATCH', body: payload }),
    delete: (id: number) => request<void>(`/academic-degrees/${id}`, { method: 'DELETE' }),
  },
  educationalPrograms: {
    list: () => request<EducationalProgramItem[]>('/educational-programs/'),
    create: (payload: EducationalProgramPayload) =>
      request<EducationalProgramItem>('/educational-programs/', { method: 'POST', body: payload }),
    update: (id: number, payload: Partial<EducationalProgramPayload>) =>
      request<EducationalProgramItem>(`/educational-programs/${id}`, { method: 'PATCH', body: payload }),
    delete: (id: number) => request<void>(`/educational-programs/${id}`, { method: 'DELETE' }),
  },
  applicants: {
    list: () => request<ApplicantItem[]>('/applicants/'),
    create: (payload: ApplicantPayload) =>
      request<ApplicantItem>('/applicants/', { method: 'POST', body: payload }),
    update: (id: string, payload: Partial<ApplicantPayload>) =>
      request<ApplicantItem>(`/applicants/${id}`, { method: 'PATCH', body: payload }),
    delete: (id: string) => request<void>(`/applicants/${id}`, { method: 'DELETE' }),
  },
  ticketEvents: {
    list: () => request<TicketEventItem[]>('/ticket-events/'),
    me: () => request<TicketEventItem[]>('/ticket-events/me'),
    create: (payload: TicketEventPayload) =>
      request<TicketEventItem>('/ticket-events/', { method: 'POST', body: payload }),
    update: (id: string, payload: Partial<TicketEventPayload>) =>
      request<TicketEventItem>(`/ticket-events/${id}`, { method: 'PATCH', body: payload }),
    delete: (id: string) => request<void>(`/ticket-events/${id}`, { method: 'DELETE' }),
  },
}
