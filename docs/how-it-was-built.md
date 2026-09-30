# How this site was built

_Draft write-up. Edit freely._

My previous portfolio was a Three.js scene. It looked nice, but every word on it was drawn by
JavaScript, it took a GPU to read my resume, and neither a recruiter's screen reader nor an AI agent
could get anything out of it. For v2 I wanted the opposite: text first, fast everywhere, and readable
by agents as well as people.

## One source, three interfaces

Everything starts with `content/resume.json`, validated by a zod schema. Three things read it:

- **The website.** Astro renders every command (`about`, `experience`, `projects`, …) to a plain HTML
  page. With JavaScript off it's a fast, accessible static site. With JavaScript on, a small shell
  (5 KB gzipped) turns those pages into one terminal session. A command fetches its page and moves
  that page's output into the scrollback, so the no-JS pages are the only renderer.
- **An MCP server** at `/mcp`, so Claude or any MCP client can ask about my work. It's a stateless
  Cloudflare Worker using the official TypeScript SDK (v2, with stateless fallback for 2025-era
  clients). Seven read-only tools sit over the same content modules as the site. `search` is a small
  BM25 index, built once per isolate; requests cost well under 2 ms.
- **An "ask" chat** that runs Qwen3-1.7B in the browser with WebLLM and WebGPU. It's opt-in: nothing
  downloads until you click, and nothing you type leaves your machine. Phones and browsers without
  WebGPU get keyword search over the same content.

## Keeping a 1.7B model honest

A small model will happily invent a job at Google if you ask about one. The prompt helps, but the
real work is in a guard that treats the model's output as a draft:

1. Retrieval runs first. If none of the question's words exist anywhere in the content ("salary",
   "Rust", "PhD"), the chat refuses without calling the model.
2. Names from the question that the content never mentions ("Google") are passed to the model as
   "the content never mentions: Google".
3. Every sentence the model writes has to be supported by a retrieved section. Its names, numbers,
   URLs and emails must appear in that section. Sentences that aren't supported are dropped.
4. The model often forgets citations or cites the wrong section, so the guard re-attributes each
   sentence to the section that actually contains its facts.

I tested this with a local eval harness: headed Chrome, the real model, and 28 questions including
prompt injection and false premises. The first run passed 21 of 28, mostly because the guard refused
correct answers the model hadn't cited. After adding citation repair it passes 27 of 28 with zero
invented facts. The model's real bad outputs from those runs became unit tests.

## The terminal look

One font (a JetBrains Mono subset I build myself, because stock web subsets drop the box-drawing
characters the layout needs), a navy background, and one amber accent. Panes borrow btop's style:
rounded borders with the title set into the top edge. The neofetch logo is a LiDAR scan of a room,
generated at build time, a nod to my robotics work.

The one piece of motion is a glyph-dissolve effect. Text arrives as slivers of its own glyphs that
snap into place from left to right. It's a canvas overlay: the real text is always in the DOM
(just transparent for a few hundred milliseconds), it never runs before JavaScript has loaded, and it
turns off for reduced motion.

`sim` is an easter egg: an ASCII port of my LiDAR Scout simulator. Four robots with Pac-Man-style
pursuit strategies sweep LiDAR into a shared occupancy map and chase a fleeing target with A*.

## Content safety

My day job is in an ITAR-regulated environment, so work projects are described at the architecture
level only. A content linter runs on every commit and in CI. It blocks phone numbers, stray emails,
part-number-shaped tokens and controlled-data phrasing, and it checks a private denylist of internal
names that never enters the repo.

## Quality bar

- Lighthouse 100 across performance, accessibility, best practices and SEO on every page tested,
  including the chat and the sim.
- axe finds no WCAG 2.1 AA or best-practice violations, including after a long terminal session.
- Every command works with JavaScript disabled.
- CI runs lint, type checks, about 90 unit tests, and Playwright end-to-end tests against the real
  Workers runtime.

## What's next

- `curl geraltheart.com` → a plain-text resume, via user-agent detection in the Worker.
- `ssh geraltheart.com` → a real TUI with Charm's Wish, reading the same JSON.
- New CLI and MCP projects, replacing the two placeholders.
