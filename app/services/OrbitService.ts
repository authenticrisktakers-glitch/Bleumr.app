/**
 * OrbitService — JUMARI Orbit: Persistent Autonomous Goal Engine
 *
 * An "Orbit" is a long-running goal JUMARI pursues in the background.
 * Users set a goal ("track BTC price daily", "find me a studio apartment under $1800")
 * and JUMARI keeps working on it — checking, researching, updating — even when the app
 * is minimised. Each orbit produces "findings" — agent responses the user can review.
 */

export type OrbitStatus = 'active' | 'paused' | 'completed' | 'failed';
export type OrbitPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface OrbitFinding {
  id: string;
  timestamp: number;
  content: string;
  read: boolean;
  /** Optional metadata: links, prices, data points the agent found */
  meta?: Record<string, any>;
}

export interface Orbit {
  id: string;
  title: string;
  goal: string;
  status: OrbitStatus;
  priority: OrbitPriority;
  /** ISO date of creation */
  createdAt: string;
  /** ISO date of last update */
  updatedAt: string;
  /** ISO date of next scheduled check */
  nextCheckAt?: string;
  /** How often to check, in minutes */
  intervalMinutes: number;
  /** Agent findings / updates */
  findings: OrbitFinding[];
  /** Number of checks performed */
  checksPerformed: number;
  /** Optional: linked chat thread ID for deep-dive conversation */
  threadId?: string;
  /** Progress description */
  progressNote?: string;
  /** Category tag */
  category?: string;
}

const STORAGE_KEY = 'jumari_orbits';
const UNREAD_KEY = 'jumari_orbits_unread';

function generateId(): string {
  return `orbit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function generateFindingId(): string {
  return `finding_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

class OrbitServiceClass {
  private orbits: Orbit[] = [];
  private listeners: Set<() => void> = new Set();
  private findingListeners: Set<(finding: OrbitFinding & { orbitId: string; orbitTitle: string; threadId?: string }) => void> = new Set();

  constructor() {
    this.load();
  }

  // ── Persistence ──────────────────────────────────────────────

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this.orbits = JSON.parse(raw);
    } catch {
      this.orbits = [];
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.orbits));
      this.notify();
    } catch (e) {
      console.error('[OrbitService] Failed to save:', e);
    }
  }

  // ── Subscriptions (React hook integration) ───────────────────

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach(fn => fn());
  }

  /** Subscribe to new findings — fires each time a finding is added */
  onFinding(listener: (finding: OrbitFinding & { orbitId: string; orbitTitle: string; threadId?: string }) => void): () => void {
    this.findingListeners.add(listener);
    return () => this.findingListeners.delete(listener);
  }

  private notifyFinding(finding: OrbitFinding, orbit: Orbit): void {
    const enriched = { ...finding, orbitId: orbit.id, orbitTitle: orbit.title, threadId: orbit.threadId };
    this.findingListeners.forEach(fn => fn(enriched));
  }

  // ── CRUD ─────────────────────────────────────────────────────

  getAll(): Orbit[] {
    return [...this.orbits];
  }

  getActive(): Orbit[] {
    return this.orbits.filter(o => o.status === 'active');
  }

  getById(id: string): Orbit | undefined {
    return this.orbits.find(o => o.id === id);
  }

  getByThreadId(threadId: string): Orbit | undefined {
    return this.orbits.find(o => o.threadId === threadId);
  }

  /** Returns set of thread IDs that have active orbits */
  getActiveThreadIds(): Set<string> {
    return new Set(
      this.orbits
        .filter(o => o.status === 'active' && o.threadId)
        .map(o => o.threadId!)
    );
  }

  /** Get all findings across all orbits, sorted newest first */
  getAllFindings(): (OrbitFinding & { orbitId: string; orbitTitle: string; threadId?: string })[] {
    return this.orbits
      .flatMap(orbit =>
        orbit.findings.map(f => ({
          ...f,
          orbitId: orbit.id,
          orbitTitle: orbit.title,
          threadId: orbit.threadId,
        }))
      )
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  create(params: {
    title: string;
    goal: string;
    priority?: OrbitPriority;
    intervalMinutes?: number;
    category?: string;
    threadId?: string;
  }): Orbit {
    const now = new Date().toISOString();
    const orbit: Orbit = {
      id: generateId(),
      title: params.title,
      goal: params.goal,
      status: 'active',
      priority: params.priority || 'medium',
      createdAt: now,
      updatedAt: now,
      intervalMinutes: params.intervalMinutes || 60,
      findings: [],
      checksPerformed: 0,
      threadId: params.threadId,
      category: params.category,
    };
    this.orbits.unshift(orbit);
    this.save();
    return orbit;
  }

  update(id: string, partial: Partial<Orbit>): Orbit | null {
    const idx = this.orbits.findIndex(o => o.id === id);
    if (idx === -1) return null;
    this.orbits[idx] = {
      ...this.orbits[idx],
      ...partial,
      updatedAt: new Date().toISOString(),
    };
    this.save();
    return this.orbits[idx];
  }

  delete(id: string): boolean {
    const len = this.orbits.length;
    this.orbits = this.orbits.filter(o => o.id !== id);
    if (this.orbits.length !== len) {
      this.save();
      return true;
    }
    return false;
  }

  pause(id: string): Orbit | null {
    return this.update(id, { status: 'paused' });
  }

  resume(id: string): Orbit | null {
    return this.update(id, { status: 'active' });
  }

  complete(id: string): Orbit | null {
    return this.update(id, { status: 'completed' });
  }

  // ── Findings ─────────────────────────────────────────────────

  addFinding(orbitId: string, content: string, meta?: Record<string, any>): OrbitFinding | null {
    const orbit = this.getById(orbitId);
    if (!orbit) return null;

    const finding: OrbitFinding = {
      id: generateFindingId(),
      timestamp: Date.now(),
      content,
      read: false,
      meta,
    };

    orbit.findings.unshift(finding);
    orbit.checksPerformed += 1;
    orbit.updatedAt = new Date().toISOString();
    this.save();

    // Update unread count
    this.persistUnreadCount();

    // Notify finding listeners (for live toast)
    this.notifyFinding(finding, orbit);

    return finding;
  }

  markFindingRead(orbitId: string, findingId: string): void {
    const orbit = this.getById(orbitId);
    if (!orbit) return;
    const finding = orbit.findings.find(f => f.id === findingId);
    if (finding) {
      finding.read = true;
      this.save();
      this.persistUnreadCount();
    }
  }

  markAllRead(orbitId?: string): void {
    const targets = orbitId ? this.orbits.filter(o => o.id === orbitId) : this.orbits;
    targets.forEach(orbit => {
      orbit.findings.forEach(f => { f.read = true; });
    });
    this.save();
    this.persistUnreadCount();
  }

  // ── Unread Count ─────────────────────────────────────────────

  getUnreadCount(): number {
    return this.orbits.reduce(
      (sum, orbit) => sum + orbit.findings.filter(f => !f.read).length,
      0
    );
  }

  private persistUnreadCount(): void {
    try {
      localStorage.setItem(UNREAD_KEY, String(this.getUnreadCount()));
    } catch {}
  }

  // ── Scheduling helpers ───────────────────────────────────────

  getOrbitsDueForCheck(): Orbit[] {
    const now = Date.now();
    return this.getActive().filter(orbit => {
      if (!orbit.nextCheckAt) return true; // never checked
      return new Date(orbit.nextCheckAt).getTime() <= now;
    });
  }

  setNextCheck(id: string, nextCheckAt: string): void {
    this.update(id, { nextCheckAt });
  }
}

export const orbitService = new OrbitServiceClass();
