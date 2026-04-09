const SESSION_KEY = "hubi_session";
const IDLE_TTL = 30 * 60 * 1000; // 30 minutes

interface SessionEntry {
  id: string;
  last_active: number;
}

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function readEntry(): SessionEntry | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as SessionEntry) : null;
  } catch {
    return null;
  }
}

function writeEntry(entry: SessionEntry): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(entry));
  } catch {
    // ignore — storage unavailable
  }
}

function isFresh(entry: SessionEntry, now: number): boolean {
  return now - entry.last_active < IDLE_TTL;
}

export function getSessionId(): string {
  const now = Date.now();
  const existing = readEntry();

  if (existing && isFresh(existing, now)) {
    existing.last_active = now;
    writeEntry(existing);
    return existing.id;
  }

  const entry: SessionEntry = { id: generateId(), last_active: now };
  writeEntry(entry);
  return entry.id;
}

export function touchSession(): void {
  const entry = readEntry();
  if (!entry) return;
  entry.last_active = Date.now();
  writeEntry(entry);
}
