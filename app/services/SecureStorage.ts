/**
 * SecureStorage - Wrapper for Electron's safeStorage API
 * Falls back to localStorage in dev/browser mode (NOT secure - dev only)
 */

class SecureStorageService {
  private isElectron(): boolean {
    return typeof window !== 'undefined' && !!(window as any).orbit?.storage;
  }

  async get(key: string): Promise<string | null> {
    if (this.isElectron()) {
      try {
        const result = await (window as any).orbit.storage.getSecure(key);
        return result?.success ? result.value : null;
      } catch (error) {
        console.error('[SecureStorage] Failed to get secure value:', error);
        return null;
      }
    } else {
      // Dev fallback - NOT SECURE
      console.warn('[SecureStorage] Using localStorage fallback (NOT SECURE - dev only)');
      return localStorage.getItem(`secure_${key}`);
    }
  }

  async set(key: string, value: string): Promise<boolean> {
    if (this.isElectron()) {
      try {
        const result = await (window as any).orbit.storage.setSecure(key, value);
        return result?.success || false;
      } catch (error) {
        console.error('[SecureStorage] Failed to set secure value:', error);
        return false;
      }
    } else {
      // Dev fallback - NOT SECURE
      console.warn('[SecureStorage] Using localStorage fallback (NOT SECURE - dev only)');
      try {
        localStorage.setItem(`secure_${key}`, value);
        return true;
      } catch {
        return false;
      }
    }
  }

  async remove(key: string): Promise<boolean> {
    if (this.isElectron()) {
      try {
        const result = await (window as any).orbit.storage.set(key, null);
        return result?.success || false;
      } catch (error) {
        console.error('[SecureStorage] Failed to remove secure value:', error);
        return false;
      }
    } else {
      // Dev fallback
      try {
        localStorage.removeItem(`secure_${key}`);
        return true;
      } catch {
        return false;
      }
    }
  }

  // Non-secure storage for preferences (uses Electron IPC or localStorage)
  async getPreference(key: string): Promise<any> {
    if (this.isElectron()) {
      return await (window as any).orbit.storage.get(key);
    } else {
      const value = localStorage.getItem(`pref_${key}`);
      return value ? JSON.parse(value) : null;
    }
  }

  async setPreference(key: string, value: any): Promise<boolean> {
    if (this.isElectron()) {
      const result = await (window as any).orbit.storage.set(key, value);
      return result?.success || false;
    } else {
      try {
        localStorage.setItem(`pref_${key}`, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    }
  }
}

export const SecureStorage = new SecureStorageService();
