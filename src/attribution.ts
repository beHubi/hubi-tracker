import type { ClickIds, TouchData, Utm } from "./types";

const UTM_KEYS = ["source", "medium", "campaign", "term", "content"] as const;

const CLICK_ID_KEYS = [
  "gclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "msclkid",
  "ttclid",
  "li_fat_id",
] as const;

const FIRST_TOUCH_KEY = "hubi_ft";
const LAST_TOUCH_KEY = "hubi_lt";

export function parseUtm(search: string): Utm {
  const params = new URLSearchParams(search);
  const utm: Utm = {};
  for (const key of UTM_KEYS) {
    const val = params.get(`utm_${key}`);
    if (val) utm[key] = val;
  }
  return utm;
}

export function parseClickIds(search: string): ClickIds {
  const params = new URLSearchParams(search);
  const ids: ClickIds = {};
  for (const key of CLICK_ID_KEYS) {
    const val = params.get(key);
    if (val) ids[key] = val;
  }
  return ids;
}

function hasData(utm: Utm, clickIds: ClickIds): boolean {
  return Object.keys(utm).length > 0 || Object.keys(clickIds).length > 0;
}

export function captureAttribution(url: string, referrer: string): void {
  const { search } = new URL(url);
  const utm = parseUtm(search);
  const click_ids = parseClickIds(search);
  if (!hasData(utm, click_ids)) return;

  const touch: TouchData = { url, referrer, utm, click_ids, ts: Date.now() };

  try {
    if (!localStorage.getItem(FIRST_TOUCH_KEY)) {
      localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(touch));
    }
    localStorage.setItem(LAST_TOUCH_KEY, JSON.stringify(touch));
  } catch {
    // localStorage unavailable — degrade silently
  }
}

export function getFirstTouch(): TouchData | null {
  try {
    const raw = localStorage.getItem(FIRST_TOUCH_KEY);
    return raw ? (JSON.parse(raw) as TouchData) : null;
  } catch {
    return null;
  }
}

export function getLastTouch(): TouchData | null {
  try {
    const raw = localStorage.getItem(LAST_TOUCH_KEY);
    return raw ? (JSON.parse(raw) as TouchData) : null;
  } catch {
    return null;
  }
}

// Current-page UTMs and click IDs (not stored — read per-event).
export function currentUtm(): Utm {
  return parseUtm(location.search);
}

export function currentClickIds(): ClickIds {
  return parseClickIds(location.search);
}
