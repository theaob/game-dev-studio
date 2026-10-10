import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, newAchievements } from './achievements';
import { botTurn } from './bot';
import { buyDecor } from './decor';
import { claimBailout } from './rewards';
import { createGame, tick } from './sim';
import type { ReleaseReport } from './types';

const ids = (list: { id: string }[]) => list.map((a) => a.id);

describe('achievements', () => {
  it('have unique ids', () => {
    expect(new Set(ids(ACHIEVEMENTS)).size).toBe(ACHIEVEMENTS.length);
  });

  it('a new studio has earned nothing yet', () => {
    expect(newAchievements(createGame('Test'), new Set())).toEqual([]);
  });

  it('unlock from the state, and only once', () => {
    const s = createGame('Test');
    s.cash = 2_000_000;
    expect(ids(newAchievements(s, new Set()))).toEqual(['millionaire']);
    expect(newAchievements(s, new Set(['millionaire']))).toEqual([]);
  });

  it('count a decorated studio and a bailout', () => {
    const s = createGame('Test');
    s.cash = 1e6;
    for (const id of ['rug', 'plants', 'beanbags', 'bookshelf', 'trophies', 'aquarium', 'arcade', 'neon'] as const) buyDecor(s, id);
    expect(ids(newAchievements(s, new Set(['millionaire'])))).toContain('decorator');

    s.over = 'bankrupt';
    expect(ids(newAchievements(s, new Set()))).not.toContain('bailout');
    expect(claimBailout(s)).toBeNull();
    expect(ids(newAchievements(s, new Set()))).toContain('bailout');
  });

  it('a good career earns the big ones', () => {
    const s = createGame('smart', 104729);
    const reports: ReleaseReport[] = [];
    const got = new Set<string>();
    while (!s.over) {
      botTurn(s, 'smart', reports);
      tick(s);
      for (const a of newAchievements(s, got)) got.add(a.id);
    }
    for (const a of newAchievements(s, got)) got.add(a.id);
    for (const id of ['first_game', 'choice', 'goty', 'millionaire', 'campus', 'researcher', 'legacy']) expect(got).toContain(id);
  });
});
