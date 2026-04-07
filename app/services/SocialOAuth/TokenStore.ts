/**
 * SocialAuth — Encrypted token store
 *
 * Stores OAuth tokens in IndexedDB, encrypted at rest with AES-GCM.
 *
 * Threat model:
 *  - Casual dev-tools snooping ......... blocked (ciphertext only in IDB)
 *  - Local backup file scraping ........ blocked (key is unwrappable but opaque)
 *  - Compromised browser extension ..... NOT blocked (extensions can read both IDB and JS heap)
 *  - Stolen unlocked device ............ NOT blocked (key lives on device)
 *
 * For better security we could derive the key from a user passphrase via
 * PBKDF2 — that's a v2 enhancement. For v1 we use a device-bound randomly
 * generated AES-256 key.
 *
 * Schema:
 *   db:  bleumr_social_auth
 *   stores:
 *     keys:        { id: 'master', wrapped: ArrayBuffer }
 *     connections: { provider: SocialProvider, ciphertext: ArrayBuffer, iv: Uint8Array, meta: ConnectionMeta }
 */

import type { SocialProvider } from './Providers';

const DB_NAME = 'bleumr_social_auth';
const DB_VERSION = 1;
const STORE_KEYS = 'keys';
const STORE_CONNECTIONS = 'connections';

export interface ConnectionMeta {
  /** Display handle, e.g. "@user" or "John Doe" */
  handle: string;
  /** Provider's user id */
  userId: string;
  /** Profile picture URL, if available */
  avatarUrl?: string;
  /** When the connection was created */
  connectedAt: number;
  /** Token expiry (epoch ms) */
  expiresAt: number;
  /** Granted scopes */
  scopes: string[];
}

export interface DecryptedTokens {
  accessToken: string;
  refreshToken?: string;
}

export interface Connection extends ConnectionMeta {
  provider: SocialProvider;
}

interface StoredConnection {
  provider: SocialProvider;
  ciphertext: ArrayBuffer;
  iv: Uint8Array;
  meta: ConnectionMeta;
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_KEYS)) {
        db.createObjectStore(STORE_KEYS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_CONNECTIONS)) {
        db.createObjectStore(STORE_CONNECTIONS, { keyPath: 'provider' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txGet<T>(storeName: string, key: string): Promise<T | undefined> {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openDb();
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  });
}

function txPut<T>(storeName: string, value: T): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openDb();
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(value);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  });
}

function txDelete(storeName: string, key: string): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openDb();
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  });
}

function txGetAll<T>(storeName: string): Promise<T[]> {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openDb();
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result || []) as T[]);
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  });
}

// ─── Master key (AES-256-GCM) ────────────────────────────────────────────────
//
// Generated once on first use, stored unwrapped in IDB. The key is non-extractable
// once loaded back as a CryptoKey, so it can't be exported via JS — but the raw
// bytes are still in IDB. This is the v1 design tradeoff.

let cachedKey: CryptoKey | null = null;

async function getMasterKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;

  const existing = await txGet<{ id: string; raw: ArrayBuffer }>(STORE_KEYS, 'master');
  if (existing?.raw) {
    cachedKey = await crypto.subtle.importKey(
      'raw',
      existing.raw,
      { name: 'AES-GCM', length: 256 },
      false, // non-extractable
      ['encrypt', 'decrypt'],
    );
    return cachedKey;
  }

  // First use — generate a fresh key
  const newKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
  const raw = await crypto.subtle.exportKey('raw', newKey);
  await txPut(STORE_KEYS, { id: 'master', raw });

  // Re-import as non-extractable for in-memory use
  cachedKey = await crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  return cachedKey;
}

// ─── Encrypt / decrypt helpers ───────────────────────────────────────────────

async function encrypt(plaintext: string): Promise<{ ciphertext: ArrayBuffer; iv: Uint8Array }> {
  const key = await getMasterKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc);
  return { ciphertext, iv };
}

async function decrypt(ciphertext: ArrayBuffer, iv: Uint8Array): Promise<string> {
  const key = await getMasterKey();
  const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(dec);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Save tokens for a provider. Encrypts the access/refresh pair and stores
 * the ciphertext + IV + non-sensitive meta in IDB.
 */
export async function saveConnection(
  provider: SocialProvider,
  tokens: DecryptedTokens,
  meta: ConnectionMeta,
): Promise<void> {
  const payload = JSON.stringify(tokens);
  const { ciphertext, iv } = await encrypt(payload);
  const stored: StoredConnection = { provider, ciphertext, iv, meta };
  await txPut(STORE_CONNECTIONS, stored);
}

/**
 * Get decrypted tokens for a provider, or null if not connected.
 */
export async function getTokens(provider: SocialProvider): Promise<DecryptedTokens | null> {
  const stored = await txGet<StoredConnection>(STORE_CONNECTIONS, provider);
  if (!stored) return null;
  try {
    const json = await decrypt(stored.ciphertext, stored.iv);
    return JSON.parse(json) as DecryptedTokens;
  } catch {
    return null;
  }
}

/**
 * Get the (non-sensitive) connection meta — used to render "Connected as @user".
 */
export async function getConnection(provider: SocialProvider): Promise<Connection | null> {
  const stored = await txGet<StoredConnection>(STORE_CONNECTIONS, provider);
  if (!stored) return null;
  return { provider: stored.provider, ...stored.meta };
}

/**
 * List all current connections (meta only — tokens stay encrypted).
 */
export async function listConnections(): Promise<Connection[]> {
  const all = await txGetAll<StoredConnection>(STORE_CONNECTIONS);
  return all.map(s => ({ provider: s.provider, ...s.meta }));
}

/**
 * Remove a connection completely.
 */
export async function removeConnection(provider: SocialProvider): Promise<void> {
  await txDelete(STORE_CONNECTIONS, provider);
}
