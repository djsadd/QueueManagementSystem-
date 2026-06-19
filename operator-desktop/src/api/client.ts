import { tokenStorage } from './tokenStorage'
import type {
  AuthTokens,
  AuthUser,
  EducationalProgramItem,
  MyWindowTickets,
  OperatorItem,
  OperatorStatus,
  ServiceLanguage,
  ServiceItem,
  StudyLanguage,
  TicketItem,
  WindowStatus,
} from '../types/domain'

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  skipRefresh?: boolean
}

export class ApiError extends Error {
  readonly status: number
  readonly details: unknown

  constructor(message: string, status: number, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

function getPayloadMessage(payload: unknown) {
  if (payload && typeof payload === 'object' && 'detail' in payload) {
    const detail = payload.detail
    if (typeof detail === 'string') return detail
  }

  return 'Не удалось выполнить запрос'
}

let refreshPromise: Promise<AuthTokens | null> | null = null

async function refreshTokens() {
  const refreshToken = tokenStorage.getRefreshToken()
  if (!refreshToken) return null

  if (!refreshPromise) {
    refreshPromise = window.operatorBridge
      .apiRequest<AuthTokens>({
        path: '/auth/refresh',
        method: 'POST',
        body: { refresh_token: refreshToken },
      })
      .then((response) => {
        if (!response.ok) throw new ApiError(getPayloadMessage(response.payload), response.status, response.payload)

        tokenStorage.setTokens(response.payload.access_token, response.payload.refresh_token)
        return response.payload
      })
      .catch(() => {
        tokenStorage.clearTokens()
        return null
      })
      .finally(() => {
        refreshPromise = null
      })
  }

  return refreshPromise
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const send = (accessToken: string | null) =>
    window.operatorBridge.apiRequest<T>({
      path,
      method: options.method ?? 'GET',
      body: options.body,
      accessToken,
    })

  const response = await send(tokenStorage.getAccessToken())

  if (response.ok) return response.payload

  if (response.status === 401 && !options.skipRefresh && path !== '/auth/login' && path !== '/auth/refresh') {
    const tokens = await refreshTokens()

    if (tokens) {
      const retryResponse = await send(tokens.access_token)
      if (retryResponse.ok) return retryResponse.payload
      throw new ApiError(getPayloadMessage(retryResponse.payload), retryResponse.status, retryResponse.payload)
    }
  }

  throw new ApiError(getPayloadMessage(response.payload), response.status, response.payload)
}

function buildQuery(params: Record<string, string | number | undefined | null>) {
  const query = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value))
  })

  const value = query.toString()
  return value ? `?${value}` : ''
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      request<AuthTokens>('/auth/login', {
        method: 'POST',
        body: { email, password },
        skipRefresh: true,
      }),
    me: () => request<AuthUser>('/auth/me'),
  },
  operator: {
    me: () => request<OperatorItem>('/operators/me'),
    availableServices: () => request<ServiceItem[]>('/operators/me/available-services'),
    services: () => request<ServiceItem[]>('/operators/me/services'),
    setServices: (serviceIds: number[], serviceLanguagesByService: Record<number, ServiceLanguage[]> = {}) =>
      request<ServiceItem[]>('/operators/me/services', {
        method: 'PUT',
        body: { service_ids: serviceIds, service_languages_by_service: serviceLanguagesByService },
      }),
    availablePrograms: () => request<EducationalProgramItem[]>('/operators/me/available-educational-programs'),
    programs: () => request<EducationalProgramItem[]>('/operators/me/educational-programs'),
    setPrograms: (educationalProgramIds: number[], studyLanguagesByProgram: Record<number, StudyLanguage[]> = {}) =>
      request<EducationalProgramItem[]>('/operators/me/educational-programs', {
        method: 'PUT',
        body: { educational_program_ids: educationalProgramIds, study_languages_by_program: studyLanguagesByProgram },
      }),
  },
  tickets: {
    myWindow: (params: {
      search?: string
      status?: string
      service_id?: number
      educational_program_id?: number
      page?: number
      page_size?: number
    }) => request<MyWindowTickets>(`/tickets/my-window${buildQuery(params)}`),
    setOperatorStatus: (status: OperatorStatus) =>
      request<MyWindowTickets>('/tickets/my-window/status', { method: 'PATCH', body: { status } }),
    setWindowStatus: (status: WindowStatus) =>
      request<MyWindowTickets>('/tickets/my-window/window-status', { method: 'PATCH', body: { status } }),
    callNext: () => request<TicketItem>('/tickets/my-window/next', { method: 'PATCH' }),
    accept: (id: string, iin?: string) =>
      request<TicketItem>(`/tickets/my-window/${id}/accept`, { method: 'PATCH', body: { iin: iin || undefined } }),
    complete: (id: string) => request<TicketItem>(`/tickets/my-window/${id}/complete`, { method: 'PATCH' }),
    skip: (id: string) => request<TicketItem>(`/tickets/my-window/${id}/skip`, { method: 'PATCH' }),
    decline: (id: string) => request<TicketItem>(`/tickets/my-window/${id}/decline`, { method: 'PATCH' }),
    updateStudyLanguage: (id: string, study_language: TicketItem['study_language']) =>
      request<TicketItem>(`/tickets/my-window/${id}/study-language`, {
        method: 'PATCH',
        body: { study_language },
      }),
    reassignService: (
      id: string,
      payload: {
        service_id: number
        educational_program_id: number | null
        study_language?: StudyLanguage | null
        service_language?: ServiceLanguage | null
      },
    ) =>
      request<TicketItem>(`/tickets/my-window/${id}/service`, { method: 'PATCH', body: payload }),
  },
}
