import { describe, expect, it } from 'vitest';
import { NO_RECORDS, addCareer, careerStats, careerTitle } from './career';
import { createGame, tick } from './sim';
import { END_YEAR, START_YEAR, TOTAL_WEEKS, WEEKS_PER_YEAR } from './time';
import type { GameState, ReleasedGame } from './types';

function game(id: number, score: number, extra: Partial<ReleasedGame> = {}): ReleasedGame {
  return {
    id, name: `Game ${id}`, topic: 'fantasy', genre: 'rpg', platform: 'pc', size: 'small', marketing: 'none',
    releaseWeek: id * 10, devWeeks: 9, design: 0, tech: 0, bugs: 0, ppw: 0, score, reviews: [score, score, score, score],
    targetUnits: 1000 * id, unitsSold: 1000 * id, revenue: 0, weeksOnMarket: 16, fansGained: 0, unitPrice: 9, cost: 0, ...extra,
  };
}

function retired(name: string, released: ReleasedGame[], extra: Partial<GameState> = {}): GameState {
  const s = createGame(name, 1);
  s.released = released;
  s.week = TOTAL_WEEKS;
  s.over = 'retired';
  return Object.assign(s, extra);
}

describe('career summary', () => {
  it('counts awards, hits, Game of the Year wins and the best seller', () => {
    const s = retired('Stats', [game(1, 6), game(2, 8.5), game(3, 9.2, { goty: 1990 }), game(4, 9.6, { series: 2 }), game(5, 10, { goty: 1995 })]);
    const c = careerStats(s);
    expect(c.games).toBe(5);
    expect(c.hits).toBe(4);
    expect(c.choice).toBe(1);
    expect(c.masterpieces).toBe(2);
    expect(c.perfectTens).toBe(1);
    expect(c.gotyYears).toEqual([1990, 1995]);
    expect(c.bestSeller?.id).toBe(5);
    expect(c.longestSeries).toBe(2);
  });

  it('titles the studio by its best achievements', () => {
    const title = (released: ReleasedGame[]) => careerTitle(careerStats(retired('T', released))).name;
    expect(title([game(1, 6)])).toBe('Indie Survivor');
    expect(title(Array.from({ length: 5 }, (_, i) => game(i + 1, 8)))).toBe('Hitmaker');
    expect(title([game(1, 9.1)])).toBe('Critically Acclaimed');
    expect(title([game(1, 7, { goty: 1990 })])).toBe('Critically Acclaimed');
    expect(title([game(1, 7, { goty: 1990 }), game(2, 7, { goty: 1991 })])).toBe('Hall of Famer');
    expect(title([game(1, 9.6), game(2, 9.7), game(3, 9.8)])).toBe('Legend');
  });
});

describe('career records', () => {
  it('the first career sets every record it qualifies for', () => {
    const s = retired('First', [game(1, 7), game(2, 9.1)], { totalRevenue: 500_000, fans: 2000 });
    const { records, beaten } = addCareer(NO_RECORDS, s);
    expect(records.careers).toBe(1);
    // Two games are too few for an average-score record, and no Game of the Year win means no record for it.
    expect(beaten).toEqual(['games', 'awards', 'revenue', 'fans']);
    expect(records.best.revenue).toEqual({ value: 500_000, studio: 'First', year: END_YEAR });
  });

  it('a later career only takes the records it beats, not ties', () => {
    const first = addCareer(NO_RECORDS, retired('First', [game(1, 7), game(2, 9.1)], { totalRevenue: 500_000, fans: 2000 })).records;
    const { records, beaten } = addCareer(first, retired('Second', [game(1, 8), game(2, 9.2)], { totalRevenue: 400_000, fans: 3000 }));
    expect(records.careers).toBe(2);
    expect(beaten).toEqual(['fans']);
    expect(records.best.revenue?.studio).toBe('First');
    expect(records.best.games?.studio).toBe('First');
    expect(records.best.fans?.studio).toBe('Second');
  });
});

describe('the final year', () => {
  it('warns at the start of the last year that the studio retires in December', () => {
    const s = createGame('Last', 3);
    s.week = (END_YEAR - START_YEAR) * WEEKS_PER_YEAR - 1;
    s.cash = 10_000_000;
    tick(s);
    expect(s.notices.some((n) => n.text.startsWith(`${END_YEAR} is Last's last year`))).toBe(true);
  });
});
