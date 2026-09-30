/**
 * Discrete-time ASCII port of LiDAR Scout's pursuit sim (github.com/GHeart01/LiDAR-Scout). Four robots
 * sweep a LiDAR, build one shared occupancy map, and chase a fleeing target with A* over that map.
 * Unlike the original, agents move cell by cell and can't pass through walls.
 */
import { CellGrid, type Cell } from "./grid";
import { aStar } from "./planner";
import { mulberry32, type Rng } from "./rng";
import { SCENARIOS, type ScenarioName } from "./scenarios";

export const N = 44; // cells per side; 1 cell = 1 world unit of the original arena
const HALF = N / 2;
export const DT = 0.1; // seconds per tick
const RANGE = 9; // LiDAR range in cells
const SWEEP_DEG = 60; // sector swept per tick (a full turn every 0.6 s)
const RAYS_PER_TICK = 16;
const LOOK = 7; // prey's obstacle look-ahead
const STUCK_TICKS = 70; // 7 s without progress: go back to start (as in the original)

export type FsmState = "IDLE" | "CHASE" | "AVOID";

export const ROBOTS = [
  { name: "Red", letter: "R", replan: 2 }, // smartest: predicts the target, re-plans fastest
  { name: "Pink", letter: "P", replan: 4 }, // ambushes ahead of the target
  { name: "Cyan", letter: "C", replan: 4 }, // chases directly
  { name: "Orange", letter: "O", replan: 5 }, // scatters to its corner when close
] as const;

export interface Robot extends Cell {
  id: number;
  heading: number; // LiDAR sweep angle (radians)
  state: FsmState;
  path: Cell[] | null;
  pathIndex: number;
  replanIn: number;
  stuck: number;
  start: Cell;
  goal: Cell;
}

export interface Prey extends Cell {
  heading: number;
  vx: number;
  vz: number;
}

export function buildTruth(name: ScenarioName): CellGrid {
  const g = new CellGrid(N);
  g.data.fill(1);
  for (let i = 0; i < N; i++) {
    g.set(i, 0, 2);
    g.set(i, N - 1, 2);
    g.set(0, i, 2);
    g.set(N - 1, i, 2);
  }
  for (const b of SCENARIOS[name]) {
    // Round edges to whole cells (min 1) so the 1-unit maze walls survive.
    const x0 = Math.round(b.x - b.w / 2 + HALF);
    const z0 = Math.round(b.z - b.d / 2 + HALF);
    const x1 = Math.max(x0 + 1, Math.round(b.x + b.w / 2 + HALF));
    const z1 = Math.max(z0 + 1, Math.round(b.z + b.d / 2 + HALF));
    for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) g.set(x, z, 2);
  }
  return g;
}

const cheb = (a: Cell, b: Cell) => Math.max(Math.abs(a.cx - b.cx), Math.abs(a.cz - b.cz));
const dist = (a: Cell, b: Cell) => Math.hypot(a.cx - b.cx, a.cz - b.cz);
const clampCell = (v: number) => Math.min(N - 2, Math.max(1, Math.round(v)));

const MOVES: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

export class World {
  readonly scenario: ScenarioName;
  readonly truth: CellGrid;
  readonly known = new CellGrid(N);
  robots: Robot[] = [];
  prey: Prey;
  catches = 0;
  ticks = 0;
  /** Cells hit by LiDAR this tick (for the "live scan" highlight). */
  scanHits = new Set<number>();
  private rng: Rng;

  constructor(scenario: ScenarioName = "Scatter", seed = 1337) {
    this.scenario = scenario;
    this.truth = buildTruth(scenario);
    this.rng = mulberry32(seed);
    for (let id = 0; id < ROBOTS.length; id++) {
      const a = (id / ROBOTS.length) * Math.PI * 2;
      const start = this.nearestFree({
        cx: clampCell(HALF + Math.cos(a) * 5),
        cz: clampCell(HALF + Math.sin(a) * 5),
      });
      this.robots.push({
        id,
        ...start,
        heading: a,
        state: "CHASE",
        path: null,
        pathIndex: 0,
        replanIn: 0,
        stuck: 0,
        start,
        goal: start,
      });
    }
    this.prey = { cx: 0, cz: 0, heading: 0, vx: 0, vz: 0 };
    this.respawnPrey();
  }

