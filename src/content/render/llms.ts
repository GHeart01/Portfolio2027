/**
 * /llms.txt per https://llmstxt.org: H1, blockquote summary, then H2 sections of links.
 */
import { SITE } from "../site";
import { resume as defaultResume, statusLabel } from "../index";
import type { Resume } from "../schema";

export function llmsTxt(r: Resume = defaultResume): string {
  const p = r.profile;
  return [
    `# ${p.name}`,
    "",
    `> ${p.pitch} ${p.role} at ${p.org} (${p.location}).`,
    "",
    "Everything on this site comes from one content file. The same data is available as markdown (below),",
    `as a read-only MCP server at ${SITE}/mcp (Streamable HTTP, no auth), and as the full resume in llms-full.txt.`,
    "",
    "## Sections",
    "",
    `- [About](${SITE}/about.md): summary, interests, education`,
    `- [Experience](${SITE}/experience.md): roles and highlights`,
    `- [Projects](${SITE}/projects.md): shipped work and what's in progress`,
    `- [Skills](${SITE}/skills.md): languages, AI/ML, web, data, infra`,
    `- [Contact](${SITE}/contact.md): email and profiles`,
    "",
    "## Projects",
    "",
    ...r.projects.map(
      (pr) => `- [${pr.name}](${SITE}/projects/${pr.id}.md): ${pr.tagline} (${statusLabel(pr)})`,
    ),
    "",
    "## Agents",
    "",
    `- [MCP server](${SITE}/mcp.md): how to connect Claude or another MCP client`,
    "",
    "## Optional",
    "",
    `- [Full resume](${SITE}/llms-full.txt): every section in one markdown file`,
    "",
  ].join("\n");
}
