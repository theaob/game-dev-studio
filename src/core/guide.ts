import type { GameState } from './types';

/**
 * The guided first game: a coach card that walks a new player through their first
 * release, one step at a time. Progress lives in the save (`state.guide`); once it's
 * finished or skipped the device remembers, so later studios start without it.
 */
export type GuideStep =
  | 'start' // studio, nothing on: tap New Game
  | 'concept' // new game, step 1: genre, topic, title
  | 'setup' // new game, step 2: platform, size, marketing
  | 'focus' // the first focus sheet
  | 'develop' // the game is in development (studio screen)
  | 'phase' // the focus sheet for phases 2 and 3
  | 'polish' // feature complete: polish or release
  | 'release' // polishing on the studio screen
  | 'reviews' // the review sheet
  | 'next'; // the first game is out: what to do next

/** Steps shown on the studio screen that stay until the player taps "Got it". */
export const DISMISSABLE: GuideStep[] = ['develop', 'next'];

/** Where the player is: the open sheet (if any) and the tab. */
export interface GuideView {
  sheet?: { kind: string; step?: number; spec?: boolean } | null;
  tab: string;
}

export function guideActive(state: GameState | null): boolean {
  return !!state?.guide && !state.guide.done && !state.over;
}

/** Starts the guide for a new studio (unless this device has already been through it). */
export function startGuide(state: GameState, deviceDone: boolean): void {
  if (!deviceDone) state.guide = { seen: [] };
}

/** Which coach card to show, if any. */
export function guideStep(state: GameState | null, view: GuideView): GuideStep | null {
  if (!state || !guideActive(state)) return null;
  const seen = state.guide!.seen ?? [];
  const sheet = view.sheet;
  const first = state.released.length === 0;
  if (sheet) {
    if (sheet.kind === 'review' && state.released.length === 1) return 'reviews';
    if (!first) return null;
    if (sheet.kind === 'newGame') return sheet.step === 2 ? 'setup' : 'concept';
    if (sheet.kind === 'focus') return sheet.spec ? 'focus' : seen.includes('phase') ? null : 'phase';
    if (sheet.kind === 'devComplete') return 'polish';
    return null;
  }
  if (view.tab !== 'studio') return null;
  if (!first) return 'next';
  const a = state.activity;
  if (!a) return 'start';
  if (a.kind !== 'game') return null;
  if (a.phase >= 3) return 'release';
  return seen.includes('develop') ? null : 'develop';
}

/** The player tapped "Got it" on a card (or a sheet card was shown once). */
export function markGuideSeen(state: GameState, step: GuideStep): void {
  if (!state.guide) return;
  const seen = (state.guide.seen ??= []);
  if (!seen.includes(step)) seen.push(step);
  if (step === 'next') state.guide.done = true;
}

export function skipGuide(state: GameState): void {
  if (state.guide) state.guide.done = true;
}
