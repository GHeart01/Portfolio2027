import { expect, test, type Page } from "@playwright/test";

const sections = (page: Page) => page.locator("#scrollback > section[data-cmd]");
const lastSection = (page: Page) => sections(page).last();

async function type(page: Page, text: string) {
  const input = page.getByRole("textbox", { name: "Type a command" });
  await input.fill(text);
  await input.press("Enter");
}

test("typed commands append output, update the URL, and keep focus in the prompt", async ({ page }) => {
  await page.goto("/");
  await type(page, "projects");
  await expect(lastSection(page)).toHaveAttribute("data-cmd", "projects");
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole("textbox", { name: "Type a command" })).toBeFocused();
  await expect(sections(page)).toHaveCount(2);
});

test("clicking a command runs it in place and focuses its output", async ({ page }) => {
  await page.goto("/");
  await page
    .locator(".menu")
    .getByRole("link", { name: /experience/ })
    .click();
  await expect(lastSection(page)).toHaveAttribute("data-cmd", "experience");
  await expect(lastSection(page).locator("h1")).toBeFocused();
  await expect(page).toHaveTitle(/experience/);
});

test("number keys run commands, and `keys off` disables them", async ({ page }) => {
  await page.goto("/");
  await page.locator("body").press("2");
  await expect(lastSection(page)).toHaveAttribute("data-cmd", "experience");
  await type(page, "keys off");
  await page.locator("h1").last().focus();
  await page.keyboard.press("4");
  await expect(page).not.toHaveURL(/\/skills$/);
  await type(page, "keys on");
});

test("typos get a suggestion", async ({ page }) => {
  await page.goto("/");
  await type(page, "exprience");
  await expect(lastSection(page)).toContainText("command not found: exprience");
  await expect(lastSection(page).getByRole("link", { name: "experience" })).toBeVisible();
});

test("back and forward replay commands", async ({ page }) => {
  await page.goto("/");
  await type(page, "skills");
  await expect(page).toHaveURL(/\/skills$/);
  await type(page, "contact");
  await expect(page).toHaveURL(/\/contact$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/skills$/);
  await expect(lastSection(page)).toHaveAttribute("data-cmd", "skills");
});

test("ids stay unique across many commands", async ({ page }) => {
  await page.goto("/");
  for (const c of ["about", "resume", "about", "experience", "resume"]) await type(page, c);
  await expect(sections(page)).toHaveCount(6);
  const dupes = await page.evaluate(() => {
    const ids = [...document.querySelectorAll("[id]")].map((e) => e.id);
    return ids.length - new Set(ids).size;
  });
  expect(dupes).toBe(0);
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  test("never draws the dissolve overlay", async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __fx: number }).__fx = 0;
      new MutationObserver((m) => {
        for (const r of m)
          r.addedNodes.forEach((n) => {
            if (n instanceof HTMLCanvasElement && n.classList.contains("fx-canvas"))
              (window as unknown as { __fx: number }).__fx++;
          });
      }).observe(document, { childList: true, subtree: true });
    });
    await page.goto("/");
    await type(page, "about");
    await expect(lastSection(page)).toHaveAttribute("data-cmd", "about");
    expect(await page.evaluate(() => (window as unknown as { __fx: number }).__fx)).toBe(0);
  });
});

test("keyboard users reach the skip link first", async ({ page, isMobile }) => {
  test.skip(isMobile, "no hardware keyboard");
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
});

test("a scrollback full of output still passes axe", async ({ page }) => {
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  await page.goto("/");
  for (const c of ["about", "projects lidar", "skills", "exprience", "help"]) await type(page, c);
  await expect(sections(page)).toHaveCount(6);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "best-practice"])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});
