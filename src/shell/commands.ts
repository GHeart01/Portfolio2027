/**
 * The command set. Shared by the Astro pages (links), the JS shell (typed commands, 1–9 keys),
 * /help, and llms.txt. Every command is also a plain page, so it works as a link without JS.
 */
export interface Command {
  name: string;
  /** Page path (no trailing slash). */
  path: string;
  /** Single-key shortcut, if any. */
  key?: string;
  /** One-line description for menus and /help. */
  summary: string;
}

export const COMMANDS: readonly Command[] = [
  { name: "about", path: "/about", key: "1", summary: "who I am, interests, education" },
  { name: "experience", path: "/experience", key: "2", summary: "where I've worked and what I built there" },
  { name: "projects", path: "/projects", key: "3", summary: "things I've built and what's in progress" },
  { name: "skills", path: "/skills", key: "4", summary: "languages, AI/ML, web, data, infra" },
  { name: "contact", path: "/contact", key: "5", summary: "email, GitHub, LinkedIn" },
  { name: "resume", path: "/resume", key: "6", summary: "everything on one page" },
  { name: "ask", path: "/ask", key: "7", summary: "ask a question, answered only from this content" },
  { name: "mcp", path: "/mcp", key: "8", summary: "connect Claude or another agent to this site" },
  { name: "sim", path: "/sim", key: "9", summary: "multi-robot LiDAR pursuit, in ASCII" },
  { name: "help", path: "/help", key: "?", summary: "commands and keyboard shortcuts" },
];

export const commandByName = (name: string) => COMMANDS.find((c) => c.name === name);
export const commandByKey = (key: string) => COMMANDS.find((c) => c.key === key);
