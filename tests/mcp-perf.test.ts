/**
 * Rough per-request cost of the MCP path (a proxy for Workers CPU time; the free plan allows 10 ms).
 * Real numbers come from Workers Observability after a preview deploy.
 */
import { describe, expect, it } from "vitest";
import worker from "../src/worker/index";

const env = {
  ASSETS: { fetch: async () => new Response("") },
  MCP_RL: { limit: async () => ({ success: true }) },
  ALLOWED_HOSTS: "",
} as unknown as Env;

const req = (method: string, params: unknown = {}) =>
  new Request("https://geraltheart.com/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "Mcp-Protocol-Version": "2025-06-18",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });

async function p99(make: () => Request, n = 300): Promise<{ p50: number; p99: number }> {
  const times: number[] = [];
  for (let i = 0; i < n + 20; i++) {
    const t = performance.now();
    const res = await worker.fetch(make() as never, env);
    await res.text();
    if (i >= 20) times.push(performance.now() - t); // skip warm-up
  }
  times.sort((a, b) => a - b);
  return { p50: times[Math.floor(n * 0.5)]!, p99: times[Math.floor(n * 0.99)]! };
}

describe("MCP request cost", () => {
  it.each([
    ["tools/list", () => req("tools/list")],
    ["search", () => req("tools/call", { name: "search", arguments: { query: "RAG with local LLMs" } })],
    ["get_resume", () => req("tools/call", { name: "get_resume", arguments: {} })],
  ])("%s stays well under the free-plan CPU budget", async (label, make) => {
    const { p50, p99: tail } = await p99(make);
    console.log(`${label}: p50 ${p50.toFixed(2)} ms, p99 ${tail.toFixed(2)} ms`);
    expect(tail).toBeLessThan(8);
  });
});
