import { describe, expect, it } from 'vitest';
import { GENRES, GENRE_TITLES, PLATFORMS, TOPICS, TOPIC_TITLE_WORDS, platformUsers } from './data';
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
  randomTitle,
  setPolishMode,
  boostWeeks,
  buyStoreItem,
  storePrice,
  zoneChance,
  ZONE_CHANCE,
  CAT_COOLDOWN_WEEKS,
  CAT_LAP_BOOST,
  catLeaveLap,
  fire,
  placeCatOnLap,
  bookBooth,
  pushSales,
  runPromo,
  SALES_WEEKS,
} from './sim';
import { TOTAL_WEEKS, WEEKS_PER_YEAR, formatDate } from './time';
import { claimReward, investorCash, researchGrant, rewardBlocker } from './rewards';
import { cumulativeRevenue, paybackWeek, profit, returnMultiple, totalCost, verdict } from './results';
import { RIVAL_CLASH_MULT, TREND_GENRE_BONUS, TREND_TOPIC_BONUS, trendMult } from './industry';
import { EXPO_BOOKING_WEEKS, EXPO_WEEK, HYPE_DECAY, hypeEffect } from './marketing';
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
    const total = gameCost(s, nova).total;
    startGame(s, nova, [1, 1, 1]);
    expect(s.cash).toBe(100000 - total);
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

describe('title suggestions', () => {
  it('mention the topic once one is picked', () => {
    for (const topic of TOPICS) {
      const words = TOPIC_TITLE_WORDS[topic.id];
      expect(words?.length, topic.id).toBeGreaterThan(0);
      for (const g of GENRES) {
        // Seeded, so the check can't fail on an unlucky streak.
        let seed = 12345;
        const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
        let mentions = 0;
        for (let i = 0; i < 20; i++) {
          const t = randomTitle(g.id, undefined, topic.id, rand);
          expect(t).not.toMatch(/[{}]|  /);
          if (words.some((w) => t.includes(w))) mentions++;
        }
        expect(mentions, `${topic.id} ${g.id}`).toBeGreaterThanOrEqual(10);
      }
    }
  });

  it('fit the genre and change on every re-roll', () => {
    for (const g of GENRES) {
      const words = [...GENRE_TITLES[g.id].a, ...GENRE_TITLES[g.id].b];
      let prev = '';
      for (let i = 0; i < 20; i++) {
        const t = randomTitle(g.id, prev);
        expect(t).not.toBe(prev);
        expect(t).not.toMatch(/[{}]/);
        expect(words.some((w) => t.includes(w))).toBe(true);
        prev = t;
      }
    }
  });
});

describe('whole-number points and polishing', () => {
  const finishDev = (seed: number) => {
    const s = createGame('Polish', seed);
    s.staff.push({ ...s.candidates[0], id: 999, design: 6, tech: 6, speed: 1 });
    startGame(s, spec, [33, 33, 33]);
    while (s.activity?.kind === 'game' && s.activity.phase < 3) {
      if (s.activity.awaitingFocus) setPhaseFocus(s, [33, 33, 33]);
      const rp = s.rp;
      for (const e of tick(s)) {
        if (e.type === 'points') expect([e.design, e.tech, e.bugs].every(Number.isInteger)).toBe(true);
      }
      const p = s.activity!;
      if (p.kind === 'game') expect([p.design, p.tech, p.bugs].every(Number.isInteger)).toBe(true);
      expect(Number.isInteger(s.rp - rp)).toBe(true);
    }
    const p = s.activity!;
    if (p.kind !== 'game') throw new Error('expected a game');
    return { s, p };
  };

  it('polishes design or tech with shrinking returns, leaving bugs unfixed', () => {
    for (const kind of ['design', 'tech'] as const) {
      const { s, p } = finishDev(31);
      expect(setPolishMode(s, kind)).toBeNull();
      const other = kind === 'design' ? 'tech' : 'design';
      const gains: number[] = [];
      for (let w = 0; w < 12; w++) {
        const before = { points: p[kind], other: p[other], bugs: p.bugs };
        tick(s);
        expect(Number.isInteger(p[kind])).toBe(true);
        expect(p[other]).toBe(before.other);
        expect(p.bugs).toBeGreaterThanOrEqual(before.bugs);
        gains.push(p[kind] - before.points);
      }
      expect(gains[0]).toBeGreaterThan(0);
      const early = gains.slice(0, 3).reduce((a, b) => a + b, 0);
      const late = gains.slice(9).reduce((a, b) => a + b, 0);
      expect(late).toBeLessThan(early * 0.5);
    }
  });

  it('only allows choosing a polish focus once development is done', () => {
    const s = createGame('Early', 5);
    startGame(s, spec, [33, 33, 33]);
    expect(setPolishMode(s, 'design')).not.toBeNull();
  });
});

