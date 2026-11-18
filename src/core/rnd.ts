/**
 * R&D projects: research that never runs out. Once the studio has the last level
 * of an engine, design or QA line, it can keep investing research points in it,
 * one level at a time, each costing more than the last. This gives research
 * points a use in the second half of a career, when the research tree is done.
 */
import { notify } from './sim';
import type { GameState } from './types';

export type RndId = 'rnd_engine' | 'rnd_design' | 'rnd_qa';

export interface RndProject {
  id: RndId;
  name: string;
  icon: string;
  /** What one level does, for the Research tab. */
  perLevel: string;
  /** Research that has to be done first: the last level of its line. */
  requires: string;
  /** RP for level 1; each level costs RND_COST_GROWTH times the one before. */
  baseCost: number;
}

export const RND: RndProject[] = [
  { id: 'rnd_engine', name: 'Engine R&D', icon: '⚙️', perLevel: '+4% tech points', requires: 'engine4', baseCost: 250 },
  { id: 'rnd_design', name: 'Design R&D', icon: '✏️', perLevel: '+4% design points', requires: 'design3', baseCost: 250 },
  { id: 'rnd_qa', name: 'QA R&D', icon: '🔍', perLevel: '6% fewer bugs', requires: 'qa2', baseCost: 200 },
];

export const RND_COST_GROWTH = 1.6;
/** Extra tech or design points per Engine or Design R&D level. */
export const RND_POINTS_PER_LEVEL = 0.04;
/** What's left of the bugs after each QA R&D level. */
export const RND_BUGS_PER_LEVEL = 0.94;

export function rndById(id: string): RndProject {
  const r = RND.find((x) => x.id === id);
  if (!r) throw new Error(`Unknown R&D project ${id}`);
  return r;
}

export function rndLevel(state: Pick<GameState, 'rnd'>, id: RndId): number {
  return state.rnd?.[id] ?? 0;
}

/** RP for the next level. */
export function rndCost(state: Pick<GameState, 'rnd'>, id: RndId): number {
  return Math.round(rndById(id).baseCost * Math.pow(RND_COST_GROWTH, rndLevel(state, id)));
}

export function rndTechMult(state: Pick<GameState, 'rnd'>): number {
  return 1 + RND_POINTS_PER_LEVEL * rndLevel(state, 'rnd_engine');
}

export function rndDesignMult(state: Pick<GameState, 'rnd'>): number {
  return 1 + RND_POINTS_PER_LEVEL * rndLevel(state, 'rnd_design');
}

export function rndBugMult(state: Pick<GameState, 'rnd'>): number {
  return Math.pow(RND_BUGS_PER_LEVEL, rndLevel(state, 'rnd_qa'));
}

/** Why the next level can't be researched right now, or null if it can. */
export function rndBlocker(state: GameState, id: RndId): string | null {
  const r = rndById(id);
  if (!state.researched.includes(r.requires)) return 'Opens once the last level of its research line is done.';
  if (state.rp < rndCost(state, id)) return 'Not enough research points.';
  return null;
}

/** Researches the next level of an R&D project. Returns an error message, or null on success. */
export function doRnd(state: GameState, id: RndId): string | null {
  const err = rndBlocker(state, id);
  if (err) return err;
  state.rp -= rndCost(state, id);
  const level = rndLevel(state, id) + 1;
  state.rnd = { ...state.rnd, [id]: level };
  notify(state, `${rndById(id).name} reached level ${level}.`, 'good');
  return null;
}
