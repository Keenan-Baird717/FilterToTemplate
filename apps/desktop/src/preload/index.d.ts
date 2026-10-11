export interface FttBridge {
  isElectron: true
  platform: NodeJS.Platform
  versions: { electron: string; node: string; chrome: string }
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  saveDocx: (name: string, bytes: Uint8Array) => Promise<{ saved?: string; canceled?: boolean }>
}

declare global {
  interface Window {
    ftt?: FttBridge
  }
}