describe('store', () => {
  const devWeek = (seed: number, buy: string[]) => {
    const s = createGame('Store', seed);
    s.cash = 1e7;
    s.staff.push({ ...s.candidates[0], id: 999, design: 6, tech: 6, speed: 1 });
    for (const id of buy) expect(buyStoreItem(s, id as never)).toBeNull();
    startGame(s, spec, [33, 33, 33]);
    let design = 0;
    let tech = 0;
    for (let w = 0; w < 3; w++) {
      if (s.activity?.kind === 'game' && s.activity.awaitingFocus) setPhaseFocus(s, [33, 33, 33]);
      for (const e of tick(s)) if (e.type === 'points') { design += e.design; tech += e.tech; }
    }
    return { s, total: design + tech };
  };

  it('charges the price and boosts output while the boost lasts', () => {
    const plain = devWeek(41, []);
    const boosted = devWeek(41, ['coffee']);
    expect(boosted.total).toBeGreaterThan(plain.total * 1.1);
    // Bought 4 weeks, 3 game weeks used.
    expect(boostWeeks(boosted.s, 'coffee')).toBe(1);
    expect(plain.s.cash - boosted.s.cash).toBe(storePrice(createGame('x', 1), 'coffee') * 2);
  });

  it('only counts boosts down during game development', () => {
    const s = createGame('Idle', 3);
    s.cash = 1e6;
    expect(buyStoreItem(s, 'pizza')).toBeNull();
    expect(zoneChance(s)).toBeCloseTo(ZONE_CHANCE * 3);
    for (let w = 0; w < 10; w++) tick(s);
    expect(boostWeeks(s, 'pizza')).toBe(4);
  });

  it('sells upgrades once and bug bashes only with bugs to fix', () => {
    const s = createGame('Once', 4);
    s.cash = 1e6;
    expect(buyStoreItem(s, 'chairs')).toBeNull();
    expect(buyStoreItem(s, 'chairs')).not.toBeNull();
    expect(buyStoreItem(s, 'bugbash')).not.toBeNull();
    startGame(s, spec, [33, 33, 33]);
    const p = s.activity!;
    if (p.kind !== 'game') throw new Error('expected a game');
    p.bugs = 10;
    expect(buyStoreItem(s, 'bugbash')).toBeNull();
    expect(p.bugs).toBe(6);
    s.cash = 0;
    expect(buyStoreItem(s, 'coffee')).toBe('Not enough cash.');
  });
});

