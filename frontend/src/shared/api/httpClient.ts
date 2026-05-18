import { env } from '../config/env'

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

type RequestOptions = {
  method?: HttpMethod
  body?: unknown
  headers?: HeadersInit
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

export async function request<T>(
  path: string,
  { method = 'GET', body, headers }: RequestOptions = {},
): Promise<T> {
  const response = await fetch(`${env.apiBaseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const contentType = response.headers.get('content-type')
  const payload = contentType?.includes('application/json')
    ? await response.json()
    : null

  if (!response.ok) {
    const message =
      typeof payload?.detail === 'string'
        ? payload.detail
        : 'Не удалось выполнить запрос'

    throw new ApiError(message, response.status, payload)
  }

  return payload as T
}
