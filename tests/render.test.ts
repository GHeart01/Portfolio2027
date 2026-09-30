import { describe, expect, it } from "vitest";
import { llmsTxt } from "../src/content/render/llms";
import { projectMd, resumeMd } from "../src/content/render/markdown";
import { profile, projects } from "../src/content/index";

describe("markdown", () => {
  it("renders the full resume with every section", () => {
    const md = resumeMd();
    expect(md.startsWith(`# ${profile.name}`)).toBe(true);
    for (const h of ["## Experience", "## Projects", "## Skills", "## Education"]) expect(md).toContain(h);
    expect(md).toContain(profile.email);
  });

  it("labels placeholder projects in their status line", () => {
    const ph = projects.find((p) => p.placeholder)!;
    expect(projectMd(ph)).toMatch(/Status: in-progress, placeholder/);
  });
});

describe("llms.txt", () => {
  const txt = llmsTxt();

  it("follows the llmstxt.org shape: H1, blockquote, H2 link sections", () => {
    const lines = txt.split("\n");
    expect(lines[0]).toBe(`# ${profile.name}`);
    expect(lines.find((l) => l.startsWith("> "))).toBeDefined();
    expect(txt).toMatch(/^## Sections$/m);
    expect(txt).toMatch(/^## Optional$/m);
    expect(txt).not.toMatch(/^### /m);
  });

  it("links every project's markdown page", () => {
    for (const p of projects) expect(txt).toContain(`/projects/${p.id}.md`);
  });
});
