import { describe, expect, it } from 'vitest';
import { botTurn, type BotStyle } from './bot';
import { priceIndex, reachableUsers } from './economy';
import { createGame, tick } from './sim';
import { WEEKS_PER_YEAR } from './time';
import type { ReleaseReport } from './types';

/** Plays whole careers and returns how each one went. See scripts/balance.test.ts for the full report. */
function careers(style: BotStyle, n: number) {
  return Array.from({ length: n }, (_, i) => {
    const s = createGame(style, (i + 1) * 104729);
    const reports: ReleaseReport[] = [];
    let yearOneLow = s.cash;
    while (!s.over) {
      botTurn(s, style, reports);
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

  it('a good studio feels the pinch early, then grows rich but not absurdly so', () => {
    const runs = careers('smart', 8);
    expect(runs.every((r) => r.over === 'retired')).toBe(true);
    expect(median(runs.map((r) => r.yearOneLow))).toBeLessThan(35_000);
    const final = median(runs.map((r) => r.cash));
    expect(final).toBeGreaterThan(10_000_000);
    expect(final).toBeLessThan(250_000_000);
  });

  it('growing fast with careless games ends in bankruptcy', () => {
    const runs = careers('eager', 8);
    expect(runs.filter((r) => r.over === 'bankrupt').length).toBeGreaterThanOrEqual(6);
  });

  it('a careless solo developer stays small', () => {
    const runs = careers('naive', 8);
    expect(median(runs.map((r) => r.cash))).toBeLessThan(5_000_000);
  });
});