  get time(): number {
    return this.ticks * DT;
  }

  free(cx: number, cz: number): boolean {
    return this.truth.get(cx, cz) !== 2;
  }

  /** Nearest free truth cell (spiral search). */
  nearestFree(c: Cell): Cell {
    for (let r = 0; r < N; r++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          if (this.free(c.cx + dx, c.cz + dz)) return { cx: c.cx + dx, cz: c.cz + dz };
        }
    return c;
  }

  private respawnPrey(): void {
    for (let i = 0; i < 80; i++) {
      const c = { cx: 1 + Math.floor(this.rng() * (N - 2)), cz: 1 + Math.floor(this.rng() * (N - 2)) };
      if (this.free(c.cx, c.cz) && this.robots.every((r) => dist(r, c) >= 10)) {
        this.prey = { ...c, heading: this.rng() * Math.PI * 2, vx: 0, vz: 0 };
        return;
      }
    }
    this.prey = { ...this.nearestFree({ cx: HALF, cz: HALF }), heading: 0, vx: 0, vz: 0 };
  }

  // ── sensing ────────────────────────────────────────────────────────────
  private sense(r: Robot): void {
    this.known.setFree(r.cx, r.cz);
    const ox = r.cx + 0.5;
    const oz = r.cz + 0.5;
    const span = (SWEEP_DEG * Math.PI) / 180;
    for (let i = 0; i < RAYS_PER_TICK; i++) {
      const a = r.heading + (i / RAYS_PER_TICK) * span;
      const ax = Math.cos(a);
      const az = Math.sin(a);
      for (let d = 0.5; d <= RANGE; d += 0.5) {
        const cx = Math.floor(ox + ax * d);
        const cz = Math.floor(oz + az * d);
        if (!this.truth.inBounds(cx, cz)) break;
        if (this.truth.get(cx, cz) === 2) {
          this.known.set(cx, cz, 2);
          this.scanHits.add(this.truth.index(cx, cz));
          break;
        }
        this.known.setFree(cx, cz);
      }
    }
    r.heading = (r.heading + span) % (Math.PI * 2);
  }

  // ── target ─────────────────────────────────────────────────────────────
  private clearance(c: Cell, dx: number, dz: number): number {
    let n = 0;
    while (n < LOOK && this.free(c.cx + dx * (n + 1), c.cz + dz * (n + 1))) n++;
    return n;
  }

  private canStep(c: Cell, dx: number, dz: number): boolean {
    if (!this.free(c.cx + dx, c.cz + dz)) return false;
    // no diagonal corner-cutting
    return dx === 0 || dz === 0 || (this.free(c.cx + dx, c.cz) && this.free(c.cx, c.cz + dz));
  }

  private movePrey(): void {
    const p = this.prey;
    let nearest = Infinity;
    let fx = 0;
    let fz = 0;
    for (const r of this.robots) {
      const d = dist(r, p);
      if (d < nearest) {
        nearest = d;
        fx = p.cx - r.cx;
        fz = p.cz - r.cz;
      }
    }
    const flee = Math.atan2(fz, fx);
    const fleeWeight = nearest < 11 ? (1 - nearest / 11) * 3 : 0;

    let best: [number, number] = [0, 0];
    let bestScore = -Infinity;
    for (const [dx, dz] of MOVES) {
      if (!this.canStep(p, dx, dz)) continue;
      const a = Math.atan2(dz, dx);
      const c = this.clearance(p, dx, dz);
      let score = c / LOOK;
      if (c < 2) score -= 2;
      score += Math.cos(a - flee) * fleeWeight + Math.cos(a - p.heading) * 0.6;
      const next = { cx: p.cx + dx, cz: p.cz + dz };
      if (this.robots.some((r) => cheb(r, next) <= 1)) score -= 3;
      score += this.rng() * 0.05; // break ties
      if (score > bestScore) {
        bestScore = score;
        best = [dx, dz];
      }
    }
    const [dx, dz] = best;
    p.cx += dx;
    p.cz += dz;
    p.vx = dx;
    p.vz = dz;
    if (dx || dz) p.heading = Math.atan2(dz, dx);
  }

