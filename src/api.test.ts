import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { initApi, pathFor, sendLead, sendPageview } from "./api";
import type { EventContext, LeadPayload, PageviewPayload } from "./types";

function makeContext(): EventContext {
  return {
    anonymous_id: "anon-123",
    session_id: "sess-456",
    page_url: "https://example.com/lp",
    page_title: "LP",
    landing_url: "https://example.com/lp",
    referrer_url: "",
    consent: { marketing: true, analytics: true },
    device: {
      type: "desktop",
      ua: "test-ua",
      language: "pt-BR",
      timezone: "America/Sao_Paulo",
      screen: "1920x1080",
      viewport: "1280x720",
    },
    utm: { source: "google", medium: "cpc" },
    click_ids: { gclid: "abc" },
    ad_cookies: { fbp: "fb.1.123.456" },
    first_touch: null,
    last_touch: null,
    ts: 1700000000000,
  };
}

function makeLead(): LeadPayload {
  return {
    form_id: "contact",
    external_id: "ext-uuid",
    event_id: "evt-uuid",
    hubi_hp: "",
    fields: { name: "João", email: "joao@example.com" },
    extra: {},
    context: makeContext(),
  };
}

function makePageview(): PageviewPayload {
  return { context: makeContext() };
}

describe("pathFor — endpoint routing", () => {
  it("routes leads to /leads", () => {
    expect(pathFor("lead")).toBe("/leads");
  });

  it("routes pageviews to /events/pageview", () => {
    expect(pathFor("pageview")).toBe("/events/pageview");
  });
});

describe("sendPageview + sendLead — HTTP shape", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 201 }));
    initApi("https://app.hubi.com.br/api/public/v1/", "hubi_pk_test");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts pageview to /events/pageview with public key + timestamp headers", async () => {
    await sendPageview(makePageview());

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://app.hubi.com.br/api/public/v1/events/pageview");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers["X-Hubi-Public-Key"]).toBe("hubi_pk_test");
    expect(init.headers["X-Hubi-Timestamp"]).toMatch(/^\d+$/);
  });

  it("posts lead to /leads with full payload shape", async () => {
    await sendLead(makeLead());

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://app.hubi.com.br/api/public/v1/leads");

    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      form_id: "contact",
      external_id: "ext-uuid",
      event_id: "evt-uuid",
      hubi_hp: "",
      fields: { name: "João", email: "joao@example.com" },
      context: {
        anonymous_id: "anon-123",
        session_id: "sess-456",
        consent: { marketing: true, analytics: true },
        device: expect.any(Object),
        utm: { source: "google", medium: "cpc" },
        click_ids: { gclid: "abc" },
      },
    });
  });

  it("strips trailing slashes from apiBase", async () => {
    initApi("https://app.hubi.com.br/api/public/v1///", "hubi_pk_test");
    await sendPageview(makePageview());
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://app.hubi.com.br/api/public/v1/events/pageview");
  });
});

describe("send — offline + failure fallback", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("does not call fetch when offline", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    vi.stubGlobal("fetch", vi.fn());
    initApi("https://api.test/v1", "pk_x");

    const ok = await sendPageview(makePageview());
    expect(ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns false when fetch throws (enqueues silently)", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    initApi("https://api.test/v1", "pk_x");

    const ok = await sendLead(makeLead());
    expect(ok).toBe(false);
  });

  it("returns false on 401 (reports in debug but does not throw)", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    initApi("https://api.test/v1", "pk_x");

    const ok = await sendLead(makeLead());
    expect(ok).toBe(false);
  });

  it("does not enqueue on 4xx (non-retryable)", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    const f = vi.fn().mockResolvedValue({ ok: false, status: 422 });
    vi.stubGlobal("fetch", f);
    initApi("https://api.test/v1", "pk_x");

    const ok = await sendLead(makeLead());
    expect(ok).toBe(false);

    // If enqueue had run, "online" event would drain and call fetch again.
    f.mockClear();
    window.dispatchEvent(new Event("online"));
    await new Promise((r) => setTimeout(r, 20));
    expect(f).not.toHaveBeenCalled();
  });
});
