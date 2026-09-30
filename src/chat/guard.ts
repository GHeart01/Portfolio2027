/**
 * Grounding guard for the ask chat. The model is small; the guard is what makes "never invent facts"
 * hold. Four layers:
 *   1. fixed intents answered without the model (greetings, contact, resume);
 *   2. a retrieval pre-check that refuses before the model runs when the content can't answer;
 *   3. the prompt demands [id] citations or the exact reply NOT_IN_CONTENT (see ./prompt.ts);
 *   4. a post-check that keeps only sentences whose checkable facts (numbers, URLs, emails, proper
 *      nouns) appear in a retrieved section, re-attributing missing or wrong citations to the section
 *      that actually supports the sentence.
 * Pure functions: unit-tested with real bad outputs captured by `pnpm eval:chat`.
 */
import type { Chunk } from "../content/chunks";
import { tokenize, type SearchHit, type SearchIndex } from "../content/search";

export const NOT_IN_CONTENT = "NOT_IN_CONTENT";
/** Minimum BM25 score of the best hit before the model is allowed to answer. See tests/chat.test.ts. */
export const MIN_TOP_SCORE = 2.0;

export type Intent = "greeting" | "contact" | "resume" | "help";

export function detectIntent(q: string): Intent | null {
  const s = q
    .trim()
    .toLowerCase()
    .replace(/[!?.]+$/, "");
  if (/^(hi|hello|hey|yo|howdy|good (morning|afternoon|evening))( there)?$/.test(s)) return "greeting";
  if (/^(help|what can (i|you) (ask|do))/.test(s)) return "help";
  if (/\b(contact|reach|email|e-mail|get in touch|hire|phone|call)\b/.test(s)) return "contact";
  if (/\b(resume|cv|pdf)\b/.test(s)) return "resume";
  return null;
}

export type PreCheck =
  | { ok: true; hits: SearchHit[]; unknownTerms: string[] }
  | { ok: false; reason: "no-overlap" | "low-score"; unknownTerms: string[] };

/**
 * Names in the question (capitalized words after the first, or tech-looking tokens) that never appear
 * anywhere in the content, e.g. "Google" in "Did Geralt work at Google?". Plain words are left out:
 * they're either stopwords or already make the question fail retrieval.
 */
