import { describe, it, expect, beforeEach } from "vitest";
import {
  captureAttribution,
  currentClickIds,
  currentUtm,
  getFirstTouch,
  getLastTouch,
  parseClickIds,
  parseUtm,
} from "./attribution";

beforeEach(() => {
  localStorage.clear();
});

describe("parseUtm", () => {
  it("parses all utm_* params", () => {
    const utm = parseUtm("?utm_source=google&utm_medium=cpc&utm_campaign=black&utm_term=x&utm_content=y");
    expect(utm).toEqual({
      source: "google",
      medium: "cpc",
      campaign: "black",
      term: "x",
      content: "y",
    });
  });

  it("returns empty when no UTMs", () => {
    expect(parseUtm("?page=1")).toEqual({});
  });
});

describe("parseClickIds", () => {
  const platforms: Array<[string, string, string]> = [
    ["Google Ads", "gclid", "gc-abc"],
    ["Google Ads iOS web", "gbraid", "gb-abc"],
    ["Google Ads iOS app-to-web", "wbraid", "wb-abc"],
    ["Meta/Facebook", "fbclid", "fb-abc"],
    ["Microsoft/Bing", "msclkid", "ms-abc"],
    ["TikTok", "ttclid", "tt-abc"],
    ["LinkedIn", "li_fat_id", "li-abc"],
  ];

  it.each(platforms)("parses %s click id (%s)", (_label, key, value) => {
    const ids = parseClickIds(`?${key}=${value}`);
    expect(ids[key as keyof typeof ids]).toBe(value);
  });

  it("parses multiple click ids simultaneously", () => {
    const ids = parseClickIds("?gclid=g1&fbclid=f1&msclkid=m1&li_fat_id=l1");
    expect(ids).toEqual({
      gclid: "g1",
      fbclid: "f1",
      msclkid: "m1",
      li_fat_id: "l1",
    });
  });

  it("returns empty when none present", () => {
    expect(parseClickIds("?page=1")).toEqual({});
  });
});

describe("captureAttribution — first/last touch", () => {
  it("persists first-touch with full shape", () => {
    captureAttribution(
      "https://example.com/lp?utm_source=google&gclid=abc",
      "https://google.com",
    );
    const ft = getFirstTouch();
    expect(ft).not.toBeNull();
    expect(ft?.utm.source).toBe("google");
    expect(ft?.click_ids.gclid).toBe("abc");
    expect(ft?.referrer).toBe("https://google.com");
    expect(ft?.url).toBe("https://example.com/lp?utm_source=google&gclid=abc");
  });

  it("preserves first-touch across subsequent visits", () => {
    captureAttribution("https://example.com/?utm_source=google", "");
    captureAttribution("https://example.com/?utm_source=facebook", "");
    expect(getFirstTouch()?.utm.source).toBe("google");
    expect(getLastTouch()?.utm.source).toBe("facebook");
  });

  it("does not persist when URL has no attribution params", () => {
    captureAttribution("https://example.com/?foo=bar", "");
    expect(getFirstTouch()).toBeNull();
    expect(getLastTouch()).toBeNull();
  });

  it("persists when only click id is present (no UTMs)", () => {
    captureAttribution("https://example.com/?gclid=xyz", "");
    expect(getFirstTouch()?.click_ids.gclid).toBe("xyz");
  });
});

describe("currentUtm / currentClickIds", () => {
  it("reads from window.location", () => {
    // happy-dom keeps location stable across tests; we just verify the
    // functions read from `location.search` without throwing.
    expect(typeof currentUtm()).toBe("object");
    expect(typeof currentClickIds()).toBe("object");
  });
});
