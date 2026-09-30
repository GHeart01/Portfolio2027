/**
 * MCP tool definitions: plain data + handlers over the shared content modules. No SDK imports here,
 * so the transport wiring (./server.ts) can change without touching what the tools do.
 */
import { z } from "zod";
import { buildChunks } from "../../content/chunks";
import { projectById, projects, resume, statusLabel } from "../../content/index";
import { experienceMd, projectMd, resumeMd, skillsMd } from "../../content/render/markdown";
import { Experience, Profile, Project, Resume, SkillGroup } from "../../content/schema";
import { createIndex } from "../../content/search";
import { SITE } from "../../content/site";

export interface ToolResult<T> {
  text: string;
  structured?: T;
  isError?: boolean;
}

export interface ToolDef<I extends z.ZodObject | undefined, O extends z.ZodObject> {
  name: string;
  title: string;
  description: string;
  inputSchema?: I;
  outputSchema: O;
  handler: (args: I extends z.ZodObject ? z.infer<I> : Record<string, never>) => ToolResult<z.infer<O>>;
}

// Built once per isolate, not per request.
const chunks = buildChunks();
const index = createIndex(chunks);
const abs = (path: string) => new URL(path, SITE).href;

const ProjectSummary = z.object({
  id: z.string(),
  name: z.string(),
  tagline: z.string(),
  status: z.string().describe("shipped | in-progress | planned; '…, placeholder' means not yet announced"),
  url: z.string(),
});

const getProfile = {
  name: "get_profile",
  title: "Profile",
  description:
    "Geralt Heart's profile: name, current role and employer, location, one-line pitch, summary, what he's " +
    "working on now, interests, email, and links. Start here for 'who is Geralt?'.",
  outputSchema: Profile,
  handler: () => {
    const p = resume.profile;
    return {
      text: [
        `${p.name}, ${p.role} at ${p.org} (${p.location})`,
        p.pitch,
        p.summary,
        `Currently: ${p.currently}`,
        `Email: ${p.email}`,
        ...p.links.map((l) => `${l.label}: ${l.url}`),
      ].join("\n"),
      structured: p,
    };
  },
} satisfies ToolDef<undefined, typeof Profile>;

const ExperienceOut = z.object({ experience: z.array(Experience) });
const getExperience = {
  name: "get_experience",
  title: "Work experience",
  description:
    "All of Geralt's roles, newest first, with dates, highlights, and stack. Work for his current employer " +
    "is described at the architecture level only.",
  outputSchema: ExperienceOut,
  handler: () => ({ text: experienceMd(), structured: { experience: resume.experience } }),
} satisfies ToolDef<undefined, typeof ExperienceOut>;

const ProjectsOut = z.object({ projects: z.array(ProjectSummary) });
const listProjects = {
  name: "list_projects",
  title: "List projects",
  description:
    "Every project with its status. Projects marked 'placeholder' are in progress and not yet announced; " +
    "don't describe them as finished. Use get_project for details.",
  outputSchema: ProjectsOut,
  handler: () => {
    const list = projects.map((p) => ({
      id: p.id,
      name: p.name,
      tagline: p.tagline,
      status: statusLabel(p),
      url: abs(`/projects/${p.id}`),
    }));
    return {
      text: list.map((p) => `- ${p.name} [${p.status}] (${p.id}): ${p.tagline}`).join("\n"),
      structured: { projects: list },
    };
  },
} satisfies ToolDef<undefined, typeof ProjectsOut>;

