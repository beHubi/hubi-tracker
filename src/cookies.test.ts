import { describe, it, expect, beforeEach } from "vitest";
import { ensureFbc, readAdCookies, readCookie, writeCookie } from "./cookies";

function clearAllCookies() {
  document.cookie.split(";").forEach((c) => {
    const name = c.split("=")[0].trim();
    if (name) document.cookie = `${name}=; max-age=0; path=/`;
  });
}

beforeEach(() => {
  clearAllCookies();
});

describe("readCookie / writeCookie", () => {
  it("round-trips", () => {
    writeCookie("foo", "bar", 60);
    expect(readCookie("foo")).toBe("bar");
  });

  it("returns null when missing", () => {
    expect(readCookie("nope")).toBeNull();
  });
});

describe("readAdCookies", () => {
  it("reads _fbp when present", () => {
    writeCookie("_fbp", "fb.1.1700000000.abc", 60);
    expect(readAdCookies().fbp).toBe("fb.1.1700000000.abc");
  });

  it("reads _fbc when present", () => {
    writeCookie("_fbc", "fb.1.1700000000.fbclid_xyz", 60);
    expect(readAdCookies().fbc).toBe("fb.1.1700000000.fbclid_xyz");
  });

  it("extracts GA client id from _ga cookie", () => {
    writeCookie("_ga", "GA1.2.1234567890.1700000000", 60);
    const ids = readAdCookies();
    expect(ids.ga_client_id).toBe("1234567890.1700000000");
  });

  it("reads _ttp when present", () => {
    writeCookie("_ttp", "tt-abc-123", 60);
    expect(readAdCookies().ttp).toBe("tt-abc-123");
  });

  it("returns undefined for missing cookies", () => {
    const ids = readAdCookies();
    expect(ids.fbp).toBeUndefined();
    expect(ids.fbc).toBeUndefined();
  });
});

describe("ensureFbc", () => {
  it("constructs _fbc from fbclid when cookie is missing", () => {
    const ids = { fbclid: "IwAR_abc123" };
    const result = ensureFbc(ids, {});
    expect(result.fbc).toMatch(/^fb\.1\.\d+\.IwAR_abc123$/);
    expect(readCookie("_fbc")).toBe(result.fbc);
  });

  it("preserves existing _fbc if already set", () => {
    const existing = "fb.1.999.existing_fbclid";
    const result = ensureFbc({ fbclid: "new_fbclid" }, { fbc: existing });
    expect(result.fbc).toBe(existing);
  });

  it("does nothing when no fbclid", () => {
    const result = ensureFbc({}, {});
    expect(result.fbc).toBeUndefined();
  });
});
