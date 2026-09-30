/**
 * Build/test-time validation: schema + cross-field rules. Not imported by browser code.
 */
import { z } from "zod";
import { Resume } from "./schema";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateResume(data: unknown): ValidationResult {
  const parsed = Resume.safeParse(data);
  if (!parsed.success) {
    return { ok: false, errors: [z.prettifyError(parsed.error)] };
  }
  const r = parsed.data;
  const errors: string[] = [];

  const unique = (label: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) errors.push(`duplicate ${label} id "${id}"`);
      seen.add(id);
    }
  };
  unique(
    "experience",
    r.experience.map((e) => e.id),
  );
  unique(
    "project",
    r.projects.map((p) => p.id),
  );
  unique(
    "skill group",
    r.skills.map((s) => s.id),
  );
  unique(
    "education",
    r.education.map((e) => e.id),
  );
  for (const e of r.experience)
    unique(
      `highlight (in ${e.id})`,
      e.highlights.map((h) => h.id),
    );

  for (const e of [...r.experience, ...r.education]) {
    if (e.end !== "present" && e.end < e.start)
      errors.push(`${e.id}: end ${e.end} is before start ${e.start}`);
  }
  for (const p of r.projects) {
    if (p.placeholder && p.status === "shipped") errors.push(`${p.id}: a placeholder can't be "shipped"`);
    if (p.placeholder && p.featured) errors.push(`${p.id}: placeholders can't be featured`);
  }
  if (!r.projects.some((p) => p.featured)) errors.push("at least one project must be featured");

  return { ok: errors.length === 0, errors };
}
