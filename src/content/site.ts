/** Canonical origin. Shared by the Astro build and the Worker. */
export const SITE = "https://geraltheart.com";

/** Hosts the Worker will answer /mcp requests for (DNS-rebinding guard). */
export const MCP_HOSTS = ["geraltheart.com", "localhost:8787", "127.0.0.1:8787"] as const;
