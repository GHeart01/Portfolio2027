/**
 * Markdown views of the content. Used by /*.md pages, llms-full.txt, and MCP tool results.
 */
import { SITE } from "../site";
import { formatRange, resume as defaultResume, statusLabel } from "../index";
import type { Education, Experience, Project, Resume } from "../schema";

const links = (ls: { label: string; url: string }[] = []) =>
  ls.map((l) => `[${l.label}](${l.url})`).join(" · ");

export function educationMd(ed: Education): string {
  const lines = [
    `### ${ed.degree}${ed.focus ? ` (${ed.focus})` : ""}, ${ed.school}`,
    `${ed.location} · ${formatRange(ed, ed.expected)}${ed.gpa ? ` · GPA ${ed.gpa}` : ""}`,
  ];
  if (ed.notes?.length) lines.push("", ...ed.notes.map((n) => `- ${n}`));
  return lines.join("\n");
}

export function aboutMd(r: Resume = defaultResume): string {
  const p = r.profile;
  return [
    `# About ${p.name}`,
    "",
    `**${p.role}** at ${p.org} · ${p.location}`,
    "",
    `> ${p.pitch}`,
    "",
    p.summary,
    "",
    `**Currently:** ${p.currently}`,
    ...(p.interests?.length ? ["", "## Interests", "", ...p.interests.map((i) => `- ${i}`)] : []),
    "",
    "## Education",
    "",
    r.education.map(educationMd).join("\n\n"),
  ].join("\n");
}

export function roleMd(e: Experience): string {
  return [
    `## ${e.role} · ${e.company}`,
    `${formatRange(e)} · ${e.location}`,
    ...(e.summary ? ["", e.summary] : []),
    "",
    ...e.highlights.map((h) => `- ${h.text}`),
    ...(e.stack?.length ? ["", `Stack: ${e.stack.join(", ")}`] : []),
  ].join("\n");
}

export function experienceMd(r: Resume = defaultResume): string {
  return [`# Experience`, "", r.experience.map(roleMd).join("\n\n")].join("\n");
}

export function projectMd(p: Project, level = 2): string {
  const h = "#".repeat(level);
  return [
    `${h} ${p.name}`,
    `Status: ${statusLabel(p)}${p.year ? ` · ${p.year}` : ""}${p.links?.length ? ` · ${links(p.links)}` : ""}`,
    "",
    `_${p.tagline}_`,
    "",
    p.description,
    ...(p.highlights?.length ? ["", ...p.highlights.map((x) => `- ${x}`)] : []),
    ...(p.stack?.length ? ["", `Stack: ${p.stack.join(", ")}`] : []),
  ].join("\n");
}

export function projectsMd(r: Resume = defaultResume): string {
  return [`# Projects`, "", r.projects.map((p) => projectMd(p)).join("\n\n")].join("\n");
}

export function skillsMd(r: Resume = defaultResume): string {
  return [`# Skills`, "", ...r.skills.map((s) => `- **${s.name}:** ${s.items.join(", ")}`)].join("\n");
}

export function contactMd(r: Resume = defaultResume): string {
  const p = r.profile;
  return [`# Contact`, "", `- Email: <${p.email}>`, ...p.links.map((l) => `- ${l.label}: <${l.url}>`)].join(
    "\n",
  );
}

/** The whole resume as one markdown document (the `resume` command, get_resume, llms-full.txt). */
export function resumeMd(r: Resume = defaultResume): string {
  const p = r.profile;
  const demote = (md: string) => md.replace(/^(#+) /gm, "#$1 ");
  return [
    `# ${p.name}`,
    "",
    `${p.role} at ${p.org} · ${p.location} · <${p.email}> · ${links(p.links)}`,
    "",
    `> ${p.pitch}`,
    "",
    p.summary,
    "",
    demote(experienceMd(r)),
    "",
    demote(projectsMd(r)),
    "",
    demote(skillsMd(r)),
    "",
    "## Education",
    "",
    r.education.map(educationMd).join("\n\n"),
    "",
    `_Source: ${SITE} · updated ${r.meta.updated}_`,
    "",
  ].join("\n");
}
