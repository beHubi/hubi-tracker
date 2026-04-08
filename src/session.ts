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

export function getSessionId(): string {
  const now = Date.now();

  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      const entry: SessionEntry = JSON.parse(raw);
      if (now - entry.last_active < IDLE_TTL) {
        entry.last_active = now;
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(entry));
        return entry.id;
      }
    }
  } catch {
    // sessionStorage unavailable — fall through
  }

  const entry: SessionEntry = { id: generateId(), last_active: now };
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(entry));
  } catch {
    // ignore
  }
  return entry.id;
}

export function touchSession(): void {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      const entry: SessionEntry = JSON.parse(raw);
      entry.last_active = Date.now();
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(entry));
    }
  } catch {
    // ignore
  }
}
