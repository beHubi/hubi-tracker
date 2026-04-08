import type { AdCookies, ClickIds } from "./types";

export function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function writeCookie(name: string, value: string, maxAgeSeconds: number): void {
  if (typeof document === "undefined") return;
  document.cookie = [
    `${name}=${encodeURIComponent(value)}`,
    `max-age=${maxAgeSeconds}`,
    "path=/",
    "SameSite=Lax",
  ].join("; ");
}

// GA4 `_ga` cookie shape: GA1.{domain_depth}.{client_id}.{creation_ts}
// We return the full cookie — hubi-web normalizes server-side.
function extractGaClientId(ga: string | null): string | undefined {
  if (!ga) return undefined;
  const parts = ga.split(".");
  if (parts.length < 4) return ga;
  // client_id is last two segments joined: randomNumber.timestamp
  return parts.slice(-2).join(".");
}

export function readAdCookies(): AdCookies {
  return {
    fbp: readCookie("_fbp") || undefined,
    fbc: readCookie("_fbc") || undefined,
    ga_client_id: extractGaClientId(readCookie("_ga")),
    ttp: readCookie("_ttp") || undefined,
  };
}

// When a fbclid is present in the URL but `_fbc` cookie is not set yet
// (Meta Pixel hasn't written it), Meta's CAPI docs specify we should construct:
//   fbc = "fb.1.{timestamp_ms}.{fbclid}"
// We also persist it so future sends are consistent.
export function ensureFbc(clickIds: ClickIds, adCookies: AdCookies): AdCookies {
  if (adCookies.fbc || !clickIds.fbclid) return adCookies;

  const constructed = `fb.1.${Date.now()}.${clickIds.fbclid}`;
  writeCookie("_fbc", constructed, 60 * 60 * 24 * 90); // 90 days (Meta recommendation)
  return { ...adCookies, fbc: constructed };
}
