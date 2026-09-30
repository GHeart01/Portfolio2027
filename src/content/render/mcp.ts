/**
 * How to connect to the MCP endpoint. Shared by /mcp (HTML) and /mcp.md.
 */
import { SITE } from "../site";

export const MCP_URL = `${SITE}/mcp`;
export const MCP_NAME = "geraltheart";

export const mcpSetup = {
  claudeCode: `claude mcp add --transport http ${MCP_NAME} ${MCP_URL}`,
  bridgeJson: JSON.stringify(
    { mcpServers: { [MCP_NAME]: { command: "npx", args: ["-y", "mcp-remote", MCP_URL] } } },
    null,
    2,
  ),
};

export function mcpMd(): string {
  return [
    "# MCP server",
    "",
    `A read-only [Model Context Protocol](https://modelcontextprotocol.io) server at \`${MCP_URL}\``,
    "(Streamable HTTP, no auth, rate-limited). It serves the same content as this site.",
    "",
    "## Claude Code",
    "",
    "```sh",
    mcpSetup.claudeCode,
    "```",
    "",
    "## Claude (claude.ai or Claude Desktop)",
    "",
    `Open Customize → Connectors, click +, choose "Add custom connector", and paste \`${MCP_URL}\`.`,
    "",
    "## Clients that only support stdio",
    "",
    "```json",
    mcpSetup.bridgeJson,
    "```",
    "",
    "## Tools",
    "",
    "- `get_profile`: name, role, location, pitch, links",
    "- `get_experience`: roles and highlights",
    "- `list_projects`: every project with its status",
    "- `get_project(name)`: one project in full",
    "- `get_skills`: skills by category",
    "- `search(query)`: keyword search across everything, with section ids",
    "- `get_resume`: the full resume as markdown and structured data",
    "",
  ].join("\n");
}