export function unknownTerms(index: SearchIndex, question: string): string[] {
  const words = question.match(/\.?[A-Za-z][A-Za-z0-9+#.-]*[A-Za-z0-9+#]|[A-Za-z]/g) ?? [];
  const out = new Set<string>();
  words.forEach((raw, i) => {
    const w = raw.replace(/[.]$/, "");
    const salient = (i > 0 && /^[A-Z]/.test(w)) || /[0-9+#]/.test(w) || /^[A-Z]{2,}$/.test(w);
    if (!salient || !tokenize(w).length) return;
    if (index.knownTerms(w).length === 0) out.add(w);
  });
  return [...out];
}

/** Questions that point back at the previous one ("what stack did it use?"). */
const REFERENTIAL = /\b(it|its|it's|that|this|there|they|them|those|these|same)\b/i;

export function preCheck(index: SearchIndex, question: string, previous?: string): PreCheck {
  const unknown = unknownTerms(index, question);
  const known = index.knownTerms(question);
  // Only a referential follow-up borrows terms from the previous question; an unrelated question
  // ("favorite food?") must stand on its own.
  const followUp = previous && known.length < 2 && REFERENTIAL.test(question);
  const query = followUp ? `${question} ${previous}` : question;
  if (index.knownTerms(query).length === 0) return { ok: false, reason: "no-overlap", unknownTerms: unknown };
  const hits = index.search(query, { limit: 5 });
  if (!hits.length || hits[0]!.score < MIN_TOP_SCORE) {
    return { ok: false, reason: "low-score", unknownTerms: unknown };
  }
  return { ok: true, hits, unknownTerms: unknown };
}

export interface Sentence {
  text: string;
  cites: string[];
}

export type Checked =
  | { kind: "answer"; sentences: Sentence[]; sources: Chunk[]; dropped: number }
  | { kind: "refusal"; reason: "not-in-content" | "no-valid-citations" | "unsupported"; dropped: number };

const CITE = /\[([a-z0-9][a-z0-9/_-]*(?:\s*[,;]\s*[a-z0-9][a-z0-9/_-]*)*)\]/gi;

export function stripThinking(raw: string): string {
  return raw.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").trim();
}

/** Splits into sentences, attaching trailing citation-only fragments to the sentence before them. */
export function splitSentences(text: string): Sentence[] {
  const pieces = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+|(?<=\])\s+(?=[A-Z])/)
    .map((p) => p.trim())
    .filter(Boolean);
  const out: Sentence[] = [];
  for (const p of pieces) {
    const cites = [...p.matchAll(CITE)].flatMap((m) => m[1]!.split(/\s*[,;]\s*/)).map((c) => c.toLowerCase());
    const body = p
      .replace(CITE, "")
      .replace(/\s+([.,;:!?])(?=\s|$)/g, "$1")
      .trim();
    if (!body.replace(/[.\s]/g, "") && out.length) {
      out.at(-1)!.cites.push(...cites);
      continue;
    }
    out.push({ text: body, cites });
  }
  return out;
}

const WORD_ALLOW = new Set(
  "Geralt Heart He His Him I The A An This That It Its In On At For And But Or Yes No Also His There They Their Both"
    .split(" ")
    .map((w) => w.toLowerCase()),
);

/** Facts in a sentence that must be backed by its sources. */
export function checkableFacts(input: string): string[] {
  const sentence = input.replace(/[*_`]/g, "");
  const facts: string[] = [];
  for (const m of sentence.matchAll(/https?:\/\/[^\s)\]]+|[\w.+-]+@[\w-]+\.[\w.-]+/g))
    facts.push(m[0].replace(/[.,]$/, ""));
  const noLinks = sentence.replace(/https?:\/\/[^\s)\]]+|[\w.+-]+@[\w-]+\.[\w.-]+/g, " ");
  for (const m of noLinks.matchAll(/\d+(?:\.\d+)?%?/g)) facts.push(m[0]);
  // Capitalized words that aren't the first word: names, companies, technologies.
  const words = noLinks.split(/\s+/).filter(Boolean);
  words.forEach((w, i) => {
    const clean = w.replace(/^[("'`]+|[)"'`,.;:!?]+$/g, "");
    if (i === 0 || !/^[A-Z][A-Za-z0-9+#.-]*$/.test(clean) || WORD_ALLOW.has(clean.toLowerCase())) return;
    facts.push(clean.replace(/'s$/, ""));
  });
  return facts;
}

const mergeChunks = (a: Chunk, b: Chunk): Chunk => ({
  ...a,
  id: `${a.id}+${b.id}`,
  text: `${a.text}\n${b.text}`,
  title: `${a.title} ${b.title}`,
  keywords: [...a.keywords, ...b.keywords],
});

const evidenceOf = (c: Chunk) => `${c.text} ${c.title} ${c.keywords.join(" ")}`.toLowerCase();

function supported(sentence: string, c: Chunk): boolean {
  const ev = evidenceOf(c);
  return checkableFacts(sentence).every((f) => ev.includes(f.toLowerCase()));
}

// Answer-glue words that say nothing about the content.
const GLUE = new Set(["yes", "use", "used", "using", "know", "knows", "worked", "include", "includ", "also"]);

/** How many of the sentence's content words appear in the chunk, and what share that is. */
function overlap(sentence: string, c: Chunk): { hits: number; share: number } {
  const words = new Set(tokenize(sentence).filter((w) => !GLUE.has(w)));
  if (!words.size) return { hits: 0, share: 0 };
  const chunkWords = new Set(tokenize(`${c.text} ${c.title} ${c.keywords.join(" ")}`));
  let hits = 0;
  for (const w of words) if (chunkWords.has(w)) hits++;
  return { hits, share: hits / words.size };
}

/**
 * A sentence with checkable facts, all found in the section, needs only modest word overlap; a
 * sentence with no checkable facts ("Geralt is a great engineer") must mostly restate the section.
 */
function matches(sentence: string, c: Chunk): number {
  if (!supported(sentence, c)) return 0;
  const { hits, share } = overlap(sentence, c);
  const hasFacts = checkableFacts(sentence).length > 0;
  if (hasFacts ? share >= 0.3 : hits >= 2 && share >= 0.6) return share;
  return 0;
}

/**
 * Small models often drop or misplace citations. A sentence keeps its own valid citations when they
 * support it; otherwise it's credited to the retrieved section that supports all of its facts and
 * shares most of its wording. Sentences no section supports are dropped.
 */
function attribute(sentence: string, cites: string[], retrieved: readonly Chunk[]): string[] | null {
  const own = retrieved.filter((c) => cites.includes(c.id));
  if (own.length && own.some((c) => supported(sentence, c))) return own.map((c) => c.id);
  let best: { id: string; score: number } | null = null;
  for (const c of retrieved) {
    const score = matches(sentence, c);
    if (score > 0 && (!best || score > best.score)) best = { id: c.id, score };
  }
  if (best) return [best.id];
  // A sentence can combine two sections ("building MCP tools and finishing an MS at CU Boulder").
  for (let i = 0; i < retrieved.length; i++) {
    for (let j = i + 1; j < retrieved.length; j++) {
      const pair = mergeChunks(retrieved[i]!, retrieved[j]!);
      if (matches(sentence, pair) > 0) return [retrieved[i]!.id, retrieved[j]!.id];
    }
  }
  return null;
}

// The model's ways of saying "not in the context" besides the exact token.
const REFUSAL_SIGNAL =
  /not[\s_-]*in[\s_-]*(the[\s_-]*)?(content|context)|(context|content) (does not|doesn't) (mention|say|include|contain)|no information (about|on)|not mentioned/i;

export function checkAnswer(raw: string, retrieved: readonly Chunk[]): Checked {
  const text = stripThinking(raw);
  if (!text || text.includes(NOT_IN_CONTENT) || REFUSAL_SIGNAL.test(text)) {
    return { kind: "refusal", reason: "not-in-content", dropped: 0 };
  }

  const byId = new Map(retrieved.map((c) => [c.id, c]));
  const kept: Sentence[] = [];
  let dropped = 0;
  let sawValidCite = false;

  for (const s of splitSentences(text)) {
    if (s.cites.some((c) => byId.has(c))) sawValidCite = true;
    const cites = attribute(s.text, s.cites, retrieved);
    if (!cites) {
      dropped++;
      continue;
    }
    kept.push({ text: s.text, cites });
  }

  if (!kept.length) {
    return { kind: "refusal", reason: sawValidCite ? "unsupported" : "no-valid-citations", dropped };
  }
  const sourceIds = [...new Set(kept.flatMap((s) => s.cites))];
  return { kind: "answer", sentences: kept, sources: sourceIds.map((id) => byId.get(id)!), dropped };
}
