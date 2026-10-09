/**
 * Special recognition for great games. A release that reviews 9 or better is
 * "Critics' Choice", 9.5 or better a "Masterpiece". The award is saved with the
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

export function sequelHype(original: Pick<ReleasedGame, 'acclaim' | 'score'>): number {
  if (!acclaimOf(original)) return 0;
  return Math.round(SEQUEL_HYPE_BASE + Math.max(0, original.score - 9) * SEQUEL_HYPE_PER_POINT);
}
