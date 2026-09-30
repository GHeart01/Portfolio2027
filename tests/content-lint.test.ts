import { describe, expect, it } from "vitest";
import { lintText, parseDenylist, shouldScan } from "../scripts/content-lint-rules";

const rules = (file: string, text: string, deny: string[] = []) =>
  lintText(file, text, deny).map((f) => f.rule);

describe("content-lint", () => {
  it("flags phone numbers and non-public emails in content", () => {
    expect(rules("content/resume.json", '"phone": "(512) 555-0199"')).toContain("phone-number");
    expect(rules("content/resume.json", "someone@example.org")).toContain("unlisted-email");
    expect(rules("content/resume.json", "emailme@geraltheart.com")).toEqual([]);
  });

  it("flags model/part-number shaped tokens but not ordinary tech names", () => {
    expect(rules("content/resume.json", "machine XZ42QR7 data")).toContain("model-or-part-number");
    expect(rules("content/resume.json", "Qwen3, BM25, ES2023, M2, 3D, MCP")).toEqual([]);
  });

  it("flags controlled-data details as errors", () => {
    const f = lintText("content/resume.json", "managed export-restricted data", []);
    expect(f[0]?.severity).toBe("error");
  });

  it("warns on headcounts and percentages", () => {
    const f = lintText("content/resume.json", "used by 20+ users, 85% better", []);
    expect(f.map((x) => x.rule)).toEqual(expect.arrayContaining(["internal-metric", "percent-claim"]));
    expect(f.every((x) => x.severity === "warn")).toBe(true);
  });

  it("matches denylist terms case-insensitively on word boundaries and reports by number", () => {
    const deny = parseDenylist("# comment\nFooDB\n\nbar-sys, qux");
    expect(deny).toEqual(["FooDB", "bar-sys", "qux"]);
    expect(rules("src/x.ts", "sync with foodb nightly", deny)).toEqual(["denylist#1"]);
    expect(rules("README.md", "the BAR-SYS api", deny)).toEqual(["denylist#2"]);
    expect(rules("src/x.ts", "quxx is fine", deny)).toEqual([]);
  });

  it("does not apply content rules to source files", () => {
    expect(rules("src/pages/index.astro", "call 512-555-0199")).toEqual([]);
  });

  it("skips binary and generated files", () => {
    expect(shouldScan("public/fonts/jbm.woff2")).toBe(false);
    expect(shouldScan("pnpm-lock.yaml")).toBe(false);
    expect(shouldScan("content/resume.json")).toBe(true);
  });
});
