import type { LeadPayload, PageviewPayload, QueueKind, QueuedEvent, TrackerPayload } from "./types";
import { warn } from "./logger";

const DB_NAME = "hubi_queue";
const DB_VERSION = 1;
const STORE_NAME = "events";
const MAX_ATTEMPTS = 5;
const BACKOFF_BASE = 1000;

const LEADS_PATH = "/leads";
const PAGEVIEW_PATH = "/events/pageview";

let _apiBase = "";
let _publicKey = "";
let _db: IDBDatabase | null = null;
let _draining = false;

export function initApi(apiBase: string, publicKey: string): void {
  // Strip trailing slash so we can always concatenate with a leading one.
  _apiBase = apiBase.replace(/\/+$/, "");
  _publicKey = publicKey;

  openDb().then(() => {
    drainQueue();
  });

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

async function send(kind: QueueKind, payload: TrackerPayload): Promise<boolean> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    await enqueue(kind, payload);
    return false;
  }

  try {
    await post(kind, payload);
    return true;
  } catch {
    await enqueue(kind, payload);
    return false;
  }
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

async function post(kind: QueueKind, payload: TrackerPayload): Promise<void> {
  const url = `${_apiBase}${pathFor(kind)}`;
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const res = await fetch(url, {
    method: "POST",
    mode: "cors",
    credentials: "omit",
    headers: {
      "Content-Type": "application/json",
      "X-Hubi-Public-Key": _publicKey,
      "X-Hubi-Timestamp": timestamp,
    },
    body,
    keepalive: true,
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      warn(`request rejected (${res.status}). Check public key and allowed origins in backoffice.`);
    }
    throw new Error(`hubi-tracker: HTTP ${res.status}`);
  }
}

// ---------------------------------------------------------------------------
// IndexedDB queue
// ---------------------------------------------------------------------------

function openDb(): Promise<void> {
  return new Promise((resolve) => {
    if (_db) {
      resolve();
      return;
    }
    if (typeof indexedDB === "undefined") {
      resolve();
      return;
    }

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

async function enqueue(kind: QueueKind, payload: TrackerPayload): Promise<void> {
  await openDb();
  if (!_db) return;

  const entry: QueuedEvent = { kind, payload, attempts: 0, queued_at: Date.now() };

  return new Promise((resolve) => {
    const tx = _db!.transaction(STORE_NAME, "readwrite");
    const req = tx.objectStore(STORE_NAME).add(entry);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
  });
}

async function drainQueue(): Promise<void> {
  if (_draining) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  _draining = true;

  await openDb();
  if (!_db) {
    _draining = false;
    return;
  }

  try {
    const entries = await getAllEntries();

    for (const { id, entry } of entries) {
      try {
        await post(entry.kind, entry.payload);
        await deleteEntry(id);
      } catch {
        entry.attempts += 1;
        if (entry.attempts >= MAX_ATTEMPTS) {
          await deleteEntry(id);
        } else {
          await updateEntry(id, entry);
          await sleep(BACKOFF_BASE * Math.pow(2, entry.attempts - 1));
        }
      }
    }
  } finally {
    _draining = false;
  }
}

function getAllEntries(): Promise<Array<{ id: number; entry: QueuedEvent }>> {
  return new Promise((resolve) => {
    if (!_db) return resolve([]);
    const tx = _db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).openCursor();
    const results: Array<{ id: number; entry: QueuedEvent }> = [];

    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        results.push({ id: cursor.key as number, entry: cursor.value as QueuedEvent });
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    req.onerror = () => resolve(results);
  });
}

function deleteEntry(id: number): Promise<void> {
  return new Promise((resolve) => {
    if (!_db) return resolve();
    const tx = _db.transaction(STORE_NAME, "readwrite");
    const req = tx.objectStore(STORE_NAME).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
  });
}

function updateEntry(id: number, entry: QueuedEvent): Promise<void> {
  return new Promise((resolve) => {
    if (!_db) return resolve();
    const tx = _db.transaction(STORE_NAME, "readwrite");
    const req = tx.objectStore(STORE_NAME).put({ ...entry, id });
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
