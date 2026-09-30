/**
 * Turns typed input into an action. Pure, so it's unit-tested.
 */
import { COMMANDS, commandByKey, commandByName } from "./commands";

/** Project ids come from the page (body[data-projects]) so the content JSON never ships to the client. */
let projectIds: readonly string[] = [];
export function setProjectIds(ids: readonly string[]): void {
  projectIds = ids;
}

export type Action =
  | { kind: "path"; path: string; name: string; arg?: string }
  | { kind: "clear" }
  | { kind: "keys"; on: boolean }
  | { kind: "message"; text: string }
  | { kind: "unknown"; input: string; suggestion?: string }
  | { kind: "empty" };

const ALIASES: Record<string, string> = {
  home: "/",
  neofetch: "/",
  "cd ~": "/",
  cd: "/",
  whoami: "/about",
  ls: "/help",
  man: "/help",
  "cat resume": "/resume",
  resume: "/resume",
  email: "/contact",
  education: "/about",
  work: "/experience",
};

export const completions = () => [
  ...COMMANDS.map((c) => c.name),
  "clear",
  "keys off",
  "keys on",
  "neofetch",
  ...projectIds.map((id) => `projects ${id}`),
];

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i]![j] = Math.min(
        d[i - 1]![j]! + 1,
        d[i]![j - 1]! + 1,
        d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return d[a.length]![b.length]!;
}

export function suggest(input: string): string | undefined {
  const word = input.split(/\s+/)[0] ?? "";
  let best: { name: string; d: number } | undefined;
  for (const c of COMMANDS) {
    const d = distance(word, c.name);
    if (!best || d < best.d) best = { name: c.name, d };
  }
  return best && best.d <= Math.max(1, Math.floor(word.length / 3)) ? best.name : undefined;
}

export function parse(raw: string): Action {
  const input = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!input) return { kind: "empty" };
  if (input === "clear" || input === "cls") return { kind: "clear" };
  if (input === "keys off" || input === "keys on") return { kind: "keys", on: input.endsWith("on") };
  if (input.startsWith("sudo"))
    return { kind: "message", text: "Permission denied. This terminal is read-only." };
  if (input === "exit" || input === "logout")
    return { kind: "message", text: "There's no leaving. Try `help`." };

  const byKey = commandByKey(input);
  if (byKey) return { kind: "path", path: byKey.path, name: byKey.name };

  const alias = ALIASES[input];
  if (alias) return { kind: "path", path: alias, name: input };

  const [head, ...rest] = input.split(" ");
  const cmd = commandByName(head ?? "");
  if (cmd && rest.length === 0) return { kind: "path", path: cmd.path, name: cmd.name };
  if (cmd?.name === "projects" && rest.length === 1) {
    const q = rest[0]!;
    const id = projectIds.find((x) => x === q) ?? projectIds.find((x) => x.startsWith(q));
    if (id) return { kind: "path", path: `/projects/${id}`, name: `projects ${id}` };
  }
  if (cmd?.name === "ask" && rest.length) {
    // keep the original casing of the question
    const question = raw.trim().replace(/^ask\s+/i, "");
    return { kind: "path", path: "/ask", name: "ask", arg: question };
  }

  const suggestion = suggest(input);
  return suggestion ? { kind: "unknown", input, suggestion } : { kind: "unknown", input };
}

/** Tab completion: the completed text, or the candidate list when ambiguous. */
export function complete(raw: string): { value: string; candidates: string[] } {
  const input = raw.trimStart().toLowerCase();
  if (!input) return { value: raw, candidates: [] };
  const candidates = completions().filter((c) => c.startsWith(input));
  if (candidates.length === 1) return { value: `${candidates[0]}`, candidates };
  if (!candidates.length) return { value: raw, candidates };
  let prefix = candidates[0]!;
  for (const c of candidates) while (!c.startsWith(prefix)) prefix = prefix.slice(0, -1);
  return { value: prefix.length > input.length ? prefix : raw, candidates };
}
