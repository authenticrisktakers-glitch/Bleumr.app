import { contextBridge, ipcRenderer } from 'electron'

/**
 * Secure IPC bridge — exposes window.orbit to the renderer.
 * All communication goes through validated ipcRenderer.invoke calls.
 * The renderer never has direct access to Node.js APIs.
 */
contextBridge.exposeInMainWorld('orbit', {
  // ── Persistent storage ────────────────────────────────────────────────────
  storage: {
    /** Read a preference value (unencrypted JSON store) */
    get: (key: string) =>
      ipcRenderer.invoke('orbit:storage:get', key),
    /** Write a preference value */
    set: (key: string, value: unknown) =>
      ipcRenderer.invoke('orbit:storage:set', key, value),
    /** Read a value encrypted with Electron safeStorage */
    getSecure: (key: string) =>
      ipcRenderer.invoke('orbit:storage:getSecure', key),
    /** Write a value encrypted with Electron safeStorage */
    setSecure: (key: string, value: string) =>
      ipcRenderer.invoke('orbit:storage:setSecure', key, value),
  },

  // ── Embedded browser tab management ──────────────────────────────────────
  browser: {
    /** Open a new tab, returns { success, tabId } */
    open: (url: string) =>
      ipcRenderer.invoke('orbit:browser:open', url),
    /** Navigate an existing tab to a URL */
    navigate: (tabId: string, url: string) =>
      ipcRenderer.invoke('orbit:browser:navigate', tabId, url),
    /** Reload a tab */
    reload: (tabId: string) =>
      ipcRenderer.invoke('orbit:browser:reload', tabId),
    /** Close a tab */
    close: (tabId: string) =>
      ipcRenderer.invoke('orbit:browser:close', tabId),
    /** Bring a tab to the foreground */
    setActive: (tabId: string) =>
      ipcRenderer.invoke('orbit:browser:setActive', tabId),
    /** Reposition the browser view within the window */
    setBounds: (
      tabId: string,
      bounds: { x: number; y: number; width: number; height: number },
    ) => ipcRenderer.invoke('orbit:browser:setBounds', tabId, bounds),
    /** Navigate back */
    goBack: (tabId: string) =>
      ipcRenderer.invoke('orbit:browser:goBack', tabId),
    /** Navigate forward */
    goForward: (tabId: string) =>
      ipcRenderer.invoke('orbit:browser:goForward', tabId),
    /** Snapshot of all tabs + active tab ID */
    getState: () => ipcRenderer.invoke('orbit:browser:getState'),
    /** Subscribe to live tab state updates; returns unsubscribe fn */
    onStateUpdate: (callback: (state: unknown) => void) => {
      const handler = (_: Electron.IpcRendererEvent, state: unknown) =>
        callback(state)
      ipcRenderer.on('orbit:browser:stateUpdate', handler)
      return () => ipcRenderer.off('orbit:browser:stateUpdate', handler)
    },

    /** Open a new tab (alias expected by BrowserService) */
    createTab: (_tabId: string, url: string) =>
      ipcRenderer.invoke('orbit:browser:open', url),
    /** Close a tab (alias expected by BrowserService) */
    closeTab: (tabId: string) =>
      ipcRenderer.invoke('orbit:browser:close', tabId),
    /** Bring a tab to the foreground (alias expected by BrowserService) */
    setActiveTab: (tabId: string) =>
      ipcRenderer.invoke('orbit:browser:setActive', tabId),
    /** Execute JavaScript in a tab's WebContents */
    executeJS: (tabId: string, code: string) =>
      ipcRenderer.invoke('orbit:browser:executeJS', tabId, code),
    /** Load raw HTML string into a new browser tab (AI-generated pages) */
    loadHTML: (html: string) =>
      ipcRenderer.invoke('orbit:browser:loadHTML', html),
    /** Capture current tab as base64 PNG for vision analysis */
    screenshot: (tabId: string) =>
      ipcRenderer.invoke('orbit:browser:screenshot', tabId),
    /** Remove all WebContentsViews from the window (called when browser panel closes) */
    hideAll: () =>
      ipcRenderer.invoke('orbit:browser:hideAll'),

    /** Subscribe to URL changes; returns unsubscribe fn */
    onUrlChanged: (callback: (data: { tabId: string; url: string }) => void) => {
      const prev = new Map<string, string>()
      const handler = (_: Electron.IpcRendererEvent, state: any) => {
        for (const tab of state?.tabs ?? []) {
          const old = prev.get(tab.id)
          if (old !== tab.url) {
            prev.set(tab.id, tab.url)
            if (old !== undefined) callback({ tabId: tab.id, url: tab.url })
          }
        }
      }
      ipcRenderer.on('orbit:browser:stateUpdate', handler)
      return () => ipcRenderer.off('orbit:browser:stateUpdate', handler)
    },
    /** Subscribe to title changes; returns unsubscribe fn */
    onTitleChanged: (callback: (data: { tabId: string; title: string }) => void) => {
      const prev = new Map<string, string>()
      const handler = (_: Electron.IpcRendererEvent, state: any) => {
        for (const tab of state?.tabs ?? []) {
          const old = prev.get(tab.id)
          if (old !== tab.title) {
            prev.set(tab.id, tab.title)
            if (old !== undefined) callback({ tabId: tab.id, title: tab.title })
          }
        }
      }
      ipcRenderer.on('orbit:browser:stateUpdate', handler)
      return () => ipcRenderer.off('orbit:browser:stateUpdate', handler)
    },
    /** Subscribe to loading-state changes; returns unsubscribe fn */
    onLoadingChanged: (callback: (data: { tabId: string; isLoading: boolean }) => void) => {
      const prev = new Map<string, boolean>()
      // Listen on stateUpdate (batched) AND the dedicated loadingChanged event
      const stateHandler = (_: Electron.IpcRendererEvent, state: any) => {
        for (const tab of state?.tabs ?? []) {
          const old = prev.get(tab.id)
          if (old !== tab.loading) {
            prev.set(tab.id, tab.loading)
            callback({ tabId: tab.id, isLoading: tab.loading }) // always fire, no guard
          }
        }
      }
      const directHandler = (_: Electron.IpcRendererEvent, data: any) => {
        if (data?.tabId !== undefined && data?.isLoading !== undefined) {
          callback({ tabId: data.tabId, isLoading: data.isLoading })
        }
      }
      ipcRenderer.on('orbit:browser:stateUpdate', stateHandler)
      ipcRenderer.on('orbit:browser:loadingChanged', directHandler)
      return () => {
        ipcRenderer.off('orbit:browser:stateUpdate', stateHandler)
        ipcRenderer.off('orbit:browser:loadingChanged', directHandler)
      }
    },
    /** Subscribe to tab crash events; returns unsubscribe fn */
    onCrash: (callback: (data: { tabId: string; details: unknown }) => void) => {
      const handler = (_: Electron.IpcRendererEvent, data: unknown) =>
        callback(data as any)
      ipcRenderer.on('orbit:browser:crash', handler)
      return () => ipcRenderer.off('orbit:browser:crash', handler)
    },
    /** Subscribe to tab load-error events; returns unsubscribe fn */
    onError: (callback: (data: { tabId: string; error: string }) => void) => {
      const handler = (_: Electron.IpcRendererEvent, data: unknown) =>
        callback(data as any)
      ipcRenderer.on('orbit:browser:error', handler)
      return () => ipcRenderer.off('orbit:browser:error', handler)
    },
  },

  // ── System information ────────────────────────────────────────────────────
  system: {
    info: () => ipcRenderer.invoke('orbit:system:info'),
  },

  // ── Connector / plugin bridge (used by ElectronRPC) ──────────────────────
  invokeConnector: (pluginId: string, action: string, payload: unknown) =>
    ipcRenderer.invoke('orbit:connector:invoke', pluginId, action, payload),

  // ── Filesystem helpers (used by ElectronRPC) ─────────────────────────────
  readFile: (filePath: string) =>
    ipcRenderer.invoke('orbit:fs:readFile', filePath),
  writeFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('orbit:fs:writeFile', filePath, content),
  listDir: (dirPath: string) =>
    ipcRenderer.invoke('orbit:fs:listDir', dirPath),
  checkFileExists: (filePath: string) =>
    ipcRenderer.invoke('orbit:fs:checkFileExists', filePath),

  // ── Auto-updater ─────────────────────────────────────────────────────────
  updater: {
    /** Called when a new version is available (downloading in background) */
    onUpdateAvailable: (cb: () => void) => {
      ipcRenderer.on('bleumr:update:available', cb)
      return () => ipcRenderer.off('bleumr:update:available', cb)
    },
    /** Called when update is downloaded and ready to install */
    onUpdateDownloaded: (cb: () => void) => {
      ipcRenderer.on('bleumr:update:downloaded', cb)
      return () => ipcRenderer.off('bleumr:update:downloaded', cb)
    },
    /** Quit and install the downloaded update */
    install: () => ipcRenderer.invoke('bleumr:update:install'),
  },

  // ── Model invocation stubs ────────────────────────────────────────────────
  // These return empty values until a provider key is configured.
  // Add real implementations via the connector system.
  invokeModel: (_prompt: string, _options?: unknown) => Promise.resolve(''),
  streamModel: (_prompt: string, _options?: unknown) =>
    Promise.resolve(new ReadableStream()),
  verifyURL: (_pattern: string) => Promise.resolve(false),
  verifyVisual: (_expectedHash: string) => Promise.resolve(false),
})
