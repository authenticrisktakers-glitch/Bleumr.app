/**
 * BrainMemory — Persistent learning memory for JUMARI agents
 *
 * Agents can teach themselves by storing knowledge learned from:
 * - Errors they've seen and how they were fixed
 * - Libraries/CDN resources that work or don't work in the preview
 * - User preferences and patterns
 * - Successful techniques and code patterns
 *
 * This is a KNOWLEDGE store, not a CODE store — agents rewrite
 * their own "brain" (knowledge), never their own source code.
 *
 * Persisted in localStorage, shared across all agents.
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export interface MemoryEntry {
  id: string;
  category: 'error_fix' | 'library' | 'pattern' | 'preference' | 'tip' | 'build_command' | 'project_context';
  content: string;
  source: 'web_designer' | 'chat_agent' | 'browser_agent' | 'code_bleu';
  confidence: number; // 0-1 — how confident we are this is useful
  uses: number;       // how many times this memory was surfaced
  createdAt: number;
  lastUsedAt: number;
}

export interface CDNLibrary {
  name: string;
  description: string;
  cssUrl?: string;
  jsUrl?: string;
  initCode?: string;  // e.g. "AOS.init()" — but we handle this safely
  tags: string[];     // e.g. ['animation', 'scroll', 'carousel']
  verified: boolean;  // tested and confirmed working in preview
}

// ─── Storage Keys ──────────────────────────────────────────────────────────

const MEMORY_KEY = 'bleumr_brain_memory';
const LIBRARY_KEY = 'bleumr_cdn_libraries';

// ─── Built-in CDN library catalog ──────────────────────────────────────────

const DEFAULT_LIBRARIES: CDNLibrary[] = [
  {
    name: 'Tailwind CSS',
    description: 'Utility-first CSS framework for rapid UI development',
    jsUrl: 'https://cdn.tailwindcss.com',
    tags: ['css', 'utility', 'responsive', 'layout'],
    verified: true,
  },
  {
    name: 'Font Awesome',
    description: 'Icon library with 2000+ free icons',
    cssUrl: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
    tags: ['icons', 'ui'],
    verified: true,
  },
  {
    name: 'AOS (Animate on Scroll)',
    description: 'Scroll-triggered animations. DO NOT call AOS.init() — it is auto-initialized.',
    cssUrl: 'https://unpkg.com/aos@2.3.4/dist/aos.css',
    jsUrl: 'https://unpkg.com/aos@2.3.4/dist/aos.js',
    initCode: '/* AUTO-INITIALIZED — do not call AOS.init() manually */',
    tags: ['animation', 'scroll'],
    verified: true,
  },
  {
    name: 'Animate.css',
    description: 'CSS animation library — add class "animate__animated animate__fadeIn" etc.',
    cssUrl: 'https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css',
    tags: ['animation', 'css'],
    verified: true,
  },
  {
    name: 'Google Fonts (Inter)',
    description: 'Professional sans-serif font family',
    cssUrl: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap',
    tags: ['font', 'typography'],
    verified: true,
  },
  {
    name: 'Swiper',
    description: 'Modern slider/carousel with touch support',
    cssUrl: 'https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css',
    jsUrl: 'https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js',
    initCode: 'new Swiper(".swiper", { loop: true, pagination: { el: ".swiper-pagination" }, navigation: { nextEl: ".swiper-button-next", prevEl: ".swiper-button-prev" } });',
    tags: ['carousel', 'slider', 'touch', 'gallery'],
    verified: true,
  },
  {
    name: 'GSAP',
    description: 'Professional animation library for complex timeline animations',
    jsUrl: 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js',
    tags: ['animation', 'timeline', 'motion'],
    verified: true,
  },
  {
    name: 'Typed.js',
    description: 'Typing animation — simulates typing text character by character',
    jsUrl: 'https://unpkg.com/typed.js@2.1.0/dist/typed.umd.js',
    initCode: 'new Typed("#typed", { strings: ["Hello", "World"], typeSpeed: 50, loop: true });',
    tags: ['animation', 'text', 'typing'],
    verified: true,
  },
  {
    name: 'Particles.js',
    description: 'Lightweight particle background animations',
    jsUrl: 'https://cdn.jsdelivr.net/npm/particles.js@2.0.0/particles.min.js',
    tags: ['particles', 'background', 'animation'],
    verified: true,
  },
  {
    name: 'Lottie Web',
    description: 'Render After Effects animations natively on web',
    jsUrl: 'https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/lottie.min.js',
    tags: ['animation', 'lottie', 'motion'],
    verified: true,
  },
  {
    name: 'Chart.js',
    description: 'Simple yet flexible JavaScript charting for data visualization',
    jsUrl: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
    tags: ['chart', 'graph', 'data', 'visualization'],
    verified: true,
  },
  {
    name: 'Three.js',
    description: '3D graphics library for WebGL',
    jsUrl: 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js',
    tags: ['3d', 'webgl', 'graphics'],
    verified: true,
  },
  {
    name: 'Leaflet',
    description: 'Interactive maps library',
    cssUrl: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    jsUrl: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    tags: ['map', 'geography', 'location'],
    verified: true,
  },
  {
    name: 'Prism.js',
    description: 'Lightweight syntax highlighting for code blocks',
    cssUrl: 'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism-tomorrow.min.css',
    jsUrl: 'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/prism.min.js',
    tags: ['code', 'syntax', 'highlighting'],
    verified: true,
  },
  {
    name: 'Alpine.js',
    description: 'Lightweight JS framework for interactivity without build steps',
    jsUrl: 'https://cdn.jsdelivr.net/npm/alpinejs@3.14.0/dist/cdn.min.js',
    tags: ['framework', 'interactive', 'reactive'],
    verified: true,
  },
];

