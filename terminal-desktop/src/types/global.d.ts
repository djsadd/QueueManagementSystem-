import type { TerminalConfig, TerminalLanguage, TerminalTicket } from './types'

declare global {
  interface Window {
    terminalBridge: {
      getConfig: () => Promise<TerminalConfig>
      reloadConfig: () => Promise<TerminalConfig>
      apiRequest: <T>(request: { path: string; method?: string; body?: unknown }) => Promise<{ ok: boolean; status: number; payload: T }>
      printTicket: (ticket: TerminalTicket, language: TerminalLanguage) => Promise<{ ok: boolean; message?: string }>
    }
  }
}
