import type { LeadPayload, PageviewPayload, QueueKind, QueuedEvent, TrackerPayload } from "./types";
import { warn } from "./logger";

const DB_NAME = "hubi_queue";
const DB_VERSION = 1;
const STORE_NAME = "events";
const MAX_ATTEMPTS = 5;
const BACKOFF_BASE = 1000;
const MAX_QUEUE_SIZE = 200;

const LEADS_PATH = "/leads";
const PAGEVIEW_PATH = "/events/pageview";

// Thrown when the server returns a non-retryable response (4xx client error).
// These are caller problems (bad key, payload, consent) — retrying won't help.
class NonRetryableError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let _apiBase = "";
let _publicKey = "";
let _db: IDBDatabase | null = null;
let _draining = false;

export function initApi(apiBase: string, publicKey: string): void {
  _apiBase = apiBase.replace(/\/+$/, "");
  _publicKey = publicKey;

  openDb().then(drainQueue);
  if (typeof window !== "undefined") {
    window.addEventListener("online", drainQueue);
  }
}

export function pathFor(kind: QueueKind): string {
  return kind === "lead" ? LEADS_PATH : PAGEVIEW_PATH;
}

// ---------------------------------------------------------------------------
// Public send
// ---------------------------------------------------------------------------

export async function sendPageview(payload: PageviewPayload): Promise<boolean> {
  return send("pageview", payload);
}

export async function sendLead(payload: LeadPayload): Promise<boolean> {
  return send("lead", payload);
}

function isOffline(): boolean {
  return typeof navigator !== "undefined" && !navigator.onLine;
}

async function send(kind: QueueKind, payload: TrackerPayload): Promise<boolean> {
  if (isOffline()) {
    await enqueue(kind, payload);
    return false;
  }

  try {
    await post(kind, payload);
    return true;
  } catch (error) {
    if (error instanceof NonRetryableError) return false;
    await enqueue(kind, payload);
    return false;
  }
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

function buildHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-Hubi-Public-Key": _publicKey,
    "X-Hubi-Timestamp": Math.floor(Date.now() / 1000).toString(),
  };
}

function warnIfAuthFailure(status: number): void {
  if (status !== 401 && status !== 403) return;
  warn(`request rejected (${status}). Check public key and allowed origins in backoffice.`);
}

function errorForStatus(status: number): Error {
  if (status >= 400 && status < 500) {
    return new NonRetryableError(status, `hubi-tracker: HTTP ${status}`);
  }
  return new Error(`hubi-tracker: HTTP ${status}`);
}

async function post(kind: QueueKind, payload: TrackerPayload): Promise<void> {
  const res = await fetch(`${_apiBase}${pathFor(kind)}`, {
    method: "POST",
    mode: "cors",
    credentials: "omit",
    headers: buildHeaders(),
    body: JSON.stringify(payload),
    keepalive: true,
  });

  if (res.ok) return;
  warnIfAuthFailure(res.status);
  throw errorForStatus(res.status);
}

// ---------------------------------------------------------------------------
// IndexedDB helpers
// ---------------------------------------------------------------------------

function canUseIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<void> {
  return new Promise((resolve) => {
    if (_db || !canUseIndexedDb()) return resolve();

    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
    };
    req.onsuccess = () => {
      _db = req.result;
      resolve();
    };
    req.onerror = () => resolve(); // degrade silently
  });
}

function txStore(mode: IDBTransactionMode): IDBObjectStore | null {
  if (!_db) return null;
  return _db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

type Entry = { id: number; entry: QueuedEvent };

function getAllEntries(): Promise<Entry[]> {
  return new Promise((resolve) => {
    const store = txStore("readonly");
    if (!store) return resolve([]);

    const results: Entry[] = [];
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return resolve(results);
      results.push({ id: cursor.key as number, entry: cursor.value as QueuedEvent });
      cursor.continue();
    };
    req.onerror = () => resolve(results);
  });
}

function putEntry(entry: QueuedEvent, id?: number): Promise<void> {
  return new Promise((resolve) => {
    const store = txStore("readwrite");
    if (!store) return resolve();

    const req = id === undefined ? store.add(entry) : store.put({ ...entry, id });
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
  });
}

function deleteEntry(id: number): Promise<void> {
  return new Promise((resolve) => {
    const store = txStore("readwrite");
    if (!store) return resolve();

    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
  });
}

// ---------------------------------------------------------------------------
// Enqueue + drain
// ---------------------------------------------------------------------------

async function enqueue(kind: QueueKind, payload: TrackerPayload): Promise<void> {
  await openDb();
  if (!_db) return;

  await trimQueue();
  await putEntry({ kind, payload, attempts: 0, queued_at: Date.now() });
}

// Drops oldest entries to keep the queue bounded. Prevents pathological
// growth when the device stays offline for long stretches.
async function trimQueue(): Promise<void> {
  const entries = await getAllEntries();
  if (entries.length < MAX_QUEUE_SIZE) return;

  const excess = entries.length - MAX_QUEUE_SIZE + 1;
  for (let i = 0; i < excess; i++) await deleteEntry(entries[i].id);
}

async function handleDrainFailure(id: number, entry: QueuedEvent): Promise<void> {
  entry.attempts += 1;
  if (entry.attempts >= MAX_ATTEMPTS) {
    await deleteEntry(id);
    return;
  }
  await putEntry(entry, id);
  await sleep(BACKOFF_BASE * Math.pow(2, entry.attempts - 1));
}

async function drainEntry({ id, entry }: Entry): Promise<void> {
  try {
    await post(entry.kind, entry.payload);
    await deleteEntry(id);
  } catch (error) {
    if (error instanceof NonRetryableError) {
      await deleteEntry(id);
      return;
    }
    await handleDrainFailure(id, entry);
  }
}

async function drainQueue(): Promise<void> {
  if (_draining || isOffline()) return;
  _draining = true;

  try {
    await openDb();
    if (!_db) return;

    const entries = await getAllEntries();
    for (const entry of entries) await drainEntry(entry);
  } finally {
    _draining = false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