// ─── BrainMemory API ──────────────────────────────────────────────────────

export const BrainMemory = {

  // ── Memory CRUD ─────────────────────────────────────────────────────────

  getAll(): MemoryEntry[] {
    try {
      const raw = localStorage.getItem(MEMORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  },

  save(entries: MemoryEntry[]) {
    try {
      // Cap at 200 entries — trim lowest confidence oldest entries
      const sorted = entries.sort((a, b) => {
        const scoreA = a.confidence * 0.6 + (a.uses / 10) * 0.4;
        const scoreB = b.confidence * 0.6 + (b.uses / 10) * 0.4;
        return scoreB - scoreA;
      });
      localStorage.setItem(MEMORY_KEY, JSON.stringify(sorted.slice(0, 200)));
    } catch {}
  },

  /**
   * Learn something new — add a memory entry
   */
  learn(entry: Omit<MemoryEntry, 'id' | 'uses' | 'createdAt' | 'lastUsedAt'>) {
    const entries = BrainMemory.getAll();

    // Check for duplicates (similar content)
    const existing = entries.find(e =>
      e.category === entry.category &&
      e.content.toLowerCase().includes(entry.content.toLowerCase().slice(0, 50))
    );
    if (existing) {
      existing.confidence = Math.min(1, existing.confidence + 0.1);
      existing.lastUsedAt = Date.now();
      existing.uses += 1;
      BrainMemory.save(entries);
      return;
    }

    entries.push({
      ...entry,
      id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      uses: 0,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });
    BrainMemory.save(entries);
  },

  /**
   * Recall relevant memories for a given context/query
   */
  recall(query: string, category?: MemoryEntry['category'], limit = 10): MemoryEntry[] {
    const entries = BrainMemory.getAll();
    const words = query.toLowerCase().split(/\s+/);

    return entries
      .filter(e => !category || e.category === category)
      .map(e => {
        const text = e.content.toLowerCase();
        const relevance = words.filter(w => text.includes(w)).length / Math.max(words.length, 1);
        return { entry: e, score: relevance * e.confidence };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(r => {
        // Mark as used
        r.entry.uses += 1;
        r.entry.lastUsedAt = Date.now();
        return r.entry;
      });
  },

  /**
   * Learn from an error and its fix
   */
  learnFromError(error: string, fix: string, source: MemoryEntry['source']) {
    BrainMemory.learn({
      category: 'error_fix',
      content: `ERROR: ${error.slice(0, 200)}\nFIX: ${fix.slice(0, 300)}`,
      source,
      confidence: 0.7,
    });
  },

  /**
   * Learn a new pattern or technique that worked well
   */
  learnPattern(pattern: string, source: MemoryEntry['source']) {
    BrainMemory.learn({
      category: 'pattern',
      content: pattern,
      source,
      confidence: 0.6,
    });
  },

  /**
   * Learn a user preference
   */
  learnPreference(pref: string, source: MemoryEntry['source']) {
    BrainMemory.learn({
      category: 'preference',
      content: pref,
      source,
      confidence: 0.8,
    });
  },

  /**
   * Format memories as context for the system prompt
   */
  toPromptContext(query: string, source: MemoryEntry['source']): string {
    const memories = BrainMemory.recall(query, undefined, 8);
    const sourceMemories = memories.filter(m => m.source === source || m.category === 'error_fix');
    if (sourceMemories.length === 0) return '';

    const lines = sourceMemories.map(m => {
      const label = m.category === 'error_fix' ? '🔧' : m.category === 'pattern' ? '💡' : m.category === 'preference' ? '👤' : '📌';
      return `${label} ${m.content}`;
    });

    return `\n\n## LEARNED KNOWLEDGE (from past interactions)\n${lines.join('\n')}`;
  },

  // ── CDN Library Catalog ─────────────────────────────────────────────────

  getLibraries(): CDNLibrary[] {
    try {
      const raw = localStorage.getItem(LIBRARY_KEY);
      const custom: CDNLibrary[] = raw ? JSON.parse(raw) : [];
      // Merge with defaults (custom overrides defaults by name)
      const merged = [...DEFAULT_LIBRARIES];
      for (const lib of custom) {
        const idx = merged.findIndex(m => m.name.toLowerCase() === lib.name.toLowerCase());
        if (idx >= 0) merged[idx] = lib;
        else merged.push(lib);
      }
      return merged;
    } catch { return DEFAULT_LIBRARIES; }
  },

  saveLibrary(lib: CDNLibrary) {
    try {
      const raw = localStorage.getItem(LIBRARY_KEY);
      const custom: CDNLibrary[] = raw ? JSON.parse(raw) : [];
      const idx = custom.findIndex(l => l.name.toLowerCase() === lib.name.toLowerCase());
      if (idx >= 0) custom[idx] = lib;
      else custom.push(lib);
      localStorage.setItem(LIBRARY_KEY, JSON.stringify(custom));
    } catch {}
  },

  /**
   * Find libraries matching a need (e.g. "carousel", "chart", "animation")
   */
  findLibraries(need: string): CDNLibrary[] {
    const libs = BrainMemory.getLibraries();
    const words = need.toLowerCase().split(/\s+/);
    return libs
      .map(lib => {
        const text = `${lib.name} ${lib.description} ${lib.tags.join(' ')}`.toLowerCase();
        const score = words.filter(w => text.includes(w)).length;
        return { lib, score };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(r => r.lib);
  },

  /**
   * Format library catalog as context for system prompt
   */
  librariesToPrompt(query: string): string {
    const relevant = BrainMemory.findLibraries(query);
    if (relevant.length === 0) return '';

    const lines = relevant.slice(0, 6).map(lib => {
      const parts = [];
      if (lib.cssUrl) parts.push(`CSS: ${lib.cssUrl}`);
      if (lib.jsUrl) parts.push(`JS: ${lib.jsUrl}`);
      if (lib.initCode) parts.push(`Init: ${lib.initCode}`);
      return `- **${lib.name}**: ${lib.description}\n  ${parts.join('\n  ')}`;
    });

    return `\n\n## ADDITIONAL LIBRARIES AVAILABLE (use if the site needs them)\n${lines.join('\n')}`;
  },

  /**
   * Clear all learned memories (keep libraries)
   */
  clearMemories() {
    localStorage.removeItem(MEMORY_KEY);
  },

  /**
   * Clear memories by category (e.g. only error_fix, only pattern)
   * Returns count of removed entries.
   */
  clearByCategory(category: MemoryEntry['category']): number {
    const entries = BrainMemory.getAll();
    const kept = entries.filter(e => e.category !== category);
    const removed = entries.length - kept.length;
    if (removed > 0) BrainMemory.save(kept);
    return removed;
  },

  /**
   * Clear memories by source agent (e.g. only chat_agent memories)
   * Returns count of removed entries.
   */
  clearBySource(source: MemoryEntry['source']): number {
    const entries = BrainMemory.getAll();
    const kept = entries.filter(e => e.source !== source);
    const removed = entries.length - kept.length;
    if (removed > 0) BrainMemory.save(kept);
    return removed;
  },

  /**
   * Clear memories older than maxAgeMs (based on lastUsedAt — stale memories go first)
   * Returns count of removed entries.
   */
  clearByAge(maxAgeMs: number): number {
    const cutoff = Date.now() - maxAgeMs;
    const entries = BrainMemory.getAll();
    const kept = entries.filter(e => e.lastUsedAt > cutoff);
    const removed = entries.length - kept.length;
    if (removed > 0) BrainMemory.save(kept);
    return removed;
  },

  /**
   * Get memory stats for admin/debug
   */
  getStats(): {
    totalEntries: number;
    byCategory: Record<string, number>;
    bySource: Record<string, number>;
    oldestEntry: number | null;
    newestEntry: number | null;
    avgConfidence: number;
    totalUses: number;
    storageSizeBytes: number;
  } {
    const entries = BrainMemory.getAll();
    const byCategory: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    let totalConf = 0;
    let totalUses = 0;
    let oldest: number | null = null;
    let newest: number | null = null;

    for (const e of entries) {
      byCategory[e.category] = (byCategory[e.category] || 0) + 1;
      bySource[e.source] = (bySource[e.source] || 0) + 1;
      totalConf += e.confidence;
      totalUses += e.uses;
      if (oldest === null || e.createdAt < oldest) oldest = e.createdAt;
      if (newest === null || e.createdAt > newest) newest = e.createdAt;
    }

    const raw = localStorage.getItem(MEMORY_KEY) || '';
    return {
      totalEntries: entries.length,
      byCategory,
      bySource,
      oldestEntry: oldest,
      newestEntry: newest,
      avgConfidence: entries.length ? totalConf / entries.length : 0,
      totalUses,
      storageSizeBytes: new Blob([raw]).size,
    };
  },

  /**
   * Clear all custom libraries (keep defaults)
   */
  clearLibraries() {
    localStorage.removeItem(LIBRARY_KEY);
  },
};
