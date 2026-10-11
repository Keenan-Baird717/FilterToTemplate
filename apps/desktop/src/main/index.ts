import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, MessageChannelMain, nativeTheme, shell, utilityProcess, type UtilityProcess } from 'electron'

// Main stays thin: windows, theme and the MessagePort broker. The agent runs in
// its own utility process so tool work never blocks window management.

const isMac = process.platform === 'darwin'
const chrome = {
  light: { ground: '#EEF0F3', symbol: '#4F5868' },
  dark: { ground: '#0B0D11', symbol: '#A0A8B7' }
}

let agent: UtilityProcess | null = null

function startAgent(): UtilityProcess {
  const child = utilityProcess.fork(join(__dirname, 'agent-worker.js'), [], {
    serviceName: 'FilterToTemplate Agent',
    stdio: 'inherit'
  })
  child.on('exit', (code) => {
    if (agent === child) agent = null
    if (code !== 0) console.error(`[agent] exited with code ${code}`)
  })
  return child
}

function connectAgent(win: BrowserWindow) {
  agent ??= startAgent()
  const { port1, port2 } = new MessageChannelMain()
  agent.postMessage({ type: 'connect' }, [port1])
  win.webContents.postMessage('agent-port', null, [port2])
}

function overlayFor(dark: boolean) {
  const c = dark ? chrome.dark : chrome.light
  return { color: c.ground, symbolColor: c.symbol, height: 44 }
}

function createWindow() {
  const dark = nativeTheme.shouldUseDarkColors
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    title: 'FilterToTemplate',
    backgroundColor: dark ? chrome.dark.ground : chrome.light.ground,
    titleBarStyle: 'hidden',
    ...(isMac ? { trafficLightPosition: { x: 16, y: 15 } } : { titleBarOverlay: overlayFor(dark) }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true
    }
  })

  win.once('ready-to-show', () => win.show())
  win.webContents.on('did-finish-load', () => connectAgent(win))
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  const syncOverlay = () => {
    if (!isMac && !win.isDestroyed()) win.setTitleBarOverlay(overlayFor(nativeTheme.shouldUseDarkColors))
  }
  nativeTheme.on('updated', syncOverlay)
  win.on('closed', () => nativeTheme.off('updated', syncOverlay))

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.on('theme:set', (_event, theme: unknown) => {
  if (theme === 'light' || theme === 'dark' || theme === 'system') nativeTheme.themeSource = theme
})

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  agent?.kill()
  if (!isMac) app.quit()
})
