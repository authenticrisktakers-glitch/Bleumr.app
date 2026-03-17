/**
 * Electron IPC bridge definition for JUMARI.
 * This is the real RPC interface when the React app runs inside the Electron wrapper.
 */
 
export interface ElectronAPI {
  invokeModel: (prompt: string, options?: any) => Promise<string>;
  streamModel: (prompt: string, options?: any) => Promise<ReadableStream>;
  readFile: (path: string) => Promise<string | ArrayBuffer>;
  writeFile: (path: string, content: string | ArrayBuffer) => Promise<void>;
  listDir: (path: string) => Promise<string[]>;
  checkFileExists: (path: string) => Promise<boolean>;
  verifyURL: (pattern: string) => Promise<boolean>;
  verifyVisual: (expectedHash: string) => Promise<boolean>;
  invokeConnector: (pluginId: string, action: string, payload: any) => Promise<any>;
}
 
declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
 
export class ElectronRPC {
  // Your preload exposes APIs under window.orbit (orbit.storage, orbit.browser, etc.)
  // Some builds also expose window.electronAPI directly.
  // We check both so the bridge works regardless of which name the preload uses.
  private static getAPI(): any {
    if (typeof window === 'undefined') return null;
    if ((window as any).orbit) return (window as any).orbit;
    if (window.electronAPI) return window.electronAPI;
    return null;
  }

  static async call<K extends keyof ElectronAPI>(
    method: K,
    ...args: Parameters<ElectronAPI[K]>
  ): Promise<ReturnType<ElectronAPI[K]>> {
    const api = this.getAPI();
    if (api && typeof api[method] === 'function') {
      // @ts-ignore
      return api[method](...args);
    }

    // Not in Electron, or this method isn't exposed by the preload yet.
    // Return safe empty values and warn — never throw, so the app keeps loading.
    console.warn(`[ElectronRPC] "${method}" unavailable — not in Electron or not exposed by preload.`);
    return this.devFallback(method) as any;
  }

  private static async devFallback(method: string): Promise<any> {
    switch (method) {
      case 'checkFileExists': return false;
      case 'verifyURL':       return false;
      case 'verifyVisual':    return false;
      case 'readFile':        return '';
      case 'listDir':         return [];
      case 'writeFile':       return;
      case 'invokeModel':     return '';
      case 'streamModel':     return new ReadableStream();
      case 'invokeConnector': return { success: false, mocked: true, reason: 'Running outside Electron', method };
      default:                return null;
    }
  }
}