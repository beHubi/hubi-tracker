let _debug = false;

const PREFIX = "%c[hubi]%c";
const STYLE_LABEL = "color:#6366f1;font-weight:bold";
const STYLE_RESET = "color:inherit;font-weight:normal";

export function enableDebug(): void {
  _debug = true;
}

export function log(message: string, ...data: unknown[]): void {
  if (!_debug) return;
  // eslint-disable-next-line no-console
  console.log(`${PREFIX} ${message}`, STYLE_LABEL, STYLE_RESET, ...data);
}

export function group(label: string, fn: () => void): void {
  if (!_debug) return;
  // eslint-disable-next-line no-console
  console.groupCollapsed(`${PREFIX} ${label}`, STYLE_LABEL, STYLE_RESET);
  fn();
  // eslint-disable-next-line no-console
  console.groupEnd();
}

export function warn(message: string, ...data: unknown[]): void {
  // eslint-disable-next-line no-console
  console.warn(`${PREFIX} ${message}`, STYLE_LABEL, STYLE_RESET, ...data);
}