describe('studio cat', () => {
  const team = (seed: number) => {
    const s = createGame('Cat', seed);
    s.cash = 1e7;
    s.staff.push({ ...s.candidates[0], id: 501, design: 5, tech: 5, speed: 1 });
    s.staff.push({ ...s.candidates[1], id: 502, design: 5, tech: 5, speed: 1 });
    return s;
  };

  it('picks laps by itself during development, then wants alone time', () => {
    const s = team(61);
    startGame(s, spec, [33, 33, 33]);
    const laps: number[] = [];
    let left = 0;
    for (let w = 0; w < 120; w++) {
      const a = s.activity;
      if (a?.kind !== 'game') break;
      if (a.awaitingFocus) setPhaseFocus(s, [33, 33, 33]);
      for (const e of tick(s)) {
        if (e.type === 'catLap') laps.push(e.staffId);
        if (e.type === 'catLeft') {
          left++;
          expect(s.cat?.cooldown).toBe(CAT_COOLDOWN_WEEKS);
        }
      }
      if (s.cat?.lap) expect(s.cat.cooldown).toBeUndefined();
    }
    expect(laps.length).toBeGreaterThan(0);
    expect(laps.every((id) => s.staff.some((x) => x.id === id))).toBe(true);
    expect(left).toBeGreaterThan(0);
  });

  it('boosts whoever has the cat on their lap', () => {
    const run = (withCat: boolean) => {
      const s = team(62);
      startGame(s, spec, [33, 33, 33]);
      // Keep the zone and random laps out of it.
      s.staff.forEach((x) => (x.zone = 0));
      if (withCat) expect(placeCatOnLap(s, 502)).toBeNull();
      const a0 = s.activity;
      const before = a0?.kind === 'game' ? (a0.contrib[502]?.design ?? 0) + (a0.contrib[502]?.tech ?? 0) : 0;
      tick(s);
      const p = s.activity!;
      if (p.kind !== 'game') throw new Error('expected a game');
      return (p.contrib[502]?.design ?? 0) + (p.contrib[502]?.tech ?? 0) - before;
    };
    const plain = run(false);
    const purring = run(true);
    // Whole-number rounding of the week's totals blurs it a little.
    expect(purring / plain).toBeGreaterThan(CAT_LAP_BOOST - 0.12);
    expect(purring / plain).toBeLessThan(CAT_LAP_BOOST + 0.12);
  });

  it('can be moved by the player, but not while it wants alone time', () => {
    const s = team(63);
    expect(placeCatOnLap(s, 501)).toBeNull();
    expect(s.cat?.lap?.staffId).toBe(501);
    expect(placeCatOnLap(s, 502)).toBeNull(); // moving it between laps is fine
    catLeaveLap(s);
    expect(s.cat?.lap).toBeUndefined();
    expect(placeCatOnLap(s, 501)).toBe('The cat wants some alone time.');
    for (let w = 0; w < CAT_COOLDOWN_WEEKS; w++) tick(s);
    expect(placeCatOnLap(s, 501)).toBeNull();
    expect(fire(s, 501)).toBeNull();
    expect(s.cat?.lap).toBeUndefined();
  });
});

