import { describe, expect, it } from "vitest";

import { API_CONFIG, UI_CONFIG } from "./api";

describe("api constants", () => {
  it("uses /api as default base url", () => {
    expect(API_CONFIG.BASE_URL.endsWith("/api")).toBe(true);
  });

  it("does not use basename", () => {
    expect(UI_CONFIG.BASENAME).toBeUndefined();
  });
});
