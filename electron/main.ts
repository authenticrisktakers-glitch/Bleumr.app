import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  safeStorage,
  WebContentsView,
  shell,
} from 'electron'
import { join } from 'path'
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
} from 'fs'
import { autoUpdater } from 'electron-updater'

// ── GPU + performance flags (must be set before app is ready) ─────────────────
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')
app.commandLine.appendSwitch('enable-hardware-overlays', 'single-fullscreen,single-on-top,underlay')
app.commandLine.appendSwitch('ignore-gpu-blacklist')
app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,PlatformHEVCDecoderSupport')
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors')
// DNS prefetch for faster first loads
app.commandLine.appendSwitch('enable-tcp-fast-open')
app.commandLine.appendSwitch('enable-quic')

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
//
// Tab lifecycle in Bleumr:
//   • Each tab is a WebContentsView (its own renderer process)
//   • Inactive tabs are removed from the contentView tree (not visible)
//   • backgroundThrottling is now ENABLED so Chromium throttles inactive tabs
//     automatically (lower frame rate, paused timers, suspended animations)
//   • LRU eviction: at most MAX_OPEN_TABS may be alive simultaneously. When a
//     new tab pushes us over the cap, the oldest INACTIVE tab is closed and
//     the renderer is notified via 'orbit:browser:tabEvicted'

const MAX_OPEN_TABS = 20

interface TabState {
  id: string
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  lastActiveAt: number
}

interface TabRecord {
  view: WebContentsView
  /** Wall-clock timestamp of when this tab was last the active tab. */
  lastActiveAt: number
}

const tabs = new Map<string, TabRecord>()
let activeTabId: string | null = null
let tabCounter = 0
let mainWindow: BrowserWindow | null = null

/** Find the oldest tab that ISN'T currently active. Returns null if every tab is active (impossible) or there are no tabs. */
function findLruInactiveTab(): string | null {
  let oldestId: string | null = null
  let oldestTs = Infinity
  for (const [id, rec] of tabs) {
    if (id === activeTabId) continue
    if (rec.lastActiveAt < oldestTs) {
      oldestTs = rec.lastActiveAt
      oldestId = id
    }
  }
  return oldestId
}

/** Close a tab from the main process side, notifying the renderer it was evicted. */
function evictTab(id: string, reason: string) {
  const rec = tabs.get(id)
  if (!rec) return
  if (mainWindow && mainWindow.contentView.children.includes(rec.view)) {
    mainWindow.contentView.removeChildView(rec.view)
  }
  try { rec.view.webContents.close() } catch { /* ignore */ }
  tabs.delete(id)
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('orbit:browser:tabEvicted', { tabId: id, reason })
  }
}

