/**
 * ChatStorage — persists chat threads to localStorage
 * Thread metadata is stored separately from messages for fast sidebar loading.
 */

export interface ChatThreadMeta {
  id: string;
  title: string;
  preview: string;
  createdAt: number;
  updatedAt: number;
}

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  isBrowserFeedback?: boolean;
  sources?: { title: string; url: string; snippet: string }[];
  responseTimeMs?: number;
  followUps?: string[];
  generatedImage?: string;
}

const THREADS_KEY = 'orbit_chat_threads';
const threadKey = (id: string) => `orbit_thread_${id}`;

// --- Thread Metadata ---

export function loadThreadsMeta(): ChatThreadMeta[] {
  try {
    const raw = localStorage.getItem(THREADS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatThreadMeta[];
    // Sort newest first
    return parsed.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function saveThreadsMeta(threads: ChatThreadMeta[]): void {
  try {
    localStorage.setItem(THREADS_KEY, JSON.stringify(threads));
  } catch (e) {
    console.warn('[ChatStorage] Failed to save thread metadata:', e);
  }
}

// --- Thread Messages ---

export function loadThreadMessages(threadId: string): StoredMessage[] {
  try {
    const raw = localStorage.getItem(threadKey(threadId));
    if (!raw) return [];
    return JSON.parse(raw) as StoredMessage[];
  } catch {
    return [];
  }
}

export function saveThreadMessages(threadId: string, messages: StoredMessage[]): void {
  try {
    // Only store user + assistant messages (skip system/feedback)
    const filtered = messages.filter(
      m => (m.role === 'user' || m.role === 'assistant') && !m.isBrowserFeedback && m.content?.trim()
    );
    localStorage.setItem(threadKey(threadId), JSON.stringify(filtered));
  } catch (e) {
    console.warn('[ChatStorage] Failed to save thread messages:', e);
  }
}

export function deleteThread(threadId: string): void {
  try {
    localStorage.removeItem(threadKey(threadId));
    const threads = loadThreadsMeta().filter(t => t.id !== threadId);
    saveThreadsMeta(threads);
  } catch (e) {
    console.warn('[ChatStorage] Failed to delete thread:', e);
  }
}

// --- Helpers ---

export function createThreadId(): string {
  return `thread_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function deriveTitle(firstUserMessage: string): string {
  const cleaned = firstUserMessage.trim().replace(/\s+/g, ' ');
  return cleaned.length > 45 ? cleaned.slice(0, 45).trimEnd() + '…' : cleaned;
}

export function derivePreview(lastMessage: string): string {
  const cleaned = lastMessage.trim().replace(/\s+/g, ' ');
  return cleaned.length > 60 ? cleaned.slice(0, 60).trimEnd() + '…' : cleaned;
}

// --- Export for JUMARI 2.0 Training ---

export interface ExportedThread {
  id: string;
  title: string;
  messages: { role: string; content: string }[];
}

export function exportConversationsForTraining(): ExportedThread[] {
  const threads = loadThreadsMeta();
  return threads
    .map(t => {
      const msgs = loadThreadMessages(t.id);
      if (msgs.length === 0) return null;
      return {
        id: t.id,
        title: t.title,
        messages: msgs.map(m => ({ role: m.role, content: m.content })),
      };
    })
    .filter((t): t is ExportedThread => t !== null);
}

// Upsert a thread's metadata
export function upsertThreadMeta(
  threadId: string,
  title: string,
  preview: string,
  createdAt: number
): void {
  const threads = loadThreadsMeta();
  const existing = threads.find(t => t.id === threadId);
  const now = Date.now();

  if (existing) {
    existing.title = title;
    existing.preview = preview;
    existing.updatedAt = now;
    saveThreadsMeta(threads);
  } else {
    threads.unshift({
      id: threadId,
      title,
      preview,
      createdAt,
      updatedAt: now,
    });
    saveThreadsMeta(threads);
  }
}
