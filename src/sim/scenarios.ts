// Obstacle layouts from LiDAR Scout (github.com/GHeart01/LiDAR-Scout, src/scenarios.ts @5bc2f74).
// Boxes are centered at (x, z) with width w and depth d, inside a 44×44 arena centered on the origin.
export interface ObstacleDef {
  x: number;
  z: number;
  w: number;
  d: number;
}

export const SCENARIO_NAMES = ["Scatter", "Maze", "Warehouse", "Room"] as const;
export type ScenarioName = (typeof SCENARIO_NAMES)[number];

export const SCENARIOS: Record<ScenarioName, ObstacleDef[]> = {
  Scatter: [
    { x: -8, z: -6, w: 4, d: 4 },
    { x: 9, z: 4, w: 3, d: 6 },
    { x: 2, z: 12, w: 6, d: 3 },
    { x: -11, z: 9, w: 3, d: 3 },
    { x: 7, z: -10, w: 4, d: 3 },
    { x: -3, z: -14, w: 5, d: 2 },
  ],
  Maze: [
    { x: -10, z: -12, w: 1, d: 16 },
    { x: -2, z: -7, w: 16, d: 1 },
    { x: 9, z: -3, w: 1, d: 16 },
    { x: 0, z: 4, w: 18, d: 1 },
    { x: -9, z: 11, w: 1, d: 12 },
    { x: 4, z: 13, w: 12, d: 1 },
    { x: 14, z: 8, w: 1, d: 12 },
  ],
  Warehouse: [
    { x: -12, z: -4, w: 2, d: 16 },
    { x: -12, z: 12, w: 2, d: 6 },
    { x: -4, z: 0, w: 2, d: 20 },
    { x: 4, z: -2, w: 2, d: 16 },
    { x: 4, z: 14, w: 2, d: 4 },
    { x: 12, z: 2, w: 2, d: 20 },
  ],
  Room: [
    { x: 0, z: -10, w: 18, d: 1 },
    { x: -9, z: -3, w: 1, d: 14 },
    { x: 9, z: 3, w: 1, d: 14 },
    { x: 3, z: 8, w: 10, d: 1 },
    { x: -4, z: 6, w: 5, d: 5 },
  ],
};
