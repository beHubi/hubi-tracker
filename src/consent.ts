import type { ConsentState } from "./types";

const CONSENT_KEY = "hubi_consent";

const DEFAULT_CONSENT: ConsentState = {
  marketing: false,
  analytics: false,
};

let _consent: ConsentState = { ...DEFAULT_CONSENT };

export function initConsent(initial?: Partial<ConsentState>): void {
  try {
    const stored = localStorage.getItem(CONSENT_KEY);
    if (stored) {
      _consent = { ...DEFAULT_CONSENT, ...(JSON.parse(stored) as Partial<ConsentState>) };
      return;
    }
  } catch {
    // ignore
  }

  if (initial) {
    _consent = { ...DEFAULT_CONSENT, ...initial };
    persistConsent();
  }
}

export function getConsent(): ConsentState {
  return { ..._consent };
}

export function setConsent(state: Partial<ConsentState>): void {
  _consent = { ..._consent, ...state };
  persistConsent();
}

function persistConsent(): void {
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(_consent));
  } catch {
    // ignore
  }
}
