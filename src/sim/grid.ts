/**
 * A square cell grid (1 cell = 1 world unit). Same interface shape as LiDAR Scout's OccupancyGrid
 * (github.com/GHeart01/LiDAR-Scout, src/sim/grid.ts @5bc2f74) so the A* planner ports unchanged.
 */
export type CellState = 0 | 1 | 2; // 0 unknown, 1 free, 2 occupied

export interface Cell {
  cx: number;
  cz: number;
}

export class CellGrid {
  readonly n: number;
  readonly data: Uint8Array;

  constructor(n: number) {
    this.n = n;
    this.data = new Uint8Array(n * n);
  }

  index(cx: number, cz: number): number {
    return cz * this.n + cx;
  }

  inBounds(cx: number, cz: number): boolean {
    return cx >= 0 && cz >= 0 && cx < this.n && cz < this.n;
  }

  /** Out-of-bounds reads as occupied so planners treat the edge as a wall. */
  get(cx: number, cz: number): CellState {
    if (!this.inBounds(cx, cz)) return 2;
    return this.data[this.index(cx, cz)] as CellState;
  }

  set(cx: number, cz: number, s: CellState): void {
    if (this.inBounds(cx, cz)) this.data[this.index(cx, cz)] = s;
  }

  /** Marks unknown cells free; never downgrades an occupied cell. */
  setFree(cx: number, cz: number): void {
    if (this.inBounds(cx, cz) && this.data[this.index(cx, cz)] === 0) this.data[this.index(cx, cz)] = 1;
  }

  coverage(): number {
    let known = 0;
    for (const v of this.data) if (v !== 0) known++;
    return known / this.data.length;
  }
}
