import { describe, expect, it } from 'vitest';
import { HARDWARE_NEWS, PLATFORMS, platformById } from './data';
import { SHOW_WEEK, announcedName, isPlatformAnnounced, tickIndustry } from './industry';
import { createGame } from './sim';
import { END_YEAR, START_YEAR, WEEKS_PER_YEAR } from './time';

const weekOf = (year: number, week = 0) => (year - START_YEAR) * WEEKS_PER_YEAR + week;

describe('platform timeline', () => {
  it('has well-formed platforms that all launch inside the career', () => {
    const ids = new Set<string>();
    for (const p of PLATFORMS) {
      expect(ids.has(p.id), p.id).toBe(false);
      ids.add(p.id);
      expect(p.start, p.id).toBeLessThanOrEqual(END_YEAR);
      if (p.end !== undefined) {
        expect(p.end, p.id).toBeGreaterThan(p.start);
        // The curve reaches the end year, so the owners it has left are known.
        expect(p.users[p.users.length - 1][0], p.id).toBe(p.end);
      }
      expect(p.users[0][0], p.id).toBe(p.start);
      if (p.announced !== undefined) expect(p.announced, p.id).toBeLessThan(p.start);
      if (p.codename) expect(p.announced, p.id).toBeLessThan(p.start - 1);
    }
  });

  it('has hardware news every year from the late 80s to the end', () => {
    for (let year = 1988; year <= END_YEAR; year++) {
      const news =
        PLATFORMS.some((p) => p.start === year || p.end === year || p.announced === year) || HARDWARE_NEWS.some((n) => n.year === year);
      expect(news, String(year)).toBe(true);
    }
  });

  it('announces hardware at the summer show under its codename, then reveals the name', () => {
    const s = createGame('Test');
    const wave = platformById('wave');
    s.week = weekOf(2004, SHOW_WEEK - 1);
    expect(isPlatformAnnounced(wave, s.week)).toBe(false);
    s.week++;
    tickIndustry(s);
    const said = s.industry!.headlines.map((h) => h.text);
    expect(said).toContain("Novaworks announces new console hardware, codename Project Ripple. It's due in 2006.");
    expect(s.notices.some((n) => n.text.includes('Project Ripple'))).toBe(true);
    expect(isPlatformAnnounced(wave, s.week)).toBe(true);
    expect(announcedName(wave, s.week)).toBe('Project Ripple');

    s.week = weekOf(2005);
    tickIndustry(s);
    expect(s.industry!.headlines.map((h) => h.text)).toContain('Novaworks reveals the real name of Project Ripple: the Wave arrives next year.');
    expect(announcedName(wave, s.week)).toBe('Wave');

    s.week = weekOf(2006);
    expect(isPlatformAnnounced(wave, s.week)).toBe(false);
  });

  it('runs the hardware news and discontinuations of the late game', () => {
    const s = createGame('Test');
    s.week = weekOf(2023);
    tickIndustry(s);
    const said = s.industry!.headlines.map((h) => h.text);
    expect(said).toContain('The Stratus has been discontinued.');
    s.week = weekOf(2025);
    tickIndustry(s);
    expect(s.industry!.headlines.map((h) => h.text)).toContain('The Switchback 2 (Hybrid) is out now!');
  });
});
