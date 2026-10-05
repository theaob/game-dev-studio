/** Deterministic mulberry32 RNG whose state lives in the saved game, so runs are reproducible. */
export interface RngHolder {
  rng: number;
}

export function random(s: RngHolder): number {
  let t = (s.rng = (s.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function range(s: RngHolder, min: number, max: number): number {
  return min + random(s) * (max - min);
}

export function int(s: RngHolder, min: number, max: number): number {
  return Math.floor(range(s, min, max + 1));
}

export function pick<T>(s: RngHolder, items: readonly T[]): T {
  return items[Math.floor(random(s) * items.length)];
}

/** Approximately normal distribution (mean 0, sd 1). */
export function gaussian(s: RngHolder): number {
  return (random(s) + random(s) + random(s) + random(s) - 2) * 1.732;
}
