// From LiDAR Scout (github.com/GHeart01/LiDAR-Scout, src/sim/rng.ts @5bc2f74), same author.
// Small deterministic PRNG (mulberry32) so the sim is reproducible and unit-testable.
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
