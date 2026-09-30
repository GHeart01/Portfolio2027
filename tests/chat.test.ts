import { describe, expect, it } from "vitest";
import { buildChunks } from "../src/content/chunks";
import { createIndex } from "../src/content/search";
import { keywordAnswer } from "../src/chat/fallback";
import {
  checkAnswer,
  checkableFacts,
  detectIntent,
  preCheck,
  splitSentences,
  stripThinking,
  unknownTerms,
} from "../src/chat/guard";
import { buildMessages, estimateTokens, selectContext } from "../src/chat/prompt";

const chunks = buildChunks();
const index = createIndex(chunks);
const byId = (id: string) => chunks.find((c) => c.id === id)!;
const RAG = "experience/athena-intern/nl-to-sql-assistant";

describe("intents", () => {
  it("answers greetings, contact, and resume requests without the model", () => {
    expect(detectIntent("hi!")).toBe("greeting");
    expect(detectIntent("How can I contact him?")).toBe("contact");
    expect(detectIntent("what's his phone number")).toBe("contact");
    expect(detectIntent("Can I get his resume as a PDF?")).toBe("resume");
    expect(detectIntent("What has he built with RAG?")).toBeNull();
  });
});

describe("preCheck", () => {
  it("refuses before the model when nothing in the question exists in the content", () => {
    for (const q of [
      "What's his salary?",
      "Is he married?",
      "Does he know Rust?",
      "What is the capital of France?",
    ]) {
      expect(preCheck(index, q).ok, q).toBe(false);
    }
  });

  it("lets answerable questions through with the right top hit", () => {
    const r = preCheck(index, "What has Geralt built with RAG?");
    expect(r.ok && r.hits[0]!.chunk.id).toBe(RAG);
    expect(preCheck(index, "Where did he go to school?").ok).toBe(true);
  });

  it("uses the previous question for short follow-ups", () => {
    expect(preCheck(index, "what stack did it use?", "Tell me about LiDAR Scout").ok).toBe(true);
    expect(preCheck(index, "What is his favorite food?", "Did Geralt work at Google?").ok).toBe(false);
  });

  it("names unknown proper nouns so the model (and the refusal) can mention them", () => {
    expect(unknownTerms(index, "Did Geralt work at Google?")).toEqual(["Google"]);
    expect(unknownTerms(index, "Does he know .NET and C#?")).toEqual([]);
    expect(unknownTerms(index, "Has he used Terraform?")).toEqual(["Terraform"]);
  });
});

describe("checkAnswer", () => {
  const retrieved = [byId(RAG), byId("projects/lidar-scout"), byId("about")];

  it("keeps cited, supported sentences", () => {
    const r = checkAnswer(
      `Geralt built an on-prem natural-language-to-SQL assistant on .NET 10 [${RAG}]. It combines Qdrant vector search with BM25 [${RAG}].`,
      retrieved,
    );
    expect(r.kind).toBe("answer");
    if (r.kind === "answer") {
      expect(r.sentences).toHaveLength(2);
      expect(r.sources.map((s) => s.id)).toEqual([RAG]);
    }
  });

  it("accepts citations placed after the period", () => {
    const r = checkAnswer(`LiDAR Scout uses A* path planning. [projects/lidar-scout]`, retrieved);
    expect(r.kind).toBe("answer");
  });

  it("refuses NOT_IN_CONTENT, even wrapped in thinking or prose", () => {
    expect(checkAnswer("NOT_IN_CONTENT", retrieved).kind).toBe("refusal");
    expect(checkAnswer("<think>hmm</think>\nNOT_IN_CONTENT.", retrieved).kind).toBe("refusal");
  });

  it("drops uncited sentences and invented citations", () => {
    const r = checkAnswer("Geralt is a great engineer. He built many things [projects/made-up].", retrieved);
    expect(r).toMatchObject({ kind: "refusal", reason: "no-valid-citations" });
  });

  it("drops sentences with facts their sources don't contain", () => {
    const r = checkAnswer(
      `Geralt worked at Google on search [about]. He built an NL-to-SQL assistant with Qdrant [${RAG}]. It improved accuracy by 85% [${RAG}]. His email is someone@example.com [about].`,
      retrieved,
    );
    expect(r.kind).toBe("answer");
    if (r.kind === "answer") {
      expect(r.sentences.map((s) => s.text)).toEqual(["He built an NL-to-SQL assistant with Qdrant."]);
      expect(r.dropped).toBe(3);
    }
  });

  it("refuses when every cited sentence is unsupported", () => {
    const r = checkAnswer("Geralt worked at Microsoft Research in 2019 [about].", retrieved);
    expect(r).toMatchObject({ kind: "refusal", reason: "unsupported" });
  });
});

