/**
 * Preacher — Code Bleu's safety net.
 *
 * Before Code Bleu modifies ANY file, Preacher saves a snapshot of the original.
 * If the agent breaks something or loops into bad edits, it can roll back to the
 * exact state before the damage started — no guessing, no domino effects.
 *
 * Stack-based: each file keeps a history of snapshots so multi-step changes
 * can be unwound one at a time or all at once.
 */

export interface Snapshot {
  path: string;
  content: string;
  timestamp: number;
  action: 'write' | 'replace' | 'delete' | 'rename';
  /** The tool call that triggered this snapshot (for audit trail) */
  reason?: string;
}

const MAX_SNAPSHOTS_PER_FILE = 10; // Keep last 10 versions, don't blow up memory
const MAX_TOTAL_SNAPSHOTS = 100;   // Hard cap across all files

class PreacherService {
  /** file path → stack of snapshots (newest last) */
  private _snapshots = new Map<string, Snapshot[]>();
  private _totalCount = 0;

  // ── Snapshot operations ──────────────────────────────────────────────────

  /**
   * Save a snapshot of a file BEFORE it gets modified.
   * Call this before every write_file, replace_in_file, delete_file, rename_file.
   */
  snapshot(path: string, content: string, action: Snapshot['action'], reason?: string): void {
    const normalized = this._normalize(path);

    if (!this._snapshots.has(normalized)) {
      this._snapshots.set(normalized, []);
    }

    const stack = this._snapshots.get(normalized)!;

    // Don't snapshot if the content is identical to the last snapshot
    if (stack.length > 0 && stack[stack.length - 1].content === content) {
      return;
    }

    const snap: Snapshot = {
      path: normalized,
      content,
      timestamp: Date.now(),
      action,
      reason,
    };

    stack.push(snap);
    this._totalCount++;

    // Trim per-file stack
    while (stack.length > MAX_SNAPSHOTS_PER_FILE) {
      stack.shift();
      this._totalCount--;
    }

    // Trim global total if needed (evict oldest snapshots from largest stacks)
    while (this._totalCount > MAX_TOTAL_SNAPSHOTS) {
      this._evictOldest();
    }

    console.log(`[Preacher] 📸 Snapshot saved: ${normalized} (${stack.length} versions, ${this._formatSize(content.length)})`);
  }

  /**
   * Get the most recent snapshot for a file (what it looked like before the last change).
   */
  getLatest(path: string): Snapshot | null {
    const stack = this._snapshots.get(this._normalize(path));
    if (!stack || stack.length === 0) return null;
    return stack[stack.length - 1];
  }

  /**
   * Pop the most recent snapshot and return it (for rollback).
   * After popping, the next getLatest() returns the version before that.
   */
  popLatest(path: string): Snapshot | null {
    const normalized = this._normalize(path);
    const stack = this._snapshots.get(normalized);
    if (!stack || stack.length === 0) return null;
    this._totalCount--;
    return stack.pop()!;
  }

  /**
   * Get the ORIGINAL snapshot for a file (the very first one before any changes).
   * This is the nuclear rollback — goes all the way back to before Code Bleu touched it.
   */
  getOriginal(path: string): Snapshot | null {
    const stack = this._snapshots.get(this._normalize(path));
    if (!stack || stack.length === 0) return null;
    return stack[0];
  }

  /**
   * Get the full snapshot history for a file.
   */
  getHistory(path: string): Snapshot[] {
    return [...(this._snapshots.get(this._normalize(path)) ?? [])];
  }

  /**
   * Get all files that have snapshots.
   */
  getTrackedFiles(): string[] {
    return [...this._snapshots.keys()].filter(k => {
      const stack = this._snapshots.get(k);
      return stack && stack.length > 0;
    });
  }

  /**
   * Get a summary of what Preacher is holding — useful for the agent's context.
   */
  getSummary(): string {
    const files = this.getTrackedFiles();
    if (files.length === 0) return 'Preacher: No file snapshots stored.';

    const lines = [`Preacher: ${files.length} file(s) backed up:`];
    for (const f of files.slice(0, 15)) {
      const stack = this._snapshots.get(f)!;
      const latest = stack[stack.length - 1];
      const age = Math.round((Date.now() - latest.timestamp) / 1000);
      lines.push(`  • ${f} (${stack.length} version${stack.length > 1 ? 's' : ''}, last snapshot ${age}s ago)`);
    }
    if (files.length > 15) lines.push(`  ... and ${files.length - 15} more`);
    return lines.join('\n');
  }

  /**
   * Clear all snapshots (call on session reset or new task).
   */
  clear(): void {
    this._snapshots.clear();
    this._totalCount = 0;
    console.log('[Preacher] 🗑️ All snapshots cleared');
  }

  /**
   * Clear snapshots for a specific file.
   */
  clearFile(path: string): void {
    const normalized = this._normalize(path);
    const stack = this._snapshots.get(normalized);
    if (stack) {
      this._totalCount -= stack.length;
      this._snapshots.delete(normalized);
    }
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private _normalize(path: string): string {
    // Normalize path separators and remove trailing slashes
    return path.replace(/\\/g, '/').replace(/\/+$/, '');
  }

  private _evictOldest(): void {
    // Find the file with the oldest bottom-of-stack snapshot and remove it
    let oldestTime = Infinity;
    let oldestKey = '';

    for (const [key, stack] of this._snapshots) {
      if (stack.length > 0 && stack[0].timestamp < oldestTime) {
        oldestTime = stack[0].timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const stack = this._snapshots.get(oldestKey)!;
      stack.shift();
      this._totalCount--;
      if (stack.length === 0) this._snapshots.delete(oldestKey);
    }
  }

  private _formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }
}

/** Singleton — lives for the entire Code Bleu session */
export const preacher = new PreacherService();
