import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { initApi, isSendable, sendLead } from "./api";
import type { LeadContext, LeadPayload, QueuedEvent } from "./types";

function makeContext(): LeadContext {
  return {
    landing_url: "https://example.com/lp",
    referrer_url: "https://google.com/",
    utm: { source: "google", medium: "cpc" },
    consent: { marketing: true, analytics: true },
  };
}

function makeLead(): LeadPayload {
  return {
    form_id: "contact",
    external_id: "ext-uuid",
    hubi_hp: "",
    fields: { name: "João", email: "joao@example.com" },
    extra: {},
    context: makeContext(),
  };
}

function makeQueued(kind: string): QueuedEvent {
  return { kind, payload: makeLead(), attempts: 0, queued_at: 1700000000000 };
}

describe("isSendable — queued entries", () => {
  it("sends queued leads", () => {
    expect(isSendable(makeQueued("lead"))).toBe(true);
  });

  it("discards pageviews queued by SDK 1.0", () => {
    expect(isSendable(makeQueued("pageview"))).toBe(false);
  });
});

describe("sendLead — HTTP shape", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 201 }));
    initApi("https://app.hubi.com.br/api/public/v1/", "hubi_pk_test");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts lead to /leads with public key + timestamp headers", async () => {
    await sendLead(makeLead());

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://app.hubi.com.br/api/public/v1/leads");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers["X-Hubi-Public-Key"]).toBe("hubi_pk_test");
    expect(init.headers["X-Hubi-Timestamp"]).toMatch(/^\d+$/);
  });

  it("posts the lead payload as is", async () => {
    await sendLead(makeLead());

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual(makeLead());
  });

  it("strips trailing slashes from apiBase", async () => {
    initApi("https://app.hubi.com.br/api/public/v1///", "hubi_pk_test");
    await sendLead(makeLead());
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://app.hubi.com.br/api/public/v1/leads");
  });
});

describe("send — offline + failure fallback", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("does not call fetch when offline", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    vi.stubGlobal("fetch", vi.fn());
    initApi("https://api.test/v1", "pk_x");

    const ok = await sendLead(makeLead());
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
