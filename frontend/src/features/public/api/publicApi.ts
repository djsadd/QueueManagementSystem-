import { request } from '../../../shared/api/httpClient'

export type PublicServiceItem = {
  id: number
  name: string
  name_kk: string
  name_en: string
  code: string
  priority: number
  is_active: boolean
  requires_educational_program: boolean
  requires_reception_desk: boolean
  reception_window_id: number | null
  requires_service_language: boolean
}

export type TicketCreatePayload = {
  service_id: number
  educational_program_id?: number | null
  study_language?: 'KAZAKH' | 'RUSSIAN' | 'ENGLISH' | null
  service_language?: 'KAZAKH' | 'RUSSIAN' | 'ENGLISH' | null
}

export type PublicEducationalProgramItem = {
  id: number
  name: string
  name_kk: string
  name_en: string
  code: string
  academic_degree_id: number
  requires_service_language: boolean
  is_active: boolean
  created_at: string
}

export type PublicTicketItem = {
  id: string
  applicant_id: string | null
  service_id: number
  educational_program_id: number | null
  study_language: 'KAZAKH' | 'RUSSIAN' | 'ENGLISH' | null
  service_language: 'KAZAKH' | 'RUSSIAN' | 'ENGLISH' | null
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
  window_name: string | null
  window_floor: string | null
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

export type QueueDisplayPayload = {
  serving: PublicTicketItem[]
  next: PublicTicketItem[]
}

export const publicApi = {
  services: {
    list: async () => {
      const services = await request<PublicServiceItem[]>('/public/services')

      return services
        .filter((service) => service.is_active)
        .sort((left, right) => right.priority - left.priority || left.name.localeCompare(right.name))
    },
  },
  educationalPrograms: {
    list: async () => {
      const programs = await request<PublicEducationalProgramItem[]>('/public/educational-programs')

      return programs
        .filter((program) => program.is_active)
        .sort((left, right) => left.name.localeCompare(right.name))
    },
  },
  tickets: {
    get: (id: string) => request<PublicTicketItem>(`/public/tickets/${id}`),
    create: (payload: TicketCreatePayload) =>
      request<PublicTicketItem>('/public/tickets', {
        method: 'POST',
        body: payload,
      }),
  },
  queueDisplay: {
    get: (serviceIds?: number[] | null) => {
      const query = serviceIds?.length
        ? `?${serviceIds.map((serviceId) => `service_ids=${serviceId}`).join('&')}`
        : ''
      return request<QueueDisplayPayload>(`/public/queue-display${query}`)
    },
  },
}
