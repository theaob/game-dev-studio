/**
 * The money model in one place. Every price in the game follows one era price
 * index, so running a studio costs more as the industry grows, and sales grow
 * with platform audiences, but more slowly, because bigger markets have more competition.
 * Tuned with scripts/balance.test.ts and checked by src/core/economy.test.ts.
 */
import { MARKETING, OFFICES, SIZES } from './data';
import { START_YEAR, yearFraction } from './time';
import type { GameState, MarketingId, SizeId } from './types';

/** Yearly growth of prices: salaries, rent, budgets, marketing, store items. */
export const INFLATION = 0.05;
/** How much of a platform's growth turns into sales (1 = all of it); the rest is lost to competitors. */
export const REACH_EXPONENT = 0.55;
/** The founder pays themselves a modest wage. */
export const FOUNDER_SALARY = 1200;

/** Price level relative to 1985 (1.0), rising every year. */
export function priceIndex(week: number): number {
  return 1 + INFLATION * Math.max(0, yearFraction(week) - START_YEAR);
}

/** Rounds money to a friendly amount ($100s below $10K, $1,000s above). */
export function friendly(v: number): number {
  const step = v >= 10_000 ? 1000 : 100;
  return Math.round(v / step) * step;
}

/**
 * The millions of players a studio can realistically reach on a platform with
 * this many users. Grows with the platform, but slower than it: early markets
 * are small and empty, later ones are huge and crowded.
 */
export function reachableUsers(users: number): number {
  if (users <= 0) return 0;
  return 3 * Math.pow(users / 3, REACH_EXPONENT);
}

/** Development budget for a game of this size, today. */
export function sizeCost(state: Pick<GameState, 'week'>, size: SizeId): number {
  const def = SIZES.find((s) => s.id === size)!;
  return friendly(def.cost * priceIndex(state.week));
}

export function marketingCost(state: Pick<GameState, 'week'>, id: MarketingId): number {
  const def = MARKETING.find((m) => m.id === id)!;
  return friendly(def.cost * priceIndex(state.week));
}

export function officeRent(state: Pick<GameState, 'week'>, level: number): number {
  return friendly(OFFICES[level].rent * priceIndex(state.week));
}

export function officeCost(state: Pick<GameState, 'week'>, level: number): number {
  return friendly(OFFICES[level].cost * priceIndex(state.week));
}

export function founderSalary(state: Pick<GameState, 'week'>): number {
  return friendly(FOUNDER_SALARY * priceIndex(state.week));
}
