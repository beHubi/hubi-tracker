const COOKIE_NAME = "hubi_anon";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string, maxAge: number): void {
  document.cookie = [
    `${name}=${encodeURIComponent(value)}`,
    `max-age=${maxAge}`,
    "path=/",
    "SameSite=Lax",
  ].join("; ");
}

export function getAnonymousId(): string {
  let id = readCookie(COOKIE_NAME);
  if (!id) {
    id = generateId();
    writeCookie(COOKIE_NAME, id, COOKIE_MAX_AGE);
  }
  return id;
}
