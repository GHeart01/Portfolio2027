/**
 * The `ask` island. Keyword search works immediately everywhere; the in-browser model is opt-in.
 * Every answer is either quoted from the content or passes the grounding guard, with sources.
 */
import { buildChunks, type Chunk } from "../content/chunks";
import { profile } from "../content/index";
import { createIndex } from "../content/search";
import { dissolveIn } from "../fx/glyph-dissolve";
import { keywordAnswer } from "./fallback";
import { GPU_REASONS, detectGpu, type GpuSupport } from "./gpu";
import { checkAnswer, detectIntent, preCheck, type Checked, type Intent } from "./guard";
import { MAX_QUESTION_CHARS, buildMessages, selectContext, type Turn } from "./prompt";
import type { Engine } from "./engine";
import { MODEL } from "./model";

const index = createIndex(buildChunks());

const SUGGESTIONS = [
  "What has Geralt built with RAG?",
  "What does he do at Athena Manufacturing?",
  "Tell me about LiDAR Scout",
  "Does he know .NET?",
];

type Mode = "keyword" | "model";

export interface EvalResult {
  kind: "answer" | "refusal" | "intent" | "matches";
  text: string;
  citations: string[];
  related?: string[];
  raw?: string;
  reason?: string;
}

const h = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  const { class: cls, ...rest } = props;
  if (cls) el.className = cls;
  Object.assign(el, rest);
  el.append(...children);
  return el;
};

const link = (href: string, text: string) => h("a", { href }, text);

function sourcesList(sources: Chunk[]): HTMLElement {
  const ol = h("ol", { class: "sources" });
  sources.forEach((c) =>
    ol.append(h("li", {}, link(c.url, c.title), " ", h("span", { class: "dim" }, `[${c.id}]`))),
  );
  return h("div", { class: "sources-wrap" }, h("p", { class: "dim" }, "sources"), ol);
}

function refusal(unknown: string[]): HTMLElement {
  const p = h("p", {}, h("span", { class: "err" }, "not in the content: "));
  p.append(
    unknown.length
      ? `nothing on this site mentions ${unknown.join(", ")}, so I won't guess. `
      : "I couldn't find that in Geralt's content, so I won't guess. ",
    "Try ",
    link("/experience", "experience"),
    ", ",
    link("/projects", "projects"),
    ", or ask about RAG, robotics, or .NET.",
  );
  return p;
}

function intentAnswer(intent: Intent): { node: HTMLElement; text: string } {
  switch (intent) {
    case "greeting":
    case "help": {
      const text =
        "Hi! Ask about Geralt's work, projects, skills, or education. Answers come only from this site.";
      return { node: h("p", {}, text), text };
    }
    case "contact": {
      const p = h(
        "p",
        {},
        "The best way to reach Geralt is email: ",
        link(`mailto:${profile.email}`, profile.email),
        ". ",
      );
      p.append("There's no phone number on this site. Profiles: ");
      profile.links
        .filter((l) => !l.url.includes("geraltheart.com"))
        .forEach((l, i) => p.append(i ? ", " : "", link(l.url, l.label)));
      p.append(".");
      return { node: p, text: p.textContent ?? "" };
    }
    case "resume": {
      const p = h(
        "p",
        {},
        "There's no PDF. The whole resume is on one page: ",
        link("/resume", "resume"),
        ".",
      );
      return { node: p, text: p.textContent ?? "" };
    }
  }
}

