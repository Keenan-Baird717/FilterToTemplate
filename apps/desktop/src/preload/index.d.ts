export interface FttBridge {
  isElectron: true
  platform: NodeJS.Platform
  versions: { electron: string; node: string; chrome: string }
  setTheme: (theme: 'light' | 'dark' | 'system') => void
}

declare global {
  interface Window {
    ftt?: FttBridge
  }
}
