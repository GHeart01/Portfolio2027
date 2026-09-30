/**
 * WebLLM wrapper. Everything here is loaded with a dynamic import, only after the visitor clicks
 * [load model]; the library never ships with the page.
 */
import type { InitProgressReport, WebWorkerMLCEngine } from "@mlc-ai/web-llm";
import { MODEL } from "./model";
import { MAX_ANSWER_TOKENS, type ChatMessage } from "./prompt";

const CACHED_FLAG = "gh.model.cached";

export function probablyCached(): boolean {
  try {
    return localStorage.getItem(CACHED_FLAG) === "1";
  } catch {
    return false;
  }
}

export interface Engine {
  stream(messages: ChatMessage[], onToken: (text: string) => void): Promise<string>;
  interrupt(): void;
}

export async function loadEngine(f16: boolean, onProgress: (r: InitProgressReport) => void): Promise<Engine> {
  const webllm = await import("@mlc-ai/web-llm");
  const worker = new Worker(new URL("./engine-worker.ts", import.meta.url), { type: "module" });
  let engine: WebWorkerMLCEngine;
  try {
    engine = await webllm.CreateWebWorkerMLCEngine(worker, f16 ? MODEL.f16 : MODEL.f32, {
      initProgressCallback: onProgress,
    });
  } catch (err) {
    worker.terminate();
    throw err;
  }
  try {
    localStorage.setItem(CACHED_FLAG, "1");
  } catch {
    /* ignore */
  }

  return {
    async stream(messages, onToken) {
      const chunks = await engine.chat.completions.create({
        messages,
        stream: true,
        temperature: 0.3,
        top_p: 0.8,
        max_tokens: MAX_ANSWER_TOKENS,
        // Qwen3's hybrid thinking is off: answers must come straight from the context.
        extra_body: { enable_thinking: false },
      });
      let text = "";
      for await (const c of chunks) {
        text += c.choices[0]?.delta?.content ?? "";
        onToken(text);
      }
      return text;
    },
    interrupt() {
      engine.interruptGenerate();
    },
  };
}
