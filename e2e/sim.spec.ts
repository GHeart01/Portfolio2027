import { expect, test } from "@playwright/test";

test("the sim runs, pauses, and switches maps", async ({ page }) => {
  await page.goto("/sim");
  const status = page.locator(".sim-status");
  await expect(status).toContainText(/t=[1-9]/, { timeout: 5000 });
  await page.getByRole("button", { name: "pause" }).click();
  const frozen = await status.textContent();
  await page.waitForTimeout(600);
  await expect(status).toHaveText(frozen!);
  await page.getByRole("button", { name: /map: Scatter/ }).click();
  await expect(page.getByRole("button", { name: /map: Maze/ })).toBeVisible();
});

test("the sim is only downloaded when it's shown", async ({ page }) => {
  const simChunks: string[] = [];
  page.on("request", (r) => {
    if (/\/_astro\/island\./.test(r.url())) simChunks.push(r.url());
  });
  await page.goto("/");
  await page.waitForTimeout(800);
  expect(simChunks).toEqual([]);
  await page.getByRole("textbox", { name: "Type a command" }).fill("sim");
  await page.getByRole("textbox", { name: "Type a command" }).press("Enter");
  await expect(page.locator(".sim-status").last()).toContainText(/t=[1-9]/, { timeout: 5000 });
  expect(simChunks.length).toBeGreaterThan(0);
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("shows a pre-rendered frame", async ({ page }) => {
    await page.goto("/sim");
    await expect(page.locator(".sim-screen")).toContainText("●");
    await expect(page.locator(".sim-controls")).toBeHidden();
  });
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  test("starts paused", async ({ page }) => {
    await page.goto("/sim");
    await expect(page.getByRole("button", { name: "play" })).toBeVisible();
  });
});
