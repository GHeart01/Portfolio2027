/**
 * Drives the real Worker fetch handler with both the current (v2) and the older (v1, 2025-era) MCP
 * client, so the endpoint is verified against the content file for new and existing clients alike.
 */
import {
  Client as ClientV2,
  StreamableHTTPClientTransport as TransportV2,
} from "@modelcontextprotocol/client";
import { Client as ClientV1 } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport as TransportV1 } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import raw from "../content/resume.json";
import worker from "../src/worker/index";
import { TOOLS } from "../src/worker/mcp/tools";

const URL_ = "https://geraltheart.com/mcp";

function makeEnv(limitOk = true) {
  return {
    ASSETS: {
      fetch: async () => new Response("<html>mcp page</html>", { headers: { "Content-Type": "text/html" } }),
    },
    MCP_RL: { limit: async () => ({ success: limitOk }) },
    ALLOWED_HOSTS: "",
  } as unknown as Env;
}

const call = (req: Request, env = makeEnv()) => worker.fetch(req as never, env);
const workerFetch = (input: string | URL | Request, init?: RequestInit) => call(new Request(input, init));

type AnyClient = {
  listTools(): Promise<{
    tools: { name: string; annotations?: { readOnlyHint?: boolean }; outputSchema?: unknown }[];
  }>;
  callTool(req: { name: string; arguments?: Record<string, unknown> }): Promise<{
    content?: unknown;
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
  }>;
  close(): Promise<void>;
};

const clients: [string, () => Promise<AnyClient>][] = [
  [
    "v2 client (2026-07-28)",
    async () => {
      const c = new ClientV2({ name: "test-v2", version: "1.0.0" });
      await c.connect(new TransportV2(new URL(URL_), { fetch: workerFetch }));
      return c as unknown as AnyClient;
    },
  ],
  [
    "v1 client (2025 era)",
    async () => {
      const c = new ClientV1({ name: "test-v1", version: "1.0.0" });
      // v1's types predate exactOptionalPropertyTypes
      await c.connect(new TransportV1(new URL(URL_), { fetch: workerFetch }) as never);
      return c as unknown as AnyClient;
    },
  ],
];

const text = (r: { content?: unknown }) =>
  ((r.content as { type: string; text?: string }[]) ?? []).map((c) => c.text ?? "").join("\n");

describe.each(clients)("MCP over %s", (_label, connect) => {
  let client: AnyClient;
  beforeAll(async () => {
    client = await connect();
  });
  afterAll(async () => {
    await client?.close();
  });

  it("lists every tool as read-only with an output schema", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(TOOLS.map((t) => t.name).sort());
    for (const t of tools) {
      expect(t.annotations?.readOnlyHint).toBe(true);
      expect(t.outputSchema).toBeDefined();
    }
  });

  it("get_profile returns the content file's profile", async () => {
    const r = await client.callTool({ name: "get_profile", arguments: {} });
    expect(r.structuredContent?.["name"]).toBe(raw.profile.name);
    expect(text(r)).toContain(raw.profile.pitch);
  });

  it("answers 'What has Geralt built with RAG?' via search", async () => {
    const r = await client.callTool({
      name: "search",
      arguments: { query: "What has Geralt built with RAG?" },
    });
    const results = r.structuredContent?.["results"] as { id: string; url: string }[];
    expect(results[0]?.id).toBe("experience/athena-intern/nl-to-sql-assistant");
    expect(results[0]?.url).toMatch(/^https:\/\/geraltheart\.com\/experience#/);
    expect(text(r)).toMatch(/Qdrant/);
  });

  it("search says so when nothing matches", async () => {
    const r = await client.callTool({ name: "search", arguments: { query: "favorite pizza topping" } });
    expect(r.structuredContent?.["results"]).toEqual([]);
    expect(text(r)).toMatch(/No matches/);
  });

  it("get_project finds projects by id or name and errors helpfully", async () => {
    const byName = await client.callTool({ name: "get_project", arguments: { name: "LiDAR Scout" } });
    expect((byName.structuredContent?.["project"] as { id: string }).id).toBe("lidar-scout");
    const missing = await client.callTool({ name: "get_project", arguments: { name: "does-not-exist" } });
    expect(missing.isError).toBe(true);
    expect(text(missing)).toMatch(/Available: /);
  });

  it("list_projects flags placeholders", async () => {
    const r = await client.callTool({ name: "list_projects", arguments: {} });
    const ps = r.structuredContent?.["projects"] as { id: string; status: string }[];
    expect(ps.length).toBe(raw.projects.length);
    expect(ps.filter((p) => p.status.includes("placeholder")).length).toBeGreaterThan(0);
  });

  it("get_experience, get_skills, and get_resume return valid data", async () => {
    const exp = await client.callTool({ name: "get_experience", arguments: {} });
    expect((exp.structuredContent?.["experience"] as unknown[]).length).toBe(raw.experience.length);
    const skills = await client.callTool({ name: "get_skills", arguments: {} });
    expect((skills.structuredContent?.["skills"] as unknown[]).length).toBe(raw.skills.length);
    const resume = await client.callTool({ name: "get_resume", arguments: {} });
    expect(resume.structuredContent?.["markdown"]).toMatch(/^# Geralt Heart/);
    expect(JSON.stringify(resume.structuredContent)).not.toMatch(/\.pdf/);
  });
});

describe("the /mcp route", () => {
  const post = (body: unknown, headers: Record<string, string> = {}, env = makeEnv()) =>
    call(
      new Request(URL_, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          ...headers,
        },
        body: JSON.stringify(body),
      }),
      env,
    );

  it("serves the HTML page to browsers", async () => {
    const res = await call(new Request(URL_, { headers: { Accept: "text/html" } }));
    expect(await res.text()).toContain("mcp page");
  });

  it("answers MCP GETs (event streams) with 405, since the server is stateless", async () => {
    const res = await call(new Request(URL_, { headers: { Accept: "text/event-stream" } }));
    expect(res.status).toBe(405);
  });

  it("handles CORS preflight", async () => {
    const res = await call(
      new Request(URL_, { method: "OPTIONS", headers: { Origin: "http://localhost:6274" } }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:6274");
  });

  it("rejects foreign origins and hosts", async () => {
    expect((await post({}, { Origin: "https://evil.example" })).status).toBe(403);
    const res = await call(new Request("https://evil.example/mcp", { method: "POST", body: "{}" }));
    expect(res.status).toBe(403);
  });

  it("rate-limits with 429 and Retry-After", async () => {
    const res = await post({ jsonrpc: "2.0", id: 1, method: "tools/list" }, {}, makeEnv(false));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
  });

  it("rejects oversized bodies", async () => {
    const big = "x".repeat(20_000);
    const res = await post({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { big } });
    expect(res.status).toBe(413);
  });

  it("rejects other methods", async () => {
    expect((await call(new Request(URL_, { method: "PUT", body: "{}" }))).status).toBe(405);
  });
});
