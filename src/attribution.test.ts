import { describe, it, expect, beforeEach } from "vitest";
import { parseAttribution, captureAttribution, getFirstTouch, getLastTouch } from "./attribution";

beforeEach(() => {
  localStorage.clear();
});

describe("parseAttribution", () => {
  it("parses utm params", () => {
    const attr = parseAttribution("?utm_source=google&utm_medium=cpc&utm_campaign=blackfriday");
    expect(attr).toMatchObject({
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "blackfriday",
    });
  });

  it("parses Google Ads gclid", () => {
    const attr = parseAttribution("?gclid=abc123&utm_source=google&utm_medium=cpc");
    expect(attr.gclid).toBe("abc123");
    expect(attr.utm_source).toBe("google");
  });

  it("parses Meta fbclid", () => {
    const attr = parseAttribution("?fbclid=fb_abc&utm_source=facebook&utm_medium=paid");
    expect(attr.fbclid).toBe("fb_abc");
    expect(attr.utm_source).toBe("facebook");
  });

  it("parses TikTok ttclid", () => {
    const attr = parseAttribution("?ttclid=tt123&utm_source=tiktok");
    expect(attr.ttclid).toBe("tt123");
  });

  it("parses Microsoft Ads msclkid", () => {
    const attr = parseAttribution("?msclkid=ms123&utm_source=bing");
    expect(attr.msclkid).toBe("ms123");
  });

  it("parses ref param", () => {
    const attr = parseAttribution("?ref=newsletter");
    expect(attr.ref).toBe("newsletter");
  });

  it("returns empty object for URLs without attribution params", () => {
    const attr = parseAttribution("?foo=bar&baz=qux");
    expect(Object.keys(attr)).toHaveLength(0);
  });
});

describe("captureAttribution / first-touch / last-touch", () => {
  it("persists first-touch on first visit", () => {
    captureAttribution("https://example.com/lp?utm_source=google&utm_medium=cpc");
    const ft = getFirstTouch();
    expect(ft).not.toBeNull();
    expect(ft?.utm_source).toBe("google");
  });

  it("preserves first-touch on subsequent visits", () => {
    captureAttribution("https://example.com/lp?utm_source=google&utm_medium=cpc");
    captureAttribution("https://example.com/lp?utm_source=facebook&utm_medium=paid");

    const ft = getFirstTouch();
    expect(ft?.utm_source).toBe("google");
  });

  it("updates last-touch on each visit", () => {
    captureAttribution("https://example.com/lp?utm_source=google&utm_medium=cpc");
    captureAttribution("https://example.com/lp?utm_source=facebook&utm_medium=paid");

    const lt = getLastTouch();
    expect(lt?.utm_source).toBe("facebook");
  });

  it("does not persist if no attribution params present", () => {
    captureAttribution("https://example.com/lp?page=1");
    expect(getFirstTouch()).toBeNull();
    expect(getLastTouch()).toBeNull();
  });

  it("includes url and ts in touch data", () => {
    const before = Date.now();
    captureAttribution("https://example.com/lp?utm_source=google");
    const after = Date.now();

    const ft = getFirstTouch();
    expect(ft?.url).toBe("https://example.com/lp?utm_source=google");
    expect(ft?.ts).toBeGreaterThanOrEqual(before);
    expect(ft?.ts).toBeLessThanOrEqual(after);
  });
});
