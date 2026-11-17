import { describe, expect, it } from 'vitest';
import { claimPressTour, claimReward, pressTourBlocker, pressTourCopies, rewardBlocker } from './rewards';
import { buyDecor, decorPrice, ownsDecor } from './decor';
import { createGame, headhuntFee } from './sim';
import type { ReleasedGame } from './types';

function onSale(id: number, extra: Partial<ReleasedGame> = {}): ReleasedGame {
  return {
    id, name: `Game ${id}`, topic: 'fantasy', genre: 'rpg', platform: 'pc', size: 'small', marketing: 'none',
    releaseWeek: 10, devWeeks: 9, design: 0, tech: 0, bugs: 0, ppw: 0, score: 7, reviews: [7, 7, 7, 7],
    targetUnits: 10000, unitsSold: 2000, revenue: 0, weeksOnMarket: 3, fansGained: 0, unitPrice: 9, cost: 0, ...extra,
  };
}

describe('press tour', () => {
  it('sells 25% more of what is left, once per game, only while on sale', () => {
    const s = createGame('Tour', 1);
    s.released = [onSale(1), onSale(2, { weeksOnMarket: 16 })];
    expect(pressTourCopies(s, 1)).toBe(2000);
    expect(claimPressTour(s, 1)).toBeNull();
    expect(s.released[0].targetUnits).toBe(12000);
    expect(pressTourBlocker(s, 1)).toMatch(/already/);
    expect(claimPressTour(s, 1)).toMatch(/already/);
    expect(pressTourBlocker(s, 2)).toMatch(/no longer on sale/);
    expect(pressTourBlocker(s, 99)).toMatch(/not found/);
  });
});

describe('headhunter reward', () => {
  it('starts a free search even without the fee in the bank, then waits a year', () => {
    const s = createGame('Hunt', 1);
    s.cash = headhuntFee(s) - 1;
    expect(rewardBlocker(s, 'headhunter')).toBeNull();
    expect(claimReward(s, 'headhunter')).toBeNull();
    expect(s.headhunt).toBeDefined();
    expect(s.cash).toBe(headhuntFee(s) - 1);
    delete s.headhunt;
    expect(rewardBlocker(s, 'headhunter')).toMatch(/Available again/);
  });
});

describe('supporter decorations', () => {
  it('are free for supporters and locked for everyone else', () => {
    const s = createGame('Deco', 1);
    expect(decorPrice(s, 'statue')).toBe(0);
    expect(buyDecor(s, 'statue')).toMatch(/Supporter Pack/);
    expect(ownsDecor(s, 'statue')).toBe(false);
    const cash = s.cash;
    expect(buyDecor(s, 'disco', true)).toBeNull();
    expect(ownsDecor(s, 'disco')).toBe(true);
    expect(s.cash).toBe(cash);
  });
});
