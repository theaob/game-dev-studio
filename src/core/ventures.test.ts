import { describe, expect, it } from 'vitest';
import { createGame, gameCost } from './sim';
import { platformById } from './data';
import { tickIndustry } from './industry';
import { WEEKS_PER_YEAR } from './time';
import { acquirableRivals, acquireBlocker, acquireRival, acquisitionPrice, buyVenture, hasVenture, licenseCost, phaseWeeks, platformFit, ventureHypeMult, ventureBlocker, venturePrice } from './ventures';

function campus(year = 2010) {
  const s = createGame('Test');
  s.week = (year - 1985) * WEEKS_PER_YEAR;
  s.officeLevel = 3;
  s.cash = 500_000_000;
  return s;
}

describe('late-game ventures', () => {
  it('need the Campus and open up by year', () => {
    const s = createGame('Test');
    s.cash = 500_000_000;
    expect(ventureBlocker(s, 'engine_team')).toMatch(/Campus/);
    s.officeLevel = 3;
    expect(ventureBlocker(s, 'mocap')).toMatch(/1995/);
    expect(ventureBlocker(s, 'engine_team')).toBeNull();
  });

  it('cost millions, are bought once and help forever', () => {
    const s = campus();
    const cash = s.cash;
    expect(ventureHypeMult(s)).toBe(1);
    expect(phaseWeeks(s, 'large')).toBe(10);
    expect(venturePrice(s, 'mocap')).toBeGreaterThan(3_000_000);
    expect(buyVenture(s, 'mocap')).toBeNull();
    expect(buyVenture(s, 'engine_team')).toBeNull();
    expect(buyVenture(s, 'mocap')).toMatch(/Already/);
    expect(hasVenture(s, 'mocap')).toBe(true);
    expect(s.cash).toBeLessThan(cash - 7_000_000);
    expect(ventureHypeMult(s)).toBe(1.25);
    expect(phaseWeeks(s, 'large')).toBe(9);
    expect(phaseWeeks(s, 'medium')).toBe(6);
  });

  it('the Hardware Division makes dev kits free and softens weak platform fits', () => {
    const s = campus();
    const spectra = platformById('spectra3');
    expect(licenseCost(s, spectra)).toBeGreaterThan(0);
    expect(platformFit(s, spectra, 'casual')).toBeCloseTo(0.85, 5);
    expect(platformFit(s, spectra, 'rpg')).toBeCloseTo(1.15, 5);
    expect(buyVenture(s, 'hardware')).toBeNull();
    expect(licenseCost(s, spectra)).toBe(0);
    expect(gameCost(s, { platform: 'spectra3', size: 'small', marketing: 'none' }).license).toBe(0);
    expect(platformFit(s, spectra, 'casual')).toBeCloseTo(0.925, 5);
    expect(platformFit(s, spectra, 'rpg')).toBeCloseTo(1.15, 5);
  });
});

describe('buying rival studios', () => {
  it('takes the rival out of the market and brings fans, RP and a star developer', () => {
    const s = campus();
    const target = acquirableRivals(s)[0];
    const price = acquisitionPrice(s, target.name);
    expect(price).toBeGreaterThan(5_000_000);
    const { cash, fans, rp } = s;
    const candidates = s.candidates.length;
    expect(acquireRival(s, target.name)).toBeNull();
    expect(s.cash).toBe(cash - price);
    expect(s.fans).toBeGreaterThan(fans);
    expect(s.rp).toBeGreaterThan(rp);
    expect(s.candidates.length).toBe(candidates + 1);
    expect(s.candidates[0].rockstar).toBe(true);
    expect(acquireBlocker(s, target.name)).toMatch(/Already/);
    expect(acquirableRivals(s).some((r) => r.name === target.name)).toBe(false);
  });

  it('a bought studio releases no more games', () => {
    const s = campus();
    for (const r of acquirableRivals(s)) acquireRival(s, r.name);
    const released = s.industry?.rivalGames.length ?? 0;
    for (let i = 0; i < WEEKS_PER_YEAR * 2; i++) {
      s.week++;
      tickIndustry(s);
    }
    expect(s.industry?.rivalGames.length ?? 0).toBe(released);
  });

  it('closed or unknown studios are not for sale', () => {
    const s = campus(2010);
    expect(acquireBlocker(s, 'Bitwise Bros')).toMatch(/Not open/);
    expect(acquireBlocker(s, 'Nobody Inc')).toMatch(/Unknown/);
  });
});
