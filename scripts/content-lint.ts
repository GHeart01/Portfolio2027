/**
 * Usage:
 *   pnpm content:lint            scan tracked + untracked (non-ignored) files in the working tree
 *   pnpm content:lint --staged   scan exactly what is staged for commit (pre-commit hook)
 *
 * Private denylist: `.content-denylist` (gitignored) or the CONTENT_DENYLIST env var (CI secret).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { lintText, parseDenylist, shouldScan, type Finding } from "./content-lint-rules";

const staged = process.argv.includes("--staged");
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 << 20 });

function loadDenylist(): { terms: string[]; source: string } {
  if (process.env.CONTENT_DENYLIST) {
    return { terms: parseDenylist(process.env.CONTENT_DENYLIST), source: "CONTENT_DENYLIST" };
  }
  if (existsSync(".content-denylist")) {
    return { terms: parseDenylist(readFileSync(".content-denylist", "utf8")), source: ".content-denylist" };
  }
  return { terms: [], source: "none" };
}

function listFiles(): string[] {
  const out = staged
    ? git("diff", "--cached", "--name-only", "--diff-filter=ACMR")
    : git("ls-files", "--cached", "--others", "--exclude-standard");
  return out.split("\n").filter(Boolean).filter(shouldScan);
}

function read(file: string): string | undefined {
  try {
    return staged ? git("show", `:${file}`) : readFileSync(file, "utf8");
  } catch {
    return undefined; // deleted in working tree, etc.
  }
}

const { terms, source } = loadDenylist();
const findings: Finding[] = [];
for (const file of listFiles()) {
  const text = read(file);
  if (text !== undefined) findings.push(...lintText(file, text, terms));
}

const errors = findings.filter((f) => f.severity === "error");
const warns = findings.filter((f) => f.severity === "warn");
for (const f of findings) {
  // Never echo the matched text: in CI the log is public.
  console.log(`${f.severity === "error" ? "✗" : "!"} ${f.file}:${f.line}  ${f.rule}`);
}
if (source === "none") {
  console.log("! no private denylist found (.content-denylist or CONTENT_DENYLIST); generic rules only");
}
console.log(
  `content-lint: ${errors.length} error(s), ${warns.length} warning(s)` +
    (terms.length ? `, denylist: ${terms.length} term(s) from ${source}` : ""),
);
process.exit(errors.length ? 1 : 0);
