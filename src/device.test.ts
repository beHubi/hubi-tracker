import { describe, it, expect } from "vitest";
import { collectDevice } from "./device";

describe("collectDevice", () => {
  it("returns a full DeviceInfo with valid fields", () => {
    const d = collectDevice();
    expect(["mobile", "tablet", "desktop"]).toContain(d.type);
    expect(typeof d.ua).toBe("string");
    expect(typeof d.language).toBe("string");
    expect(typeof d.timezone).toBe("string");
    expect(d.screen).toMatch(/^\d+x\d+$/);
    expect(d.viewport).toMatch(/^\d+x\d+$/);
  });
});
