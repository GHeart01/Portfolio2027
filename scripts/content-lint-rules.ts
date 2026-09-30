/**
 * Content-safety rules. The day job is in an ITAR-regulated environment, so anything that looks like
 * internal detail (system names, part/model numbers, headcounts, security controls, personal contact
 * info) must never reach this public repo.
 *
 * Two layers:
 *  - generic pattern rules (safe to publish, live here);
 *  - a private denylist of real internal names, loaded from the gitignored `.content-denylist` file or
 *    the CONTENT_DENYLIST secret. Denylist hits are reported by entry number only, never by the text.
 */

export type Severity = "error" | "warn";

export interface Finding {
  file: string;
  line: number;
  rule: string;
  severity: Severity;
}

interface PatternRule {
  id: string;
  severity: Severity;
  pattern: RegExp;
  /** Only applied to files where this returns true (defaults to every scanned file). */
  appliesTo?: (file: string) => boolean;
  /** Return false to ignore a specific match. */
  accept?: (match: string) => boolean;
}

export const PUBLIC_EMAILS = new Set(["emailme@geraltheart.com", "noreply@anthropic.com"]);

const isContent = (file: string) => file.startsWith("content/") || file.endsWith(".md");

export const GENERIC_RULES: readonly PatternRule[] = [
  {
    id: "phone-number",
    severity: "error",
    pattern: /(?<![\w.-])\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}(?![\w-])/g,
    appliesTo: isContent,
  },
  {
    id: "unlisted-email",
    severity: "error",
    pattern: /[\w.+-]+@[\w-]+\.[\w.-]+/g,
    appliesTo: isContent,
    accept: (m) => !PUBLIC_EMAILS.has(m.toLowerCase()),
  },
  {
    // Model / part-number shaped tokens: uppercase letters sandwiched by digits, e.g. "AB12CD3".
    id: "model-or-part-number",
    severity: "error",
    pattern: /\b[A-Z0-9]*[A-Z]+\d+[A-Z]+\d*[A-Z0-9]*\b/g,
    appliesTo: isContent,
    accept: (m) => m.length >= 5,
  },
  {
    id: "long-numeric-id",
    severity: "error",
    pattern: /\b\d{5,}(?:-\d+)+\b/g,
    appliesTo: isContent,
  },
  {
    id: "controlled-data-detail",
    severity: "error",
    pattern:
      /\b(export[- ](controlled|restricted)|controlled unclassified|technical data package|access controls? for)\b/gi,
    appliesTo: isContent,
  },
  {
    id: "customer-or-program",
    severity: "warn",
    pattern: /\b(customers?|clients?|programs? name|part numbers?|drawing numbers?)\b/gi,
    appliesTo: (f) => f.startsWith("content/"),
  },
  {
    id: "internal-metric",
    severity: "warn",
    pattern: /\b\d+\+?\s*(users|people|employees|operators|work ?centers|machines|technicians)\b/gi,
    appliesTo: (f) => f.startsWith("content/"),
  },
  {
    id: "percent-claim",
    severity: "warn",
    pattern: /\b\d{1,3}(\.\d+)?\s?%/g,
    appliesTo: (f) => f.startsWith("content/"),
  },
];

/** Parses a denylist: one term per line (or comma separated), `#` comments, blank lines ignored. */
export function parseDenylist(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((l) => l.replace(/#.*$/, "").trim())
    .filter(Boolean);
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function denylistPattern(term: string): RegExp {
  // Word-ish boundaries that also work for terms containing punctuation.
  return new RegExp(`(?<![A-Za-z0-9])${escape(term)}(?![A-Za-z0-9])`, "i");
}

export function lintText(file: string, text: string, denylist: readonly string[]): Finding[] {
  const findings: Finding[] = [];
  const denyPatterns = denylist.map(denylistPattern);
  const rules = GENERIC_RULES.filter((r) => !r.appliesTo || r.appliesTo(file));
  const lines = text.split("\n");

  lines.forEach((lineText, i) => {
    const line = i + 1;
    denyPatterns.forEach((re, n) => {
      if (re.test(lineText)) findings.push({ file, line, rule: `denylist#${n + 1}`, severity: "error" });
    });
    for (const rule of rules) {
      for (const m of lineText.matchAll(rule.pattern)) {
        if (rule.accept && !rule.accept(m[0])) continue;
        findings.push({ file, line, rule: rule.id, severity: rule.severity });
        break;
      }
    }
  });
  return findings;
}

const TEXT_EXT = /\.(json|jsonc|md|mdx|ts|tsx|js|mjs|astro|txt|ya?ml|css|html|svg|sh)$/i;
const SKIP = [
  /^pnpm-lock\.yaml$/,
  /worker-configuration\.d\.ts$/,
  /^public\/fonts\//,
  /^\.content-denylist$/,
];

export function shouldScan(file: string): boolean {
  return TEXT_EXT.test(file) && !SKIP.some((re) => re.test(file));
}