export async function mount(root: HTMLElement): Promise<void> {
  const history: Turn[] = [];
  let mode: Mode = "keyword";
  let engine: Engine | null = null;
  let loading = false;
  let queue: Promise<unknown> = Promise.resolve();
  let gpu: GpuSupport | null = null;

  // ── DOM ────────────────────────────────────────────────────────────────
  const uid = Math.random().toString(36).slice(2, 8);
  const status = h("p", { class: "ask-status" });
  status.setAttribute("aria-live", "polite");
  const modelBox = h("div", { class: "ask-model" });
  const log = h("ol", { class: "ask-log" });
  log.setAttribute("aria-live", "polite");
  log.setAttribute("aria-relevant", "additions");
  const input = h("input", {
    id: `ask-q-${uid}`,
    type: "text",
    maxLength: MAX_QUESTION_CHARS,
    autocomplete: "off",
    spellcheck: true,
    placeholder: "What has Geralt built with RAG?",
  });
  input.setAttribute("enterkeyhint", "send");
  const submit = h("button", { type: "submit", class: "btn" }, "ask");
  const stop = h("button", { type: "button", class: "btn", hidden: true }, "stop");
  const label = h("label", { htmlFor: input.id, class: "ps1" }, "ask>");
  const form = h("form", { class: "ask-form" }, label, input, submit, stop);
  const hints = h("p", { class: "ask-hints" }, h("span", { class: "dim" }, "try: "));
  SUGGESTIONS.forEach((q, i) => {
    const b = h("button", { type: "button", class: "hint-btn" }, q);
    b.addEventListener("click", () => void ask(q));
    hints.append(i ? " " : "", b);
  });
  root.replaceChildren(status, modelBox, form, hints, log);

  const setStatus = (text: string) => {
    status.textContent = `mode: ${mode === "model" ? `model (${MODEL.label}, on your GPU)` : "keyword search"}${text ? `. ${text}` : ""}`;
  };

  // ── model controls ─────────────────────────────────────────────────────
  const renderModelBox = () => {
    modelBox.replaceChildren();
    if (mode === "model") return;
    const offer = (why?: string) => {
      const btn = h(
        "button",
        { type: "button", class: "btn load" },
        `[load model] ${MODEL.label}, ${MODEL.approxDownload}`,
      );
      btn.addEventListener("click", () => void load());
      const note = h(
        "p",
        { class: "dim" },
        why
          ? `${why}. Keyword search works fine here; you can still try the model.`
          : `Runs entirely in your browser with WebGPU: nothing you type leaves this device. One-time download, cached afterwards.`,
      );
      modelBox.append(btn, note);
    };
    if (!gpu) return;
    if (gpu.ok) offer();
    else if (gpu.reason === "no-webgpu" || gpu.reason === "no-adapter") {
      modelBox.append(
        h(
          "p",
          { class: "dim" },
          `${GPU_REASONS[gpu.reason]}, so answers come from keyword search over the content.`,
        ),
      );
    } else offer(GPU_REASONS[gpu.reason]);
  };

  async function load(): Promise<void> {
    if (loading || !gpu) return;
    loading = true;
    const bar = h("pre", { class: "progress" });
    bar.setAttribute("aria-hidden", "true");
    const progressText = h("p", { class: "dim" }, "starting download…");
    modelBox.replaceChildren(bar, progressText);
    const draw = (p: number) => {
      const n = 24;
      const filled = Math.round(p * n);
      bar.textContent = `[${"█".repeat(filled)}${"░".repeat(n - filled)}] ${Math.round(p * 100)}%`;
    };
    draw(0);
    setStatus("downloading the model");
    try {
      const { loadEngine } = await import("./engine");
      let lastAnnounced = 0;
      engine = await loadEngine(gpu.f16, (r) => {
        draw(r.progress);
        progressText.textContent = r.text.replace(/\s+/g, " ").slice(0, 140);
        const pct = Math.floor(r.progress * 4) * 25; // announce every 25%
        if (pct > lastAnnounced) {
          lastAnnounced = pct;
          setStatus(`loading model: ${pct}%`);
        }
      });
      mode = "model";
      modelBox.replaceChildren();
      setStatus("ready");
      void dissolveIn(status);
    } catch (err) {
      engine = null;
      const reason = err instanceof Error ? err.message.split("\n")[0]!.slice(0, 160) : "unknown error";
      modelBox.replaceChildren(
        h(
          "p",
          {},
          h("span", { class: "err" }, "couldn't load the model: "),
          reason,
          ". Using keyword search.",
        ),
      );
      setStatus("");
    } finally {
      loading = false;
    }
  }

  // ── asking ─────────────────────────────────────────────────────────────
  /** Questions are answered in order; asking while an answer is still running queues it. */
  function ask(raw: string): Promise<EvalResult> {
    const question = raw.trim().slice(0, MAX_QUESTION_CHARS);
    if (!question) return Promise.resolve({ kind: "refusal", text: "", citations: [], reason: "empty" });
    input.value = "";
    const run = queue.then(() => answerQuestion(question));
    queue = run.catch(() => undefined);
    return run;
  }

  async function answerQuestion(question: string): Promise<EvalResult> {
    const turn = h("li", { class: "turn" });
    turn.append(h("p", { class: "q" }, h("span", { class: "who" }, "you"), " ", question));
    const answer = h("div", { class: "a" });
    turn.append(answer);
    log.append(turn);
    turn.scrollIntoView({ block: "nearest" });
    const previous = history.at(-1)?.question;
    let result: EvalResult;

    try {
      const intent = detectIntent(question);
      if (intent) {
        const { node, text } = intentAnswer(intent);
        answer.append(node);
        result = { kind: "intent", text, citations: [] };
      } else if (mode === "model" && engine) {
        result = await askModel(question, previous, answer);
      } else {
        const r = keywordAnswer(index, question, previous);
        if (r.kind === "refusal") {
          answer.append(refusal(r.unknownTerms));
          result = { kind: "refusal", text: answer.textContent ?? "", citations: [] };
        } else {
          answer.append(h("p", { class: "dim" }, "from the content:"));
          for (const c of r.sources) {
            const excerpt = c.text.length > 320 ? `${c.text.slice(0, 317)}…` : c.text;
            answer.append(h("blockquote", {}, h("p", {}, excerpt), h("p", {}, link(c.url, c.title))));
          }
          result = { kind: "matches", text: answer.textContent ?? "", citations: r.sources.map((c) => c.id) };
        }
      }
      history.push({ question, answer: result.text.slice(0, 600) });
      await dissolveIn(answer);
    } finally {
      stop.hidden = true;
      submit.hidden = false;
    }
    return result;
  }

  async function askModel(
    question: string,
    previous: string | undefined,
    answer: HTMLElement,
  ): Promise<EvalResult> {
    const pre = preCheck(index, question, previous);
    if (!pre.ok) {
      answer.append(refusal(pre.unknownTerms));
      return { kind: "refusal", text: answer.textContent ?? "", citations: [], reason: pre.reason };
    }
    const context = selectContext(pre.hits);
    const draft = h("p", { class: "draft" }, "thinking…");
    draft.setAttribute("aria-hidden", "true");
    answer.append(draft);
    submit.hidden = true;
    stop.hidden = false;
    const raw = await engine!.stream(buildMessages(question, context, pre.unknownTerms, history), (t) => {
      draft.textContent = t.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").trim() || "thinking…";
    });
    const checked: Checked = checkAnswer(
      raw,
      context.map((hit) => hit.chunk),
    );
    draft.remove();
    if (checked.kind === "refusal") {
      answer.append(refusal(pre.unknownTerms));
      return { kind: "refusal", text: answer.textContent ?? "", citations: [], raw, reason: checked.reason };
    }
    const p = h("p");
    checked.sentences.forEach((s, i) => {
      p.append(i ? " " : "", s.text, " ");
      s.cites.forEach((id) => {
        const c = checked.sources.find((x) => x.id === id)!;
        const a = link(c.url, `[${checked.sources.indexOf(c) + 1}]`);
        a.className = "cite";
        a.setAttribute("aria-label", `source: ${c.title}`);
        p.append(a);
      });
    });
    answer.append(p);
    if (checked.dropped) {
      answer.append(
        h(
          "p",
          { class: "dim" },
          `(${checked.dropped} unsupported sentence${checked.dropped > 1 ? "s" : ""} removed)`,
        ),
      );
    }
    answer.append(sourcesList(checked.sources));
    // Strong matches the answer didn't use: a small model often covers one of two relevant sections.
    const top = context[0]!.score;
    const related = context
      .filter((hit) => hit.score >= top * 0.8 && !checked.sources.some((c) => c.id === hit.chunk.id))
      .slice(0, 2)
      .map((hit) => hit.chunk);
    if (related.length) {
      const p = h("p", { class: "dim" }, "also relevant: ");
      related.forEach((c, i) => p.append(i ? ", " : "", link(c.url, c.title)));
      answer.append(p);
    }
    return {
      kind: "answer",
      text: checked.sentences.map((s) => s.text).join(" "),
      citations: checked.sources.map((c) => c.id),
      related: related.map((c) => c.id),
      raw,
    };
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    void ask(input.value);
  });
  stop.addEventListener("click", () => engine?.interrupt());

  // ── boot ───────────────────────────────────────────────────────────────
  setStatus("");
  gpu = await detectGpu();
  renderModelBox();

  const section = root.closest<HTMLElement>("section[data-cmd]");
  const initial = section?.dataset.arg ?? new URLSearchParams(location.search).get("q") ?? "";
  if (initial) void ask(initial);

  if (/[?&]eval\b/.test(location.search)) {
    (window as unknown as { __chatEval: unknown }).__chatEval = {
      load,
      ask,
      ready: () => mode === "model",
      gpu: () => gpu,
    };
  }
}
