import { describe, expect, it } from 'vitest';
import { guideActive, guideStep, markGuideSeen, skipGuide, startGuide } from './guide';
import { createGame, releaseGame, setPhaseFocus, startGame, tick } from './sim';
import type { GameSpec } from './types';

const SPEC: GameSpec = { name: 'Dragon Garage', topic: 'fantasy', genre: 'adventure', platform: 'pc', size: 'small', marketing: 'none' };
const studio = { sheet: null, tab: 'studio' };

/** Runs weeks until the sim asks for something, answering focus prompts on the way. */
function runUntil(s: ReturnType<typeof createGame>, stop: (type: string) => boolean): void {
  for (let i = 0; i < 200; i++) {
    for (const ev of tick(s)) {
      if (stop(ev.type)) return;
      if (ev.type === 'needFocus') setPhaseFocus(s, [50, 50, 50]);
    }
  }
  throw new Error('never happened');
}

describe('guided first game', () => {
  it('is off for old saves and for devices that finished it', () => {
    const old = createGame('Old', 1);
    expect(guideActive(old)).toBe(false);
    expect(guideStep(old, studio)).toBeNull();
    const second = createGame('Second', 1);
    startGuide(second, true);
    expect(guideActive(second)).toBe(false);
  });

  it('walks through the first game, step by step', () => {
    const s = createGame('New', 1);
    startGuide(s, false);
    expect(guideStep(s, studio)).toBe('start');
    expect(guideStep(s, { sheet: { kind: 'newGame', step: 1 }, tab: 'studio' })).toBe('concept');
    expect(guideStep(s, { sheet: { kind: 'newGame', step: 2 }, tab: 'studio' })).toBe('setup');
    expect(guideStep(s, { sheet: { kind: 'focus', spec: true }, tab: 'studio' })).toBe('focus');
    // Other sheets and tabs stay clean.
    expect(guideStep(s, { sheet: { kind: 'store' }, tab: 'studio' })).toBeNull();
    expect(guideStep(s, { sheet: null, tab: 'staff' })).toBeNull();

    expect(startGame(s, SPEC, [50, 50, 50])).toBeNull();
    expect(guideStep(s, studio)).toBe('develop');
    markGuideSeen(s, 'develop');
    expect(guideStep(s, studio)).toBeNull();

    expect(guideStep(s, { sheet: { kind: 'focus', spec: false }, tab: 'studio' })).toBe('phase');
    markGuideSeen(s, 'phase');
    expect(guideStep(s, { sheet: { kind: 'focus', spec: false }, tab: 'studio' })).toBeNull();

    runUntil(s, (t) => t === 'devComplete');
    expect(guideStep(s, { sheet: { kind: 'devComplete' }, tab: 'studio' })).toBe('polish');
    expect(guideStep(s, studio)).toBe('release');

    expect(typeof releaseGame(s)).toBe('object');
    expect(guideStep(s, { sheet: { kind: 'review' }, tab: 'studio' })).toBe('reviews');
    expect(guideStep(s, studio)).toBe('next');
    // A second game gets no coaching while the last card waits.
    expect(guideStep(s, { sheet: { kind: 'newGame', step: 1 }, tab: 'studio' })).toBeNull();
    markGuideSeen(s, 'next');
    expect(s.guide?.done).toBe(true);
    expect(guideStep(s, studio)).toBeNull();
  });

  it('can be skipped at any point', () => {
    const s = createGame('Skip', 1);
    startGuide(s, false);
    skipGuide(s);
    expect(guideStep(s, studio)).toBeNull();
    expect(guideStep(s, { sheet: { kind: 'newGame', step: 1 }, tab: 'studio' })).toBeNull();
  });

  it('survives a save round trip', () => {
    const s = createGame('Saved', 1);
    startGuide(s, false);
    markGuideSeen(s, 'develop');
    const back = JSON.parse(JSON.stringify(s)) as typeof s;
    expect(back.guide).toEqual({ seen: ['develop'] });
    expect(guideStep(back, studio)).toBe('start');
  });
});
