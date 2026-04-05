// ─── Code Bleu File System Helpers ───────────────────────────────────────────

import { IGNORE_DIRS } from './constants';

/** Recursively read directory via FileSystem Access API (browser) */
export async function readDirRecursive(
  dirHandle: FileSystemDirectoryHandle,
  basePath = '',
  depth = 0,
  maxDepth = 4
): Promise<{ path: string; name: string }[]> {
  if (depth > maxDepth) return [];
  const files: { path: string; name: string }[] = [];
  for await (const [name, handle] of (dirHandle as any).entries()) {
    const fullPath = basePath ? `${basePath}/${name}` : name;
    if (handle.kind === 'directory') {
      if (IGNORE_DIRS.includes(name)) continue;
      files.push(...await readDirRecursive(handle, fullPath, depth + 1, maxDepth));
    } else {
      files.push({ path: fullPath, name });
    }
  }
  return files;
}

/** Read a single file via FileSystem Access API (browser) */
export async function readFileFromHandle(
  dirHandle: FileSystemDirectoryHandle,
  path: string
): Promise<string> {
  const parts = path.split('/');
  let current: FileSystemDirectoryHandle = dirHandle;
  for (let i = 0; i < parts.length - 1; i++) {
    current = await current.getDirectoryHandle(parts[i]);
  }
  const fileHandle = await current.getFileHandle(parts[parts.length - 1]);
  const file = await fileHandle.getFile();
  return file.text();
}

/** Write a file via FileSystem Access API (browser) */
export async function writeFileFromHandle(
  dirHandle: FileSystemDirectoryHandle,
  path: string,
  content: string
): Promise<boolean> {
  try {
    const parts = path.split('/');
    let current: FileSystemDirectoryHandle = dirHandle;
    for (let i = 0; i < parts.length - 1; i++) {
      current = await current.getDirectoryHandle(parts[i], { create: true });
    }
    const fileHandle = await current.getFileHandle(parts[parts.length - 1], { create: true });
    const writable = await (fileHandle as any).createWritable();
    await writable.write(content);
    await writable.close();
    return true;
  } catch {
    return false;
  }
}

// ── Electron IPC helpers ──

export async function listDirElectron(dirPath: string): Promise<{ path: string; name: string; isDir: boolean }[]> {
  const orbit = (window as any).orbit;
  if (!orbit?.listDir) return [];
  try { return await orbit.listDir(dirPath); } catch { return []; }
}

export async function readFileElectron(filePath: string): Promise<string> {
  const orbit = (window as any).orbit;
  if (!orbit?.readFile) return '';
  try { return await orbit.readFile(filePath); } catch { return ''; }
}

export async function writeFileElectron(filePath: string, content: string): Promise<boolean> {
  const orbit = (window as any).orbit;
  if (!orbit?.writeFile) return false;
  try {
    const result = await orbit.writeFile(filePath, content);
    return result?.success ?? false;
  } catch { return false; }
}

/** Recursively read directory via Electron IPC */
export async function readDirElectronRecursive(
  basePath: string,
  depth = 0,
  maxDepth = 4
): Promise<{ path: string; name: string }[]> {
  if (depth > maxDepth) return [];
  const entries = await listDirElectron(basePath);
  const files: { path: string; name: string }[] = [];
  for (const entry of entries) {
    if (entry.isDir) {
      if (IGNORE_DIRS.includes(entry.name)) continue;
      files.push(...await readDirElectronRecursive(entry.path, depth + 1, maxDepth));
    } else {
      files.push({ path: entry.path, name: entry.name });
    }
  }
  return files;
}
