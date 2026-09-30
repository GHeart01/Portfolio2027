/**
 * Build-time ASCII art for the neofetch header: a 360° LiDAR scan of a small room, plotted with
 * quadrant block characters (2×2 "pixels" per character cell). Decorative; rendered aria-hidden.
 */

type Box = { x0: number; y0: number; x1: number; y1: number };

// Quadrant glyphs indexed by bitmask: 1=top-left 2=top-right 4=bottom-left 8=bottom-right.
const QUAD = [" ", "▘", "▝", "▀", "▖", "▌", "▞", "▛", "▗", "▚", "▐", "▜", "▄", "▙", "▟", "█"];

function hit(ox: number, oy: number, dx: number, dy: number, boxes: Box[], room: Box): number {
  let best = Infinity;
  const slab = (b: Box, inside: boolean) => {
    // ray vs axis-aligned box: entry distance (or exit distance when starting inside)
    const tx0 = (b.x0 - ox) / dx,
      tx1 = (b.x1 - ox) / dx;
    const ty0 = (b.y0 - oy) / dy,
      ty1 = (b.y1 - oy) / dy;
    const tmin = Math.max(Math.min(tx0, tx1), Math.min(ty0, ty1));
    const tmax = Math.min(Math.max(tx0, tx1), Math.max(ty0, ty1));
    if (tmax < 0 || tmin > tmax) return;
    const t = inside ? tmax : tmin;
    if (t > 0 && t < best) best = t;
  };
  slab(room, true);
  for (const b of boxes) slab(b, false);
  return best;
}

export type ArtCell = { ch: string; kind: "hit" | "free" | "robot" | "empty" };

export function lidarArt(cols = 22, rows = 10, rays = 540): ArtCell[][] {
  const W = cols * 2,
    H = rows * 2;
  const hits = Array.from({ length: H }, () => new Array<boolean>(W).fill(false));
  const free = Array.from({ length: rows }, () => new Array<boolean>(cols).fill(false));
  // World units = quadrant pixels. A character cell is ~1:2, so a 2×2 pixel block is roughly square.
  const room: Box = { x0: 1, y0: 1, x1: W - 1.01, y1: H - 1.01 };
  const boxes: Box[] = [
    { x0: 7, y0: 4, x1: 12, y1: 7 },
    { x0: 31, y0: 12, x1: 37, y1: 16 },
    { x0: 30, y0: 3, x1: 32, y1: 8 },
    { x0: 9, y0: 13, x1: 11, y1: 17 },
  ];
  const ox = W / 2 - 1.5,
    oy = H / 2 + 0.3;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    const dx = Math.cos(a) || 1e-9,
      dy = Math.sin(a) || 1e-9;
    const t = hit(ox, oy, dx, dy, boxes, room);
    if (!Number.isFinite(t)) continue;
    const px = Math.floor(ox + dx * t),
      py = Math.floor(oy + dy * t);
    if (px >= 0 && px < W && py >= 0 && py < H) hits[py]![px] = true;
    // swept floor between the sensor and the hit
    for (let d = 2; d < t - 1.5; d += 1) {
      const c = Math.floor((ox + dx * d) / 2),
        r = Math.floor((oy + dy * d) / 2);
      if (r >= 0 && r < rows && c >= 0 && c < cols) free[r]![c] = true;
    }
  }
  const out: ArtCell[][] = [];
  const rr = Math.floor(oy / 2),
    rc = Math.floor(ox / 2);
  for (let r = 0; r < rows; r++) {
    const line: ArtCell[] = [];
    for (let c = 0; c < cols; c++) {
      const m =
        (hits[r * 2]![c * 2] ? 1 : 0) |
        (hits[r * 2]![c * 2 + 1] ? 2 : 0) |
        (hits[r * 2 + 1]![c * 2] ? 4 : 0) |
        (hits[r * 2 + 1]![c * 2 + 1] ? 8 : 0);
      if (r === rr && c === rc) line.push({ ch: "●", kind: "robot" });
      else if (m) line.push({ ch: QUAD[m]!, kind: "hit" });
      else if (free[r]![c] && (r + c) % 2 === 0) line.push({ ch: "·", kind: "free" });
      else line.push({ ch: " ", kind: "empty" });
    }
    out.push(line);
  }
  return out;
}

export const artToText = (art: ArtCell[][]) => art.map((l) => l.map((c) => c.ch).join("")).join("\n");