describe('marketing', () => {
  const studio = (seed: number) => {
    const s = createGame('Hype', seed);
    s.cash = 1e7;
    s.staff.push({ ...s.candidates[0], id: 701, design: 6, tech: 6, speed: 1 });
    return s;
  };
  const finish = (s: ReturnType<typeof createGame>) => {
    while (s.activity?.kind === 'game' && s.activity.phase < 3) {
      if (s.activity.awaitingFocus) setPhaseFocus(s, [33, 33, 33]);
      tick(s);
    }
    const r = releaseGame(s);
    if (typeof r === 'string') throw new Error(r);
    return r;
  };

  it('builds hype with promos once each, in the right phase, and it fades', () => {
    const s = studio(81);
    startGame(s, spec, [33, 33, 33]);
    expect(runPromo(s, 'trailer')).toBe('Needs more of the game to show.');
    const cash = s.cash;
    expect(runPromo(s, 'preview')).toBeNull();
    expect(s.cash).toBeLessThan(cash);
    expect(runPromo(s, 'preview')).toBe('Already done for this game.');
    expect(runPromo(s, 'influencers')).toMatch(/Available from/);
    const p = s.activity!;
    if (p.kind !== 'game') throw new Error('expected a game');
    expect(p.hype).toBe(12);
    tick(s);
    expect(p.hype).toBeCloseTo(12 * HYPE_DECAY, 1);
  });

  it('hype pays off for good games and backfires on bad ones', () => {
    expect(hypeEffect(50, 8).salesMult).toBeGreaterThan(1.15);
    expect(hypeEffect(50, 8, 2.4).salesMult).toBeLessThan(hypeEffect(50, 8).salesMult);
    expect(hypeEffect(0, 8).salesMult).toBe(1);
    expect(hypeEffect(50, 6).salesMult).toBeGreaterThan(1);
    expect(hypeEffect(50, 6).salesMult).toBeLessThan(hypeEffect(50, 8).salesMult);
    expect(hypeEffect(80, 3).salesMult).toBeLessThan(1);
    expect(hypeEffect(80, 3).fansMult).toBeLessThan(1);
    expect(hypeEffect(80, 2).salesMult).toBeLessThan(hypeEffect(20, 2).salesMult);
  });

  it('sells more at launch with hype', () => {
    const plain = studio(82);
    startGame(plain, spec, [33, 33, 33]);
    const hyped = studio(82);
    startGame(hyped, spec, [33, 33, 33]);
    const p = hyped.activity!;
    if (p.kind !== 'game') throw new Error('expected a game');
    p.hype = 60; // set directly so both runs use the same random numbers
    const a = finish(plain);
    const b = finish(hyped);
    expect(b.game.score).toBe(a.game.score);
    expect(b.game.targetUnits / a.game.targetUnits).toBeCloseTo(hypeEffect(60 * HYPE_DECAY ** 9, b.game.score).salesMult, 1);
  });

  it('runs GameExpo: booking window, one booth a year, hype and fans on expo week', () => {
    const s = studio(83);
    expect(bookBooth(s, 'small')).toMatch(/Booking opens/);
    while (s.week % WEEKS_PER_YEAR !== EXPO_WEEK - EXPO_BOOKING_WEEKS + 1) tick(s);
    startGame(s, spec, [33, 33, 33]);
    expect(bookBooth(s, 'medium')).toBeNull();
    expect(bookBooth(s, 'big')).toBe('You already have a booth this year.');
    const fans = s.fans;
    while (s.week % WEEKS_PER_YEAR !== EXPO_WEEK) {
      if (s.activity?.kind === 'game' && s.activity.awaitingFocus) setPhaseFocus(s, [33, 33, 33]);
      tick(s);
    }
    const p = s.activity!;
    if (p.kind !== 'game') throw new Error('expected a game');
    expect(p.hype).toBeGreaterThanOrEqual(30 * 0.99);
    expect(s.fans).toBeGreaterThanOrEqual(fans + 1000);
  });

  it('reports what GameExpo did, for the results screen', () => {
    const s = studio(85);
    while (s.week % WEEKS_PER_YEAR !== EXPO_WEEK - 1) tick(s);
    startGame(s, spec, [33, 33, 33]);
    expect(bookBooth(s, 'small')).toBeNull();
    const price = s.expo!.price!;
    expect(price).toBeGreaterThan(0);
    const events = tick(s);
    const ev = events.find((e) => e.type === 'expo');
    if (ev?.type !== 'expo') throw new Error('expected an expo event');
    const r = ev.report;
    expect(s.expo!.report).toBe(r);
    expect(r).toMatchObject({ year: s.expo!.year, booth: 'small', price, game: (s.activity as { name: string }).name });
    expect(r.hypeAfter! - r.hypeBefore!).toBeCloseTo(15);
    expect(r.fansAfter - r.fansBefore).toBe(300);
  });

  it('reports a smaller GameExpo when there is no game to show', () => {
    const s = studio(86);
    s.activity = null;
    while (s.week % WEEKS_PER_YEAR !== EXPO_WEEK - 1) {
      s.activity = null;
      tick(s);
    }
    expect(bookBooth(s, 'medium')).toBeNull();
    const ev = tick(s).find((e) => e.type === 'expo');
    if (ev?.type !== 'expo') throw new Error('expected an expo event');
    expect(ev.report.game).toBeUndefined();
    expect(ev.report.hypeBefore).toBeUndefined();
    expect(ev.report.fansAfter - ev.report.fansBefore).toBe(500);
  });

  it('pushes sales after launch: ads and a discount sale, once each, while on the charts', () => {
    const s = studio(84);
    startGame(s, spec, [33, 33, 33]);
    const g = finish(s).game;
    const target = g.targetUnits;
    expect(pushSales(s, g.id, 'ads')).toBeNull();
    expect(g.targetUnits).toBeGreaterThan(target);
    expect(pushSales(s, g.id, 'ads')).toBe('Already done for this game.');
    const price = g.unitPrice;
    expect(pushSales(s, g.id, 'sale')).toBeNull();
    expect(g.unitPrice).toBeCloseTo(price * 0.6);
    for (let w = 0; w < SALES_WEEKS; w++) tick(s);
    expect(g.unitsSold).toBe(g.targetUnits);
    expect(pushSales(s, g.id, 'ads')).toBe('It has left the charts.');
  });
});

