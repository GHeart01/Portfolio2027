/**
 * Flattens the resume into small, citable chunks with stable ids. Shared by the MCP `search` tool,
 * the chat's retrieval step, and the no-WebGPU keyword fallback.
 */
import { formatRange, resume as defaultResume, statusLabel } from "./index";
import type { Resume } from "./schema";

export type Section = "about" | "contact" | "experience" | "projects" | "skills" | "education";

export interface Chunk {
  /** Stable citation id, e.g. "experience/athena-intern/nl-to-sql-assistant". */
  id: string;
  section: Section;
  /** Short human title for citations. */
  title: string;
  /** Site path that shows this chunk. */
  url: string;
  /** Self-contained text: what the model reads and what search matches. */
  text: string;
  /** Boosted search terms (titles, tags, aliases). Not shown. */
  keywords: string[];
}

// State abbreviations people (and models) expand when they talk about places.
const STATES: Record<string, string> = { TX: "Texas", CO: "Colorado" };
const placeTerms = (loc: string) =>
  Object.entries(STATES)
    .filter(([abbr]) => new RegExp(`\\b${abbr}\\b`).test(loc))
    .map(([, name]) => name);

export function buildChunks(r: Resume = defaultResume): Chunk[] {
  const chunks: Chunk[] = [];
  const p = r.profile;

  chunks.push({
    id: "about",
    section: "about",
    title: `About ${p.name}`,
    url: "/about",
    text: [
      `${p.name}: ${p.role} at ${p.org}, ${p.location}.`,
      p.pitch,
      p.summary,
      `Currently: ${p.currently}.`,
      p.interests?.length ? `Interests: ${p.interests.join("; ")}.` : "",
    ]
      .filter(Boolean)
      .join(" "),
    keywords: [
      p.name,
      p.role,
      p.org,
      p.location,
      ...placeTerms(p.location),
      // the summary says "CU Boulder"; people expand it
      ...r.education.map((e) => e.school),
      "about",
      "bio",
      "background",
      "who",
      "work",
      "job",
      "employer",
      "current",
      "now",
    ],
  });

  chunks.push({
    id: "contact",
    section: "contact",
    title: "Contact",
    url: "/contact",
    text: `Contact ${p.name}: email ${p.email}. ${p.links.map((l) => `${l.label}: ${l.url}`).join(". ")}.`,
    keywords: ["contact", "email", "reach", "hire", "links", ...p.links.map((l) => l.label)],
  });

  for (const e of r.experience) {
    const header = `${e.role} at ${e.company} (${formatRange(e)}, ${e.location})`;
    chunks.push({
      id: `experience/${e.id}`,
      section: "experience",
      title: `${e.role} · ${e.company}`,
      url: `/experience#${e.id}`,
      text: [
        `${header}.`,
        e.summary ?? "",
        e.stack?.length ? `Stack: ${e.stack.join(", ")}.` : "",
        `Highlights: ${e.highlights.map((h) => h.text.split(". ")[0]).join("; ")}.`,
      ]
        .filter(Boolean)
        .join(" "),
      // "work"/"job" questions usually mean the current role, so only present roles get those terms.
      keywords: [
        e.role,
        e.company,
        ...(e.aliases ?? []),
        "experience",
        ...(e.end === "present" ? ["work", "job", "current", "now"] : ["previous", "past"]),
      ],
    });
    for (const h of e.highlights) {
      chunks.push({
        id: `experience/${e.id}/${h.id}`,
        section: "experience",
        title: `${e.role} · ${e.company}`,
        url: `/experience#${e.id}-${h.id}`,
        text: `${header}: ${h.text}${h.tags?.length ? ` (${h.tags.join(", ")})` : ""}`,
        keywords: [...(h.tags ?? []), ...(h.aliases ?? []), e.company, ...placeTerms(e.location)],
      });
    }
  }

  for (const pr of r.projects) {
    const links = pr.links?.map((l) => `${l.label}: ${l.url}`).join(", ");
    chunks.push({
      id: `projects/${pr.id}`,
      section: "projects",
      title: `${pr.name} (project)`,
      url: `/projects/${pr.id}`,
      text: [
        `Project ${pr.name} [status: ${statusLabel(pr)}]${pr.year ? ` (${pr.year})` : ""}: ${pr.tagline}`,
        pr.description,
        pr.highlights?.length ? `Highlights: ${pr.highlights.join("; ")}.` : "",
        pr.stack?.length ? `Stack: ${pr.stack.join(", ")}.` : "",
        links ? `Links: ${links}.` : "",
      ]
        .filter(Boolean)
        .join(" "),
      keywords: [pr.name, ...(pr.stack ?? []), ...(pr.aliases ?? []), "project", "built"],
    });
  }

  for (const s of r.skills) {
    chunks.push({
      id: `skills/${s.id}`,
      section: "skills",
      title: `Skills: ${s.name}`,
      url: `/skills#${s.id}`,
      text: `${s.name} skills: ${s.items.join(", ")}.`,
      keywords: [s.name, ...s.items, ...(s.aliases ?? []), "skills", "stack", "technologies"],
    });
  }

  for (const ed of r.education) {
    chunks.push({
      id: `education/${ed.id}`,
      section: "education",
      title: `${ed.degree} · ${ed.school}`,
      url: `/about#${ed.id}`,
      text: [
        `${ed.degree}${ed.focus ? ` (${ed.focus})` : ""}, ${ed.school}, ${ed.location}, ${formatRange(ed, ed.expected)}.`,
        ed.gpa ? `GPA ${ed.gpa}.` : "",
        ...(ed.notes ?? []).map((n) => `${n}.`),
      ]
        .filter(Boolean)
        .join(" "),
      keywords: [
        ed.school,
        ed.degree,
        ...(ed.aliases ?? []),
        "education",
        "degree",
        "school",
        "university",
        "study",
      ],
    });
  }

  return chunks;
}
