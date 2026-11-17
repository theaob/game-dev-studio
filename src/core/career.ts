/**
 * A finished career, summed up: highlights for the ending screen, a title for the
 * studio, and the records to beat. Records belong to the device, like achievements
 * (see src/save.ts), so a new studio has the old ones to beat.
 */
import { acclaimOf } from './acclaim';
import { seriesNumber } from './sequels';
import { yearOf } from './time';
import type { GameState, ReleasedGame } from './types';

/** A hit, for the career summary: the same bar as a trophy on the trophy shelf. */
export const CAREER_HIT_SCORE = 8;

export interface CareerStats {
  games: number;
  avgScore: number;
  hits: number;
  choice: number;
  masterpieces: number;
  /** Years the studio won Game of the Year. */
  gotyYears: number[];
  perfectTens: number;
  bestSeller?: ReleasedGame;
  /** Most parts in one series. */
  longestSeries: number;
  revenue: number;
  fans: number;
  cash: number;
}

export function careerStats(state: GameState): CareerStats {
  const games = state.released;
  const best = games.reduce<ReleasedGame | undefined>((a, g) => (!a || g.unitsSold > a.unitsSold ? g : a), undefined);
  return {
    games: games.length,
    avgScore: games.length ? games.reduce((a, g) => a + g.score, 0) / games.length : 0,
    hits: games.filter((g) => g.score >= CAREER_HIT_SCORE).length,
    choice: games.filter((g) => acclaimOf(g)?.id === 'choice').length,
    masterpieces: games.filter((g) => acclaimOf(g)?.id === 'masterpiece').length,
    gotyYears: games.flatMap((g) => (g.goty !== undefined ? [g.goty] : [])).sort((a, b) => a - b),
    perfectTens: games.filter((g) => g.score >= 10).length,
    bestSeller: best && best.unitsSold > 0 ? best : undefined,
    longestSeries: games.reduce((a, g) => Math.max(a, seriesNumber(g)), 0),
    revenue: state.totalRevenue,
    fans: state.fans,
    cash: state.cash,
  };
}

export interface CareerTitle {
  icon: string;
  name: string;
  desc: string;
}

/** What the industry remembers the studio as, best first. */
export function careerTitle(c: CareerStats): CareerTitle {
  const awards = c.choice + c.masterpieces;
  if (c.masterpieces >= 3 || (c.gotyYears.length >= 5 && awards >= 3)) return { icon: '👑', name: 'Legend', desc: 'One of the great studios. Players will be talking about your games for decades.' };
  if (c.gotyYears.length >= 2 || awards >= 2) return { icon: '🏆', name: 'Hall of Famer', desc: 'Award-winning games that defined their years.' };
  if (c.gotyYears.length >= 1 || awards >= 1) return { icon: '🏅', name: 'Critically Acclaimed', desc: 'The critics loved your best work.' };
  if (c.hits >= 5) return { icon: '⭐', name: 'Hitmaker', desc: 'Hit after hit, year after year.' };
  if (c.games >= 10) return { icon: '🎮', name: 'Industry Veteran', desc: 'Four decades of making games, through every console war.' };
  return { icon: '🌱', name: 'Indie Survivor', desc: 'Small, stubborn and still standing.' };
}

// ---------------------------------------------------------------------------
// Records across careers on this device.

export type RecordKey = 'games' | 'avgScore' | 'awards' | 'goty' | 'revenue' | 'fans';

export interface CareerRecord {
  value: number;
  studio: string;
  /** Year the career ended. */
  year: number;
}

export interface CareerRecords {
  /** Careers finished on this device (retired, not bankrupt). */
  careers: number;
  best: Partial<Record<RecordKey, CareerRecord>>;
}

export const RECORD_KEYS: { key: RecordKey; label: string }[] = [
  { key: 'games', label: 'Games released' },
  { key: 'avgScore', label: 'Average score' },
  { key: 'awards', label: 'Awards' },
  { key: 'goty', label: 'Game of the Year wins' },
  { key: 'revenue', label: 'Total revenue' },
  { key: 'fans', label: 'Fans' },
];

/** An average over a handful of games says little: it only counts from this many releases. */
export const AVG_RECORD_MIN_GAMES = 5;

/** The values a career puts up for each record (absent = it doesn't qualify). */
export function recordValues(c: CareerStats): Partial<Record<RecordKey, number>> {
  return {
    games: c.games,
    ...(c.games >= AVG_RECORD_MIN_GAMES ? { avgScore: Math.round(c.avgScore * 100) / 100 } : {}),
    awards: c.choice + c.masterpieces,
    goty: c.gotyYears.length,
    revenue: c.revenue,
    fans: c.fans,
  };
}

/**
 * Adds a finished career to the records. Returns the new records and the ones
 * this career set (a tie doesn't take a record, and a zero never sets one).
 * A studio that keeps playing past the last year was counted when it first retired:
 * later calls pass `count: false` and only raise the records it beats.
 */
export function addCareer(records: CareerRecords, state: GameState, count = true): { records: CareerRecords; beaten: RecordKey[] } {
  const values = recordValues(careerStats(state));
  const best = { ...records.best };
  const beaten: RecordKey[] = [];
  for (const { key } of RECORD_KEYS) {
    const v = values[key];
    if (v === undefined || v <= 0 || v <= (best[key]?.value ?? 0)) continue;
    // The year just played: a career that ends at New Year finished the year before.
    best[key] = { value: v, studio: state.studioName, year: yearOf(Math.max(0, state.week - 1)) };
    beaten.push(key);
  }
  return { records: { careers: records.careers + (count ? 1 : 0), best }, beaten };
}

export const NO_RECORDS: CareerRecords = { careers: 0, best: {} };
