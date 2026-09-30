/**
 * Small BM25 keyword search over content chunks. No dependencies, so it runs in the browser, the
 * Worker (built once per isolate), and tests. Titles/keywords count double.
 */
import type { Chunk } from "./chunks";

export interface SearchHit {
  chunk: Chunk;
  score: number;
  /** Query terms (stemmed) that matched this chunk. */
  matched: string[];
}

export interface SearchIndex {
  search(query: string, opts?: { limit?: number; sections?: readonly Chunk["section"][] }): SearchHit[];
  /** Stemmed, stopword-free query terms that exist anywhere in the corpus. */
  knownTerms(query: string): string[];
  readonly chunks: readonly Chunk[];
}

const STOPWORDS = new Set(
  (
    "a an and are as at be been but by can could did do does for from had has have he her his how i if in " +
    "into is it its me my of on or our she so than that the their them then there these they this to " +
    "us was we were what when where which who whom why will with would you your about tell any some " +
    "geralt heart geralts"
  ).split(" "),
);

/** Tech names that would otherwise be destroyed by tokenizing on punctuation. */
const SPECIAL: [RegExp, string][] = [
  [/c#/gi, " csharp "],
  [/c\+\+/gi, " cpp "],
  [/\.net\b/gi, " dotnet "],
  [/\ba\*/gi, " astar "],
  [/\ba-star\b/gi, " astar "],
  [/node\.js/gi, " nodejs "],
  [/three\.js/gi, " threejs "],
  [/llms\.txt/gi, " llmstxt "],
];

export function stem(word: string): string {
  if (word.length <= 4) return word;
  if (word.endsWith("ies") && word.length > 5) return `${word.slice(0, -3)}y`;
  if (word.endsWith("ied") && word.length > 5) return `${word.slice(0, -3)}y`;
  if (word.endsWith("ing") && word.length > 6) return word.slice(0, -3);
  if (word.endsWith("ed") && word.length > 5) return word.slice(0, -2);
  if (word.endsWith("es") && /(ss|x|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

export function tokenize(text: string): string[] {
  let t = text;
  for (const [re, rep] of SPECIAL) t = t.replace(re, rep);
  return t
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map(stem);
}

const K1 = 1.2;
const B = 0.75;

export function createIndex(chunks: readonly Chunk[]): SearchIndex {
  const docs = chunks.map((chunk) => {
    const boosted = tokenize([chunk.title, ...chunk.keywords].join(" "));
    const terms = [...tokenize(chunk.text), ...boosted, ...boosted];
    const tf = new Map<string, number>();
    for (const t of terms) tf.set(t, (tf.get(t) ?? 0) + 1);
    return { chunk, tf, len: terms.length };
  });
  const avgLen = docs.reduce((s, d) => s + d.len, 0) / Math.max(docs.length, 1);
  const df = new Map<string, number>();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const idf = (t: string) => {
    const n = df.get(t) ?? 0;
    return Math.log(1 + (docs.length - n + 0.5) / (n + 0.5));
  };

  return {
    chunks,
    knownTerms(query) {
      return [...new Set(tokenize(query))].filter((t) => df.has(t));
    },
    search(query, opts = {}) {
      const q = [...new Set(tokenize(query))];
      if (q.length === 0) return [];
      const hits: SearchHit[] = [];
      for (const d of docs) {
        if (opts.sections && !opts.sections.includes(d.chunk.section)) continue;
        let score = 0;
        const matched: string[] = [];
        for (const t of q) {
          const f = d.tf.get(t);
          if (!f) continue;
          matched.push(t);
          score += idf(t) * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * d.len) / avgLen)));
        }
        if (score > 0) hits.push({ chunk: d.chunk, score, matched });
      }
      hits.sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id));
      return hits.slice(0, opts.limit ?? 5);
    },
  };
}