const GetProjectIn = z.object({
  name: z.string().min(1).max(100).describe("Project id or name, e.g. 'lidar-scout' or 'LiDAR Scout'"),
});
const GetProjectOut = z.object({ project: Project, url: z.string() });
function findProject(q: string) {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const n = norm(q);
  return (
    projectById(q.trim().toLowerCase()) ??
    projects.find((p) => norm(p.name) === n || norm(p.id) === n) ??
    projects.find((p) => norm(p.id).startsWith(n) || norm(p.name).startsWith(n)) ??
    projects.find(
      (p) => index.search(q, { sections: ["projects"], limit: 1 })[0]?.chunk.id === `projects/${p.id}`,
    )
  );
}
const getProject = {
  name: "get_project",
  title: "Get project",
  description: "One project in full: description, highlights, stack, links, and status.",
  inputSchema: GetProjectIn,
  outputSchema: GetProjectOut,
  handler: ({ name }: z.infer<typeof GetProjectIn>) => {
    const p = findProject(name);
    if (!p) {
      return {
        isError: true,
        text: `No project matches "${name}". Available: ${projects.map((x) => x.id).join(", ")}.`,
      };
    }
    return { text: projectMd(p, 1), structured: { project: p, url: abs(`/projects/${p.id}`) } };
  },
} satisfies ToolDef<typeof GetProjectIn, typeof GetProjectOut>;

const SkillsOut = z.object({ skills: z.array(SkillGroup) });
const getSkills = {
  name: "get_skills",
  title: "Skills",
  description: "Geralt's skills grouped by category (languages, AI/ML, web, data, infra).",
  outputSchema: SkillsOut,
  handler: () => ({ text: skillsMd(), structured: { skills: resume.skills } }),
} satisfies ToolDef<undefined, typeof SkillsOut>;

const SearchIn = z.object({
  query: z.string().min(1).max(200).describe("Keywords, e.g. 'RAG', 'path planning', 'SQL Server'"),
  limit: z.number().int().min(1).max(10).optional().describe("Max results (default 5)"),
});
const SearchOut = z.object({
  results: z.array(
    z.object({
      id: z.string().describe("Stable section id; cite it"),
      section: z.string(),
      title: z.string(),
      url: z.string(),
      score: z.number(),
      text: z.string(),
    }),
  ),
});
const search = {
  name: "search",
  title: "Search",
  description:
    "Keyword search (BM25) across the whole resume: roles, highlights, projects, skills, education. Returns " +
    "matching sections with ids and URLs to cite. Empty results mean the answer isn't in Geralt's content.",
  inputSchema: SearchIn,
  outputSchema: SearchOut,
  handler: ({ query, limit }: z.infer<typeof SearchIn>) => {
    const results = index.search(query, { limit: limit ?? 5 }).map((h) => ({
      id: h.chunk.id,
      section: h.chunk.section,
      title: h.chunk.title,
      url: abs(h.chunk.url),
      score: Math.round(h.score * 1000) / 1000,
      text: h.chunk.text,
    }));
    const text = results.length
      ? results.map((r) => `[${r.id}] ${r.title}\n${r.text}\n${r.url}`).join("\n\n")
      : `No matches for "${query}" in Geralt's content.`;
    return { text, structured: { results } };
  },
} satisfies ToolDef<typeof SearchIn, typeof SearchOut>;

const ResumeOut = z.object({ markdown: z.string(), resume: Resume, url: z.string() });
const getResume = {
  name: "get_resume",
  title: "Full resume",
  description:
    "The complete resume as markdown plus structured data. (There is no PDF; everything is published as text.)",
  outputSchema: ResumeOut,
  handler: () => {
    const markdown = resumeMd();
    const { $schema: _schema, ...data } = resume;
    return { text: markdown, structured: { markdown, resume: data, url: abs("/resume") } };
  },
} satisfies ToolDef<undefined, typeof ResumeOut>;

export const TOOLS = [
  getProfile,
  getExperience,
  listProjects,
  getProject,
  getSkills,
  search,
  getResume,
] as const;

export const SERVER_INSTRUCTIONS =
  "Read-only access to Geralt Heart's portfolio (the same content as geraltheart.com). Use `search` to find " +
  "relevant sections and cite their ids or URLs. If search returns nothing, the answer isn't in his content: " +
  "say so rather than guessing. Projects marked 'placeholder' are unannounced work in progress.";
