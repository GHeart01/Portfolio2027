/**
 * Abuse protection in front of the MCP handler. Order matters: cheap checks first.
 */

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

export function jsonRpcError(status: number, message: string, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }), {
    status,
    headers: { "Content-Type": "application/json", ...extra },
  });
}

/** Host allowlist (DNS-rebinding guard). Entries may be exact hosts or "*.suffix". */
export function hostAllowed(request: Request, allowed: readonly string[]): boolean {
  const host = new URL(request.url).hostname.toLowerCase();
  return allowed.some((a) => (a.startsWith("*.") ? host.endsWith(a.slice(1)) : host === a));
}

/**
 * Browsers always send Origin on cross-origin POSTs. Allow no Origin (server-side clients like Claude),
 * our own origin, and localhost (MCP Inspector, local dev).
 */
export function originAllowed(request: Request, allowedHosts: readonly string[]): boolean {
  const origin = request.headers.get("Origin");
  if (!origin || origin === "null") return !origin;
  let host: string;
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return true;
  return allowedHosts.some((a) => (a.startsWith("*.") ? host.endsWith(a.slice(1)) : host === a));
}

export function withCors(res: Response, origin: string | null): Response {
  const out = new Response(res.body, res);
  out.headers.set("Access-Control-Allow-Origin", origin ?? "*");
  out.headers.append("Vary", "Origin");
  for (const [k, v] of Object.entries(CORS_HEADERS)) out.headers.set(k, v);
  return out;
}

/** True when a GET should go to the MCP transport rather than the HTML page at the same path. */
export function isMcpGet(request: Request): boolean {
  return (request.headers.get("Accept") ?? "").includes("text/event-stream");
}
