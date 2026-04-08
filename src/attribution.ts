import type { Attribution, TouchData } from "./types";

const UTM_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;

const CLICK_IDS = ["gclid", "fbclid", "ttclid", "msclkid"] as const;

const FIRST_TOUCH_KEY = "hubi_ft";
const LAST_TOUCH_KEY = "hubi_lt";

export function parseAttribution(search: string): Attribution {
  const params = new URLSearchParams(search);
  const attr: Attribution = {};

  for (const key of UTM_PARAMS) {
    const val = params.get(key);
    if (val) attr[key] = val;
  }

  for (const key of CLICK_IDS) {
    const val = params.get(key);
    if (val) attr[key] = val;
  }

  const ref = params.get("ref");
  if (ref) attr.ref = ref;

  return attr;
}

function hasAttribution(attr: Attribution): boolean {
  return Object.keys(attr).length > 0;
}

export function captureAttribution(url: string): void {
  const { search } = new URL(url);
  const attr = parseAttribution(search);
  if (!hasAttribution(attr)) return;

  const touch: TouchData = { ...attr, url, ts: Date.now() };

  try {
    if (!localStorage.getItem(FIRST_TOUCH_KEY)) {
      localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(touch));
    }
    localStorage.setItem(LAST_TOUCH_KEY, JSON.stringify(touch));
  } catch {
    // localStorage unavailable
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
