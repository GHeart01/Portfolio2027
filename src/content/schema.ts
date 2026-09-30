/**
 * Schema for content/resume.json — the single source for the site, the MCP server, llms.txt, and the chat.
 * Runtime code should `import type` from here; zod only runs at build/test time and in the Worker.
 */
import { z } from "zod";

const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase-kebab-case id")
  .describe("Stable id; used in URLs, citations, and MCP lookups. Don't rename casually.");

const yearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "YYYY-MM");

const aliases = z
  .array(z.string().min(1))
  .optional()
  .describe("Extra search terms (synonyms, acronyms). Not displayed.");

export const Link = z.strictObject({
  label: z.string().min(1),
  url: z.url(),
});

export const Profile = z.strictObject({
  name: z.string().min(1),
  role: z.string().min(1).describe("Job title, e.g. 'Software Engineer'"),
  org: z.string().min(1).describe("Current employer"),
  location: z.string().min(1),
  pitch: z.string().min(1).max(160).describe("One-line pitch shown at the top of every interface"),
  summary: z.string().min(1).describe("About paragraph"),
  currently: z.string().min(1).max(120).describe("neofetch 'currently:' status line"),
  stack: z.array(z.string()).min(1).max(8).describe("Short stack list for the neofetch readout"),
  interests: z.array(z.string()).optional(),
  email: z.email(),
  links: z.array(Link).min(1),
});

export const Highlight = z.strictObject({
  id: slug,
  text: z.string().min(1),
  tags: z.array(z.string()).optional(),
  aliases,
});

export const Experience = z.strictObject({
  id: slug,
  company: z.string().min(1),
  role: z.string().min(1),
  location: z.string().min(1),
  start: yearMonth,
  end: z.union([yearMonth, z.literal("present")]),
  summary: z.string().optional(),
  highlights: z.array(Highlight).min(1),
  stack: z.array(z.string()).optional(),
  aliases,
});

export const ProjectStatus = z.enum(["shipped", "in-progress", "planned"]);

export const Project = z.strictObject({
  id: slug,
  name: z.string().min(1),
  tagline: z.string().min(1).max(120),
  status: ProjectStatus,
  placeholder: z
    .boolean()
    .optional()
    .describe("True for not-yet-announced work; interfaces must never present it as finished"),
  featured: z.boolean().optional(),
  year: z.number().int().min(2000).max(2100).optional(),
  description: z.string().min(1),
  highlights: z.array(z.string()).optional(),
  stack: z.array(z.string()).optional(),
  links: z.array(Link).optional(),
  aliases,
});

export const SkillGroup = z.strictObject({
  id: slug,
  name: z.string().min(1),
  items: z.array(z.string().min(1)).min(1),
  aliases,
});

export const Education = z.strictObject({
  id: slug,
  school: z.string().min(1),
  degree: z.string().min(1),
  focus: z.string().optional(),
  location: z.string().min(1),
  start: yearMonth,
  end: yearMonth,
  expected: z.boolean().optional(),
  gpa: z.string().optional(),
  notes: z.array(z.string()).optional(),
  aliases,
});

export const Resume = z.strictObject({
  $schema: z.string().optional(),
  meta: z.strictObject({
    updated: z.iso.date(),
  }),
  profile: Profile,
  experience: z.array(Experience).min(1),
  projects: z.array(Project).min(1),
  skills: z.array(SkillGroup).min(1),
  education: z.array(Education).min(1),
});

/** Content as stored in resume.json (no defaults are applied, so the raw JSON import is exactly this type). */
export type Resume = z.infer<typeof Resume>;
export type Profile = z.infer<typeof Profile>;
export type Experience = z.infer<typeof Experience>;
export type Highlight = z.infer<typeof Highlight>;
export type Project = z.infer<typeof Project>;
export type ProjectStatus = z.infer<typeof ProjectStatus>;
export type SkillGroup = z.infer<typeof SkillGroup>;
export type Education = z.infer<typeof Education>;
export type Link = z.infer<typeof Link>;
