import { describe, expect, it } from 'vitest';
import { botTurn } from './bot';
import { GOAL_SLOTS, GOAL_SWAP_WEEKS, goalDone, goalPossible, goalText, roundUp, swapGoal, updateGoals, type Goal } from './goals';
import { createGame, tick } from './sim';
import type { GameState, ReleaseReport, ReleasedGame } from './types';

/** A studio with one game out, so goals are on. */
function studio(seed = 1): GameState {
  const s = createGame('Test', seed);
  s.released.push(game(s, { id: 1, score: 6, releaseWeek: 0 }));
  return s;
}

function game(s: GameState, over: Partial<ReleasedGame>): ReleasedGame {
  return {
    id: s.nextId++, name: 'Game', topic: 'fantasy', genre: 'action', platform: 'pc', size: 'small', marketing: 'none',
    releaseWeek: s.week, devWeeks: 10, design: 10, tech: 10, bugs: 0, ppw: 1, score: 7, reviews: [7, 7, 7, 7],
    targetUnits: 1000, unitsSold: 0, revenue: 0, weeksOnMarket: 0, fansGained: 0, unitPrice: 10, cost: 0, ...over,
  };
}

function setGoal(s: GameState, goal: Omit<Goal, 'id' | 'since' | 'until'>): Goal {
  const g: Goal = { id: 99, since: s.week, until: s.week + 48, ...goal };
  s.goals = { active: [g], done: 0, nextId: 100 };
  return g;
}

describe('studio goals', () => {
  it('start after the first release', () => {
    const s = createGame('Test', 1);
    expect(updateGoals(s)).toEqual([]);
    expect(s.goals).toBeUndefined();
    s.released.push(game(s, {}));
    updateGoals(s);
    expect(s.goals!.active).toHaveLength(GOAL_SLOTS);
    expect(new Set(s.goals!.active.map((g) => g.kind)).size).toBe(GOAL_SLOTS);
  });

  it('are never handed out already done, and read as sentences', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = studio(seed);
      s.fans = 5000;
      s.cash = 300_000;
      updateGoals(s);
      for (const g of s.goals!.active) {
        expect(goalDone(s, g)).toBe(false);
        expect(goalText(g)).not.toMatch(/undefined|NaN|a RPG|a Action|a Adventure/);
        expect(g.reward.amount).toBeGreaterThan(0);
      }
    }
  });

  it('pay their reward once and are replaced', () => {
    const s = studio();
    setGoal(s, { kind: 'fans', target: 2000, reward: { kind: 'cash', amount: 10_000 } });
    const cash = s.cash;
    s.fans = 2500;
    expect(updateGoals(s).map((g) => g.id)).toEqual([99]);
    expect(s.cash).toBe(cash + 10_000);
    expect(s.goals!.done).toBe(1);
    expect(s.goals!.active).toHaveLength(GOAL_SLOTS);
    expect(s.goals!.active.some((g) => g.id === 99)).toBe(false);
    expect(updateGoals(s)).toEqual([]);
  });

  it('only count releases after the goal was set', () => {
    const s = studio();
    s.released.push(game(s, { genre: 'rpg', score: 9 }));
    s.week = 10;
    const g = setGoal(s, { kind: 'hit', subject: 'rpg', target: 8, reward: { kind: 'rp', amount: 20 } });
    expect(goalDone(s, g)).toBe(false);
    s.released.push(game(s, { genre: 'rpg', score: 7.5 }));
    expect(goalDone(s, g)).toBe(false);
    s.released.push(game(s, { genre: 'rpg', score: 8.2 }));
    expect(goalDone(s, g)).toBe(true);
  });

  it('expire, and trends end with the year', () => {
    const s = studio();
    s.week = 50;
    const g = setGoal(s, { kind: 'trend', subject: 'rpg|space', target: 1, reward: { kind: 'cash', amount: 1 } });
    expect(goalPossible(s, g)).toBe(true);
    s.week = 96;
    expect(goalPossible(s, g)).toBe(false);
    const f = setGoal(s, { kind: 'fans', target: 1e9, reward: { kind: 'cash', amount: 1 } });
    s.week = f.until + 1;
    expect(updateGoals(s)).toEqual([]);
    expect(s.goals!.active.some((x) => x.id === f.id)).toBe(false);
  });

  it('can be swapped once every six months', () => {
    const s = studio();
    updateGoals(s);
    const first = s.goals!.active[0].id;
    expect(swapGoal(s, first)).toBeNull();
    expect(s.goals!.active.some((g) => g.id === first)).toBe(false);
    expect(swapGoal(s, s.goals!.active[1].id)).toMatch(/in 24 weeks/);
    s.week += GOAL_SWAP_WEEKS;
    expect(swapGoal(s, s.goals!.active[1].id)).toBeNull();
  });

  it('round targets to friendly numbers', () => {
    expect([roundUp(1000), roundUp(1001), roundUp(2400), roundUp(7000), roundUp(123_456)]).toEqual([1000, 1500, 2500, 8000, 150_000]);
  });

  it('keep coming for a whole career', () => {
    const s = createGame('casual', 104729);
    const reports: ReleaseReport[] = [];
    let done = 0;
    while (!s.over) {
      botTurn(s, 'casual', reports);
      tick(s);
      done += updateGoals(s).length;
      if (s.released.length && !s.over) expect(s.goals!.active.length).toBeGreaterThan(0);
    }
    // The bot doesn't chase goals, so this is what a player gets without trying.
    expect(done).toBeGreaterThan(3);
  });
});
