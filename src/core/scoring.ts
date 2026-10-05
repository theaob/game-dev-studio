import { genreById, platformById, platformGenreFit, sizeById, topicFit } from './data';
import { gaussian, type RngHolder } from './rng';
import { yearFraction, START_YEAR } from './time';
import type { GameProject, GameState } from './types';

export const FIT_MULT = [0.6, 0.85, 1.0, 1.15];

export function normalizeFocus(raw: number[]): number[] {
  const total = raw.reduce((a, b) => a + Math.max(0, b), 0);
  if (total <= 0) return raw.map(() => 1 / raw.length);
  return raw.map((v) => Math.max(0, v) / total);
}

/**
 * How well a phase's focus matches the genre's priorities. 0 = worst possible,
 * 1 = best possible. Leaving an important area almost empty is penalised.
 */
export function phaseAlignment(genreImportance: number[], phase: number, rawFocus: number[]): number {
  const f = normalizeFocus(rawFocus);
  const imp = genreImportance.slice(phase * 3, phase * 3 + 3);
  const min = Math.min(...imp);
  const max = Math.max(...imp);
  const value = f.reduce((acc, share, i) => acc + share * imp[i], 0);
  let align = max === min ? 1 : (value - min) / (max - min);
  f.forEach((share, i) => {
    if (share < 0.12 && imp[i] >= 1) align -= 0.15;
  });
  return Math.max(0, Math.min(1, align));
}

/** The market's expectation of points-per-week: rises over time and with your own best work. */
export function benchmark(state: Pick<GameState, 'week' | 'bestPPW'>): number {
  const years = yearFraction(state.week) - START_YEAR;
  return Math.max(3 * Math.pow(1.07, years), state.bestPPW * 0.9);
}

export interface Evaluation {
  ppw: number;
  pointsRatio: number;
  fit: number;
  fitMult: number;
  align: number;
  alignMult: number;
  designShare: number;
  designTarget: number;
  balanceMult: number;
  bugRatio: number;
  bugMult: number;
  repeatMult: number;
  staffMult: number;
  platformMult: number;
  quality: number;
  score: number;
}

export function evaluate(state: GameState, project: GameProject): Evaluation {
  const genre = genreById(project.genre);
  const size = sizeById(project.size);
  const devWeeks = project.phaseWeeks * 3;
  const total = project.design + project.tech;
  const ppw = total / devWeeks;
  const pointsRatio = ppw / benchmark(state);

  const fit = topicFit(project.topic, project.genre);
  const fitMult = FIT_MULT[fit];

  const align = [0, 1, 2].reduce((a, p) => a + phaseAlignment(genre.importance, p, project.focus[p]), 0) / 3;
  const alignMult = 0.75 + 0.4 * align;

  const designShare = total > 0 ? project.design / total : 0.5;
  const balanceMult = clamp(1.06 - Math.abs(designShare - genre.designTarget) * 1.6, 0.65, 1.06);

  const bugRatio = total > 0 ? project.bugs / total : 0;
  const bugMult = clamp(1 - bugRatio * 2.2, 0.55, 1);

  const recent = state.released.slice(-3);
  let repeatMult = 1;
  if (recent.some((g) => g.topic === project.topic && g.genre === project.genre)) repeatMult = 0.85;
  else if (recent.length && recent[recent.length - 1].genre === project.genre) repeatMult = 0.95;

  const staffMult = state.staff.length < size.minStaff ? 0.9 - 0.05 * (size.minStaff - state.staff.length) : 1;
  const platformMult = Math.sqrt(platformGenreFit(platformById(project.platform), project.genre));

  const quality = pointsRatio * fitMult * alignMult * balanceMult * bugMult * repeatMult * Math.max(0.6, staffMult) * platformMult;
  const score = clamp(1 + 9 * (1 - Math.exp(-1.15 * quality)), 1, 10);

  return {
    ppw,
    pointsRatio,
    fit,
    fitMult,
    align,
    alignMult,
    designShare,
    designTarget: genre.designTarget,
    balanceMult,
    bugRatio,
    bugMult,
    repeatMult,
    staffMult,
    platformMult,
    quality,
    score,
  };
}

/** Four reviewers, each with their own opinion around the true score. */
export function rollReviews(rng: RngHolder, score: number): number[] {
  return [0, 1, 2, 3].map(() => clamp(Math.round(score + gaussian(rng) * 0.6), 1, 10));
}

export function average(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function scoreFactor(score: number): number {
  return Math.pow(Math.max(0, (score - 1) / 9), 2.6);
}
