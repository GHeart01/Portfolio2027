import { expect, test } from "@playwright/test";
import raw from "../content/resume.json" with { type: "json" };

// The brief's non-negotiable: name, pitch, top projects, and contact work with JavaScript off.
test.use({ javaScriptEnabled: false });

const profile = raw.profile;
const featured = raw.projects.filter((p) => "featured" in p && p.featured);

test("home shows the plain path without JavaScript", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(profile.name);
  await expect(page.getByText(profile.name, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(profile.pitch).first()).toBeVisible();
  for (const p of featured) {
    await expect(page.getByRole("link", { name: p.name, exact: true }).first()).toBeVisible();
  }
  await expect(page.getByRole("link", { name: profile.email }).first()).toHaveAttribute(
    "href",
    `mailto:${profile.email}`,
  );
  // The JS prompt stays hidden.
  await expect(page.locator("#prompt")).toBeHidden();
});

const COMMAND_PAGES = ["about", "experience", "projects", "skills", "contact", "resume", "help"];

for (const name of COMMAND_PAGES) {
  test(`"${name}" is one click away as a plain link`, async ({ page }) => {
    await page.goto("/");
    await page.getByRole("navigation", { name: "Commands" }).getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${name}$`));
    await expect(page.locator(`section[data-cmd="${name}"]`)).toBeVisible();
  });
}

test("resume shows every section on one page", async ({ page }) => {
  await page.goto("/resume");
  for (const e of raw.experience) await expect(page.getByText(e.role, { exact: true }).first()).toBeVisible();
  for (const ed of raw.education) await expect(page.getByText(ed.school).first()).toBeVisible();
  for (const s of raw.skills) await expect(page.getByText(s.name, { exact: true }).first()).toBeVisible();
});

test("unknown paths get the command-not-found page with a 404", async ({ page }) => {
  const res = await page.goto("/definitely-not-a-command");
  expect(res?.status()).toBe(404);
  await expect(page.getByText("nothing lives at this path")).toBeVisible();
});
