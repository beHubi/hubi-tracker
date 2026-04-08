const EMAIL_KEY = "hubi_email";
const LANDING_KEY = "hubi_landing";

export function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Persisted identify email (late-binding across pages/sessions).
export function loadIdentifiedEmail(): string | null {
  try {
    return localStorage.getItem(EMAIL_KEY);
  } catch {
    return null;
  }
}

export function saveIdentifiedEmail(email: string): void {
  try {
    localStorage.setItem(EMAIL_KEY, email);
  } catch {
    // ignore
  }
}

export function clearIdentifiedEmail(): void {
  try {
    localStorage.removeItem(EMAIL_KEY);
  } catch {
    // ignore
  }
}

// Landing URL — the very first URL the visitor ever opened on this property,
// regardless of whether it had attribution params. Distinct from first-touch
// (which only fires if UTMs/click-IDs are present).
export function ensureLandingUrl(currentUrl: string): string {
  try {
    const stored = localStorage.getItem(LANDING_KEY);
    if (stored) return stored;
    localStorage.setItem(LANDING_KEY, currentUrl);
    return currentUrl;
  } catch {
    return currentUrl;
  }
}
