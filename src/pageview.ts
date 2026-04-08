type PageviewCallback = (url: string, referrerUrl: string) => void;

// Tracks the previous URL so SPA navigations get an internal referrer
// instead of the original document.referrer (which never changes).
let _lastUrl = "";

export function initPageviewTracking(callback: PageviewCallback): void {
  _lastUrl = location.href;

  const emit = () => {
    const referrer = _lastUrl;
    _lastUrl = location.href;
    callback(location.href, referrer);
  };

  const originalPushState = history.pushState.bind(history);
  history.pushState = function (...args) {
    originalPushState(...args);
    emit();
  };

  const originalReplaceState = history.replaceState.bind(history);
  history.replaceState = function (...args) {
    originalReplaceState(...args);
    emit();
  };

  window.addEventListener("popstate", emit);
}

export function currentReferrer(): string {
  return _lastUrl || document.referrer || "";
}

export function primeReferrer(url: string): void {
  _lastUrl = url;
}
