import { describe, expect, it } from 'vitest';
import { RND_COST_GROWTH, doRnd, rndBlocker, rndCost, rndLevel } from './rnd';
import { BAR_GRACE_YEARS, BAR_MEMORY, benchmark, rememberedBest } from './scoring';
import { bugMultiplier, createGame, designMultiplier, techMultiplier } from './sim';
import { WEEKS_PER_YEAR } from './time';

describe('R&D projects', () => {
  it('open once the last level of their research line is done', () => {
    const s = createGame('RnD', 1);
    s.rp = 10_000;
    expect(rndBlocker(s, 'rnd_engine')).toMatch(/last level/);
    s.researched.push('engine2', 'engine3', 'engine4');
    expect(rndBlocker(s, 'rnd_engine')).toBeNull();
    expect(rndBlocker(s, 'rnd_design')).not.toBeNull();
  });

  it('every level costs more than the last and keeps helping', () => {
    const s = createGame('RnD', 1);
    s.researched.push('engine4', 'design3', 'qa2');
    s.rp = 100_000;
    const tech = techMultiplier(s);
    const design = designMultiplier(s);
    const bugs = bugMultiplier(s);
    const first = rndCost(s, 'rnd_engine');
    expect(doRnd(s, 'rnd_engine')).toBeNull();
    expect(rndCost(s, 'rnd_engine')).toBe(Math.round(first * RND_COST_GROWTH));
    expect(doRnd(s, 'rnd_engine')).toBeNull();
    expect(rndLevel(s, 'rnd_engine')).toBe(2);
    expect(techMultiplier(s)).toBeCloseTo(tech * 1.08, 6);
    expect(designMultiplier(s)).toBeCloseTo(design, 6);
    doRnd(s, 'rnd_design');
    doRnd(s, 'rnd_qa');
    expect(designMultiplier(s)).toBeCloseTo(design * 1.04, 6);
    expect(bugMultiplier(s)).toBeCloseTo(bugs * 0.94, 6);
    expect(s.rp).toBe(100_000 - 250 - 400 - 250 - 200);
  });

  it('needs the research points', () => {
    const s = createGame('RnD', 1);
    s.researched.push('qa2');
    s.rp = 199;
    expect(doRnd(s, 'rnd_qa')).toMatch(/Not enough/);
    expect(rndLevel(s, 'rnd_qa')).toBe(0);
  });
});

describe('the market remembers recent work best', () => {
  const game = (ppw: number, releaseWeek: number) => ({ ppw, releaseWeek });

  it('holds the studio to a game in full for the grace years, then less each year', () => {
    const peak = game(300, 0);
    const graceEnd = BAR_GRACE_YEARS * WEEKS_PER_YEAR;
    expect(rememberedBest({ week: graceEnd, bestPPW: 300, released: [peak] })).toBe(300);
    expect(rememberedBest({ week: graceEnd + 2 * WEEKS_PER_YEAR, bestPPW: 300, released: [peak] })).toBeCloseTo(300 * BAR_MEMORY * BAR_MEMORY, 6);
  });

  it('a recent game sets the bar when it beats the faded memory of an old peak', () => {
    const week = 10 * WEEKS_PER_YEAR;
    const released = [game(300, 0), game(250, week - 10)];
    expect(rememberedBest({ week, bestPPW: 300, released })).toBe(250);
    expect(benchmark({ week, bestPPW: 300, released })).toBeCloseTo(225, 6);
  });
});
