const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api'

function getDefaultApiWebSocketBaseUrl(baseUrl: string) {
  if (baseUrl.startsWith('http://')) {
    return baseUrl.replace(/^http:\/\//, 'ws://')
  }

  if (baseUrl.startsWith('https://')) {
    return baseUrl.replace(/^https:\/\//, 'wss://')
  }

  const normalizedBaseUrl = baseUrl.startsWith('/') ? baseUrl : `/${baseUrl}`
  return `${window.location.origin.replace(/^http/, 'ws')}${normalizedBaseUrl}`
}

export const env = {
  apiBaseUrl,
  apiWsBaseUrl: import.meta.env.VITE_API_WS_BASE_URL ?? getDefaultApiWebSocketBaseUrl(apiBaseUrl),
}
