import { describe, expect, it } from 'vitest';
import { reviewQuote } from './quotes';
import type { ReleasedGame } from './types';

function game(extra: Partial<ReleasedGame>): ReleasedGame {
  return {
    id: 1, name: 'Q', topic: 'fantasy', genre: 'rpg', platform: 'pc', size: 'small', marketing: 'none',
    releaseWeek: 0, devWeeks: 9, design: 100, tech: 100, bugs: 0, ppw: 0, score: 7, reviews: [7, 7, 7, 7],
    targetUnits: 0, unitsSold: 0, revenue: 0, weeksOnMarket: 0, fansGained: 0, unitPrice: 9, cost: 0, ...extra,
  };
}

describe('review quotes', () => {
  it('are the same every time for the same game and outlet', () => {
    const g = game({ id: 42 });
    expect(reviewQuote(g, 2)).toBe(reviewQuote(g, 2));
  });

  it('fill in the genre and topic, and vary between games', () => {
    const quotes = new Set<string>();
    for (let id = 0; id < 50; id++) for (let i = 0; i < 4; i++) quotes.add(reviewQuote(game({ id, reviews: [9, 9, 9, 9] }), i));
    expect(quotes.size).toBeGreaterThan(3);
    for (const q of quotes) expect(q).not.toMatch(/[{}]/);
  });

  it('match the score: a 2 never gets a rave and a 10 never gets panned', () => {
    for (let id = 0; id < 50; id++) {
      const bad = reviewQuote(game({ id, reviews: [2, 2, 2, 2] }), id % 4);
      const perfect = reviewQuote(game({ id, reviews: [10, 10, 10, 10] }), id % 4);
      expect(['Flawless.', 'A perfect game. Truly.', 'Games will be measured against this.', 'This is why we play games.']).toContain(perfect);
      expect(bad).not.toBe(perfect);
    }
  });

  it('complain about bugs in buggy games', () => {
    const all = Array.from({ length: 40 }, (_, id) => [0, 1, 2, 3].map((i) => reviewQuote(game({ id, bugs: 40, reviews: [6, 6, 6, 6] }), i))).flat();
    expect(all.some((q) => /bug|patch|crash|works/i.test(q))).toBe(true);
  });
});

describe('review quotes on one game', () => {
  it('never repeat between outlets that gave the same score', () => {
    for (let id = 0; id < 30; id++) {
      const g = game({ id, reviews: [8, 8, 8, 8] });
      expect(new Set([0, 1, 2, 3].map((i) => reviewQuote(g, i))).size).toBe(4);
    }
  });
});
