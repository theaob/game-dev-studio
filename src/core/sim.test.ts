import { describe, expect, it } from 'vitest';
import { GENRES, PLATFORMS, TOPICS, platformUsers } from './data';
import { playThrough } from './bot';
import { benchmark, normalizeFocus, phaseAlignment } from './scoring';
import {
  createGame,
  doResearch,
  gameCost,
  hire,
  releaseGame,
  setPhaseFocus,
  startContract,
  startGame,
  tick,
  validateGame,
} from './sim';
import { TOTAL_WEEKS, formatDate } from './time';
import type { GameSpec } from './types';

const spec: GameSpec = { name: 'Dragon Quest', topic: 'fantasy', genre: 'rpg', platform: 'pc', size: 'small', marketing: 'none' };

describe('data', () => {
  it('has a fit for every genre on every topic', () => {
    for (const t of TOPICS) expect(t.fit).toHaveLength(GENRES.length);
    for (const g of GENRES) expect(g.importance).toHaveLength(9);
  });

  it('interpolates platform users and hides retired platforms', () => {
    const nova = PLATFORMS.find((p) => p.id === 'nova8')!;
    expect(platformUsers(nova, 1985)).toBe(2);
    expect(platformUsers(nova, 1989)).toBe(28);
    expect(platformUsers(nova, 1987)).toBeCloseTo(15);
    expect(platformUsers(nova, 1994)).toBe(0);
  });
});

describe('scoring helpers', () => {
  it('normalizes focus', () => {
    expect(normalizeFocus([50, 50, 0])).toEqual([0.5, 0.5, 0]);
    expect(normalizeFocus([0, 0, 0])).toEqual([1 / 3, 1 / 3, 1 / 3]);
  });

  it('rewards focusing on important areas', () => {
    const rpg = GENRES.find((g) => g.id === 'rpg')!;
    // RPG foundation: engine low, gameplay normal, story high
    expect(phaseAlignment(rpg.importance, 0, [10, 30, 60])).toBeGreaterThan(phaseAlignment(rpg.importance, 0, [60, 30, 10]));
  });

  it('raises the bar after strong games', () => {
    expect(benchmark({ week: 0, bestPPW: 0 })).toBe(3);
    expect(benchmark({ week: 0, bestPPW: 10 })).toBe(9);
  });
});

describe('simulation', () => {
  it('formats dates', () => {
    expect(formatDate(0)).toBe('Jan 1985 · W1');
    expect(formatDate(49)).toBe('Jan 1986 · W2');
  });

  it('runs a full development cycle', () => {
    const s = createGame('Test', 42);
    expect(startGame(s, spec, [10, 30, 60])).toBeNull();
    expect(validateGame(s, spec)).toBe('Your team is busy.');

    // Phase 1
    for (let i = 0; i < 3; i++) tick(s);
    const p = s.activity!;
    expect(p.kind === 'game' && p.awaitingFocus).toBe(true);
    const week = s.week;
    tick(s); // blocked while waiting for focus
    expect(s.week).toBe(week);
    expect(setPhaseFocus(s, [60, 20, 20])).toBeNull();
    for (let i = 0; i < 3; i++) tick(s);
    expect(setPhaseFocus(s, [60, 20, 20])).toBeNull();
    for (let i = 0; i < 3; i++) tick(s);
    expect(s.activity?.kind === 'game' && s.activity.phase).toBe(3);

    const report = releaseGame(s);
    if (typeof report === 'string') throw new Error(report);
    expect(report.game.score).toBeGreaterThanOrEqual(1);
    expect(report.game.score).toBeLessThanOrEqual(10);
    expect(report.insights.length).toBeGreaterThan(0);
    expect(s.knowledge.combos['fantasy|rpg']).toBe(3);
    expect(s.activity).toBeNull();

    const cash = s.cash;
    for (let i = 0; i < 20; i++) tick(s);
    expect(s.released[0].unitsSold).toBe(s.released[0].targetUnits);
    expect(s.cash).toBeGreaterThan(cash - 10000);
  });

  it('charges for licenses only once', () => {
    const s = createGame('Test', 1);
    s.cash = 100000;
    const nova = { ...spec, platform: 'nova8' };
    expect(gameCost(s, nova).license).toBe(20000);
    startGame(s, nova, [1, 1, 1]);
    expect(s.cash).toBe(80000);
    expect(gameCost(s, nova).license).toBe(0);
  });

  it('completes contracts', () => {
    const s = createGame('Test', 7);
    const offer = s.contractOffers[0];
    expect(startContract(s, offer.id)).toBeNull();
    for (let i = 0; i < offer.weeks; i++) tick(s);
    expect(s.activity).toBeNull();
    expect(s.cash).toBeGreaterThanOrEqual(40000 + offer.pay - 1000 * 2);
  });

  it('enforces research prerequisites and office capacity', () => {
    const s = createGame('Test', 3);
    s.rp = 1000;
    expect(doResearch(s, 'engine3')).toMatch(/Requires/);
    expect(doResearch(s, 'engine2')).toBeNull();
    expect(doResearch(s, 'engine3')).toBeNull();
    expect(doResearch(s, 'horror')).toBeNull();
    expect(s.topics).toContain('horror');
    expect(hire(s, s.candidates[0].id)).toMatch(/office is full/);
  });

  it('goes bankrupt after three months in the red', () => {
    const s = createGame('Test', 5);
    s.cash = -100000;
    for (let i = 0; i < 12; i++) tick(s);
    expect(s.over).toBe('bankrupt');
  });
});

describe('balance (bot playthroughs)', () => {
  it('a smart player builds a thriving studio over 41 years', () => {
    const s = createGame('Smart', 1234);
    const reports = playThrough(s, 'smart');
    expect(s.over).toBe('retired');
    expect(s.week).toBe(TOTAL_WEEKS);
    const scores = reports.map((r) => r.game.score);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    expect(avg).toBeGreaterThan(6.5);
    expect(s.cash).toBeGreaterThan(1_000_000);
    expect(s.officeLevel).toBeGreaterThanOrEqual(2);
  });

  it('a careless player scores poorly', () => {
    const s = createGame('Naive', 99);
    const reports = playThrough(s, 'naive', 48 * 10);
    const avg = reports.reduce((a, r) => a + r.game.score, 0) / reports.length;
    expect(avg).toBeLessThan(6);
  });
});

describe('in the zone', () => {
  it('sometimes boosts developers during a project and clears after release', () => {
    const s = createGame('Zone', 11);
    startGame(s, spec, [10, 30, 60]);
    let zoned = 0;
    for (let i = 0; i < 400 && s.activity; i++) {
      const p = s.activity;
      if (p.kind === 'game' && p.awaitingFocus) setPhaseFocus(s, [33, 33, 33]);
      if (p.kind === 'game' && p.phase >= 3) {
        releaseGame(s);
        if (s.released.length < 8) startGame(s, { ...spec, name: `G${s.released.length}`, topic: s.released.length % 2 ? 'scifi' : 'fantasy' }, [33, 33, 33]);
        continue;
      }
      zoned += tick(s).filter((e) => e.type === 'zone').length;
    }
    expect(zoned).toBeGreaterThan(0);
    expect(s.staff.every((x) => !x.zone)).toBe(true);
  });
});
