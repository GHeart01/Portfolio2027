import { describe, expect, it } from "vitest";
import { SITE } from "../src/content/site";

describe("scaffold", () => {
  it("has a canonical site origin", () => {
    expect(SITE).toBe("https://geraltheart.com");
  });
});
