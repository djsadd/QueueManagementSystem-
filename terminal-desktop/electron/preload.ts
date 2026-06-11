import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('terminalBridge', {
  getConfig: () => ipcRenderer.invoke('terminal:get-config'),
  reloadConfig: () => ipcRenderer.invoke('terminal:reload-config'),
  apiRequest: (request: unknown) => ipcRenderer.invoke('terminal:api-request', request),
  printTicket: (ticket: unknown, language: unknown) => ipcRenderer.invoke('terminal:print-ticket', ticket, language),
})
