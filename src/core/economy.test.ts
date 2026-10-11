import { describe, expect, it } from 'vitest';
import { botTurn, type BotStyle } from './bot';
import { priceIndex, reachableUsers } from './economy';
import { createGame, tick } from './sim';
import { WEEKS_PER_YEAR } from './time';
import type { GameState, ReleaseReport } from './types';
import { VENTURES, acquirableRivals, acquireRival, acquisitionPrice, buyVenture, venturePrice } from './ventures';

/** A tycoon buys every big investment and rival studio once it has twice the price in the bank. */
function buyEverything(s: GameState) {
  for (const v of VENTURES) if (s.cash > venturePrice(s, v.id) * 2) buyVenture(s, v.id);
  for (const r of acquirableRivals(s)) if (s.cash > acquisitionPrice(s, r.name) * 2) acquireRival(s, r.name);
}

/** Plays whole careers and returns how each one went. See scripts/balance.test.ts for the full report. */
function careers(style: BotStyle, n: number, extra?: (s: GameState) => void) {
  return Array.from({ length: n }, (_, i) => {
    const s = createGame(style, (i + 1) * 104729);
    const reports: ReleaseReport[] = [];
    let yearOneLow = s.cash;
    while (!s.over) {
      botTurn(s, style, reports);
      extra?.(s);
      tick(s);
      if (s.week <= WEEKS_PER_YEAR) yearOneLow = Math.min(yearOneLow, s.cash);
    }
    return { over: s.over, cash: s.cash, yearOneLow, years: s.week / WEEKS_PER_YEAR };
  });
}
const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];

describe('money curve', () => {
  it('prices rise every year and markets get more crowded', () => {
    expect(priceIndex(0)).toBe(1);
    expect(priceIndex(WEEKS_PER_YEAR * 20)).toBeCloseTo(2, 5);
    // Ten times the players is well under ten times the sales.
    expect(reachableUsers(300) / reachableUsers(30)).toBeLessThan(4);
  });

  it('research points come fast enough to unlock the first upgrades early', () => {
    // When does an average player first get medium-sized games (30 RP)?
    const years = Array.from({ length: 8 }, (_, i) => {
      const s = createGame('rp', (i + 1) * 7919);
      const reports: ReleaseReport[] = [];
      while (!s.over && !s.researched.includes('size_medium') && s.week < WEEKS_PER_YEAR * 10) {
        botTurn(s, 'casual', reports);
        tick(s);
      }
      return s.week / WEEKS_PER_YEAR;
    });
    expect(median(years)).toBeLessThan(2);
  });

  it('a good studio grows rich, but not absurdly so', () => {
    const runs = careers('smart', 8);
    expect(runs.every((r) => r.over === 'retired')).toBe(true);
    const final = median(runs.map((r) => r.cash));
    expect(final).toBeGreaterThan(10_000_000);
    // Marketing, word-of-mouth hype and Game of the Year let an expert earn more,
    // but it should stay in the hundreds of millions, not billions.
    expect(final).toBeLessThan(600_000_000);
  });

  it('late-game investments soak up money without breaking the curve', () => {
    // A good studio that buys everything ends richer, but still not a billionaire.
    const smart = careers('smart', 4, buyEverything);
    expect(smart.every((r) => r.over === 'retired')).toBe(true);
    expect(median(smart.map((r) => r.cash))).toBeLessThan(1_000_000_000);
    // An average studio can afford it all and stay comfortable, with far less left over.
    const casual = careers('casual', 4, buyEverything);
    expect(casual.every((r) => r.over === 'retired')).toBe(true);
    expect(median(casual.map((r) => r.cash))).toBeGreaterThan(5_000_000);
    expect(median(casual.map((r) => r.cash))).toBeLessThan(60_000_000);
  });

  it('growing fast with careless games ends in bankruptcy', () => {
    const runs = careers('eager', 8);
    expect(runs.filter((r) => r.over === 'bankrupt').length).toBeGreaterThanOrEqual(5);
  });

  it('an average player gets by comfortably', () => {
    const runs = careers('casual', 8);
    expect(runs.every((r) => r.over === 'retired')).toBe(true);
    expect(median(runs.map((r) => r.cash))).toBeGreaterThan(5_000_000);
  });

  it('a new player with mediocre games keeps a cushion and stays small', () => {
    const runs = careers('naive', 8);
    // The first year shouldn't feel like the edge of bankruptcy.
    expect(Math.min(...runs.map((r) => r.yearOneLow))).toBeGreaterThan(30_000);
    expect(median(runs.map((r) => r.cash))).toBeLessThan(5_000_000);
  });
});