describe('industry news', () => {
  it('sets a new trend every year and announces it', () => {
    const s = createGame('News', 91);
    const first = s.industry!.trend!;
    expect(first.year).toBe(1985);
    expect(s.industry!.headlines[0].text).toMatch(/1985 trend/);
    while (s.week < WEEKS_PER_YEAR) tick(s);
    const next = s.industry!.trend!;
    expect(next.year).toBe(1986);
    expect(next.genre).not.toBe(first.genre);
    expect(next.topic).not.toBe(first.topic);
    expect(trendMult(s, next.genre, next.topic)).toBeCloseTo(TREND_GENRE_BONUS * TREND_TOPIC_BONUS);
    expect(trendMult(s, next.genre, 'no-such-topic')).toBe(TREND_GENRE_BONUS);
  });

  it('has rival studios release games, keeping the feed short', () => {
    const s = createGame('News', 92);
    for (let i = 0; i < WEEKS_PER_YEAR * 10; i++) {
      s.activity = null; // stay idle so nothing else happens
      tick(s);
    }
    const ind = s.industry!;
    expect(ind.rivalGames.length).toBeGreaterThan(10);
    expect(ind.headlines.length).toBeLessThanOrEqual(80);
    expect(ind.headlines.some((h) => /released|flopped|smash hit/.test(h.text))).toBe(true);
  });

  it('sells more on trend and less right after a rival hit with the same idea', () => {
    const run = (setup: (s: ReturnType<typeof createGame>) => void) => {
      const s = createGame('News', 93);
      s.cash = 1e7;
      s.industry!.trend = { year: 1985, genre: 'action', topic: 'space' };
      setup(s);
      startGame(s, spec, [33, 33, 33]);
      while (s.activity?.kind === 'game' && s.activity.phase < 3) {
        if (s.activity.awaitingFocus) setPhaseFocus(s, [33, 33, 33]);
        tick(s);
      }
      // Keep the setup in place even if the week's news changed it.
      setup(s);
      const r = releaseGame(s);
      if (typeof r === 'string') throw new Error(r);
      return r;
    };
    const plain = run(() => {});
    const trendy = run((s) => (s.industry!.trend = { year: 1985, genre: 'rpg', topic: 'fantasy' }));
    const clashed = run((s) => {
      s.industry!.rivalGames = [{ week: s.week, studio: 'Lunar Soft', name: 'Dragon Saga', genre: 'rpg', topic: 'fantasy', score: 8.8 }];
    });
    expect(trendy.game.targetUnits / plain.game.targetUnits).toBeCloseTo(TREND_GENRE_BONUS * TREND_TOPIC_BONUS, 1);
    expect(clashed.game.targetUnits / plain.game.targetUnits).toBeCloseTo(RIVAL_CLASH_MULT, 1);
    expect(trendy.insights.some((i) => /trend/.test(i.text))).toBe(true);
    expect(clashed.insights.some((i) => /Dragon Saga/.test(i.text))).toBe(true);
  });
});

