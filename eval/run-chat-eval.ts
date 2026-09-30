/**
 * Local-only eval of the in-browser model (CI has no WebGPU):
 *
 *   pnpm dev:worker          # serves the built site on :8787
 *   pnpm eval:chat           # opens headed Chrome, loads the model once (cached in .cache/), asks every question
 *
 * Scores refusal precision/recall and citation validity; raw outputs go to eval/results/ so bad answers
 * can become guard.ts unit-test fixtures.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

type Expect =
  | "refuse"
  | "refuse-or-placeholder"
  | { cite: string | string[]; contains?: string[] }
  // a trap where a grounded non-answer is fine as long as it doesn't claim the false premise
  | { refuseOr: true; notContains: string[] };
interface Case {
  q: string;
  expect: Expect;
}
interface Result {
  kind: string;
  text: string;
  citations: string[];
  related?: string[];
  raw?: string;
  reason?: string;
}

const BASE = process.env.EVAL_BASE ?? "http://localhost:8787";
const cases: Case[] = readFileSync("eval/chat.jsonl", "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l) as Case);

const ctx = await chromium.launchPersistentContext(".cache/eval-profile", {
  headless: false,
  viewport: { width: 1100, height: 900 },
  args: ["--enable-unsafe-webgpu"],
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
page.on("console", (m) => m.type() === "error" && console.error("page:", m.text()));
await page.goto(`${BASE}/ask?eval`);
await page.waitForFunction(() => "__chatEval" in window, null, { timeout: 30_000 });

type EvalApi = { load(): Promise<void>; ask(q: string): Promise<Result>; ready(): boolean; gpu(): unknown };
const gpu = await page.evaluate(() => (window as unknown as { __chatEval: EvalApi }).__chatEval.gpu());
console.log("gpu:", JSON.stringify(gpu));
console.log("loading model (first run downloads ~1 GB)…");
const t0 = Date.now();
await page.evaluate(() => (window as unknown as { __chatEval: EvalApi }).__chatEval.load());
const ready = await page.evaluate(() => (window as unknown as { __chatEval: EvalApi }).__chatEval.ready());
if (!ready) {
  console.error("model failed to load; see the page for the reason");
  process.exit(1);
}
console.log(`model ready in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

const rows: (Case & { result: Result; pass: boolean; ms: number })[] = [];
for (const c of cases) {
  const t = Date.now();
  const result = await page.evaluate(
    (q) => (window as unknown as { __chatEval: EvalApi }).__chatEval.ask(q),
    c.q,
  );
  const refused = result.kind === "refusal";
  let pass: boolean;
  if (c.expect === "refuse") pass = refused;
  else if (c.expect === "refuse-or-placeholder")
    pass = refused || /placeholder|in progress|not yet/i.test(result.text);
  else if ("refuseOr" in c.expect) {
    const e = c.expect;
    pass = refused || e.notContains.every((s) => !result.text.includes(s));
  } else {
    const e = c.expect;
    pass =
      !refused &&
      result.citations.some((id) => [e.cite].flat().some((c) => id.startsWith(c))) &&
      (e.contains ?? []).every((s) => result.text.includes(s));
  }
  rows.push({ ...c, result, pass, ms: Date.now() - t });
  console.log(`${pass ? "✓" : "✗"} ${c.q}\n   → ${result.kind}: ${result.text.slice(0, 160)}`);
  if (result.related?.length) console.log(`     also relevant: ${result.related.join(", ")}`);
}

const isTrap = (e: Expect) => typeof e === "string" || "refuseOr" in e;
const refuseCases = rows.filter((r) => isTrap(r.expect));
const answerCases = rows.filter((r) => !isTrap(r.expect));
const refusedAll = rows.filter((r) => r.result.kind === "refusal");
const summary = {
  model: "Qwen3-1.7B",
  total: rows.length,
  passed: rows.filter((r) => r.pass).length,
  refusalRecall: refuseCases.filter((r) => r.result.kind === "refusal").length / refuseCases.length,
  refusalPrecision: refusedAll.length
    ? refusedAll.filter((r) => isTrap(r.expect)).length / refusedAll.length
    : 1,
  answeredCorrectly: answerCases.filter((r) => r.pass).length / answerCases.length,
  // traps the model answered in a way the expectation rejects
  inventedFacts: refuseCases.filter((r) => !r.pass).map((r) => r.q),
  medianMs: rows.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(rows.length / 2)],
};
console.log(summary);
mkdirSync("eval/results", { recursive: true });
writeFileSync(
  `eval/results/${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  JSON.stringify({ summary, rows }, null, 2),
);
await ctx.close();
process.exit(summary.inventedFacts.length ? 1 : 0);
