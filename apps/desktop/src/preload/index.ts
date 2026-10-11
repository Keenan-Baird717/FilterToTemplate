import { contextBridge, ipcRenderer } from 'electron'

type Theme = 'light' | 'dark' | 'system'

contextBridge.exposeInMainWorld('ftt', {
  isElectron: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome
  },
  setTheme: (theme: Theme) => ipcRenderer.send('theme:set', theme),
  saveDocx: (name: string, bytes: Uint8Array): Promise<{ saved?: string; canceled?: boolean }> =>
    ipcRenderer.invoke('file:save-docx', name, bytes)
})

// Hand the agent MessagePort to the page so tokens stream straight from the
// worker to the renderer without passing through main.
ipcRenderer.on('agent-port', (event) => {
  window.postMessage('ftt:agent-port', '*', event.ports)
})
