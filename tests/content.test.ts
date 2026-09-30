import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import raw from "../content/resume.json";
import { buildChunks } from "../src/content/chunks";
import { formatMonth, formatRange, projects, statusLabel } from "../src/content/index";
import { createIndex, stem, tokenize } from "../src/content/search";
import { validateResume } from "../src/content/validate";
import { lintText } from "../scripts/content-lint-rules";
import { resumeJsonSchema } from "../scripts/json-schema";

describe("resume.json", () => {
  it("passes the schema and cross-field rules", () => {
    const r = validateResume(raw);
    expect(r.errors).toEqual([]);
  });

  it("has no content-safety errors from the generic rules", () => {
    const text = readFileSync("content/resume.json", "utf8");
    const errors = lintText("content/resume.json", text, []).filter((f) => f.severity === "error");
    expect(errors).toEqual([]);
  });

  it("has an up-to-date generated JSON Schema (run `pnpm content:schema`)", () => {
    expect(readFileSync("content/resume.schema.json", "utf8")).toBe(resumeJsonSchema());
  });

  it("marks placeholder projects so no interface can present them as finished", () => {
    const placeholders = projects.filter((p) => p.placeholder);
    expect(placeholders.length).toBeGreaterThan(0);
    for (const p of placeholders) {
      expect(p.status).not.toBe("shipped");
      expect(statusLabel(p)).toContain("placeholder");
    }
  });
});

describe("validateResume", () => {
  const clone = () => structuredClone(raw) as typeof raw;

  it("rejects unknown fields and bad ids", () => {
    const bad = clone() as Record<string, unknown>;
    bad["phone"] = "x";
    expect(validateResume(bad).ok).toBe(false);
    const badId = clone();
    badId.projects[0]!.id = "Not A Slug";
    expect(validateResume(badId).ok).toBe(false);
  });

  it("rejects duplicate ids and shipped placeholders", () => {
    const dup = clone();
    dup.projects[1]!.id = dup.projects[0]!.id;
    expect(validateResume(dup).errors.join()).toMatch(/duplicate project id/);
    const shipped = clone();
    const ph = shipped.projects.find((p) => "placeholder" in p && p.placeholder)!;
    ph.status = "shipped";
    expect(validateResume(shipped).errors.join()).toMatch(/placeholder can't be "shipped"/);
  });
});

describe("formatting", () => {
  it("formats months and ranges", () => {
    expect(formatMonth("2026-08")).toBe("Aug 2026");
    expect(formatMonth("present")).toBe("Present");
    expect(formatRange({ start: "2025-01", end: "2027-05" }, true)).toBe("Jan 2025 – May 2027 (expected)");
  });
});

describe("chunks", () => {
  const chunks = buildChunks();

  it("have unique ids and non-empty text", () => {
    const ids = chunks.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of chunks) expect(c.text.length).toBeGreaterThan(20);
  });

  it("stay small enough to fit several in a 4k-token context", () => {
    for (const c of chunks) expect(c.text.split(/\s+/).length).toBeLessThanOrEqual(140);
  });
});

describe("search", () => {
  const index = createIndex(buildChunks());
  const top = (q: string) => index.search(q)[0]?.chunk.id;

  it("tokenizes tech names and stems plurals", () => {
    expect(tokenize("C# and .NET with C++ and A*")).toEqual(["csharp", "dotnet", "cpp", "astar"]);
    expect(stem("pipelines")).toBe("pipeline");
    expect(stem("databases")).toBe("database");
  });

  it("finds the RAG work first for the brief's acceptance question", () => {
    expect(top("What has Geralt built with RAG?")).toBe("experience/athena-intern/nl-to-sql-assistant");
    expect(top("retrieval-augmented generation")).toBe("experience/athena-intern/nl-to-sql-assistant");
  });

  it("routes common recruiter questions to the right section", () => {
    expect(top("where did he study?")).toMatch(/^education\//);
    expect(top("how do I contact him? email")).toBe("contact");
    expect(top("path planning robots")).toBe("projects/lidar-scout");
    expect(top("RLHF")).toMatch(/handshake/);
    expect(top("kubernetes docker")).toMatch(/^skills\/infra|on-prem/);
  });

  it("returns nothing for off-content questions", () => {
    expect(index.search("favorite pizza topping")).toEqual([]);
    expect(index.knownTerms("salary at google")).toEqual([]);
  });
});
