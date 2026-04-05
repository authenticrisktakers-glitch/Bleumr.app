/**
 * CodeSessionStorage — Persist Code Bleu sessions to localStorage
 *
 * Follows the same pattern as ChatStorage.ts.
 * Sessions survive page reloads and app restarts.
 */

const META_KEY = 'codebleu_sessions_meta';
const SESSION_PREFIX = 'codebleu_session_';
const MAX_SESSIONS = 20;
const MAX_MESSAGES_PER_SESSION = 50;

export interface CodeSessionMeta {
  id: string;
  name: string;
  projectName: string | null;
  projectPath: string | null;
  messageCount: number;
  timestamp: number;
}

interface StoredSession {
  id: string;
  name: string;
  projectName: string | null;
  projectPath: string | null;
  projectFiles: { path: string; name: string }[];
  messages: any[];  // AgentMessage[] — stored as any to avoid circular import
  timestamp: number;
}

function getMetaList(): CodeSessionMeta[] {
  try {
    const raw = localStorage.getItem(META_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function setMetaList(metas: CodeSessionMeta[]): void {
  localStorage.setItem(META_KEY, JSON.stringify(metas));
}

/**
 * Save a coding session to localStorage.
 * Only stores user + assistant messages (skips activity/subagent).
 */
export function saveCodeSession(session: {
  id: string;
  name: string;
  projectName: string | null;
  projectPath: string | null;
  projectFiles: { path: string; name: string }[];
  messages: any[];
  timestamp: number;
}): void {
  // Filter to only user + assistant messages, cap at limit
  const filteredMessages = session.messages
    .filter((m: any) => m.role === 'user' || m.role === 'assistant')
    .slice(-MAX_MESSAGES_PER_SESSION);

  const stored: StoredSession = {
    id: session.id,
    name: session.name,
    projectName: session.projectName,
    projectPath: session.projectPath,
    projectFiles: session.projectFiles,
    messages: filteredMessages,
    timestamp: session.timestamp,
  };

  try {
    localStorage.setItem(SESSION_PREFIX + session.id, JSON.stringify(stored));
  } catch (err) {
    // QuotaExceededError — storage full. Try to free space by removing oldest session.
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      const metas = getMetaList();
      if (metas.length > 0) {
        const oldest = metas.pop();
        if (oldest) localStorage.removeItem(SESSION_PREFIX + oldest.id);
        setMetaList(metas);
        try { localStorage.setItem(SESSION_PREFIX + session.id, JSON.stringify(stored)); } catch { return; }
      } else { return; }
    } else { return; }
  }

  // Update meta list
  const metas = getMetaList();
  const existing = metas.findIndex(m => m.id === session.id);
  const meta: CodeSessionMeta = {
    id: session.id,
    name: session.name,
    projectName: session.projectName,
    projectPath: session.projectPath,
    messageCount: filteredMessages.length,
    timestamp: session.timestamp,
  };

  if (existing >= 0) {
    metas[existing] = meta;
  } else {
    metas.unshift(meta);
  }

  // Enforce cap — remove oldest sessions beyond limit
  while (metas.length > MAX_SESSIONS) {
    const removed = metas.pop();
    if (removed) localStorage.removeItem(SESSION_PREFIX + removed.id);
  }

  try { setMetaList(metas); } catch { /* storage full — meta not updated but session was saved */ }
}

/**
 * Load lightweight session list (for sidebar/menu).
 */
export function loadCodeSessionsMeta(): CodeSessionMeta[] {
  return getMetaList().sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Load a full session with messages.
 */
export function loadCodeSession(id: string): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_PREFIX + id);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/**
 * Delete a session from storage.
 */
export function deleteCodeSession(id: string): void {
  localStorage.removeItem(SESSION_PREFIX + id);
  const metas = getMetaList().filter(m => m.id !== id);
  setMetaList(metas);
}
