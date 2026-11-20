import { describe, expect, it } from 'vitest';
import { playThrough } from './bot';
import {
  bestEngine,
  engineCost,
  engineTechMult,
  engineWeeks,
  featuresNotBuilt,
  migrateEngines,
  startEngine,
} from './engines';
import { createGame, doResearch, researchBlocker, startGame, techMultiplier, tick, validateGame } from './sim';
import { WEEKS_PER_YEAR } from './time';
import type { GameSpec, GameState } from './types';

const spec: GameSpec = { name: 'Test Game', topic: 'fantasy', genre: 'rpg', platform: 'pc', size: 'small', marketing: 'none' };

function buildEngine(s: GameState, name: string, features: string[]) {
  expect(startEngine(s, name, features)).toBeNull();
  for (let i = 0; i < 200 && s.activity?.kind === 'engine'; i++) tick(s);
  expect(s.activity).toBeNull();
}

describe('custom engines', () => {
  it('engine features do nothing until they are built into an engine', () => {
    const s = createGame('Engines', 1);
    s.rp = 1000;
    expect(doResearch(s, 'engine2')).toBeNull();
    expect(s.notices.at(-1)?.text).toMatch(/engine feature/);
    expect(techMultiplier(s)).toBe(1);
    expect(featuresNotBuilt(s).map((f) => f.id)).toEqual(['engine2']);
  });

  it('is a development project of its own: it takes the team, weeks and money, and earns research points', () => {
    const s = createGame('Engines', 1);
    s.rp = 1000;
    doResearch(s, 'engine2');
    doResearch(s, 'feat_sound');
    expect(startEngine(s, 'Garage Engine', ['feat_physics'])).toMatch(/isn't researched/);
    expect(startEngine(s, '  ', ['engine2'])).toMatch(/name/);
    expect(startEngine(s, 'Garage Engine', [])).toMatch(/at least one/);
    const cash = s.cash;
    const rp = s.rp;
    const weeks = engineWeeks(s, 2);
    expect(startEngine(s, 'Garage Engine', ['feat_sound', 'engine2'])).toBeNull();
    expect(s.cash).toBe(cash - engineCost(s, 2));
    expect(s.activity?.kind).toBe('engine');
    expect(validateGame(s, spec)).toBe('Your team is busy.');
    for (let i = 0; i < weeks; i++) tick(s);
    expect(s.activity).toBeNull();
    expect(s.rp).toBeGreaterThan(rp);
    expect(s.engines).toHaveLength(1);
    // Features are kept in research order.
    expect(s.engines![0]).toMatchObject({ id: 1, name: 'Garage Engine', features: ['engine2', 'feat_sound'] });
    expect(featuresNotBuilt(s)).toEqual([]);
  });

  it('a bigger team builds faster, and more features take longer and cost more', () => {
    const s = createGame('Engines', 1);
    expect(engineWeeks(s, 3)).toBeGreaterThan(engineWeeks(s, 1));
    expect(engineCost(s, 3)).toBeGreaterThan(engineCost(s, 1));
    const solo = engineWeeks(s, 4);
    for (let i = 0; i < 3; i++) s.staff.push({ ...s.staff[0], id: 100 + i, founder: false });
    expect(engineWeeks(s, 4)).toBeLessThan(solo);
  });

  it('games made with an engine get its features’ tech points; games without one do not', () => {
    const s = createGame('Engines', 1);
    s.rp = 1000;
    s.cash = 1e6;
    doResearch(s, 'engine2');
    doResearch(s, 'feat_sound');
    buildEngine(s, 'Garage Engine', ['engine2', 'feat_sound']);
    expect(engineTechMult(['engine2', 'feat_sound'])).toBeCloseTo(1.15 * 1.04, 6);
    expect(techMultiplier(s, 1)).toBeCloseTo(1.15 * 1.04, 6);
    expect(validateGame(s, { ...spec, engine: 99 })).toMatch(/engine/);
    expect(startGame(s, { ...spec, engine: 1 }, [50, 50, 50])).toBeNull();
    expect(techMultiplier(s)).toBeCloseTo(1.15 * 1.04, 6);
    s.activity = null;
    expect(startGame(s, spec, [50, 50, 50])).toBeNull();
    expect(techMultiplier(s)).toBe(1);
  });

  it('picks the engine with the most tech as the best', () => {
    const s = createGame('Engines', 1);
    s.rp = 1000;
    s.cash = 1e6;
    doResearch(s, 'engine2');
    doResearch(s, 'feat_sound');
    buildEngine(s, 'Big', ['engine2', 'feat_sound']);
    buildEngine(s, 'Small', ['feat_sound']);
    expect(bestEngine(s)?.name).toBe('Big');
  });

  it('some features only arrive with their era', () => {
    const s = createGame('Engines', 1);
    s.rp = 10_000;
    doResearch(s, 'engine2');
    doResearch(s, 'engine3');
    expect(researchBlocker(s, 'feat_online')).toBe('Available from 1997.');
    s.week = (1997 - 1985) * WEEKS_PER_YEAR;
    expect(researchBlocker(s, 'feat_online')).toBeNull();
  });

  it('old saves turn their engine upgrades into a ready-built engine, so nothing is lost', () => {
    const s = createGame('Old Save', 1);
    s.rp = 1000;
    s.cash = 1e6;
    doResearch(s, 'engine2');
    doResearch(s, 'engine3');
    startGame(s, spec, [50, 50, 50]);
    // What a save from before engines looks like.
    delete s.engines;
    if (s.activity?.kind === 'game') delete s.activity.engine;
    migrateEngines(s);
    expect(s.engines).toHaveLength(1);
    expect(s.engines![0].features).toEqual(['engine2', 'engine3']);
    expect(s.activity?.kind === 'game' && s.activity.engine).toBe(1);
    // The same tech as the old global upgrades gave.
    expect(techMultiplier(s)).toBeCloseTo(1.15 * 1.15, 6);
    // Running it again changes nothing.
    migrateEngines(s);
    expect(s.engines).toHaveLength(1);
  });

  it('an old save without engine research gets no engine', () => {
    const s = createGame('Old Save', 1);
    delete s.engines;
    migrateEngines(s);
    expect(s.engines).toEqual([]);
  });

  it('the bots build engines as research unlocks features, and use them', () => {
    const s = createGame('Bot', 7);
    playThrough(s, 'smart', WEEKS_PER_YEAR * 15);
    expect(s.engines!.length).toBeGreaterThan(0);
    expect(s.released.some((g) => g.engine !== undefined)).toBe(true);
  });
});
