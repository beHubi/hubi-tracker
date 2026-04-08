import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { initApi, sendEvent } from "./api";
import type { TrackPayload } from "./types";

function makePayload(overrides?: Partial<TrackPayload>): TrackPayload {
  return {
    event: "pageview",
    anonymous_id: "anon-123",
    session_id: "sess-456",
    public_key: "hubi_pk_test",
    site: "test-site",
    url: "https://example.com/",
    referrer: "",
    first_touch: null,
    last_touch: null,
    consent: { marketing: true, analytics: true },
    properties: {},
    ts: Date.now(),
    ...overrides,
  };
}

describe("sendEvent — payload shape", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    initApi("https://app.hubi.com.br/api/public/v1");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to /events with correct shape", async () => {
    const payload = makePayload();
    await sendEvent(payload);

    expect(fetch).toHaveBeenCalledWith(
      "https://app.hubi.com.br/api/public/v1/events",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );

    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body).toMatchObject({
      event: "pageview",
      anonymous_id: "anon-123",
      public_key: "hubi_pk_test",
      site: "test-site",
    });
  });

  it("includes all required fields", async () => {
    const payload = makePayload({ event: "lead", properties: { formId: "contact" } });
    await sendEvent(payload);

    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body).toHaveProperty("anonymous_id");
    expect(body).toHaveProperty("session_id");
    expect(body).toHaveProperty("public_key");
    expect(body).toHaveProperty("site");
    expect(body).toHaveProperty("url");
    expect(body).toHaveProperty("ts");
    expect(body).toHaveProperty("consent");
  });
});

describe("sendEvent — offline queuing", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", { onLine: false });
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not call fetch when offline", async () => {
    initApi("https://app.hubi.com.br/api/public/v1");
    const payload = makePayload();
    await sendEvent(payload);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("sendEvent — retry on failure", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", { onLine: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("enqueues event when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
    initApi("https://app.hubi.com.br/api/public/v1");

    const payload = makePayload();
    // Should not throw — falls back to queue
    await expect(sendEvent(payload)).resolves.toBeUndefined();
  });
});
