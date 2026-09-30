import { expect, test } from "@playwright/test";

// Runs against `wrangler dev`, i.e. the real workerd runtime (catches bundling issues such as a JSON
// Schema validator that needs eval, which Node-based unit tests can't see).
const headers = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
  "Mcp-Protocol-Version": "2025-06-18",
};

const parse = (body: string) => {
  const data = body.startsWith("event:")
    ? body
        .split("\n")
        .find((l) => l.startsWith("data: "))!
        .slice(6)
    : body;
  return JSON.parse(data) as { result?: Record<string, unknown>; error?: unknown };
};

test("MCP search works in workerd", async ({ request }) => {
  const res = await request.post("/mcp", {
    headers,
    data: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "search", arguments: { query: "What has Geralt built with RAG?" } },
    },
  });
  expect(res.status()).toBe(200);
  const body = parse(await res.text());
  const results = (body.result?.["structuredContent"] as { results: { id: string }[] }).results;
  expect(results[0]?.id).toBe("experience/athena-intern/nl-to-sql-assistant");
});

test("input validation works in workerd", async ({ request }) => {
  const res = await request.post("/mcp", {
    headers,
    data: {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "get_project", arguments: { name: 42 } },
    },
  });
  const body = parse(await res.text());
  expect(body.result?.["isError"]).toBe(true);
});

test("the /mcp page shows setup instructions with copy buttons", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/mcp");
  await expect(page.getByText("claude mcp add --transport http geraltheart")).toBeVisible();
  const copy = page.locator('button[data-copy="mcp-cc"]');
  await copy.click();
  await expect(copy).toHaveText("copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("claude mcp add");
});
