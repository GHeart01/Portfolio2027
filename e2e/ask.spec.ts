import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const WEBLLM = /lib\.[\w-]+\.js|engine-worker|huggingface|hf\.co|web-llm/;

function trackWebLLM(page: Page): string[] {
  const hits: string[] = [];
  page.on("request", (r) => {
    if (WEBLLM.test(r.url())) hits.push(r.url());
  });
  return hits;
}

async function ask(page: Page, q: string) {
  const input = page.getByRole("textbox", { name: "ask>" });
  await input.fill(q);
  await input.press("Enter");
}

test("keyword mode answers from the content with sources, and never loads WebLLM unasked", async ({
  page,
}) => {
  const webllm = trackWebLLM(page);
  await page.goto("/ask");
  await expect(page.locator(".ask-status")).toContainText("mode: keyword search");
  await ask(page, "What has Geralt built with RAG?");
  const answer = page.locator(".turn .a").last();
  await expect(answer).toContainText("Qdrant");
  await expect(answer.getByRole("link", { name: /Software Engineering Intern/ }).first()).toHaveAttribute(
    "href",
    "/experience#athena-intern-nl-to-sql-assistant",
  );
  await page.waitForTimeout(500);
  expect(webllm).toEqual([]);
});

test("off-content questions are refused, not guessed", async ({ page }) => {
  await page.goto("/ask");
  await ask(page, "What's his salary?");
  await expect(page.locator(".turn .a").last()).toContainText("not in the content");
  await ask(page, "Has he used Terraform?");
  await expect(page.locator(".turn .a").last()).toContainText("nothing on this site mentions Terraform");
});

test("contact and resume requests get fixed, sourced answers", async ({ page }) => {
  await page.goto("/ask");
  await ask(page, "What's his phone number?");
  await expect(page.locator(".turn .a").last()).toContainText("There's no phone number on this site");
  await ask(page, "can I get his resume pdf");
  await expect(page.locator(".turn .a").last().getByRole("link", { name: "resume" })).toHaveAttribute(
    "href",
    "/resume",
  );
});

test("`ask <question>` from the shell opens the chat and answers", async ({ page }) => {
  await page.goto("/");
  const prompt = page.getByRole("textbox", { name: "Type a command" });
  await prompt.fill("ask Tell me about LiDAR Scout");
  await prompt.press("Enter");
  await expect(page).toHaveURL(/\/ask\?q=Tell/);
  await expect(page.locator(".turn .a").last()).toContainText("A*");
});

test("the chat passes axe after a few turns", async ({ page }) => {
  await page.goto("/ask");
  await ask(page, "Where did he go to school?");
  await ask(page, "What is the capital of France?");
  await expect(page.locator(".turn")).toHaveCount(2);
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "best-practice"])
    .analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual(
    [],
  );
});
