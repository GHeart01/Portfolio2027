/**
 * Glyph dissolve: text arrives as scattered slivers of its own glyphs that snap into place, left to
 * right. Purely visual: a canvas overlay (aria-hidden) draws the effect while the real DOM text stays
 * in place (made transparent only for the duration), so screen readers, selection, and layout never
 * see anything but the real text.
 */

const SLICES = 5;
const CHAR_MS = 280;
const SPREAD_MS = 220;
const MAX_CHARS = 1400;

const rand = (seed: number) => {
  // tiny deterministic hash → [0, 1)
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const easeOut = (x: number) => 1 - (1 - x) ** 3;

export function motionAllowed(): boolean {
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches && !document.hidden;
}

interface Glyph {
  ch: string;
  x: number;
  y: number;
  w: number;
  h: number;
  font: string;
  color: string;
  delay: number;
  seed: number;
}

function collectGlyphs(root: Element, origin: { left: number; top: number; width: number }): Glyph[] {
  const glyphs: Glyph[] = [];
  const range = document.createRange();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const vh = window.innerHeight;
  let node: Node | null;
  let seed = 1;
  while ((node = walker.nextNode()) && glyphs.length < MAX_CHARS) {
    const text = node.nodeValue ?? "";
    if (!text.trim()) continue;
    const parent = node.parentElement;
    if (!parent || parent.closest(".art, .visually-hidden, canvas, [data-fx-skip]")) continue;
    const cs = getComputedStyle(parent);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    const font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    for (let i = 0; i < text.length && glyphs.length < MAX_CHARS; i++) {
      const ch = text[i]!;
      if (ch === " " || ch === "\n" || ch === "\t") continue;
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const r = range.getBoundingClientRect();
      if (r.width === 0 || r.bottom < 0 || r.top > vh) continue;
      glyphs.push({
        ch,
        x: r.left - origin.left,
        y: r.top - origin.top,
        w: r.width,
        h: r.height,
        font,
        color: cs.color,
        delay: 0,
        seed: seed++,
      });
    }
  }
  const width = Math.max(origin.width, 1);
  for (const g of glyphs) g.delay = (g.x / width) * SPREAD_MS * 0.8 + rand(g.seed) * SPREAD_MS * 0.35;
  return glyphs;
}

const sprites = new Map<string, HTMLCanvasElement>();
function sprite(g: Glyph, dpr: number): HTMLCanvasElement {
  const key = `${g.ch}|${g.font}|${g.color}|${Math.round(g.w)}x${Math.round(g.h)}|${dpr}`;
  let c = sprites.get(key);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = Math.ceil(g.w * dpr) + 2;
  c.height = Math.ceil(g.h * dpr) + 2;
  const ctx = c.getContext("2d")!;
  ctx.scale(dpr, dpr);
  ctx.font = g.font;
  ctx.fillStyle = g.color;
  ctx.textBaseline = "alphabetic";
  const m = ctx.measureText(g.ch);
  const asc = m.fontBoundingBoxAscent || g.h * 0.8;
  const desc = m.fontBoundingBoxDescent || g.h * 0.2;
  ctx.fillText(g.ch, 0, (g.h - (asc + desc)) / 2 + asc);
  if (sprites.size > 600) sprites.clear();
  sprites.set(key, c);
  return c;
}

/**
 * Plays the dissolve on `el`. Resolves when finished (immediately if motion is off).
 * `el`'s text is hidden only once the overlay is ready, never before.
 */
export function dissolveIn(el: HTMLElement): Promise<void> {
  if (!motionAllowed()) return Promise.resolve();
  const bounds = el.getBoundingClientRect();
  if (bounds.bottom < 0 || bounds.top > window.innerHeight) return Promise.resolve();

  // Only the visible slice of the element is animated.
  const top = Math.max(bounds.top, 0);
  const bottom = Math.min(bounds.bottom, window.innerHeight);
  const glyphs = collectGlyphs(el, { left: bounds.left, top, width: bounds.width });
  if (!glyphs.length) return Promise.resolve();

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pad = 48; // room for slivers flying outside the element
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.className = "fx-canvas";
  const cw = bounds.width + pad * 2;
  const ch = bottom - top + pad * 2;
  canvas.width = Math.ceil(cw * dpr);
  canvas.height = Math.ceil(ch * dpr);
  Object.assign(canvas.style, {
    position: "absolute",
    left: `${bounds.left + window.scrollX - pad}px`,
    top: `${top + window.scrollY - pad}px`,
    width: `${cw}px`,
    height: `${ch}px`,
    pointerEvents: "none",
    zIndex: "5",
  });
  const ctx = canvas.getContext("2d")!;
  document.body.appendChild(canvas);
  el.classList.add("fx-hiding");

  const total = SPREAD_MS + CHAR_MS;
  const start = performance.now();

  return new Promise((resolve) => {
    const finish = () => {
      el.classList.remove("fx-hiding");
      canvas.remove();
      resolve();
    };
    const frame = (now: number) => {
      const t = now - start;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      for (const g of glyphs) {
        const p = Math.min(Math.max((t - g.delay) / CHAR_MS, 0), 1);
        const e = easeOut(p);
        const img = sprite(g, dpr);
        const sw = img.width / dpr;
        const sh = img.height / dpr;
        if (p >= 1) {
          ctx.globalAlpha = 1;
          ctx.drawImage(img, g.x + pad, g.y + pad, sw, sh);
          continue;
        }
        const scatter = 1 - e;
        ctx.globalAlpha = 0.25 + 0.75 * e;
        for (let s = 0; s < SLICES; s++) {
          const r1 = rand(g.seed * 31 + s);
          const r2 = rand(g.seed * 17 + s * 7);
          const sy = (s / SLICES) * img.height;
          const shh = img.height / SLICES;
          const dy = (r1 - 0.5) * g.h * 5 * scatter;
          const dx = (r2 - 0.5) * g.w * 1.2 * scatter;
          // slivers: squeezed horizontally while scattered, like the glyph is being sampled
          const squeeze = 1 - 0.6 * scatter * r2;
          ctx.drawImage(
            img,
            0,
            sy,
            img.width,
            shh,
            g.x + pad + dx + (sw * (1 - squeeze)) / 2,
            g.y + pad + (s / SLICES) * sh + dy,
            sw * squeeze,
            sh / SLICES,
          );
        }
      }
      if (t < total) requestAnimationFrame(frame);
      else finish();
    };
    requestAnimationFrame(frame);
  });
}
