let _debug = false;

const LABEL = "[hubi]";
const STYLE = "color:#6366f1;font-weight:bold";
const RESET = "color:inherit;font-weight:normal";

export function enableDebug(): void {
  _debug = true;
}

export function isDebug(): boolean {
  return _debug;
}

export function log(message: string, ...data: unknown[]): void {
  if (!_debug) return;
  // eslint-disable-next-line no-console
  console.log(`%c${LABEL}%c ${message}`, STYLE, RESET, ...data);
}

export function group(label: string, fn: () => void): void {
  if (!_debug) return;
  // eslint-disable-next-line no-console
  console.groupCollapsed(`%c${LABEL}%c ${label}`, STYLE, RESET);
  try {
    fn();
  } finally {
    // eslint-disable-next-line no-console
    console.groupEnd();
  }
}

// Pads a string to a fixed width for console table alignment.
export function pad(str: string, width: number): string {
  if (str.length >= width) return str;
  return str + " ".repeat(width - str.length);
}

export function warn(message: string, ...data: unknown[]): void {
  // eslint-disable-next-line no-console
  console.warn(`${LABEL} ${message}`, ...data);
}
