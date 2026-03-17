import localforage from 'localforage';
 
export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
 
export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  action: string;
  details: Record<string, any>;
}
 
// FIX: Fields that may contain PII — strip their values before persisting to disk.
// The full details are still available in-memory during the session for debugging.
const PII_FIELDS = ['text', 'script', 'apiKey', 'token', 'password', 'email', 'context'];
 
function stripPII(details: Record<string, any>): Record<string, any> {
  const safe: Record<string, any> = {};
  for (const [key, value] of Object.entries(details)) {
    if (PII_FIELDS.includes(key)) {
      safe[key] = '[redacted]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      safe[key] = stripPII(value);
    } else {
      safe[key] = value;
    }
  }
  return safe;
}
 
export class AutomationLogger {
  private static logs: LogEntry[] = [];
 
  static log(level: LogLevel, action: string, details: Record<string, any> = {}) {
    const entry: LogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      level,
      action,
      details
    };
    this.logs.push(entry);
    this.persist();
    console.log(`[JUMARI ${level}] ${action}`, details);
  }
 
  static getLogs(): LogEntry[] {
    return this.logs;
  }
 
  // FIX: Persist to localforage (IndexedDB-backed, async, no 5MB cap, not accessible
  // to sync XSS reads) instead of localStorage. PII fields are stripped before write.
  private static persist() {
    try {
      const recentLogs = this.logs.slice(-100);
      const safeEntries = recentLogs.map(entry => ({
        ...entry,
        details: stripPII(entry.details)
      }));
      localforage.setItem('jumari_automation_logs', safeEntries).catch(e => {
        console.warn('Failed to persist logs', e);
      });
    } catch (e) {
      console.warn('Failed to persist logs', e);
    }
  }
 
  static async loadLogs() {
    try {
      const saved = await localforage.getItem<LogEntry[]>('jumari_automation_logs');
      if (saved) {
        this.logs = saved;
      }
    } catch (e) {
      console.warn('Failed to load logs', e);
    }
  }
 
  static async clearLogs() {
    this.logs = [];
    await localforage.removeItem('jumari_automation_logs');
  }
}
 
// Auto-load on init (async — logs are available after the promise resolves)
AutomationLogger.loadLogs();
