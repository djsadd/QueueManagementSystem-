import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('operatorBridge', {
  getConfig: () => ipcRenderer.invoke('operator:get-config'),
  reloadConfig: () => ipcRenderer.invoke('operator:reload-config'),
  apiRequest: (request: unknown) => ipcRenderer.invoke('operator:api-request', request),
  openDisplay: () => ipcRenderer.invoke('operator:open-display'),
})
