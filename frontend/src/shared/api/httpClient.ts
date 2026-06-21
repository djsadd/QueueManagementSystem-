import { env } from '../config/env'
import { tokenStorage } from '../lib/tokenStorage'

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

type RequestOptions = {
  method?: HttpMethod
  body?: unknown
  headers?: HeadersInit
  skipAuthRefresh?: boolean
}

type AuthTokens = {
  access_token: string
  refresh_token: string
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

let refreshPromise: Promise<AuthTokens> | null = null

async function readResponsePayload(response: Response) {
  const contentType = response.headers.get('content-type')
  return contentType?.includes('application/json') ? await response.json() : null
}

function getErrorFromResponse(response: Response, payload: unknown) {
  const detail = payload && typeof payload === 'object' && 'detail' in payload ? payload.detail : null
  const message = typeof detail === 'string' ? detail : 'Не удалось выполнить запрос'

  return new ApiError(message, response.status, payload)
}

function canRefreshAuth(path: string, skipAuthRefresh?: boolean) {
  return !skipAuthRefresh && path !== '/auth/login' && path !== '/auth/refresh'
}

function isAuthFailureStatus(status: number) {
  return status === 401 || status === 403
}

export async function refreshAuthTokens(): Promise<AuthTokens | null> {
  const refreshToken = tokenStorage.getRefreshToken()

  if (!refreshToken) {
    return null
  }

  if (!refreshPromise) {
    refreshPromise = fetch(`${env.apiBaseUrl}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
      .then(async (response) => {
        const payload = await readResponsePayload(response)

        if (!response.ok) {
          throw getErrorFromResponse(response, payload)
        }

        const tokens = payload as AuthTokens
        tokenStorage.setTokens(tokens.access_token, tokens.refresh_token)
        return tokens
      })
      .catch((error) => {
        if (error instanceof ApiError && isAuthFailureStatus(error.status)) {
          tokenStorage.clear()
        }

        throw error
      })
      .finally(() => {
        refreshPromise = null
      })
  }

  return refreshPromise
}

export async function request<T>(
  path: string,
  { method = 'GET', body, headers, skipAuthRefresh }: RequestOptions = {},
): Promise<T> {
  async function send(accessToken: string | null) {
    const requestHeaders = new Headers(headers)
    requestHeaders.set('Content-Type', 'application/json')

    if (accessToken) {
      requestHeaders.set('Authorization', `Bearer ${accessToken}`)
    }

    return fetch(`${env.apiBaseUrl}${path}`, {
      method,
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined,
    })
  }

  const response = await send(tokenStorage.getAccessToken())
  const payload = await readResponsePayload(response)

  if (!response.ok) {
    const error = getErrorFromResponse(response, payload)

    if (isAuthFailureStatus(response.status) && canRefreshAuth(path, skipAuthRefresh)) {
      let tokens: AuthTokens | null = null

      try {
        tokens = await refreshAuthTokens()
      } catch (refreshError) {
        if (!(refreshError instanceof ApiError && isAuthFailureStatus(refreshError.status))) {
          throw refreshError
        }
      }

      if (tokens) {
        const retryResponse = await send(tokens.access_token)
        const retryPayload = await readResponsePayload(retryResponse)

        if (retryResponse.ok) {
          return retryPayload as T
        }

        throw getErrorFromResponse(retryResponse, retryPayload)
      }
    }

    throw error
  }

  return payload as T
}
