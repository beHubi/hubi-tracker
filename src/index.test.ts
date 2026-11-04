import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { Hubi } from "./index";

describe("Hubi — lead only", () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201 });

  beforeAll(() => {
    localStorage.clear();
    history.replaceState(null, "", "/lp?utm_source=google&utm_medium=cpc&gclid=abc");
    vi.stubGlobal("fetch", fetchMock);
    Hubi.init({
      publicKey: "hubi_pk_test",
      site: "lp-test",
      apiBase: "https://api.test/v1",
      consent: { marketing: true, analytics: true },
    });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    history.replaceState(null, "", "/");
  });

  it("sends nothing on init", () => {
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores a queued ['pageview'] without warning", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    window.HubiTracker?.push(["pageview"]);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("sends a lead with only landing, referrer, utm and consent in context", async () => {
    history.replaceState(null, "", "/contato?utm_source=meta");

    await Hubi.submit({ formId: "contact", fields: { name: "Maria", email: "maria@acme.com" } });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.test/v1/leads");
    const body = JSON.parse(init.body);
    expect(Object.keys(body).sort()).toEqual(
      ["context", "external_id", "extra", "fields", "form_id", "hubi_hp"],
    );
    expect(body.context).toEqual({
      landing_url: expect.stringContaining("/lp?utm_source=google"),
      referrer_url: "",
      utm: { source: "meta" },
      consent: { marketing: true, analytics: true },
    });
  });
});
