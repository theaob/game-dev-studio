import { describe, expect, it } from 'vitest';
import { GENRES, PLATFORMS, TOPICS, platformUsers } from './data';
import { playThrough } from './bot';
import { benchmark, evaluate, normalizeFocus, phaseAlignment, repeatMultiplier } from './scoring';
import { SEQUEL_TOO_SOON_MULT, sequelCandidates, sequelName, sequelSalesMult } from './sequels';
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
import type { GameProject, GameSpec } from './types';

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

describe('whole-number bugs', () => {
  it('adds and removes bugs in whole numbers, at least one per polish week', () => {
    const s = createGame('Bugs', 21);
    s.staff.push({ ...s.candidates[0], id: 999, tech: 9, speed: 1.2 });
    startGame(s, spec, [33, 33, 33]);
    while (s.activity?.kind === 'game' && s.activity.phase < 3) {
      if (s.activity.awaitingFocus) setPhaseFocus(s, [33, 33, 33]);
      tick(s);
      expect(Number.isInteger(s.activity!.kind === 'game' && s.activity.bugs)).toBe(true);
    }
    const p = s.activity!;
    if (p.kind !== 'game') throw new Error('expected a game');
    p.bugs = 3.4; // e.g. an old save with fractional bugs
    let before = Infinity;
    while (p.bugs > 0) {
      const events = tick(s);
      const fixed = events.find((e) => e.type === 'points');
      expect(fixed && fixed.type === 'points' && Number.isInteger(fixed.bugs) && fixed.bugs <= -1).toBe(true);
      expect(Number.isInteger(p.bugs) && p.bugs < before).toBe(true);
      before = p.bugs;
    }
    expect(p.bugs).toBe(0);
  });

  it('shares the repeat penalty with the reception preview', () => {
    const g = (topic: string, genre: string) => ({ topic, genre });
    expect(repeatMultiplier([], 'fantasy', 'rpg')).toBe(1);
    expect(repeatMultiplier([g('fantasy', 'rpg'), g('space', 'action')], 'fantasy', 'rpg')).toBe(0.85);
    expect(repeatMultiplier([g('space', 'rpg')], 'fantasy', 'rpg')).toBe(0.95);
    expect(repeatMultiplier([g('fantasy', 'rpg'), g('a', 'b'), g('c', 'd'), g('e', 'f')], 'fantasy', 'rpg')).toBe(1);
  });
});

describe('sequels', () => {
  /** Makes and releases one game so it can get a sequel. */
  const releaseOne = (s: ReturnType<typeof createGame>, game: GameSpec) => {
    expect(startGame(s, game, [10, 30, 60])).toBeNull();
    for (let i = 0; i < 200 && s.activity; i++) {
      const p = s.activity;
      if (p.kind === 'game' && p.awaitingFocus) setPhaseFocus(s, [10, 30, 60]);
      if (p.kind === 'game' && p.phase >= 3) {
        const r = releaseGame(s);
        if (typeof r === 'string') throw new Error(r);
        return r;
      }
      tick(s);
    }
    throw new Error('game never finished');
  };

  it('names sequels and lists only the latest entry of each series', () => {
    const s = createGame('Seq', 3);
    const first = releaseOne(s, spec).game;
    expect(sequelName(first)).toBe('Dragon Quest 2');
    expect(sequelCandidates(s).map((g) => g.id)).toEqual([first.id]);
    const second = releaseOne(s, { ...spec, name: sequelName(first), sequelOf: first.id }).game;
    expect(second.series).toBe(2);
    expect(second.sequelOf).toBe(first.id);
    expect(sequelName(second)).toBe('Dragon Quest 3');
    expect(sequelCandidates(s).map((g) => g.id)).toEqual([second.id]);
  });

  it('keeps topic and genre, and allows only one sequel per game', () => {
    const s = createGame('Seq', 4);
    const first = releaseOne(s, spec).game;
    expect(validateGame(s, { ...spec, topic: 'scifi', sequelOf: first.id })).toMatch(/topic and genre/);
    releaseOne(s, { ...spec, name: 'DQ2', sequelOf: first.id });
    expect(validateGame(s, { ...spec, name: 'DQ2b', sequelOf: first.id })).toMatch(/already has a sequel/);
  });

  it('sells to the original’s fans and tires out long series', () => {
    const g = (score: number, series = 1) => ({ score, series }) as Parameters<typeof sequelSalesMult>[0];
    expect(sequelSalesMult(g(9))).toBeCloseTo(1.45);
    expect(sequelSalesMult(g(7))).toBeCloseTo(1.24);
    expect(sequelSalesMult(g(5))).toBe(1);
    expect(sequelSalesMult(g(3))).toBeLessThan(1);
    expect(sequelSalesMult(g(9, 4))).toBeLessThan(sequelSalesMult(g(9, 2)));
  });

  it('skips the repeat penalty unless the sequel is rushed', () => {
    const s = createGame('Seq', 6);
    const first = releaseOne(s, spec).game;
    // Straight after the original: same combo as a new game is a repeat, as a sequel it's "too soon".
    expect(startGame(s, { ...spec, name: 'DQ2', sequelOf: first.id }, [10, 30, 60])).toBeNull();
    expect(evaluate(s, s.activity as GameProject).repeatMult).toBe(SEQUEL_TOO_SOON_MULT);
    // A year later, a sequel carries no penalty while a non-sequel repeat still does.
    s.week = first.releaseWeek + 60;
    expect(evaluate(s, s.activity as GameProject).repeatMult).toBe(1);
    (s.activity as GameProject).sequelOf = undefined;
    expect(evaluate(s, s.activity as GameProject).repeatMult).toBe(0.85);
  });
});
