import type { DeviceInfo } from "./types";

const MOBILE_RE = /Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/i;
const TABLET_RE = /iPad|Tablet|Nexus 7|Nexus 10|PlayBook|Silk/i;

function detectDeviceType(ua: string): DeviceInfo["type"] {
  if (TABLET_RE.test(ua)) return "tablet";
  if (MOBILE_RE.test(ua)) return "mobile";
  return "desktop";
}

function safeScreen(): string {
  try {
    return `${window.screen.width}x${window.screen.height}`;
  } catch {
    return "";
  }
}

function safeViewport(): string {
  try {
    return `${window.innerWidth}x${window.innerHeight}`;
  } catch {
    return "";
  }
}

function safeTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}

function safeLanguage(): string {
  try {
    return navigator.language || (navigator.languages && navigator.languages[0]) || "";
  } catch {
    return "";
  }
}

export function collectDevice(): DeviceInfo {
  const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";

  return {
    type: detectDeviceType(ua),
    ua,
    language: safeLanguage(),
    timezone: safeTimezone(),
    screen: safeScreen(),
    viewport: safeViewport(),
  };
}
