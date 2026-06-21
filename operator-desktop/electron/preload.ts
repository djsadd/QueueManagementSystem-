import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('operatorBridge', {
  getConfig: () => ipcRenderer.invoke('operator:get-config'),
  reloadConfig: () => ipcRenderer.invoke('operator:reload-config'),
  verifyAdminPassword: (value: string) => ipcRenderer.invoke('operator:verify-admin-password', value),
  saveServerUrl: (value: string, adminToken: string | null) => ipcRenderer.invoke('operator:save-server-url', value, adminToken),
  apiRequest: (request: unknown) => ipcRenderer.invoke('operator:api-request', request),
  openDisplay: (authTokens?: unknown) => ipcRenderer.invoke('operator:open-display', authTokens),
  openPlatonusDisplay: (options?: unknown) => ipcRenderer.invoke('operator:open-platonus-display', options),
  openPlatonusStreamDisplay: () => ipcRenderer.invoke('operator:open-platonus-stream-display'),
  updatePlatonusStreamFrame: (frame: unknown) => ipcRenderer.send('operator:update-platonus-stream-frame', frame),
  streamMainWindowArea: (options: unknown) => ipcRenderer.invoke('operator:stream-main-window-area', options),
  onPlatonusStreamFrame: (callback: (frame: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, frame: unknown) => {
      if (typeof frame === 'string') callback(frame)
    }

    ipcRenderer.on('operator:platonus-stream-frame', listener)
    return () => ipcRenderer.removeListener('operator:platonus-stream-frame', listener)
  },
  closePlatonusStreamDisplay: () => ipcRenderer.invoke('operator:close-platonus-stream-display'),
  capturePlatonusDisplay: () => ipcRenderer.invoke('operator:capture-platonus-display'),
  sendPlatonusInput: (event: unknown) => ipcRenderer.invoke('operator:send-platonus-input', event),
})
