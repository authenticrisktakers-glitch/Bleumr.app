import {
  app,
  BrowserWindow,
  ipcMain,
  safeStorage,
  WebContentsView,
  shell,
} from 'electron'
import { join } from 'path'
import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
} from 'fs'
import { autoUpdater } from 'electron-updater'

// ── Simple JSON preference store ──────────────────────────────────────────────

const storePath = join(app.getPath('userData'), 'preferences.json')
let store: Record<string, unknown> = {}

function loadStore() {
  try {
    if (existsSync(storePath)) {
      store = JSON.parse(readFileSync(storePath, 'utf-8'))
    }
  } catch {
    store = {}
  }
}

function saveStore() {
  try {
    writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf-8')
  } catch { /* ignore */ }
}

// ── Browser tab manager ───────────────────────────────────────────────────────

interface TabState {
  id: string
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
}

const tabs = new Map<string, WebContentsView>()
let activeTabId: string | null = null
let tabCounter = 0
let mainWindow: BrowserWindow | null = null

function createTab(url: string): string {
  const id = `tab_${++tabCounter}`

  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  view.webContents.loadURL(url || 'about:blank').catch(() => {})

  // Grant mic/camera permissions for browser tabs (e.g. Google Meet, voice sites)
  view.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    const allowed = ['media', 'audioCapture', 'mediaKeySystem'].includes(permission)
    callback(allowed)
  })

  // Forward all navigation events as state updates to the renderer
  const stateEvents = [
    'did-navigate',
    'did-navigate-in-page',
    'page-title-updated',
    'did-start-loading',
    'did-stop-loading',
  ] as const

  stateEvents.forEach((event) => {
    view.webContents.on(event as any, () => emitBrowserState())
  })

  view.webContents.on('render-process-gone', (_e, details) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('orbit:browser:crash', { tabId: id, details })
    }
    tabs.delete(id)
    if (activeTabId === id) {
      activeTabId = tabs.size > 0 ? (tabs.keys().next().value as string) : null
      if (activeTabId) setActiveTab(activeTabId)
    }
    emitBrowserState()
  })

  view.webContents.on('did-fail-load', (_e, errorCode, errorDescription) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('orbit:browser:error', {
        tabId: id,
        error: `${errorDescription} (${errorCode})`,
      })
    }
    emitBrowserState()
  })

  // Open new windows / popups as new Bleumr tabs — never leak to system browser
  view.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    if (openUrl && openUrl !== 'about:blank') {
      createTab(openUrl)
    }
    return { action: 'deny' }
  })

  tabs.set(id, view)
  setActiveTab(id)
  return id
}

function setActiveTab(id: string) {
  if (!mainWindow) return

  // Hide all non-active views
  for (const [, view] of tabs) {
    if (mainWindow.contentView.children.includes(view)) {
      mainWindow.contentView.removeChildView(view)
    }
  }

  const view = tabs.get(id)
  if (!view) return

  mainWindow.contentView.addChildView(view)
  activeTabId = id

  // Default to full window bounds; renderer can call setBounds to adjust
  const { width, height } = mainWindow.getBounds()
  view.setBounds({ x: 0, y: 0, width, height })

  emitBrowserState()
}

function getTabState(id: string, view: WebContentsView): TabState {
  const wc = view.webContents
  return {
    id,
    url: wc.getURL(),
    title: wc.getTitle(),
    loading: wc.isLoading(),
    canGoBack: wc.canGoBack(),
    canGoForward: wc.canGoForward(),
  }
}

function getAllTabsState() {
  return {
    tabs: [...tabs.entries()].map(([id, view]) => getTabState(id, view)),
    activeTabId,
  }
}

