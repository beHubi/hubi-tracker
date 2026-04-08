import { describe, it, expect, beforeEach } from "vitest";
import {
  clearIdentifiedEmail,
  ensureLandingUrl,
  loadIdentifiedEmail,
  saveIdentifiedEmail,
  uuid,
} from "./identity";

beforeEach(() => {
  localStorage.clear();
});

describe("uuid", () => {
  it("returns a UUID-shaped string", () => {
    expect(uuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("returns distinct values", () => {
    expect(uuid()).not.toBe(uuid());
  });
});

describe("identified email — late-binding across pages", () => {
  it("round-trips through localStorage", () => {
    saveIdentifiedEmail("joao@example.com");
    expect(loadIdentifiedEmail()).toBe("joao@example.com");
  });

  it("clears on demand", () => {
    saveIdentifiedEmail("a@b.com");
    clearIdentifiedEmail();
    expect(loadIdentifiedEmail()).toBeNull();
  });
});

describe("ensureLandingUrl", () => {
  it("stores the first URL and returns it forever", () => {
    expect(ensureLandingUrl("https://example.com/first")).toBe("https://example.com/first");
    expect(ensureLandingUrl("https://example.com/second")).toBe("https://example.com/first");
  });
});
