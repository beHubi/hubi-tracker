import type { QueuedEvent, TrackPayload } from "./types";

const DB_NAME = "hubi_queue";
const DB_VERSION = 1;
const STORE_NAME = "events";
const MAX_ATTEMPTS = 5;
const BACKOFF_BASE = 1000; // ms

let _apiBase = "";
let _db: IDBDatabase | null = null;
let _draining = false;

export function initApi(apiBase: string): void {
  _apiBase = apiBase;
  openDb().then(() => {
    drainQueue();
  });

  window.addEventListener("online", drainQueue);
}

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

export async function sendEvent(payload: TrackPayload): Promise<void> {
  if (!navigator.onLine) {
    await enqueue(payload);
    return;
  }

  try {
    await post(payload);
  } catch {
    await enqueue(payload);
  }
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

async function post(payload: TrackPayload): Promise<void> {
  const res = await fetch(`${_apiBase}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  });

  if (!res.ok) {
    throw new Error(`hubi-tracker: HTTP ${res.status}`);
  }
}

// ---------------------------------------------------------------------------
// IndexedDB queue
// ---------------------------------------------------------------------------

function openDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (_db) {
      resolve();
      return;
    }

    if (!("indexedDB" in window)) {
      resolve();
      return;
    }

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, {
        keyPath: "id",
        autoIncrement: true,
      });
    };

    req.onsuccess = () => {
      _db = req.result;
      resolve();
    };

    req.onerror = () => reject(req.error);
  });
}

async function enqueue(payload: TrackPayload): Promise<void> {
  const entry: QueuedEvent = {
    payload,
    attempts: 0,
    queued_at: Date.now(),
  };

  await openDb();
  if (!_db) return;

  return new Promise((resolve, reject) => {
    const tx = _db!.transaction(STORE_NAME, "readwrite");
    const req = tx.objectStore(STORE_NAME).add(entry);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function drainQueue(): Promise<void> {
  if (_draining || !navigator.onLine) return;
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
        await post(entry.payload);
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
  return new Promise((resolve, reject) => {
    const tx = _db!.transaction(STORE_NAME, "readonly");
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

    req.onerror = () => reject(req.error);
  });
}

function deleteEntry(id: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = _db!.transaction(STORE_NAME, "readwrite");
    const req = tx.objectStore(STORE_NAME).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function updateEntry(id: number, entry: QueuedEvent): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = _db!.transaction(STORE_NAME, "readwrite");
    const req = tx.objectStore(STORE_NAME).put({ ...entry, id });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
