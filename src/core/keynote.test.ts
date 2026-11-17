import { describe, expect, it } from 'vitest';
import { PLATFORMS, platformById } from './data';
import { platformKeynote } from './keynote';
import { createGame, tick } from './sim';
import { WEEKS_PER_YEAR, START_YEAR } from './time';

describe('console launch keynotes', () => {
  it('puts every platform launched after the first year on stage, with its maker and a tagline', () => {
    for (const p of PLATFORMS.filter((x) => x.start > START_YEAR)) {
      expect(p.maker, p.id).toBeTruthy();
      expect(p.tagline, p.id).toBeTruthy();
    }
  });

  it('describes the hardware from its data', () => {
    const k = platformKeynote(platformById('spectra'));
    expect(k).toMatchObject({ year: 1995, maker: 'Spectra Entertainment', name: 'Spectra', launchUsers: 3, peakUsers: 60, peakYear: 1999, license: 80000, platform: 'spectra' });
    expect(k.strengths).toEqual(['Rhythm', 'RPG']);
    expect(k.weaknesses).toEqual(['Strategy']);
  });

  it('holds a keynote on the first week of the year a console launches', () => {
    const s = createGame('Test');
    s.cash = 1e9; // Stay solvent for ten years.
    const seen: string[] = [];
    while (s.week < (1995 - START_YEAR) * WEEKS_PER_YEAR) {
      for (const ev of tick(s)) {
        if (ev.type === 'keynote') {
          expect(s.week % WEEKS_PER_YEAR).toBe(0);
          seen.push(`${ev.keynote.year} ${ev.keynote.name}`);
        }
      }
    }
    expect(seen).toEqual(['1989 Zephyr Drive', '1990 Pocket Pal', '1995 Spectra']);
  });
});
