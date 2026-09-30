/**
 * geraltheart-v2 Worker. Static assets are served directly by Cloudflare; this code only runs for
 * /mcp (see run_worker_first in wrangler.jsonc).
 *
 * /mcp is two things: browsers get the HTML page that explains how to connect, and MCP clients (POST,
 * or GET asking for an event stream) get the read-only MCP server.
 */
import { CORS_HEADERS, hostAllowed, isMcpGet, jsonRpcError, originAllowed, withCors } from "./guards";
import { MAX_BODY_BYTES, mcpHandler } from "./mcp/server";

const DEFAULT_HOSTS = ["geraltheart.com", "www.geraltheart.com", "localhost", "127.0.0.1", "*.workers.dev"];

function allowedHosts(env: Env): string[] {
  const extra = (env.ALLOWED_HOSTS ?? "").split(",").map((s) => s.trim().toLowerCase());
  return [...DEFAULT_HOSTS, ...extra.filter(Boolean)];
}

async function handleMcp(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get("Origin");
  const hosts = allowedHosts(env);

  if (!hostAllowed(request, hosts)) return jsonRpcError(403, "Host not allowed");
  if (!originAllowed(request, hosts)) return jsonRpcError(403, "Origin not allowed");

  if (request.method === "OPTIONS") {
    return withCors(new Response(null, { status: 204, headers: CORS_HEADERS }), origin);
  }
  if (!["POST", "GET", "DELETE"].includes(request.method)) {
    return withCors(jsonRpcError(405, "Method not allowed", { Allow: "POST, GET, DELETE, OPTIONS" }), origin);
  }

  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  if (env.MCP_RL) {
    const { success } = await env.MCP_RL.limit({ key: ip });
    if (!success)
      return withCors(
        jsonRpcError(429, "Rate limit exceeded; try again in a minute", { "Retry-After": "60" }),
        origin,
      );
  }

  const length = Number(request.headers.get("Content-Length") ?? "0");
  if (length > MAX_BODY_BYTES) return withCors(jsonRpcError(413, "Request body too large"), origin);

  return withCors(await mcpHandler.fetch(request), origin);
}

export default {
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/mcp" || pathname === "/mcp/") {
      const isPage = (request.method === "GET" || request.method === "HEAD") && !isMcpGet(request);
      if (!isPage) return handleMcp(request, env);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