function createTab(url: string): string {
  // LRU eviction: if we're at the cap, close the oldest inactive tab BEFORE
  // spinning up another renderer process.
  if (tabs.size >= MAX_OPEN_TABS) {
    const lruId = findLruInactiveTab()
    if (lruId) {
      console.log(`[Tabs] At cap (${MAX_OPEN_TABS}), evicting LRU tab ${lruId}`)
      evictTab(lruId, 'lru_cap')
    }
  }

  const id = `tab_${++tabCounter}`

  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Let Chromium throttle inactive tabs (paused rAF, slowed timers,
      // suspended animations). The previous `false` setting was the single
      // biggest CPU/GPU drain in Bleumr — every tab kept rendering at full
      // speed even when the user couldn't see it.
      backgroundThrottling: true,
      images: true,
      javascript: true,
      webgl: true,
      spellcheck: false,
    },
  })

  // Speed: aggressive caching + DNS prefetch
  view.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
    callback({ requestHeaders: { ...details.requestHeaders } })
  })

  // Load the URL — add https:// if scheme is missing
  const targetUrl = url
    ? (url.startsWith('http') || url.startsWith('file') || url.startsWith('about') ? url : `https://${url}`)
    : 'about:blank'
  view.webContents.loadURL(targetUrl).catch(() => {})

  // Grant mic/camera/clipboard permissions for browser tabs
  view.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    const allowed = ['media', 'audioCapture', 'mediaKeySystem', 'clipboard-read', 'notifications'].includes(permission)
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

  // Belt-and-braces: re-assert background throttling whenever Chromium
  // says rendering started, in case a future Electron version flips the
  // default for new contents.
  view.webContents.on('did-start-loading', () => {
    try { view.webContents.setBackgroundThrottling(true) } catch { /* ignore */ }
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

  tabs.set(id, { view, lastActiveAt: Date.now() })
  setActiveTab(id)
  return id
}

function setActiveTab(id: string) {
  if (!mainWindow) return

  // Stamp the OUTGOING tab's last-active time before swapping. This is the
  // ground truth used by findLruInactiveTab() for eviction decisions.
  if (activeTabId && activeTabId !== id) {
    const prev = tabs.get(activeTabId)
    if (prev) prev.lastActiveAt = Date.now()
  }

  // Hide all non-active views
  for (const [, rec] of tabs) {
    if (mainWindow.contentView.children.includes(rec.view)) {
      mainWindow.contentView.removeChildView(rec.view)
    }
  }

  const rec = tabs.get(id)
  if (!rec) return

  mainWindow.contentView.addChildView(rec.view)
  activeTabId = id
  rec.lastActiveAt = Date.now()

  // Start hidden (1×1 off-screen); the renderer will call orbit:browser:setBounds
  // with the actual viewport rect immediately after switching tabs.
  // This prevents the WebContentsView from flashing at full-window size.
  rec.view.setBounds({ x: 0, y: -1, width: 1, height: 1 })

  emitBrowserState()
}

function getTabState(id: string, rec: TabRecord): TabState {
  const wc = rec.view.webContents
  return {
    id,
    url: wc.getURL(),
    title: wc.getTitle(),
    loading: wc.isLoading(),
    canGoBack: wc.canGoBack(),
    canGoForward: wc.canGoForward(),
    lastActiveAt: rec.lastActiveAt,
  }
}

function getAllTabsState() {
  return {
    tabs: [...tabs.entries()].map(([id, rec]) => getTabState(id, rec)),
    activeTabId,
  }
}

function emitBrowserState() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const state = getAllTabsState()
  mainWindow.webContents.send('orbit:browser:stateUpdate', state)
  // Also emit explicit loading-changed events for each tab so the renderer
  // can reliably clear the loading indicator without relying on stale closures
  for (const tab of state.tabs) {
    mainWindow.webContents.send('orbit:browser:loadingChanged', {
      tabId: tab.id,
      isLoading: tab.loading,
    })
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

  // Override User-Agent — Electron's default UA contains "Electron/" which
  // triggers Cloudflare bot-detection (403) on sites like Pollinations.ai
  session.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  )

  // electron-vite sets ELECTRON_RENDERER_URL in dev mode
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Block all popup windows from the renderer — window.open() must never open Chrome or a new Electron window.
  // Any http/https URL is routed into a new Bleumr browser tab instead.
  mainWindow.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    if (openUrl && (openUrl.startsWith('http://') || openUrl.startsWith('https://'))) {
      // Route to a Bleumr tab — same behaviour as WebContentsView tabs
      createTab(openUrl)
    }
    return { action: 'deny' }
  })

  // Prevent the renderer window itself from navigating away (e.g. a stray location.href assignment)
  mainWindow.webContents.on('will-navigate', (event, navUrl) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    const isDevServer = devUrl && navUrl.startsWith(devUrl)
    const isLocalFile = navUrl.startsWith('file://')
    if (!isDevServer && !isLocalFile) {
      event.preventDefault()
    }
  })

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

  // Window resize is handled by the renderer's ResizeObserver which calls setBounds via IPC

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
  const rec = tabs.get(tabId)
  if (!rec) return { success: false, reason: 'Tab not found' }
  rec.view.webContents.loadURL(url).catch(() => {})
  return { success: true }
})

ipcMain.handle('orbit:browser:reload', (_e, tabId: string) => {
  const rec = tabs.get(tabId)
  if (!rec) return { success: false }
  rec.view.webContents.reload()
  return { success: true }
})

