import type { Utm } from "./types";

const UTM_KEYS = ["source", "medium", "campaign", "term", "content"] as const;

export function parseUtm(search: string): Utm {
  const params = new URLSearchParams(search);
  const utm: Utm = {};
  for (const key of UTM_KEYS) {
    const val = params.get(`utm_${key}`);
    if (val) utm[key] = val;
  }
  return utm;
}

// UTMs of the current page, read when the lead is sent.
export function currentUtm(): Utm {
  return parseUtm(location.search);
}
