import { describe, it, expect, beforeEach } from "vitest";
import { getAnonymousId } from "./visitor";

beforeEach(() => {
  document.cookie = "hubi_anon=; max-age=0; path=/";
});

describe("getAnonymousId", () => {
  it("returns a UUID-like string", () => {
    const id = getAnonymousId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("returns same id on subsequent calls (stable across reloads)", () => {
    const id1 = getAnonymousId();
    const id2 = getAnonymousId();
    expect(id1).toBe(id2);
  });

  it("generates a new id after cookie is cleared", () => {
    const id1 = getAnonymousId();
    document.cookie = "hubi_anon=; max-age=0; path=/";
    const id2 = getAnonymousId();
    expect(id1).not.toBe(id2);
  });
});
