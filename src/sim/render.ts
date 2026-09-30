/**
 * Renders the world as 44 columns × 22 rows: each character is two stacked cells drawn with half
 * blocks, so cells come out roughly square. Pure: returns runs of (class, text), not DOM.
 */
import { N, ROBOTS, type World } from "./world";

export type Cls = "empty" | "free" | "ghost" | "wall" | "scan" | "prey" | `r${number}`;
export interface Run {
  cls: Cls;
  text: string;
}

const HALF_BLOCK = { top: "▀", bottom: "▄", both: "█" } as const;

function charAt(w: World, c: number, row: number): { ch: string; cls: Cls } {
  const zt = row * 2;
  const zb = zt + 1;
  const at = (cx: number, cz: number) => cx === c && (cz === zt || cz === zb);
  if (at(w.prey.cx, w.prey.cz)) return { ch: "●", cls: "prey" };
  const robot = w.robots.find((r) => at(r.cx, r.cz));
  if (robot) return { ch: ROBOTS[robot.id]!.letter, cls: `r${robot.id}` };

  const wt = w.truth.get(c, zt) === 2;
  const wb = zb < N && w.truth.get(c, zb) === 2;
  if (wt || wb) {
    const ch = wt && wb ? HALF_BLOCK.both : wt ? HALF_BLOCK.top : HALF_BLOCK.bottom;
    const hit = (wt && w.scanHits.has(w.truth.index(c, zt))) || (wb && w.scanHits.has(w.truth.index(c, zb)));
    const known = (wt && w.known.get(c, zt) === 2) || (wb && w.known.get(c, zb) === 2);
    return { ch, cls: hit ? "scan" : known ? "wall" : "ghost" };
  }
  const seen = w.known.get(c, zt) === 1 || (zb < N && w.known.get(c, zb) === 1);
  if (seen && (c + row) % 2 === 0) return { ch: "·", cls: "free" };
  return { ch: " ", cls: "empty" };
}

export function renderRows(w: World): Run[][] {
  const rows: Run[][] = [];
  for (let row = 0; row < N / 2; row++) {
    const runs: Run[] = [];
    for (let c = 0; c < N; c++) {
      const { ch, cls } = charAt(w, c, row);
      const last = runs.at(-1);
      if (last && last.cls === cls) last.text += ch;
      else runs.push({ cls, text: ch });
    }
    rows.push(runs);
  }
  return rows;
}

export const renderText = (w: World) =>
  renderRows(w)
    .map((r) => r.map((x) => x.text).join(""))
    .join("\n");

export function renderHtml(w: World): string {
  return renderRows(w)
    .map((runs) =>
      runs.map((r) => (r.cls === "empty" ? r.text : `<span class="s-${r.cls}">${r.text}</span>`)).join(""),
    )
    .join("\n");
}

export function statusLine(w: World): string {
  const states = w.robots.map((r) => `${ROBOTS[r.id]!.letter}:${r.state.toLowerCase()}`).join(" ");
  return `t=${w.time.toFixed(1)}s  catches ${w.catches}  map ${Math.round(w.coverage() * 100)}%  ${states}`;
}
