import { describe, expect, it } from 'vitest';
import { botTurn } from './bot';
import { COUNTER_OFFER_RAISE, DECISIONS, DECISION_GAP_WEEKS, PUBLISHER_CUT, eligibleDecisions, resolveDecision, rollDecision } from './events';
import { createGame, tick } from './sim';
import { WEEKS_PER_YEAR } from './time';
import type { GameState, ReleaseReport, ReleasedGame, Staff } from './types';

function game(s: GameState, extra: Partial<ReleasedGame> = {}): ReleasedGame {
  const g: ReleasedGame = {
    id: s.nextId++, name: 'Hit', topic: 'fantasy', genre: 'rpg', platform: 'pc', size: 'small', marketing: 'none',
    releaseWeek: s.week, devWeeks: 9, design: 100, tech: 100, bugs: 0, ppw: 0, score: 9, reviews: [9, 9, 9, 9],
    targetUnits: 10_000, unitsSold: 0, revenue: 0, weeksOnMarket: 0, fansGained: 0, unitPrice: 10, cost: 0, ...extra,
  };
  s.released.push(g);
  return g;
}

function star(s: GameState): Staff {
  const st: Staff = { id: s.nextId++, name: 'Ada Star', design: 7, tech: 7, speed: 1, salary: 4000, hiredWeek: 0 };
  s.staff.push(st);
  return st;
}

describe('decision events', () => {
  it('only start once the studio has released a game', () => {
    const s = createGame('Events', 7);
    for (let i = 0; i < 400; i++) expect(rollDecision(s)).toBeNull();
    game(s);
    let rolled = 0;
    for (let i = 0; i < 400; i++) {
      s.week++;
      if (rollDecision(s)) rolled++;
      delete s.decision;
    }
    expect(rolled).toBeGreaterThan(0);
  });

  it('happen one or two times a year in a career, never back to back', () => {
    for (const seed of [11, 22]) {
      const s = createGame('Bot', seed);
      const reports: ReleaseReport[] = [];
      const weeks: number[] = [];
      while (!s.over) {
        botTurn(s, 'casual', reports);
        for (const ev of tick(s)) if (ev.type === 'decision') weeks.push(ev.decision.week);
      }
      const years = s.week / WEEKS_PER_YEAR;
      expect(weeks.length / years).toBeGreaterThan(0.6);
      expect(weeks.length / years).toBeLessThan(2.5);
      for (let i = 1; i < weeks.length; i++) expect(weeks[i] - weeks[i - 1]).toBeGreaterThanOrEqual(DECISION_GAP_WEEKS);
    }
  });

  it('every event has a bot choice, and every choice explains itself', () => {
    for (const d of DECISIONS) {
      expect(d.choices[d.botChoice]).toBeDefined();
      for (const c of d.choices) expect(c.label.length).toBeGreaterThan(0);
    }
  });

  it('a counter-offer keeps a star at a higher salary, and rivals leave them alone for a while', () => {
    const s = createGame('Poach', 3);
    game(s);
    const st = star(s);
    s.week = 100;
    s.decision = { id: 'poach', week: s.week, staffId: st.id, rival: 'Rival Soft' };
    expect(resolveDecision(s, 0)).toMatchObject({ ok: true });
    expect(st.salary).toBe(Math.round((4000 * COUNTER_OFFER_RAISE) / 50) * 50);
    expect(s.staff).toContain(st);
    expect(eligibleDecisions(s).some((d) => d.id === 'poach')).toBe(false);
  });

  it('letting a star go loses them', () => {
    const s = createGame('Poach', 3);
    game(s);
    const st = star(s);
    s.decision = { id: 'poach', week: s.week, staffId: st.id, rival: 'Rival Soft' };
    resolveDecision(s, 1);
    expect(s.staff.find((x) => x.id === st.id)).toBeUndefined();
  });

  it('a decision that no longer applies does nothing', () => {
    const s = createGame('Gone', 3);
    game(s);
    const cash = s.cash;
    s.decision = { id: 'poach', week: s.week, staffId: 999, rival: 'Rival Soft' };
    expect(resolveDecision(s, 0)).toEqual({ ok: true, text: 'Never mind, it sorted itself out.' });
    expect(s.cash).toBe(cash);
    expect(s.decision).toBeUndefined();
  });

  it('a publisher keeps its share of every sale', () => {
    const s = createGame('Pub', 3);
    const own = game(s, { name: 'Own' });
    const funded = game(s, { name: 'Funded', publisherCut: PUBLISHER_CUT });
    tick(s);
    expect(own.unitsSold).toBe(funded.unitsSold);
    expect(funded.revenue).toBe(Math.round(own.unitsSold * 10 * (1 - PUBLISHER_CUT)));
    expect(own.revenue).toBe(own.unitsSold * 10);
  });

  it('patching a launch bug costs money; leaving it costs sales and fans', () => {
    const a = createGame('Bug', 3);
    a.fans = 10_000;
    const ga = game(a, { bugs: 50 });
    a.decision = { id: 'launch_bug', week: a.week, gameId: ga.id, amount: 5000 };
    const cash = a.cash;
    resolveDecision(a, 0);
    expect(a.cash).toBe(cash - 5000);
    expect(ga.targetUnits).toBe(10_000);

    const b = createGame('Bug', 3);
    b.fans = 10_000;
    const gb = game(b, { bugs: 50 });
    b.decision = { id: 'launch_bug', week: b.week, gameId: gb.id, amount: 5000 };
    resolveDecision(b, 1);
    expect(gb.targetUnits).toBe(7500);
    expect(b.fans).toBe(9900);
  });
});
