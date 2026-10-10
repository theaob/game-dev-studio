import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, newAchievements, playGamesIds } from './achievements';
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

  it('fit Google Play Games limits: points in multiples of 5, at most 200 each and 1,000 in all', () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.points % 5, a.id).toBe(0);
      expect(a.points, a.id).toBeLessThanOrEqual(200);
    }
    expect(ACHIEVEMENTS.reduce((sum, a) => sum + a.points, 0)).toBeLessThanOrEqual(1000);
    const keys = ACHIEVEMENTS.map((a) => a.name.toLowerCase().replace(/[^a-z0-9]/g, ''));
    expect(new Set(keys).size).toBe(ACHIEVEMENTS.length);
  });
});

describe('Play Games IDs', () => {
  it('reads the resources XML the Play Console exports, matching achievements by name', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <string name="app_id" translatable="false">123456789012</string>
  <string name="package_name" translatable="false">io.github.theaob.gamedevstudio</string>
  <string name="achievement_hello_world" translatable="false">CgkIA1</string>
  <string name="achievement_critics_choice" translatable="false">CgkIA2</string>
  <string name="achievement_knowitall" translatable="false">CgkIA3</string>
  <string name="achievement_something_else" translatable="false">CgkIA4</string>
</resources>`;
    expect(playGamesIds(xml)).toEqual({ first_game: 'CgkIA1', choice: 'CgkIA2', researcher: 'CgkIA3' });
  });

  it('also takes a JSON map of in-game ids, and ignores anything else', () => {
    expect(playGamesIds('{"legacy":"CgkIB1","nope":"x","cat":""}')).toEqual({ legacy: 'CgkIB1' });
    expect(playGamesIds('{broken')).toEqual({});
    expect(playGamesIds(undefined)).toEqual({});
    expect(playGamesIds('  ')).toEqual({});
  });

  // CI runs this with the repository's PLAY_GAMES_RESOURCES variable, once it is set.
  it.runIf(!!process.env.PLAY_GAMES_RESOURCES)('the configured Play Games resources cover every achievement', () => {
    const ids = playGamesIds(process.env.PLAY_GAMES_RESOURCES);
    expect(ACHIEVEMENTS.filter((a) => !ids[a.id]).map((a) => a.name)).toEqual([]);
  });
});
