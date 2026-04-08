type PageviewCallback = (url: string) => void;

export function initPageviewTracking(callback: PageviewCallback): void {
  // SPA: intercept history.pushState
  const originalPushState = history.pushState.bind(history);

  history.pushState = function (...args) {
    originalPushState(...args);
    callback(location.href);
  };

  window.addEventListener("popstate", () => {
    callback(location.href);
  });
}
