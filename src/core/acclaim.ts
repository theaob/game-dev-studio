/**
 * Special recognition for great games. A release that reviews 9 or better is
 * "Critics' Choice", 9.5 or better a "Masterpiece". Once a year the best-reviewed
 * release, yours or a rival's, is Game of the Year. Awards are saved with the
 * game, and a sequel to an awarded game starts development already hyped.
 */
import { WEEKS_PER_YEAR } from './time';
import type { ReleasedGame } from './types';

export type AcclaimId = 'choice' | 'masterpiece';

export interface Acclaim {
  id: AcclaimId;
  name: string;
  icon: string;
  /** Lowest average review score that earns it. */
  minScore: number;
}

/** Best first. */
export const ACCLAIMS: Acclaim[] = [
  { id: 'masterpiece', name: 'Masterpiece', icon: '👑', minScore: 9.5 },
  { id: 'choice', name: "Critics' Choice", icon: '🏅', minScore: 9 },
];

/** The recognition a score earns, if any. */
export function acclaimFor(score: number): Acclaim | undefined {
  return ACCLAIMS.find((a) => score >= a.minScore);
}

/** A released game's recognition. Saves from before awards fall back to its score. */
export function acclaimOf(g: Pick<ReleasedGame, 'acclaim' | 'score'>): Acclaim | undefined {
  if (g.acclaim) return ACCLAIMS.find((a) => a.id === g.acclaim);
  return acclaimFor(g.score);
}

/** Hype a sequel starts with when the original was recognized: 20 at a 9.0, 40 at 9.5, 60 at a perfect 10. */
export const SEQUEL_HYPE_BASE = 20;
export const SEQUEL_HYPE_PER_POINT = 40;
/** Fans of a great game get more excited the longer they wait: extra hype per year after the first, up to a cap. */
export const LONG_AWAITED_HYPE_PER_YEAR = 8;
export const LONG_AWAITED_MAX_HYPE = 32;

/** A Critics' Choice, Masterpiece or Game of the Year: its fans never tire of the series. */
export function beloved(g: Pick<ReleasedGame, 'acclaim' | 'score' | 'goty'>): boolean {
  return !!acclaimOf(g) || g.goty !== undefined;
}

/** Extra hype for a beloved game's sequel announced `week`, for the years fans have waited since the original. */
export function longAwaitedHype(original: Pick<ReleasedGame, 'acclaim' | 'score' | 'goty' | 'releaseWeek'>, week: number): number {
  if (!beloved(original)) return 0;
  const years = Math.floor((week - original.releaseWeek) / WEEKS_PER_YEAR);
  return Math.min(LONG_AWAITED_MAX_HYPE, Math.max(0, years - 1) * LONG_AWAITED_HYPE_PER_YEAR);
}

/**
 * Hype a sequel starts with, started in `week`. The fans of a beloved original
 * keep at least this much excitement all through development: it doesn't fade.
 */
export function sequelHype(original: Pick<ReleasedGame, 'acclaim' | 'score' | 'goty' | 'releaseWeek'>, week: number): number {
  const acclaimed = acclaimOf(original) ? SEQUEL_HYPE_BASE + Math.max(0, original.score - 9) * SEQUEL_HYPE_PER_POINT : 0;
  const total = acclaimed + (original.goty !== undefined ? GOTY_SEQUEL_HYPE : 0) + longAwaitedHype(original, week);
  return Math.min(100, Math.round(total));
}

// ---------------------------------------------------------------------------
// Game of the Year: judged when a new year starts, over last year's releases.

export const GOTY_ICON = '🏆';
/** What winning brings: fans (a share of the studio's, at least GOTY_MIN_FANS), more copies of what it has left to sell, and sequel hype. */
export const GOTY_FANS_SHARE = 0.03;
export const GOTY_MIN_FANS = 1000;
export const GOTY_SALES_BOOST = 0.25;
export const GOTY_SEQUEL_HYPE = 15;

export function gotyFans(fans: number): number {
  return Math.round(Math.max(GOTY_MIN_FANS, fans * GOTY_FANS_SHARE));
}
