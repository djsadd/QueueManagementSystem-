import type { DetailedHTMLProps, HTMLAttributes } from 'react'
import type { OperatorConfig } from './domain'

type BridgeApiResponse<T = unknown> = {
  ok: boolean
  status: number
  payload: T
}

type PlatonusInputEvent =
  | { type: 'mouseMove' | 'mouseDown' | 'mouseUp'; x: number; y: number; button?: 'left' | 'right' | 'middle'; clickCount?: number }
  | { type: 'mouseWheel'; deltaX?: number; deltaY?: number }
  | { type: 'keyDown' | 'keyUp' | 'char'; keyCode: string }

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
      openDisplay: (authTokens?: {
        accessToken?: string | null
        refreshToken?: string | null
        url?: string
      }) => Promise<{ ok: boolean; reused: boolean }>
      openPlatonusDisplay: (options?: { url?: string }) => Promise<{ ok: boolean; reused: boolean }>
      openPlatonusStreamDisplay: () => Promise<{ ok: boolean; reused: boolean }>
      updatePlatonusStreamFrame: (frame: string) => void
      streamMainWindowArea: (options: {
        x: number
        y: number
        width: number
        height: number
        maxWidth?: number
        quality?: number
      }) => Promise<{ ok: boolean }>
      onPlatonusStreamFrame: (callback: (frame: string) => void) => () => void
      closePlatonusStreamDisplay: () => Promise<{ ok: boolean }>
      capturePlatonusDisplay: () => Promise<{ ok: boolean; frame: string | null }>
      sendPlatonusInput: (event: PlatonusInputEvent) => Promise<{ ok: boolean }>
    }
  }

  namespace JSX {
    interface IntrinsicElements {
      webview: DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        allowpopups?: boolean | string
        partition?: string
        src?: string
      }
    }
  }
}

export {}
