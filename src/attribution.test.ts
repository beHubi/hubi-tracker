import { describe, it, expect } from "vitest";
import { currentUtm, parseUtm } from "./attribution";

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
    expect(parseUtm("?page=1&gclid=abc")).toEqual({});
  });
});

describe("currentUtm", () => {
  it("reads from window.location", () => {
    history.replaceState(null, "", "/lp?utm_source=meta&utm_campaign=bf26");
    expect(currentUtm()).toEqual({ source: "meta", campaign: "bf26" });
    history.replaceState(null, "", "/");
  });
});
