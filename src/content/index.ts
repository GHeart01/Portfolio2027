/**
 * Typed access to content/resume.json for every runtime (browser, Worker, build).
 * Only types are imported from ./schema, so zod never ships to the browser. The JSON is validated
 * at build time (Astro integration) and in tests; see ./validate.ts.
 */
import raw from "../../content/resume.json";
import type { Education, Experience, Project, Resume } from "./schema";

export type * from "./schema";

export const resume = raw as Resume;
export const { profile, experience, projects, skills, education } = resume;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-08" → "Aug 2026"; "present" → "Present". */
export function formatMonth(ym: string): string {
  if (ym === "present") return "Present";
  const [y, m] = ym.split("-");
  return `${MONTHS[Number(m) - 1] ?? ""} ${y}`.trim();
}

export function formatRange(item: Pick<Experience | Education, "start" | "end">, expected = false): string {
  return `${formatMonth(item.start)} – ${formatMonth(item.end)}${expected ? " (expected)" : ""}`;
}

export function projectById(id: string): Project | undefined {
  return projects.find((p) => p.id === id);
}

export const featuredProjects = (): Project[] => projects.filter((p) => p.featured);

/** Status label that every interface uses, so placeholders are never presented as finished work. */
export function statusLabel(p: Pick<Project, "status" | "placeholder">): string {
  if (p.placeholder) return `${p.status}, placeholder`;
  return p.status;
}

export function linkByLabel(label: string): string | undefined {
  return profile.links.find((l) => l.label.toLowerCase() === label.toLowerCase())?.url;
}