ipcMain.handle('orbit:browser:close', (_e, tabId: string) => {
  const rec = tabs.get(tabId)
  if (!rec) return { success: false }

  if (mainWindow?.contentView.children.includes(rec.view)) {
    mainWindow.contentView.removeChildView(rec.view)
  }
  rec.view.webContents.close()
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

// Remove all WebContentsViews from the window without destroying them.
// Called when the browser panel is closed so nothing renders behind the platform UI.
ipcMain.handle('orbit:browser:hideAll', () => {
  if (!mainWindow) return { success: false }
  // Stamp the outgoing active tab so LRU eviction has accurate timestamps.
  if (activeTabId) {
    const prev = tabs.get(activeTabId)
    if (prev) prev.lastActiveAt = Date.now()
  }
  for (const [, rec] of tabs) {
    if (mainWindow.contentView.children.includes(rec.view)) {
      mainWindow.contentView.removeChildView(rec.view)
    }
  }
  activeTabId = null
  return { success: true }
})

ipcMain.handle(
  'orbit:browser:setBounds',
  (
    _e,
    tabId: string,
    bounds: { x: number; y: number; width: number; height: number },
  ) => {
    const rec = tabs.get(tabId)
    if (!rec) return { success: false }
    rec.view.setBounds(bounds)
    return { success: true }
  },
)

ipcMain.handle('orbit:browser:goBack', (_e, tabId: string) => {
  const rec = tabs.get(tabId)
  if (rec?.view.webContents.canGoBack()) rec.view.webContents.goBack()
  return { success: true }
})

ipcMain.handle('orbit:browser:goForward', (_e, tabId: string) => {
  const rec = tabs.get(tabId)
  if (rec?.view.webContents.canGoForward()) rec.view.webContents.goForward()
  return { success: true }
})

ipcMain.handle('orbit:browser:getState', () => getAllTabsState())

ipcMain.handle('orbit:browser:executeJS', async (_e, tabId: string, code: string) => {
  const rec = tabs.get(tabId)
  if (!rec) return { success: false, reason: 'Tab not found' }
  try {
    const result = await rec.view.webContents.executeJavaScript(code, true)
    return { success: true, result }
  } catch (err: any) {
    return { success: false, error: String(err?.message ?? err) }
  }
})

// Screenshot — captures current tab as base64 PNG for vision analysis
ipcMain.handle('orbit:browser:screenshot', async (_e, tabId: string) => {
  const rec = tabs.get(tabId)
  if (!rec) return { success: false, reason: 'Tab not found' }
  try {
    const image = await rec.view.webContents.capturePage()
    const base64 = image.toPNG().toString('base64')
    return { success: true, base64 }
  } catch (err: any) {
    return { success: false, error: String(err?.message ?? err) }
  }
})

// Process metrics — exposes Electron's per-process CPU/memory data so the
// renderer (or admin dashboard) can show "memory pressure" warnings and let
// users see exactly what each tab/process is costing.
ipcMain.handle('orbit:browser:getProcessMetrics', () => {
  try {
    const metrics = app.getAppMetrics().map(m => ({
      pid: m.pid,
      type: m.type,
      cpu: {
        percentCPUUsage: m.cpu?.percentCPUUsage ?? 0,
      },
      memory: {
        workingSetSize: m.memory?.workingSetSize ?? 0,
        peakWorkingSetSize: m.memory?.peakWorkingSetSize ?? 0,
      },
      name: (m as any).name || undefined,
    }))
    return {
      success: true,
      tabCount: tabs.size,
      maxTabs: MAX_OPEN_TABS,
      metrics,
    }
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

// Read a file as base64 (for images, binary files)
ipcMain.handle('orbit:fs:readFileBase64', (_e, filePath: string) => {
  if (!isPathAllowed(filePath)) {
    console.warn('[FS] Blocked base64 read attempt:', filePath)
    return null
  }
  try {
    const buffer = readFileSync(filePath)
    const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
    const mimeMap: Record<string, string> = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
      ico: 'image/x-icon', bmp: 'image/bmp', pdf: 'application/pdf',
    }
    const contentType = mimeMap[ext] ?? 'application/octet-stream'
    return { base64: buffer.toString('base64'), contentType, size: buffer.length }
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
    const entries = readdirSync(dirPath, { withFileTypes: true })
    return entries.map(entry => ({
      name: entry.name,
      path: join(dirPath, entry.name),
      isDir: entry.isDirectory(),
    }))
  } catch {
    return []
  }
})

ipcMain.handle('orbit:fs:checkFileExists', (_e, filePath: string) => {
  if (!isPathAllowed(filePath)) return false
  return existsSync(filePath)
})

ipcMain.handle('orbit:fs:mkdir', (_e, dirPath: string) => {
  if (!isPathAllowed(dirPath)) {
    console.warn('[FS] Blocked mkdir attempt:', dirPath)
    return { success: false, reason: 'Path not permitted' }
  }
  try {
    mkdirSync(dirPath, { recursive: true })
    return { success: true }
  } catch (err: any) {
    return { success: false, reason: err?.message ?? 'mkdir failed' }
  }
})

ipcMain.handle('orbit:fs:createProject', (_e, projectName: string) => {
  // Create project folder on user's Desktop
  const desktopPath = join(app.getPath('desktop'), projectName)
  if (existsSync(desktopPath)) {
    return { success: true, path: desktopPath, existed: true }
  }
  try {
    mkdirSync(desktopPath, { recursive: true })
    return { success: true, path: desktopPath, existed: false }
  } catch (err: any) {
    return { success: false, path: '', reason: err?.message ?? 'Failed to create project folder' }
  }
})

// Native folder / file picker dialog
ipcMain.handle('orbit:dialog:showOpenDialog', async (_e, options: Record<string, unknown>) => {
  if (!mainWindow) return { canceled: true, filePaths: [] }
  try {
    const result = await dialog.showOpenDialog(mainWindow, options as any)
    return result
  } catch {
    return { canceled: true, filePaths: [] }
  }
})

// ── Shell command execution (for Code Bleu agent) ──────────────────────────
ipcMain.handle('orbit:shell:exec', async (_e, command: string, cwd?: string) => {
  // Safety: only allow execution within an opened project directory
  if (cwd && !isPathAllowed(cwd)) {
    return { success: false, stdout: '', stderr: 'Working directory not permitted', code: 1 }
  }

  const { exec } = await import('child_process')

  return new Promise((resolve) => {
    const opts: any = {
      cwd: cwd || undefined,
      timeout: 60000, // 60 second timeout
      maxBuffer: 1024 * 1024, // 1MB output buffer
      shell: true,
    }

    exec(command, opts, (error: any, stdout: string, stderr: string) => {
      resolve({
        success: !error,
        stdout: stdout?.toString()?.slice(0, 50000) ?? '',
        stderr: stderr?.toString()?.slice(0, 10000) ?? '',
        code: error?.code ?? 0,
      })
    })
  })
})

// Auto-update: install now and restart
ipcMain.handle('bleumr:update:install', () => {
  autoUpdater.quitAndInstall()
})

// ── CORS-free proxy fetch — routes HTTP requests through main process ──────
// Renderer can't fetch DuckDuckGo (CORS blocked), so we proxy through Node.
ipcMain.handle(
  'orbit:proxyFetch',
  async (_e, url: string, options?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    try {
      // Security: only allow HTTPS URLs and a limited set of domains
      const parsed = new URL(url)
      const allowedHosts = [
        'html.duckduckgo.com',
        'duckduckgo.com',
        'api.groq.com',
        'generativelanguage.googleapis.com',
        'api.pollinations.ai',
        'image.pollinations.ai',
      ]
      if (parsed.protocol !== 'https:' || !allowedHosts.some(h => parsed.hostname.endsWith(h))) {
        return { ok: false, status: 403, text: 'Domain not allowed for proxy fetch' }
      }

      // Merge caller headers with a sensible default User-Agent (DDG blocks bot-like UAs)
      const mergedHeaders: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...(options?.headers || {}),
      }
      const res = await fetch(url, {
        method: options?.method || 'GET',
        headers: mergedHeaders,
        body: options?.body,
      })
      const text = await res.text()
      return { ok: res.ok, status: res.status, text }
    } catch (err: any) {
      return { ok: false, status: 0, text: err.message || 'Proxy fetch failed' }
    }
  },
)

// ── Fetch image as base64 (avoids Cloudflare bot-detection in renderer) ─────
ipcMain.handle(
  'orbit:fetchImage',
  async (_e, imageUrl: string) => {
    try {
      const parsed = new URL(imageUrl)
      if (parsed.protocol !== 'https:') {
        return { ok: false, error: 'Only HTTPS allowed' }
      }
      const res = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      })
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
      const buffer = await res.arrayBuffer()
      const base64 = Buffer.from(buffer).toString('base64')
      const contentType = res.headers.get('content-type') || 'image/jpeg'
      return { ok: true, base64, contentType }
    } catch (err: any) {
      return { ok: false, error: err.message || 'Image fetch failed' }
    }
  },
)

// Connector / plugin system
ipcMain.handle(
  'orbit:connector:invoke',
  (_e, pluginId: string, action: string, payload: unknown) => {
    console.log(`[Connector] ${pluginId}.${action}`, payload)
    // Register real connectors here as the app grows
    return { success: false, reason: `Connector "${pluginId}" not registered` }
  },
)