  // ── pursuit ────────────────────────────────────────────────────────────
  private chaseGoal(r: Robot): Cell {
    const p = this.prey;
    let tx = p.cx;
    let tz = p.cz;
    if (r.id === 0) {
      tx += p.vx * 3;
      tz += p.vz * 3;
    } else if (r.id === 1) {
      tx += Math.cos(p.heading) * 4;
      tz += Math.sin(p.heading) * 4;
    } else if (r.id === 3 && dist(r, p) < 7) {
      const c = HALF - 3;
      const corners: [number, number][] = [
        [-c, -c],
        [c, -c],
        [-c, c],
        [c, c],
      ];
      [tx, tz] = corners[r.id % 4]!.map((v) => v + HALF) as [number, number];
    }
    const goal = { cx: clampCell(tx), cz: clampCell(tz) };
    // plan to a cell the shared map doesn't already know is a wall
    if (this.known.get(goal.cx, goal.cz) !== 2) return goal;
    for (let rad = 1; rad < 4; rad++)
      for (const [dx, dz] of MOVES) {
        const c = { cx: goal.cx + dx * rad, cz: goal.cz + dz * rad };
        if (this.known.get(c.cx, c.cz) !== 2 && this.truth.inBounds(c.cx, c.cz)) return c;
      }
    return goal;
  }

  private stepRobot(r: Robot): void {
    this.sense(r);
    if (r.replanIn <= 0 || !r.path) {
      r.goal = this.chaseGoal(r);
      r.path = aStar(this.known, r, r.goal, { allowUnknown: true });
      r.pathIndex = 1;
      r.replanIn = ROBOTS[r.id]!.replan;
    }
    r.replanIn--;

    const next = r.path?.[r.pathIndex];
    let moved = false;
    if (next) {
      const dx = next.cx - r.cx;
      const dz = next.cz - r.cz;
      const blockedByRobot = this.robots.some((o) => o !== r && o.cx === next.cx && o.cz === next.cz);
      if (!this.canStep(r, dx, dz)) {
        // Bumped into a wall the map didn't know yet: record it and re-plan.
        this.known.set(next.cx, next.cz, 2);
        r.path = null;
        r.state = "AVOID";
      } else if (blockedByRobot) {
        r.state = "AVOID";
        r.replanIn = 0;
      } else {
        r.cx = next.cx;
        r.cz = next.cz;
        r.pathIndex++;
        r.state = "CHASE";
        moved = true;
      }
    } else {
      r.state = "AVOID";
    }
    r.stuck = moved ? 0 : r.stuck + 1;
    if (r.stuck >= STUCK_TICKS) {
      r.cx = r.start.cx;
      r.cz = r.start.cz;
      r.path = null;
      r.stuck = 0;
    }
  }

  step(): void {
    this.scanHits.clear();
    this.ticks++;
    if (this.ticks % 6 !== 0) this.movePrey(); // the target runs at 5/6 of robot speed
    for (const r of this.robots) this.stepRobot(r);
    if (this.robots.some((r) => cheb(r, this.prey) <= 1)) {
      this.catches++;
      this.respawnPrey();
      for (const r of this.robots) r.path = null;
    }
  }

  coverage(): number {
    let known = 0;
    let total = 0;
    for (let i = 0; i < this.truth.data.length; i++) {
      if (this.truth.data[i] === 1) {
        total++;
        if (this.known.data[i] !== 0) known++;
      }
    }
    return known / Math.max(total, 1);
  }
}
