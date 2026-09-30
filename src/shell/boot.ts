/**
 * Progressive enhancement: turns the static pages into one terminal session. Without this script
 * every command is still a normal link to a normal page.
 */
import { dissolveIn, motionAllowed } from "../fx/glyph-dissolve";
import { COMMANDS } from "./commands";
import { mountIslands } from "./islands";
import { complete, parse, setProjectIds, type Action } from "./parse";
import { clear, localBlock, prefetch, runPath, show } from "./scrollback";
import "./island-registry";

setProjectIds((document.body.dataset.projects ?? "").split(" ").filter(Boolean));

const KEYS_PREF = "gh.keys";
const HISTORY = "gh.history";
const BOOTED = "gh.booted";

const store = {
  get(k: string, s: Storage = localStorage) {
    try {
      return s.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string, s: Storage = localStorage) {
    try {
      s.setItem(k, v);
    } catch {
      /* private mode etc. */
    }
  },
};

const announcer = document.getElementById("announcer");
const announce = (text: string) => {
  if (!announcer) return;
  announcer.textContent = "";
  requestAnimationFrame(() => (announcer.textContent = text));
};

const COMMAND_PATHS = new Set(["/", ...COMMANDS.map((c) => c.path)]);
const isCommandPath = (path: string) => COMMAND_PATHS.has(path) || /^\/projects\/[a-z0-9-]+$/.test(path);

function setCurrent(path: string) {
  const name = path === "/" ? "home" : path.startsWith("/projects") ? "projects" : path.slice(1);
  document.querySelectorAll<HTMLAnchorElement>(".topbar a").forEach((a) => {
    const target = a.getAttribute("href") === "/" ? "home" : a.getAttribute("href")!.slice(1);
    if (target === name) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

let busy = Promise.resolve();

/** Runs one action. `from` decides where focus goes: typed commands keep focus in the prompt. */
function execute(action: Action, from: "prompt" | "link" | "key" | "history", input = "") {
  busy = busy.then(async () => {
    switch (action.kind) {
      case "empty":
        return;
      case "clear":
        clear();
        announce("Screen cleared");
        return;
      case "keys": {
        store.set(KEYS_PREF, action.on ? "on" : "off");
        await show(localBlock(input, `Single-key shortcuts are ${action.on ? "on" : "off"}.`));
        announce(`Shortcuts ${action.on ? "on" : "off"}`);
        break;
      }
      case "message":
        await show(localBlock(input, action.text));
        announce(action.text);
        break;
      case "unknown": {
        const body = document.createElement("p");
        const err = document.createElement("span");
        err.className = "err";
        err.textContent = "command not found: ";
        body.append(err, action.input);
        if (action.suggestion) {
          const a = document.createElement("a");
          a.href = COMMANDS.find((c) => c.name === action.suggestion)!.path;
          a.textContent = action.suggestion;
          body.append(". Did you mean ", a, "? Type ");
        } else body.append(". Type ");
        const help = document.createElement("a");
        help.href = "/help";
        help.textContent = "help";
        body.append(help, " for the list.");
        await show(localBlock(input, body, "Command not found"));
        announce(`Command not found: ${action.input}`);
        break;
      }
      case "path": {
        try {
          const shown = await runPath(action.path, action.arg);
          document.title = shown.title;
          setCurrent(action.path);
          if (from !== "history") {
            const url = action.arg ? `${action.path}?q=${encodeURIComponent(action.arg)}` : action.path;
            history.pushState({ path: action.path }, "", url);
          }
          announce(`Showing ${action.name}`);
        } catch {
          // Network trouble: fall back to a normal navigation.
          location.href = action.path;
          return;
        }
        break;
      }
    }
    if (from === "prompt") input_?.focus({ preventScroll: true });
  });
}

// ── prompt ───────────────────────────────────────────────────────────────
const form = document.getElementById("prompt") as HTMLFormElement | null;
const input_ = document.getElementById("prompt-input") as HTMLInputElement | null;
const history_: string[] = JSON.parse(store.get(HISTORY, sessionStorage) ?? "[]") as string[];
let cursor = history_.length;

if (form && input_) {
  form.hidden = false;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const value = input_.value;
    input_.value = "";
    if (value.trim()) {
      history_.push(value.trim());
      history_.splice(0, Math.max(0, history_.length - 50));
      store.set(HISTORY, JSON.stringify(history_), sessionStorage);
    }
    cursor = history_.length;
    execute(parse(value), "prompt", value.trim());
  });
  input_.addEventListener("keydown", (e) => {
    if (e.key === "Tab" && input_.value.trim()) {
      e.preventDefault();
      const { value, candidates } = complete(input_.value);
      input_.value = value;
      if (candidates.length > 1)
        announce(`${candidates.length} matches: ${candidates.slice(0, 8).join(", ")}`);
    } else if (e.key === "ArrowUp" && history_.length) {
      e.preventDefault();
      cursor = Math.max(0, cursor - 1);
      input_.value = history_[cursor] ?? "";
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      cursor = Math.min(history_.length, cursor + 1);
      input_.value = history_[cursor] ?? "";
    } else if (e.key === "Escape") {
      input_.value = "";
    }
  });
}

// ── links ────────────────────────────────────────────────────────────────
document.addEventListener("click", (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = (e.target as Element | null)?.closest?.("a");
  if (!a || a.target || a.hasAttribute("download") || a.origin !== location.origin) return;
  if (!isCommandPath(a.pathname) || a.hash) return;
  e.preventDefault();
  const name = a.pathname === "/" ? "neofetch" : a.pathname.slice(1).replace("/", " ");
  execute({ kind: "path", path: a.pathname, name }, "link");
});

// ── single-key shortcuts (WCAG 2.1.4: can be turned off with `keys off`) ─
document.addEventListener("keydown", (e) => {
  if (store.get(KEYS_PREF) === "off" || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
  const t = e.target instanceof Element ? e.target : document.body;
  if (t.closest("input, textarea, select, button, [contenteditable]:not([contenteditable='false'])")) return;
  if (e.key === "/" && input_) {
    e.preventDefault();
    input_.focus();
    return;
  }
  const cmd = COMMANDS.find((c) => c.key === e.key);
  if (cmd) {
    e.preventDefault();
    execute({ kind: "path", path: cmd.path, name: cmd.name }, "key");
  }
});

// ── history ──────────────────────────────────────────────────────────────
history.replaceState({ path: location.pathname }, "", location.href);
window.addEventListener("popstate", (e) => {
  const path = (e.state as { path?: string } | null)?.path ?? location.pathname;
  if (isCommandPath(path)) execute({ kind: "path", path, name: path.slice(1) || "neofetch" }, "history");
});

// ── boot ─────────────────────────────────────────────────────────────────
document.querySelectorAll<HTMLElement>("[data-js-only]").forEach((el) => (el.hidden = false));
mountIslands(document);
prefetch(COMMANDS.map((c) => c.path));

// The boot dissolve plays once per session, and only if this script arrived quickly: text is never
// hidden waiting on JavaScript.
const fast = performance.now() < 800;
if (fast && motionAllowed() && !store.get(BOOTED, sessionStorage)) {
  store.set(BOOTED, "1", sessionStorage);
  const target = document.querySelector<HTMLElement>("#scrollback > section[data-cmd]");
  if (target) void dissolveIn(target);
}