describe('game results', () => {
  it('records weekly sales and everything the game cost', () => {
    const s = createGame('Results', 101);
    s.cash = 1e7;
    startGame(s, spec, [33, 33, 33]);
    expect(runPromo(s, 'preview')).toBeNull();
    while (s.activity?.kind === 'game' && s.activity.phase < 3) {
      if (s.activity.awaitingFocus) setPhaseFocus(s, [33, 33, 33]);
      tick(s);
    }
    const r = releaseGame(s);
    if (typeof r === 'string') throw new Error(r);
    const g = r.game;
    expect(g.spend!.budget).toBe(g.cost);
    expect(g.spend!.marketing).toBeGreaterThan(0);
    expect(g.spend!.team).toBeGreaterThan(0);
    const before = g.spend!.marketing;
    expect(pushSales(s, g.id, 'ads')).toBeNull();
    expect(g.spend!.marketing).toBeGreaterThan(before);
    for (let i = 0; i < SALES_WEEKS + 2; i++) tick(s);
    expect(g.weekly!.units).toHaveLength(SALES_WEEKS);
    expect(g.weekly!.units.reduce((a, b) => a + b, 0)).toBe(g.unitsSold);
    expect(g.weekly!.revenue.reduce((a, b) => a + b, 0)).toBe(g.revenue);
    expect(cumulativeRevenue(g)).toHaveLength(SALES_WEEKS + 1);
    expect(totalCost(g)).toBe(g.spend!.budget + g.spend!.marketing + g.spend!.team);
    expect(profit(g)).toBe(g.revenue - totalCost(g));
    const pay = paybackWeek(g);
    if (pay !== null) expect(cumulativeRevenue(g)[pay]).toBeGreaterThanOrEqual(totalCost(g));
    else expect(g.revenue).toBeLessThan(totalCost(g));
  });

  it('rates games by how many times their cost they made', () => {
    const base = { ...spec, id: 1, releaseWeek: 0, devWeeks: 10, design: 0, tech: 0, bugs: 0, ppw: 0, score: 7, reviews: [], targetUnits: 0, unitsSold: 0, weeksOnMarket: SALES_WEEKS, fansGained: 0, unitPrice: 10, cost: 100, spend: { budget: 60, marketing: 20, team: 20 } };
    const at = (revenue: number) => verdict({ ...base, revenue }).id;
    expect(at(600)).toBe('blockbuster');
    expect(at(300)).toBe('hit');
    expect(at(150)).toBe('success');
    expect(at(100)).toBe('even');
    expect(at(50)).toBe('flop');
    // While still selling, the copies it is expected to sell count too.
    expect(returnMultiple({ ...base, revenue: 50, weeksOnMarket: 2, targetUnits: 30, unitsSold: 5 })).toBeCloseTo(3);
  });
});

describe('ad rewards', () => {
  it('gives each reward once per cooldown', () => {
    const s = createGame('Ads', 111);
    const cash = s.cash;
    expect(claimReward(s, 'investor')).toBeNull();
    expect(s.cash).toBe(cash + investorCash(s));
    expect(claimReward(s, 'investor')).toMatch(/Available again in 12 weeks/);
    for (let i = 0; i < 12; i++) {
      s.activity = null;
      tick(s);
    }
    expect(rewardBlocker(s, 'investor')).toBeNull();
  });

  it('gives research points, and a free Espresso Bar only while making a game', () => {
    const s = createGame('Ads', 112);
    const rp = s.rp;
    expect(claimReward(s, 'research')).toBeNull();
    expect(s.rp).toBe(rp + researchGrant(s));
    expect(claimReward(s, 'espresso')).toBe('Only while making a game.');
    startGame(s, spec, [33, 33, 33]);
    expect(claimReward(s, 'espresso')).toBeNull();
    expect(boostWeeks(s, 'coffee')).toBe(4);
  });

  it('scales the investor with the studio', () => {
    const s = createGame('Ads', 113);
    const small = investorCash(s);
    for (let i = 0; i < 5; i++) s.staff.push({ ...s.candidates[0], id: 900 + i, salary: 5000 });
    expect(investorCash(s)).toBeGreaterThan(small);
    expect(small).toBeGreaterThanOrEqual(6000);
  });
});
