import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CellGrid } from "../src/sim/grid";
import { aStar } from "../src/sim/planner";
import { renderText } from "../src/sim/render";
import { SCENARIO_NAMES } from "../src/sim/scenarios";
import { N, World, buildTruth } from "../src/sim/world";

describe("A*", () => {
  const open = () => {
    const g = new CellGrid(10);
    g.data.fill(1);
    return g;
  };

  it("finds a shortest 8-connected path", () => {
    const path = aStar(open(), { cx: 0, cz: 0 }, { cx: 5, cz: 5 });
    expect(path).toHaveLength(6);
  });

  it("routes around walls and never cuts corners", () => {
    const g = open();
    for (let z = 0; z < 9; z++) g.set(5, z, 2);
    const path = aStar(g, { cx: 2, cz: 2 }, { cx: 8, cz: 2 })!;
    expect(path.some((c) => c.cx === 5 && c.cz === 9)).toBe(true);
    for (let i = 1; i < path.length; i++) {
      const [a, b] = [path[i - 1]!, path[i]!];
      if (a.cx !== b.cx && a.cz !== b.cz) {
        expect(g.get(b.cx, a.cz)).not.toBe(2);
        expect(g.get(a.cx, b.cz)).not.toBe(2);
      }
    }
  });

  it("returns null when the goal is unreachable or unknown cells are disallowed", () => {
    const g = open();
    for (let z = 0; z < 10; z++) g.set(5, z, 2);
    expect(aStar(g, { cx: 1, cz: 1 }, { cx: 8, cz: 1 })).toBeNull();
    const unknown = new CellGrid(10);
    expect(aStar(unknown, { cx: 1, cz: 1 }, { cx: 3, cz: 1 })).toBeNull();
    expect(aStar(unknown, { cx: 1, cz: 1 }, { cx: 3, cz: 1 }, { allowUnknown: true })).not.toBeNull();
  });
});

describe.each(SCENARIO_NAMES)("scenario %s", (name) => {
  it("has one connected free space", () => {
    const g = buildTruth(name);
    const start = g.data.indexOf(1);
    const seen = new Uint8Array(g.data.length);
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const cx = i % N;
      const cz = Math.floor(i / N);
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const j = g.index(cx + dx, cz + dz);
        if (g.get(cx + dx, cz + dz) === 1 && !seen[j]) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    const free = g.data.filter((v) => v === 1).length;
    expect(seen.filter(Boolean).length).toBe(free);
  });

  it("keeps every agent out of walls and catches the target", () => {
    const w = new World(name, 1337);
    for (let t = 0; t < 1500; t++) {
      w.step();
      for (const a of [...w.robots, w.prey]) expect(w.truth.get(a.cx, a.cz), `tick ${t}`).not.toBe(2);
    }
    expect(w.catches).toBeGreaterThan(5);
    expect(w.coverage()).toBeGreaterThan(0.9);
  });
});

describe("determinism", () => {
  it("renders the same frame for the same seed", () => {
    const frame = () => {
      const w = new World("Maze", 1337);
      for (let i = 0; i < 300; i++) w.step();
      return createHash("sha256").update(renderText(w)).digest("hex");
    };
    expect(frame()).toBe(frame());
  });

  it("renders 44 columns × 22 rows", () => {
    const rows = renderText(new World()).split("\n");
    expect(rows).toHaveLength(22);
    for (const r of rows) expect([...r]).toHaveLength(44);
  });
});
