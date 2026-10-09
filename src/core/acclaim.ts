/**
 * Special recognition for great games. A release that reviews 9 or better is
 * "Critics' Choice", 9.5 or better a "Masterpiece". Once a year the best-reviewed
 * release, yours or a rival's, is Game of the Year. Awards are saved with the
 * game, and a sequel to an awarded game starts development already hyped.
 */
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

export function sequelHype(original: Pick<ReleasedGame, 'acclaim' | 'score' | 'goty'>): number {
  const acclaimed = acclaimOf(original) ? SEQUEL_HYPE_BASE + Math.max(0, original.score - 9) * SEQUEL_HYPE_PER_POINT : 0;
  return Math.round(acclaimed + (original.goty !== undefined ? GOTY_SEQUEL_HYPE : 0));
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
