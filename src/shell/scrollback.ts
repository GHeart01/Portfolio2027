/**
 * Runs a command by fetching its static page and appending that page's [data-cmd] section to the
 * scrollback. The static pages are the single renderer; the shell only moves their output around.
 */
import { dissolveIn } from "../fx/glyph-dissolve";
import { mountIslands } from "./islands";

const MAX_ENTRIES = 15;
const pages = new Map<string, Promise<Document>>();
let serial = 0;

export function fetchPage(path: string): Promise<Document> {
  let p = pages.get(path);
  if (!p) {
    p = fetch(path, { headers: { Accept: "text/html" } }).then(async (res) => {
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      if (!res.ok && res.status !== 404) throw new Error(`${res.status}`);
      return doc;
    });
    p.catch(() => pages.delete(path));
    pages.set(path, p);
  }
  return p;
}

/** Warm the cache for the command pages when the browser is idle. */
export function prefetch(paths: readonly string[]): void {
  const run = () => paths.forEach((p) => void fetchPage(p).catch(() => undefined));
  if ("requestIdleCallback" in window) requestIdleCallback(run, { timeout: 4000 });
  else setTimeout(run, 1500);
}

/** Cloned sections get unique ids so the scrollback never has duplicates. */
function uniquifyIds(section: Element, suffix: string): void {
  const map = new Map<string, string>();
  section.querySelectorAll<HTMLElement>("[id]").forEach((el) => {
    const next = `${el.id}--${suffix}`;
    map.set(el.id, next);
    el.id = next;
  });
  const remap = (v: string) =>
    v
      .split(/\s+/)
      .map((id) => map.get(id) ?? id)
      .join(" ");
  for (const attr of ["aria-labelledby", "aria-describedby", "aria-controls", "for", "list"]) {
    section
      .querySelectorAll(`[${attr}]`)
      .forEach((el) => el.setAttribute(attr, remap(el.getAttribute(attr)!)));
  }
  section.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((a) => {
    const id = a.getAttribute("href")!.slice(1);
    if (map.has(id)) a.setAttribute("href", `#${map.get(id)}`);
  });
}

function trim(scrollback: HTMLElement): void {
  while (scrollback.children.length > MAX_ENTRIES) scrollback.firstElementChild?.remove();
}

export interface Shown {
  section: HTMLElement;
  title: string;
}

/** Appends a section to the scrollback, plays the dissolve, and moves focus to its heading. */
export async function show(section: HTMLElement, title?: string): Promise<Shown> {
  const scrollback = document.getElementById("scrollback")!;
  scrollback.append(section);
  trim(scrollback);
  mountIslands(section);
  const heading = section.querySelector<HTMLElement>("h1") ?? section;
  heading.setAttribute("tabindex", "-1");
  // Output lands instantly, like a real terminal; the dissolve is the only motion.
  section.scrollIntoView({ block: "start", behavior: "auto" });
  heading.focus({ preventScroll: true });
  await new Promise((r) => requestAnimationFrame(r));
  await dissolveIn(section);
  return { section, title: title ?? document.title };
}

export async function runPath(path: string, arg?: string): Promise<Shown> {
  const doc = await fetchPage(path);
  const src = doc.querySelector<HTMLElement>("#scrollback section[data-cmd]");
  if (!src) throw new Error(`no command output at ${path}`);
  const section = document.importNode(src, true) as HTMLElement;
  uniquifyIds(section, String(++serial));
  if (arg) section.dataset.arg = arg;
  return show(section, doc.title);
}

/** A locally built block (errors, `clear` notices, etc.) styled like command output. */
export function localBlock(echo: string, body: Node | string, label = echo): HTMLElement {
  const section = document.createElement("section");
  section.className = "cmd";
  section.dataset.cmd = `local-${++serial}`;
  section.setAttribute("aria-label", label);
  const p = document.createElement("p");
  p.className = "echo";
  p.setAttribute("aria-hidden", "true");
  p.innerHTML = '<span class="ps1">visitor@geraltheart.com<span class="path">:~</span>$</span> ';
  p.append(echo);
  const h = document.createElement("h1");
  h.className = "visually-hidden";
  h.textContent = label;
  const out = document.createElement("div");
  out.className = "local-out";
  out.append(body);
  section.append(p, h, out);
  return section;
}

export function clear(): void {
  document.getElementById("scrollback")!.replaceChildren();
}
