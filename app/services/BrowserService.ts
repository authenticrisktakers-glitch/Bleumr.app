/**
 * BrowserService - Wrapper for Electron browser API
 * Provides a unified interface for browser tab management
 */

export class BrowserService {
  private static isElectron(): boolean {
    return typeof window !== 'undefined' && !!(window as any).orbit?.browser;
  }

  static async createTab(tabId: string, url: string): Promise<boolean> {
    if (this.isElectron()) {
      const result = await (window as any).orbit.browser.createTab(tabId, url);
      return result?.success || false;
    }
    console.warn('[BrowserService] Not in Electron - browser operations unavailable');
    return false;
  }

  static async navigate(tabId: string, url: string): Promise<boolean> {
    if (this.isElectron()) {
      const result = await (window as any).orbit.browser.navigate(tabId, url);
      return result?.success || false;
    }
    return false;
  }

  static async reload(tabId: string): Promise<boolean> {
    if (this.isElectron()) {
      const result = await (window as any).orbit.browser.reload(tabId);
      return result?.success || false;
    }
    return false;
  }

  static async goBack(tabId: string): Promise<boolean> {
    if (this.isElectron()) {
      const result = await (window as any).orbit.browser.goBack(tabId);
      return result?.success || false;
    }
    return false;
  }

  static async goForward(tabId: string): Promise<boolean> {
    if (this.isElectron()) {
      const result = await (window as any).orbit.browser.goForward(tabId);
      return result?.success || false;
    }
    return false;
  }

  /** Load raw HTML into a new browser tab — used for AI-generated pages */
  static async loadHTML(html: string): Promise<{ success: boolean; tabId?: string }> {
    if (this.isElectron()) {
      const result = await (window as any).orbit.browser.loadHTML(html);
      return result || { success: false };
    }
    console.warn('[BrowserService] loadHTML: not in Electron');
    return { success: false };
  }

  static async executeJS(tabId: string, code: string): Promise<any> {
    if (this.isElectron()) {
      const result = await (window as any).orbit.browser.executeJS(tabId, code);
      if (result?.success) {
        return result.result;
      }
      throw new Error(result?.error || 'Script execution failed');
    }
    throw new Error('Not in Electron environment');
  }

  static async closeTab(tabId: string): Promise<boolean> {
    if (this.isElectron()) {
      const result = await (window as any).orbit.browser.closeTab(tabId);
      return result?.success || false;
    }
    return false;
  }

  static async setActiveTab(tabId: string): Promise<boolean> {
    if (this.isElectron()) {
      const result = await (window as any).orbit.browser.setActiveTab(tabId);
      return result?.success || false;
    }
    return false;
  }

  static onUrlChanged(callback: (data: { tabId: string; url: string }) => void): () => void {
    if (this.isElectron()) {
      return (window as any).orbit.browser.onUrlChanged(callback);
    }
    return () => {};
  }

  static onTitleChanged(callback: (data: { tabId: string; title: string }) => void): () => void {
    if (this.isElectron()) {
      return (window as any).orbit.browser.onTitleChanged(callback);
    }
    return () => {};
  }

  static onLoadingChanged(callback: (data: { tabId: string; isLoading: boolean }) => void): () => void {
    if (this.isElectron()) {
      return (window as any).orbit.browser.onLoadingChanged(callback);
    }
    return () => {};
  }

  static onCrash(callback: (data: { tabId: string; details: any }) => void): () => void {
    if (this.isElectron()) {
      return (window as any).orbit.browser.onCrash(callback);
    }
    return () => {};
  }

  static onError(callback: (data: { tabId: string; error: string }) => void): () => void {
    if (this.isElectron()) {
      return (window as any).orbit.browser.onError(callback);
    }
    return () => {};
  }
}
