import { describe, expect, it } from 'vitest';
import { createGame } from '../core/sim';
import { playThrough } from '../core/bot';
import { profit } from '../core/results';
import { renderGames, sortCollection } from './views';

describe('games collection table', () => {
  const s = createGame('Test Studio', 7);
  playThrough(s, 'casual', 52 * 12);
  const games = s.released;

  it('has a row for every released game', () => {
    expect(games.length).toBeGreaterThan(3);
    const html = renderGames(s);
    expect(html.match(/<tr data-action="game-detail"/g)?.length).toBe(games.length);
  });

  it('sorts by each column in both directions', () => {
    const byScore = sortCollection(games, { key: 'score', desc: true }).map((g) => g.score);
    expect(byScore).toEqual([...byScore].sort((a, b) => b - a));
    const byProfit = sortCollection(games, { key: 'profit', desc: false }).map(profit);
    expect(byProfit).toEqual([...byProfit].sort((a, b) => a - b));
    const newest = sortCollection(games, { key: 'year', desc: true });
    expect(newest[0].releaseWeek).toBe(Math.max(...games.map((g) => g.releaseWeek)));
    const names = sortCollection(games, { key: 'name', desc: false }).map((g) => g.name.toLocaleLowerCase());
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('does not change the saved list', () => {
    const before = games.map((g) => g.id);
    sortCollection(games, { key: 'sold', desc: true });
    expect(games.map((g) => g.id)).toEqual(before);
  });
});
