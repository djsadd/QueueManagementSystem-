import type { OperatorConfig } from './domain'

type BridgeApiResponse<T = unknown> = {
  ok: boolean
  status: number
  payload: T
}

declare global {
  interface Window {
    operatorBridge: {
      getConfig: () => Promise<OperatorConfig>
      reloadConfig: () => Promise<OperatorConfig>
      apiRequest: <T>(request: {
        path: string
        method?: string
        body?: unknown
        accessToken?: string | null
      }) => Promise<BridgeApiResponse<T>>
      openDisplay: () => Promise<{ ok: boolean; reused: boolean }>
    }
  }
}

export {}
