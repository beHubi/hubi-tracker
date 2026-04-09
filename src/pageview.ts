type PageviewCallback = (url: string, referrerUrl: string) => void;

// Tracks the previous URL so SPA navigations get an internal referrer
// instead of the original document.referrer (which never changes).
let _lastUrl = "";

function emitIfChanged(callback: PageviewCallback): void {
  const current = location.href;
  if (current === _lastUrl) return;
  const referrer = _lastUrl;
  _lastUrl = current;
  callback(current, referrer);
}

function wrapPushState(callback: PageviewCallback): void {
  const original = history.pushState.bind(history);
  history.pushState = function (...args) {
    original(...args);
    emitIfChanged(callback);
  };
}

export function initPageviewTracking(callback: PageviewCallback): void {
  _lastUrl = location.href;
  wrapPushState(callback);
  window.addEventListener("popstate", () => emitIfChanged(callback));
}

export function currentReferrer(): string {
  return _lastUrl || document.referrer || "";
}

export function primeReferrer(url: string): void {
  _lastUrl = url;
}