describe("helpers", () => {
  it("strips Qwen3 thinking blocks, including unterminated ones", () => {
    expect(stripThinking("<think>\n</think>\nHello [about].")).toBe("Hello [about].");
    expect(stripThinking("<think>still going")).toBe("");
  });

  it("splits sentences and parses multi-citations", () => {
    expect(splitSentences("A is true [about, contact]. B too. [skills/data]")).toEqual([
      { text: "A is true.", cites: ["about", "contact"] },
      { text: "B too.", cites: ["skills/data"] },
    ]);
  });

  it("extracts checkable facts", () => {
    expect(checkableFacts("He used **Qdrant** and BM25 on .NET 10 at Athena in 2026.")).toEqual(
      expect.arrayContaining(["Qdrant", "BM25", "10", "Athena", "2026"]),
    );
  });
});

describe("prompt", () => {
  it("stays inside the 4k context with room for the answer", () => {
    const hits = index.search("RAG MCP LLM Qdrant .NET robotics projects skills", { limit: 5 });
    const ctx = selectContext(hits);
    const history = [
      { question: "x".repeat(300), answer: "y".repeat(2000) },
      { question: "q", answer: "a" },
    ];
    const msgs = buildMessages("What has Geralt built with RAG?", ctx, ["Google"], history);
    const total = msgs.reduce((n, m) => n + estimateTokens(m.content) + 4, 0);
    expect(total).toBeLessThan(4096 - 320 - 300);
    expect(msgs[0]!.content).toContain("NOT_IN_CONTENT");
    expect(msgs[0]!.content).toContain("never mentions: Google");
    expect(msgs.at(-1)).toEqual({ role: "user", content: "What has Geralt built with RAG?" });
  });
});

describe("keyword fallback", () => {
  it("quotes matching sections or refuses", () => {
    const a = keywordAnswer(index, "What has Geralt built with RAG?");
    expect(a.kind === "matches" && a.sources[0]!.id).toBe(RAG);
    expect(keywordAnswer(index, "What's his salary?").kind).toBe("refusal");
  });
});

describe("citation repair (real Qwen3-1.7B outputs from pnpm eval:chat)", () => {
  const ctxFor = (q: string) => selectContext(index.search(q, { limit: 5 })).map((h) => h.chunk);
  const ok = (q: string, raw: string, cite: string) => {
    const r = checkAnswer(raw, ctxFor(q));
    expect(r.kind, raw).toBe("answer");
    if (r.kind === "answer") expect(r.sources.map((s) => s.id)).toContain(cite);
  };

  it("credits uncited but correct sentences to the section that supports them", () => {
    ok(
      "Where does Geralt work?",
      "<think>\n\n</think>\n\nGeralt works at Athena Manufacturing in Austin, TX.",
      "about",
    );
    ok(
      "What path planning algorithm does LiDAR Scout use?",
      "LiDAR Scout uses A* path planning with obstacle inflation.",
      "projects/lidar-scout",
    );
    ok(
      "Which programming languages does he know?",
      "Geralt knows Python, TypeScript, JavaScript, SQL, C#, C++, MATLAB, Bash, and PowerShell.",
      "skills/languages",
    );
    ok("Has he used Docker?", "Yes, Geralt has used Docker.", "experience/athena-intern/on-prem-containers");
  });

  it("moves a wrong citation to the section that has the facts", () => {
    ok(
      "What is he working on right now?",
      "He is currently building CLI + MCP developer tools and completing an MS in Computer Science at CU Boulder. [experience/athena-swe]",
      "about",
    );
  });

  it("applies one trailing citation to a whole paragraph", () => {
    const raw =
      "LiDAR Scout is a multi-robot LiDAR pursuit simulator. It uses A* path planning with obstacle inflation. Each robot runs its own finite-state machine. [projects/lidar-scout]";
    const r = checkAnswer(raw, ctxFor("Tell me about LiDAR Scout"));
    expect(r.kind === "answer" && r.sentences.length).toBe(3);
  });

  it("does not glue '.NET' to the previous word", () => {
    expect(splitSentences("He built it on .NET 10 [x].")[0]!.text).toBe("He built it on .NET 10.");
  });
});

describe("more real outputs", () => {
  const ctxFor = (q: string) => selectContext(index.search(q, { limit: 5 })).map((h) => h.chunk);

  it("treats the model's paraphrased refusals as refusals", () => {
    for (const raw of [
      "NOT IN CONTENT.",
      "NOT IN CONTENT: The context does not mention Geralt's favorite food.",
      "The context doesn't mention his car.",
    ]) {
      expect(checkAnswer(raw, ctxFor("What car does he drive?")).kind, raw).toBe("refusal");
    }
  });

  it("accepts spelled-out state names and facts spanning two sections", () => {
    const where = checkAnswer(
      "Geralt works at Athena Manufacturing in Austin, Texas.",
      ctxFor("Where does Geralt work?"),
    );
    expect(where.kind).toBe("answer");
    const now = checkAnswer(
      "Geralt is currently working on building CLI + MCP developer tools and completing an MS in Computer Science (ML/Robotics) at the University of Colorado Boulder. [experience/athena-swe]",
      ctxFor("What is he working on right now?"),
    );
    expect(now.kind).toBe("answer");
  });
});
