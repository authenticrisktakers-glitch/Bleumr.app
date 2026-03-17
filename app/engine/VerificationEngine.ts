import { AutomationLogger } from './AutomationLogger';
import { ElectronRPC } from './ElectronRPC';
 
export interface DOMSnapshot {
  timestamp: number;
  html: string;
  url: string;
}
 
// FIX: Cap the in-memory snapshot map. document.body.innerHTML on a complex page
// can be several MB. Without a cap, long sessions OOM the renderer process.
const MAX_SNAPSHOTS = 10;
 
export class VerificationEngine {
  private static snapshots: Map<string, DOMSnapshot> = new Map();
 
  static async verifyDOM(selector: string, expectedText?: string, autoRecover: boolean = true): Promise<boolean> {
    AutomationLogger.log('DEBUG', 'VERIFY_DOM', { selector, expectedText });
    let el = document.querySelector(selector);
 
    if (!el && autoRecover) {
      AutomationLogger.log('WARN', 'DOM_VERIFY_FAIL', { selector, message: 'Element not found, attempting recovery...' });
      el = await this.waitForElement(selector, 2000);
    }
 
    if (!el) return false;
    if (expectedText && !el.textContent?.includes(expectedText)) return false;
 
    this.takeSnapshot('last_verified_state');
    return true;
  }
 
  private static waitForElement(selector: string, timeout: number): Promise<Element | null> {
    return new Promise((resolve) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
 
      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });
 
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }
 
  static takeSnapshot(tag: string) {
    // FIX: Evict oldest snapshot when the cap is reached
    if (this.snapshots.size >= MAX_SNAPSHOTS) {
      const oldestKey = this.snapshots.keys().next().value;
      if (oldestKey) this.snapshots.delete(oldestKey);
    }
 
    this.snapshots.set(tag, {
      timestamp: Date.now(),
      html: document.body.innerHTML,
      url: window.location.href
    });
  }
 
  static getSnapshot(tag: string): DOMSnapshot | undefined {
    return this.snapshots.get(tag);
  }
 
  // FIX: Explicit clear for when a task completes and snapshots are no longer needed
  static clearSnapshots() {
    this.snapshots.clear();
  }
 
  static async verifyURL(expectedPattern: string | RegExp): Promise<boolean> {
    AutomationLogger.log('DEBUG', 'VERIFY_URL', { expectedPattern });
    const currentUrl = window.location.href;
 
    let matched = false;
    if (typeof expectedPattern === 'string') {
      matched = currentUrl.includes(expectedPattern);
    } else {
      matched = expectedPattern.test(currentUrl);
    }
 
    if (!matched) {
      const isExternalMatch = await ElectronRPC.call('verifyURL', String(expectedPattern));
      return isExternalMatch;
    }
 
    return matched;
  }
 
  static async verifyFileDownloaded(filenamePattern: string): Promise<boolean> {
    AutomationLogger.log('DEBUG', 'VERIFY_FILE', { filenamePattern });
    const exists = await ElectronRPC.call('checkFileExists', filenamePattern);
    return exists;
  }
 
  static async verifyVisualState(referenceImageHash: string): Promise<boolean> {
    AutomationLogger.log('DEBUG', 'VERIFY_VISUAL', { referenceImageHash });
    const matched = await ElectronRPC.call('verifyVisual', referenceImageHash);
    return matched;
  }
}
