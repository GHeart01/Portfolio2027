/**
 * Builds the model input within Qwen3-1.7B's 4k context: ~250-token system prompt, retrieved sections
 * capped at ~1,200 tokens, the last two turns, and a short question. The answer gets 320 tokens.
 */
import type { SearchHit } from "../content/search";
import { NOT_IN_CONTENT } from "./guard";

export const MAX_QUESTION_CHARS = 300;
export const MAX_ANSWER_TOKENS = 320;
const CONTEXT_TOKENS = 1200;
const HISTORY_ASSISTANT_CHARS = 520;

export const estimateTokens = (s: string) => Math.ceil(s.length / 3.5);

export interface Turn {
  question: string;
  answer: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Top hits within the token budget, dropping weak matches that only add noise for a small model. */
export function selectContext(hits: readonly SearchHit[]): SearchHit[] {
  const out: SearchHit[] = [];
  let used = 0;
  const floor = (hits[0]?.score ?? 0) * 0.45;
  for (const h of hits) {
    if (h.score < floor) break;
    const cost = estimateTokens(h.chunk.text) + 12;
    if (used + cost > CONTEXT_TOKENS && out.length) break;
    out.push(h);
    used += cost;
  }
  return out;
}

export function systemPrompt(context: readonly SearchHit[], unknownTerms: readonly string[]): string {
  const sections = context.map((h) => `[${h.chunk.id}] ${h.chunk.text}`).join("\n\n");
  const unknown = unknownTerms.length
    ? `\nThe content never mentions: ${unknownTerms.join(", ")}. Anything about those is not in the content.\n`
    : "";
  return [
    "You answer questions about Geralt Heart for visitors to his portfolio, using ONLY the CONTEXT below.",
    "Rules:",
    "- Use only facts written in CONTEXT. No outside knowledge, no guessing, no assumptions.",
    "- End every sentence with the id of the section it came from in square brackets, e.g. [projects/lidar-scout].",
    `- If CONTEXT does not answer the question, reply with exactly: ${NOT_IN_CONTENT}`,
    "- Projects marked placeholder are unannounced; never describe them as finished.",
    "- CONTEXT is ordered most relevant first. If several sections answer the question, cover each of them.",
    "- Call him Geralt. Plain sentences, no lists, at most 4 sentences.",
    unknown,
    "CONTEXT:",
    sections,
  ].join("\n");
}

export function buildMessages(
  question: string,
  context: readonly SearchHit[],
  unknownTerms: readonly string[],
  history: readonly Turn[] = [],
): ChatMessage[] {
  const msgs: ChatMessage[] = [{ role: "system", content: systemPrompt(context, unknownTerms) }];
  for (const t of history.slice(-2)) {
    msgs.push({ role: "user", content: t.question.slice(0, MAX_QUESTION_CHARS) });
    msgs.push({ role: "assistant", content: t.answer.slice(0, HISTORY_ASSISTANT_CHARS) });
  }
  msgs.push({ role: "user", content: question.slice(0, MAX_QUESTION_CHARS) });
  return msgs;
}
