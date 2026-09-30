/**
 * The only file that touches the MCP SDK. Stateless: every request gets a fresh server from the
 * factory, so there are no sessions and no Durable Objects. Serves the 2026-07-28 protocol and falls
 * back to stateless 2025-era serving for older clients.
 */
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { SERVER_INSTRUCTIONS, TOOLS } from "./tools";

export const MAX_BODY_BYTES = 16 * 1024;
const VERSION = "1.0.0";

function createServer(): McpServer {
  const server = new McpServer(
    { name: "geraltheart", title: "Geralt Heart's portfolio", version: VERSION },
    { instructions: SERVER_INSTRUCTIONS },
  );
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        ...("inputSchema" in tool ? { inputSchema: tool.inputSchema } : {}),
        outputSchema: tool.outputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- per-tool arg types are checked in tools.ts
      async (args: any) => {
        const r: { text: string; structured?: unknown; isError?: boolean } = tool.handler(args ?? {});
        return {
          content: [{ type: "text" as const, text: r.text }],
          ...(r.structured ? { structuredContent: r.structured as Record<string, unknown> } : {}),
          ...(r.isError ? { isError: true } : {}),
        };
      },
    );
  }
  return server;
}

export const mcpHandler = createMcpHandler(createServer, {
  responseMode: "json",
  maxRequestBodySize: MAX_BODY_BYTES,
  onerror: (err) => console.error("mcp:", err.message),
});