function emitBrowserState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('orbit:browser:stateUpdate', getAllTabsState())
  }
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  loadStore()

  // Resolve icon: look next to the compiled main.js in production,
  // or fall back to the source public/ folder in dev.
  const iconPath = (() => {
    const prodIcon = join(__dirname, '../../public/icon.png')
    const devIcon  = join(__dirname, '../../../public/icon.png')
    if (existsSync(prodIcon)) return prodIcon
    if (existsSync(devIcon))  return devIcon
    return undefined
  })()

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#000000',
    titleBarStyle: 'hiddenInset',
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, '../preload/index.js'),
      devTools: !app.isPackaged,
    },
  })

  // ── Permissions: grant mic + camera so Web Speech API works ─────────────
  const { session } = mainWindow.webContents
  session.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['media', 'audioCapture', 'mediaKeySystem'].includes(permission)
    callback(allowed)
  })
  session.setPermissionCheckHandler((_webContents, permission) => {
    return ['media', 'audioCapture', 'mediaKeySystem'].includes(permission)
  })

  // electron-vite sets ELECTRON_RENDERER_URL in dev mode
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // DevTools: only open via View menu or keyboard shortcut, not automatically

  // ── Auto-updater ────────────────────────────────────────────────────────────
  // Only run in production (not dev server)
  if (!process.env['ELECTRON_RENDERER_URL']) {
    autoUpdater.checkForUpdatesAndNotify()

    autoUpdater.on('update-available', () => {
      mainWindow?.webContents.send('bleumr:update:available')
    })

    autoUpdater.on('update-downloaded', () => {
      mainWindow?.webContents.send('bleumr:update:downloaded')
    })
  }

  // Keep active browser view sized to the window
  mainWindow.on('resize', () => {
    if (activeTabId) {
      const view = tabs.get(activeTabId)
      if (view && mainWindow) {
        const { width, height } = mainWindow.getBounds()
        view.setBounds({ x: 0, y: 0, width, height })
      }
    }
  })

  mainWindow.on('closed', () => { mainWindow = null })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    // Re-create window on macOS dock click
    app.whenReady().then(() => {
      loadStore()
      mainWindow = new BrowserWindow({
        width: 1400, height: 900, minWidth: 900, minHeight: 600,
        backgroundColor: '#000000', titleBarStyle: 'hiddenInset',
        webPreferences: {
          contextIsolation: true, nodeIntegration: false, sandbox: true,
          preload: join(__dirname, '../preload/index.js'), devTools: !app.isPackaged,
        },
      })
      if (process.env['ELECTRON_RENDERER_URL']) {
        mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
      } else {
        mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
      }
      mainWindow.on('closed', () => { mainWindow = null })
    })
  }
})

// ── IPC handlers ──────────────────────────────────────────────────────────────

// Storage
ipcMain.handle('orbit:storage:get', (_e, key: string) => store[key] ?? null)

ipcMain.handle('orbit:storage:set', (_e, key: string, value: unknown) => {
  store[key] = value
  saveStore()
  return { success: true }
})

ipcMain.handle('orbit:storage:getSecure', (_e, key: string) => {
  const raw = store[`__secure_${key}`]
  if (!raw || !safeStorage.isEncryptionAvailable()) {
    return { success: false }
  }
  try {
    const decrypted = safeStorage.decryptString(
      Buffer.from(raw as string, 'base64'),
    )
    return { success: true, value: decrypted }
  } catch {
    return { success: false }
  }
})

ipcMain.handle('orbit:storage:setSecure', (_e, key: string, value: string) => {
  if (!safeStorage.isEncryptionAvailable()) {
    return { success: false, reason: 'Encryption unavailable on this system' }
  }
  try {
    const encrypted = safeStorage.encryptString(value)
    store[`__secure_${key}`] = Buffer.from(encrypted).toString('base64')
    saveStore()
    return { success: true }
  } catch {
    return { success: false }
  }
})

// Browser tabs
ipcMain.handle('orbit:browser:open', (_e, url: string) => {
  const tabId = createTab(url)
  return { success: true, tabId }
})

// Load raw HTML into a new tab — bypasses renderer URL sanitizer safely
ipcMain.handle('orbit:browser:loadHTML', (_e, html: string) => {
  // Use loadURL with data: URI directly in the main process — this is safe
  // because the HTML content is generated by our own AI, not from external input
  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
  const tabId = createTab(dataUrl)
  return { success: true, tabId }
})

ipcMain.handle('orbit:browser:navigate', (_e, tabId: string, url: string) => {
  const view = tabs.get(tabId)
  if (!view) return { success: false, reason: 'Tab not found' }
  view.webContents.loadURL(url).catch(() => {})
  return { success: true }
})

ipcMain.handle('orbit:browser:reload', (_e, tabId: string) => {
  const view = tabs.get(tabId)
  if (!view) return { success: false }
  view.webContents.reload()
  return { success: true }
})

ipcMain.handle('orbit:browser:close', (_e, tabId: string) => {
  const view = tabs.get(tabId)
  if (!view) return { success: false }

  if (mainWindow?.contentView.children.includes(view)) {
    mainWindow.contentView.removeChildView(view)
  }
  view.webContents.close()
  tabs.delete(tabId)

  if (activeTabId === tabId) {
    activeTabId = tabs.size > 0 ? (tabs.keys().next().value as string) : null
    if (activeTabId) setActiveTab(activeTabId)
  }

  emitBrowserState()
  return { success: true }
})

ipcMain.handle('orbit:browser:setActive', (_e, tabId: string) => {
  setActiveTab(tabId)
  return { success: true }
})

