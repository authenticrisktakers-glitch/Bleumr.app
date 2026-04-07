/**
 * CheckpointService — Per-prompt rewind for Code Bleu
 *
 * Mirrors Claude Code's checkpointing model: every user message creates
 * a snapshot of the current state (messages + edited file contents). The
 * user can later "rewind" to any checkpoint, which restores the conversation
 * AND the files Code Bleu had touched at that point.
 *
 * Storage layout in localStorage:
 *   codebleu_checkpoints_{sessionId}_meta  → CheckpointMeta[]
 *   codebleu_checkpoint_{sessionId}_{checkpointId}  → CheckpointData
 *
 * Caps: MAX_CHECKPOINTS_PER_SESSION (oldest pruned first), each file content
 * truncated to MAX_FILE_CONTENT to keep localStorage from blowing up.
 */

const META_PREFIX = 'codebleu_checkpoints_';
const DATA_PREFIX = 'codebleu_checkpoint_';
const MAX_CHECKPOINTS_PER_SESSION = 20;
const MAX_FILE_CONTENT = 50_000; // chars per file
const MAX_FILES_PER_CHECKPOINT = 60;

export interface CheckpointMeta {
  id: string;
  sessionId: string;
  prompt: string;        // the user message that triggered this checkpoint
  timestamp: number;
  messageCount: number;
  fileCount: number;
}

export interface CheckpointFile {
  path: string;
  content: string;
}

export interface CheckpointData {
  id: string;
  sessionId: string;
  prompt: string;
  timestamp: number;
  // Only persistable message fields — strip activity/streaming/etc.
  messages: { id: string; role: string; content: string; timestamp?: number }[];
  // Files Code Bleu had touched at the time of the checkpoint (in-memory writtenFiles map)
  files: CheckpointFile[];
  // Project metadata
  projectPath: string | null;
  projectName: string | null;
}

function metaKey(sessionId: string): string {
  return `${META_PREFIX}${sessionId}_meta`;
}

function dataKey(sessionId: string, checkpointId: string): string {
  return `${DATA_PREFIX}${sessionId}_${checkpointId}`;
}

/**
 * Generate a short, sortable checkpoint id.
 */
function newCheckpointId(): string {
  return `cp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Load all checkpoint metadata for a session, newest first.
 */
export function loadCheckpoints(sessionId: string): CheckpointMeta[] {
  if (!sessionId) return [];
  try {
    const raw = localStorage.getItem(metaKey(sessionId));
    if (!raw) return [];
    const list = JSON.parse(raw) as CheckpointMeta[];
    return list.sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return [];
  }
}

/**
 * Load a single checkpoint's full data.
 */
export function loadCheckpoint(sessionId: string, checkpointId: string): CheckpointData | null {
  try {
    const raw = localStorage.getItem(dataKey(sessionId, checkpointId));
    if (!raw) return null;
    return JSON.parse(raw) as CheckpointData;
  } catch {
    return null;
  }
}

/**
 * Create a new checkpoint capturing the current session state.
 *
 * @param sessionId    Active code session id
 * @param prompt       The user message that's about to run
 * @param messages     Current message list (will be filtered to user/assistant only)
 * @param writtenFiles The in-memory map of files Code Bleu has edited so far
 * @param projectPath  Active project path
 * @param projectName  Active project name
 */
export function createCheckpoint(
  sessionId: string,
  prompt: string,
  messages: { id: string; role: string; content: string; timestamp?: number }[],
  writtenFiles: { path: string; content: string }[],
  projectPath: string | null,
  projectName: string | null,
): CheckpointMeta | null {
  if (!sessionId) return null;

  const id = newCheckpointId();

  // Strip non-persistable fields, keep user/assistant only
  const cleanMessages = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .filter(m => m.content?.trim())
    .map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
    }));

  // Cap files and content size
  const cleanFiles: CheckpointFile[] = writtenFiles
    .slice(0, MAX_FILES_PER_CHECKPOINT)
    .map(f => ({
      path: f.path,
      content: f.content.slice(0, MAX_FILE_CONTENT),
    }));

  const data: CheckpointData = {
    id,
    sessionId,
    prompt: prompt.slice(0, 500),
    timestamp: Date.now(),
    messages: cleanMessages,
    files: cleanFiles,
    projectPath,
    projectName,
  };

  const meta: CheckpointMeta = {
    id,
    sessionId,
    prompt: prompt.slice(0, 200),
    timestamp: data.timestamp,
    messageCount: cleanMessages.length,
    fileCount: cleanFiles.length,
  };

  try {
    localStorage.setItem(dataKey(sessionId, id), JSON.stringify(data));
  } catch (e) {
    // localStorage full — try pruning oldest 5 and retry once
    pruneOldestCheckpoints(sessionId, 5);
    try {
      localStorage.setItem(dataKey(sessionId, id), JSON.stringify(data));
    } catch {
      console.warn('[CheckpointService] localStorage full — skipping checkpoint');
      return null;
    }
  }

  // Update meta list
  const metas = loadCheckpoints(sessionId);
  metas.unshift(meta);

  // Cap to MAX_CHECKPOINTS_PER_SESSION
  while (metas.length > MAX_CHECKPOINTS_PER_SESSION) {
    const oldest = metas.pop();
    if (oldest) {
      try { localStorage.removeItem(dataKey(sessionId, oldest.id)); } catch {}
    }
  }

  try {
    localStorage.setItem(metaKey(sessionId), JSON.stringify(metas));
  } catch {
    return null;
  }

  return meta;
}

/**
 * Delete a single checkpoint.
 */
export function deleteCheckpoint(sessionId: string, checkpointId: string): void {
  try {
    localStorage.removeItem(dataKey(sessionId, checkpointId));
    const metas = loadCheckpoints(sessionId).filter(m => m.id !== checkpointId);
    localStorage.setItem(metaKey(sessionId), JSON.stringify(metas));
  } catch {}
}

/**
 * Delete all checkpoints for a session.
 */
export function clearCheckpoints(sessionId: string): void {
  try {
    const metas = loadCheckpoints(sessionId);
    for (const m of metas) {
      localStorage.removeItem(dataKey(sessionId, m.id));
    }
    localStorage.removeItem(metaKey(sessionId));
  } catch {}
}

/**
 * Prune the N oldest checkpoints (used when localStorage is full).
 */
function pruneOldestCheckpoints(sessionId: string, n: number): void {
  try {
    const metas = loadCheckpoints(sessionId);
    const toRemove = metas.slice(-n); // already sorted newest-first, so oldest is at the end
    for (const m of toRemove) {
      localStorage.removeItem(dataKey(sessionId, m.id));
    }
    const remaining = metas.slice(0, metas.length - n);
    localStorage.setItem(metaKey(sessionId), JSON.stringify(remaining));
  } catch {}
}

/**
 * Format a checkpoint timestamp as a relative time string.
 * e.g. "2m ago", "1h ago", "Yesterday".
 */
export function formatCheckpointTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const sec = Math.floor(diff / 1000);
  if (sec < 10) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return 'Yesterday';
  if (day < 7) return `${day}d ago`;
  return new Date(timestamp).toLocaleDateString();
}
