// A* from LiDAR Scout (github.com/GHeart01/LiDAR-Scout, src/sim/planner.ts @5bc2f74), same author,
// ported to strict TypeScript. 8-connected, octile heuristic, no diagonal corner-cutting.
import type { Cell, CellGrid } from "./grid";

interface Options {
  allowUnknown?: boolean; // let paths cross unobserved cells (optimistic)
  inflate?: number; // keep this many cells clear of obstacles
}

const DIRS: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

export function aStar(grid: CellGrid, start: Cell, goal: Cell, opts: Options = {}): Cell[] | null {
  const n = grid.n;
  if (!grid.inBounds(start.cx, start.cz) || !grid.inBounds(goal.cx, goal.cz)) return null;
  if (grid.get(goal.cx, goal.cz) === 2) return null;
  const startIdx = grid.index(start.cx, start.cz);
  const goalIdx = grid.index(goal.cx, goal.cz);
  const inflate = opts.inflate ?? 0;

  const occupiedNear = (cx: number, cz: number): boolean => {
    for (let dz = -inflate; dz <= inflate; dz++)
      for (let dx = -inflate; dx <= inflate; dx++) if (grid.get(cx + dx, cz + dz) === 2) return true;
    return false;
  };
  const passable = (cx: number, cz: number): boolean => {
    const s = grid.get(cx, cz);
    if (s === 2) return false;
    if (s === 0 && !opts.allowUnknown) return false;
    if (inflate > 0 && occupiedNear(cx, cz)) return false;
    return true;
  };
  const h = (cx: number, cz: number): number => {
    const dx = Math.abs(cx - goal.cx);
    const dz = Math.abs(cz - goal.cz);
    return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz);
  };

  const gScore = new Float64Array(n * n).fill(Infinity);
  const fOf = new Float64Array(n * n).fill(Infinity);
  const cameFrom = new Int32Array(n * n).fill(-1);
  const closed = new Uint8Array(n * n);

  // Tiny binary heap of cell indices keyed by f-score.
  const heap: number[] = [];
  const f = (i: number) => fOf[heap[i]!]!;
  const swap = (a: number, b: number) => ([heap[a], heap[b]] = [heap[b]!, heap[a]!]);
  const push = (idx: number) => {
    heap.push(idx);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (f(p) <= f(i)) break;
      swap(p, i);
      i = p;
    }
  };
  const pop = (): number => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let s = i;
        if (l < heap.length && f(l) < f(s)) s = l;
        if (r < heap.length && f(r) < f(s)) s = r;
        if (s === i) break;
        swap(s, i);
        i = s;
      }
    }
    return top;
  };

  gScore[startIdx] = 0;
  fOf[startIdx] = h(start.cx, start.cz);
  push(startIdx);

  while (heap.length) {
    const current = pop();
    if (current === goalIdx) {
      const path: Cell[] = [];
      for (let c = current; c !== -1; c = cameFrom[c]!) path.push({ cx: c % n, cz: Math.floor(c / n) });
      return path.reverse();
    }
    if (closed[current]) continue;
    closed[current] = 1;
    const ccx = current % n;
    const ccz = Math.floor(current / n);
    for (const [dx, dz, cost] of DIRS) {
      const nx = ccx + dx;
      const nz = ccz + dz;
      if (!passable(nx, nz)) continue;
      if (dx !== 0 && dz !== 0 && (!passable(ccx + dx, ccz) || !passable(ccx, ccz + dz))) continue;
      const nIdx = grid.index(nx, nz);
      if (closed[nIdx]) continue;
      const tentative = gScore[current]! + cost;
      if (tentative < gScore[nIdx]!) {
        cameFrom[nIdx] = current;
        gScore[nIdx] = tentative;
        fOf[nIdx] = tentative + h(nx, nz);
        push(nIdx);
      }
    }
  }
  return null;
}