ipcMain.handle(
  'orbit:browser:setBounds',
  (
    _e,
    tabId: string,
    bounds: { x: number; y: number; width: number; height: number },
  ) => {
    const view = tabs.get(tabId)
    if (!view) return { success: false }
    view.setBounds(bounds)
    return { success: true }
  },
)

ipcMain.handle('orbit:browser:goBack', (_e, tabId: string) => {
  const view = tabs.get(tabId)
  if (view?.webContents.canGoBack()) view.webContents.goBack()
  return { success: true }
})

ipcMain.handle('orbit:browser:goForward', (_e, tabId: string) => {
  const view = tabs.get(tabId)
  if (view?.webContents.canGoForward()) view.webContents.goForward()
  return { success: true }
})

ipcMain.handle('orbit:browser:getState', () => getAllTabsState())

ipcMain.handle('orbit:browser:executeJS', async (_e, tabId: string, code: string) => {
  const view = tabs.get(tabId)
  if (!view) return { success: false, reason: 'Tab not found' }
  try {
    const result = await view.webContents.executeJavaScript(code, true)
    return { success: true, result }
  } catch (err: any) {
    return { success: false, error: String(err?.message ?? err) }
  }
})

// Screenshot — captures current tab as base64 PNG for vision analysis
ipcMain.handle('orbit:browser:screenshot', async (_e, tabId: string) => {
  const view = tabs.get(tabId)
  if (!view) return { success: false, reason: 'Tab not found' }
  try {
    const image = await view.webContents.capturePage()
    const base64 = image.toPNG().toString('base64')
    return { success: true, base64 }
  } catch (err: any) {
    return { success: false, error: String(err?.message ?? err) }
  }
})

// System info
ipcMain.handle('orbit:system:info', () => ({
  platform: process.platform,
  arch: process.arch,
  version: app.getVersion(),
  electron: process.versions.electron,
  node: process.versions.node,
}))

// Filesystem — path-restricted to safe user directories only
const BLOCKED_PATH_PATTERNS = [
  /\/\.ssh\//i, /\\\.ssh\\/i,
  /\/\.aws\//i, /\\\.aws\\/i,
  /\/\.gnupg\//i,
  /\/Keychains\//i,
  /\/keychain/i,
  /\/etc\//i,
  /^\/System\//i,
  /^\/private\/etc\//i,
  /^\/Library\/Security/i,
  /id_rsa/i, /id_ed25519/i, /id_ecdsa/i,
]

function isPathAllowed(filePath: string): boolean {
  const allowed = [
    app.getPath('userData'),
    app.getPath('documents'),
    app.getPath('desktop'),
    app.getPath('downloads'),
    app.getPath('home'),
  ]
  const norm = filePath.replace(/\\/g, '/')
  const inAllowed = allowed.some(dir => norm.startsWith(dir.replace(/\\/g, '/')))
  if (!inAllowed) return false
  return !BLOCKED_PATH_PATTERNS.some(p => p.test(filePath))
}

ipcMain.handle('orbit:fs:readFile', (_e, filePath: string) => {
  if (!isPathAllowed(filePath)) {
    console.warn('[FS] Blocked read attempt:', filePath)
    return null
  }
  try {
    return readFileSync(filePath, 'utf-8')
  } catch {
    return null
  }
})

ipcMain.handle('orbit:fs:writeFile', (_e, filePath: string, content: string) => {
  if (!isPathAllowed(filePath)) {
    console.warn('[FS] Blocked write attempt:', filePath)
    return { success: false, reason: 'Path not permitted' }
  }
  try {
    writeFileSync(filePath, content, 'utf-8')
    return { success: true }
  } catch {
    return { success: false }
  }
})

ipcMain.handle('orbit:fs:listDir', (_e, dirPath: string) => {
  if (!isPathAllowed(dirPath)) {
    console.warn('[FS] Blocked listDir attempt:', dirPath)
    return []
  }
  try {
    return readdirSync(dirPath)
  } catch {
    return []
  }
})

ipcMain.handle('orbit:fs:checkFileExists', (_e, filePath: string) => {
  if (!isPathAllowed(filePath)) return false
  return existsSync(filePath)
})

// Auto-update: install now and restart
ipcMain.handle('bleumr:update:install', () => {
  autoUpdater.quitAndInstall()
})

// Connector / plugin system
ipcMain.handle(
  'orbit:connector:invoke',
  (_e, pluginId: string, action: string, payload: unknown) => {
    console.log(`[Connector] ${pluginId}.${action}`, payload)
    // Register real connectors here as the app grows
    return { success: false, reason: `Connector "${pluginId}" not registered` }
  },
)
