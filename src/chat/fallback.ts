/**
 * Keyword-search answers: used on phones, browsers without WebGPU, before the model is loaded, and
 * whenever the model fails. Grounded by construction: it only ever quotes the content.
 */
import type { Chunk } from "../content/chunks";
import type { SearchIndex } from "../content/search";
import { preCheck } from "./guard";

export type FallbackAnswer =
  { kind: "matches"; sources: Chunk[] } | { kind: "refusal"; unknownTerms: string[] };

export function keywordAnswer(index: SearchIndex, question: string, previous?: string): FallbackAnswer {
  const pre = preCheck(index, question, previous);
  if (!pre.ok) return { kind: "refusal", unknownTerms: pre.unknownTerms };
  // Show the strongest matches only: anything well below the best hit is usually noise.
  const top = pre.hits[0]!.score;
  const sources = pre.hits
    .filter((h) => h.score >= top * 0.6)
    .slice(0, 3)
    .map((h) => h.chunk);
  return { kind: "matches", sources };
}
