import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { currentReferrer, initPageviewTracking, primeReferrer } from "./pageview";

describe("initPageviewTracking", () => {
  let callback: ReturnType<typeof vi.fn>;
  let originalPushState: typeof history.pushState;
  let originalReplaceState: typeof history.replaceState;

  beforeEach(() => {
    originalPushState = history.pushState;
    originalReplaceState = history.replaceState;
    window.history.replaceState({}, "", "/start");
    callback = vi.fn();
    initPageviewTracking(callback);
  });

  afterEach(() => {
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
  });

  it("emits a pageview when pushState changes the URL", () => {
    history.pushState({}, "", "/next");
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0]).toContain("/next");
  });

  it("does not emit if the URL is unchanged", () => {
    history.pushState({}, "", "/start");
    expect(callback).not.toHaveBeenCalled();
  });

  it("does not intercept replaceState", () => {
    history.replaceState({}, "", "/replaced");
    expect(callback).not.toHaveBeenCalled();
  });

  it("uses the previous URL as referrer for the next pageview", () => {
    history.pushState({}, "", "/a");
    history.pushState({}, "", "/b");
    const [, referrer] = callback.mock.calls[1];
    expect(referrer).toContain("/a");
  });
});

describe("currentReferrer / primeReferrer", () => {
  it("returns the primed URL", () => {
    primeReferrer("https://example.com/lp");
    expect(currentReferrer()).toBe("https://example.com/lp");
  });
});

