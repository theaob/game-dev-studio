/**
 * Sequels: a follow-up to a released game keeps its topic and genre, sells to
 * the original's fans, and isn't penalised for repeating the combination —
 * unless it's rushed out too soon or the series has run too long.
 */
import { beloved } from './acclaim';
import type { GameState, ReleasedGame } from './types';

/** Releasing a sequel within a year of the previous entry feels rushed. */
export const SEQUEL_TOO_SOON_WEEKS = 48;
export const SEQUEL_TOO_SOON_MULT = 0.88;

/** Part number in its series (1 for an original). Saves from before sequels have no `series`. */
export function seriesNumber(g: ReleasedGame): number {
  return g.series ?? 1;
}

export function hasSequel(state: GameState, id: number): boolean {
  return state.released.some((g) => g.sequelOf === id);
}

/** Games that can get a sequel: the latest entry of each series, best reviewed first. */
export function sequelCandidates(state: GameState): ReleasedGame[] {
  return state.released.filter((g) => !hasSequel(state, g.id)).sort((a, b) => b.score - a.score);
}

/** "Dragon Saga" → "Dragon Saga 2", "Dragon Saga 2" → "Dragon Saga 3". */
export function sequelName(original: ReleasedGame): string {
  const m = original.name.match(/^(.*?)\s+(\d+)$/);
  if (m) return `${m[1]} ${Number(m[2]) + 1}`;
  return `${original.name} ${seriesNumber(original) + 1}`;
}

/**
 * Sales multiplier for a sequel to `original`. Fans of a good game come back
 * (up to +45%); a flop's sequel sells less. Long series start to tire players,
 * unless the last entry was an award winner: those fans want more.
 */
export function sequelSalesMult(original: ReleasedGame): number {
  const s = original.score;
  const fans = s >= 5 ? 1 + Math.min(0.45, Math.max(0, (s - 5) * 0.12)) : 0.8 + (s - 1) * 0.05;
  const part = seriesNumber(original) + 1;
  const fatigue = part >= 4 && !beloved(original) ? Math.max(0.75, 1 - 0.05 * (part - 3)) : 1;
  return fans * fatigue;
}

/** Review multiplier replacing the usual repeat penalty: only rushing it out hurts. */
export function sequelQualityMult(week: number, original: ReleasedGame): number {
  return week - original.releaseWeek < SEQUEL_TOO_SOON_WEEKS ? SEQUEL_TOO_SOON_MULT : 1;
}
