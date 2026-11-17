import { describe, expect, it } from 'vitest';
import { OFFICES, PLATFORM_TAIL_YEARS, platformBuyers, platformById, platformUsers } from './data';
import { developmentTeam } from './scoring';
import { sequelName, seriesTitle } from './sequels';
import { createGame, headhuntBlocker, releaseGame, setPhaseFocus, startGame, tick } from './sim';
import type { GameSpec, ReleasedGame, Staff } from './types';

const spec: GameSpec = { name: 'Dragon Quest', topic: 'fantasy', genre: 'rpg', platform: 'pc', size: 'small', marketing: 'none' };

function dev(s: ReturnType<typeof createGame>) {
  while (s.activity?.kind === 'game' && s.activity.phase < 3) {
    if (s.activity.awaitingFocus) setPhaseFocus(s, [50, 50, 50]);
    tick(s);
  }
}

function worker(id: number): Staff {
  return { id, name: `Dev ${id}`, design: 3, tech: 3, speed: 1, salary: 1000, hiredWeek: 0 };
}

describe('platform buyers after a platform is discontinued', () => {
  const nova = platformById('nova8');
  it('fade over the tail years instead of dropping to zero', () => {
    const end = nova.end!;
    expect(platformBuyers(nova, end - 0.5)).toBe(platformUsers(nova, end - 0.5));
    const last = nova.users[nova.users.length - 1][1];
    expect(platformBuyers(nova, end)).toBeCloseTo(last);
    expect(platformBuyers(nova, end + PLATFORM_TAIL_YEARS / 2)).toBeCloseTo(last / 2);
    expect(platformBuyers(nova, end + PLATFORM_TAIL_YEARS)).toBe(0);
  });

  it('still sell a game that launches just after the end', () => {
    const release = (tailGone: boolean) => {
      const s = createGame('Fade', 4);
      s.cash = 1e9;
      s.licenses.push('nova8');
      s.week = (nova.end! - 1985) * 48 - 5;
      expect(startGame(s, { ...spec, platform: 'nova8' }, [50, 50, 50])).toBeNull();
      dev(s);
      // Same seed and choices; the only difference is whether the last owners are still around.
      const end = nova.end;
      if (tailGone) nova.end = end! - PLATFORM_TAIL_YEARS - 1;
      try {
        const r = releaseGame(s);
        if (typeof r === 'string') throw new Error(r);
        return r;
      } finally {
        nova.end = end;
      }
    };
    const faded = release(false);
    const gone = release(true);
    expect(faded.game.targetUnits).toBeGreaterThan(gone.game.targetUnits * 1.5);
    expect(faded.insights.some((i) => i.text.includes('discontinued'))).toBe(true);
  });
});

describe('team size over development', () => {
  it('averages the team over the development weeks', () => {
    const s = createGame('Team', 6);
    s.cash = 1e9;
    expect(startGame(s, { ...spec, size: 'small' }, [50, 50, 50])).toBeNull();
    dev(s);
    const p = s.activity!;
    if (p.kind !== 'game') throw new Error('no game');
    // Built solo, then four people hired on release day: still judged as a team of one.
    for (let i = 0; i < 4; i++) s.staff.push(worker(100 + i));
    expect(developmentTeam(s, p)).toBe(1);
  });

  it('falls back to today’s team for saves without the count', () => {
    const s = createGame('Team', 7);
    s.staff.push(worker(100));
    expect(developmentTeam(s, { phase: 3, phaseWeeks: 3, weekInPhase: 0 })).toBe(2);
  });
});

describe('headhunter', () => {
  it('refuses when the biggest office is already full', () => {
    const s = createGame('Hunt', 8);
    s.cash = 1e9;
    s.officeLevel = OFFICES.length - 1;
    while (s.staff.length < OFFICES[s.officeLevel].capacity) s.staff.push(worker(200 + s.staff.length));
    expect(headhuntBlocker(s)).toMatch(/no desk/);
    s.staff.pop();
    expect(headhuntBlocker(s)).toBeNull();
  });
});

describe('sequel names', () => {
  const g = (name: string, series: number) => ({ name, series }) as ReleasedGame;
  it('only drops a trailing number that is the part number', () => {
    expect(sequelName(g('Area 51', 1))).toBe('Area 51 2');
    expect(sequelName(g('Area 51 2', 2))).toBe('Area 51 3');
    expect(sequelName(g('Dragon Quest 2', 2))).toBe('Dragon Quest 3');
    expect(seriesTitle(g('Dragon Quest 2', 2))).toBe('Dragon Quest');
    expect(seriesTitle(g('Area 51', 1))).toBe('Area 51');
  });
});
