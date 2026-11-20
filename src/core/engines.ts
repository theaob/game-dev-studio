/**
 * Custom engines. Research unlocks engine features (Smooth Scrolling, 3D Graphics,
 * Physics...), but a feature does nothing until the studio builds it into an engine:
 * a development project of its own that takes the whole team some weeks and costs
 * money, with nothing to sell at the end. Every game then picks the engine it's made
 * with, and gets the tech points of that engine's features.
 */
import { RESEARCH, type ResearchItem } from './data';
import { friendly, priceIndex } from './economy';
import { notify, weeklyRp, wholeNumber } from './sim';
import { hasVenture } from './ventures';
import type { Engine, EngineProject, GameState, SimEvent } from './types';

/** All engine features, in research order. */
export const ENGINE_FEATURES: ResearchItem[] = RESEARCH.filter((r) => r.category === 'Engine features');

/** Weeks to build an engine: a base, plus more for every feature (for a solo founder; a team is faster). */
export const ENGINE_BASE_WEEKS = 2;
export const ENGINE_WEEKS_PER_FEATURE = 2;
export const ENGINE_MIN_WEEKS = 3;
/** What an engine costs in 1985 dollars: tools and licences, plus more for every feature. */
export const ENGINE_BASE_COST = 5000;
export const ENGINE_COST_PER_FEATURE = 8000;
/** The Engine Division builds engines in half the time. */
export const ENGINE_TEAM_SPEEDUP = 0.5;

export function isEngineFeature(id: string): boolean {
  return ENGINE_FEATURES.some((f) => f.id === id);
}

export function featureById(id: string): ResearchItem {
  const f = ENGINE_FEATURES.find((x) => x.id === id);
  if (!f) throw new Error(`Unknown engine feature ${id}`);
  return f;
}

/** Engine features the studio has researched, so it can build them into an engine. */
export function unlockedFeatures(state: GameState): ResearchItem[] {
  return ENGINE_FEATURES.filter((f) => state.researched.includes(f.id));
}

/** Tech points multiplier of an engine with these features: each feature's bonus multiplies the others. */
export function engineTechMult(features: readonly string[]): number {
  return features.reduce((m, id) => m * (1 + (ENGINE_FEATURES.find((f) => f.id === id)?.engineTech ?? 0)), 1);
}

/** Extra tech points (0.15 = +15%) an engine with these features gives. */
export function engineTechBonus(features: readonly string[]): number {
  return engineTechMult(features) - 1;
}

/** The tech bonus as a label: "+32% tech". */
export function engineTechLabel(features: readonly string[]): string {
  return `+${Math.round(engineTechBonus(features) * 100)}% tech`;
}

export function engineById(state: GameState, id: number | undefined): Engine | undefined {
  return id === undefined ? undefined : state.engines?.find((e) => e.id === id);
}

/** The engine with the most tech, the newest one on a tie. */
export function bestEngine(state: GameState): Engine | undefined {
  let best: Engine | undefined;
  for (const e of state.engines ?? []) if (!best || engineTechBonus(e.features) >= engineTechBonus(best.features)) best = e;
  return best;
}

/** Researched features that none of the studio's engines has yet: a reason to build a new one. */
export function featuresNotBuilt(state: GameState): ResearchItem[] {
  const built = new Set((state.engines ?? []).flatMap((e) => e.features));
  return unlockedFeatures(state).filter((f) => !built.has(f.id));
}

/** Weeks the current team needs to build an engine with this many features. */
export function engineWeeks(state: GameState, features: number): number {
  const team = Math.max(1, state.staff.length);
  const speed = hasVenture(state, 'engine_team') ? ENGINE_TEAM_SPEEDUP : 1;
  return Math.max(ENGINE_MIN_WEEKS, Math.round(((ENGINE_BASE_WEEKS + ENGINE_WEEKS_PER_FEATURE * features) / Math.sqrt(team)) * speed));
}

/** What building an engine with this many features costs today. */
export function engineCost(state: Pick<GameState, 'week'>, features: number): number {
  return friendly((ENGINE_BASE_COST + ENGINE_COST_PER_FEATURE * features) * priceIndex(state.week));
}

/** Why this engine can't be started right now, or null if it can. */
export function engineBlocker(state: GameState, name: string, features: readonly string[]): string | null {
  if (state.over) return 'The game is over.';
  if (state.activity) return 'Your team is busy.';
  if (!name.trim()) return 'Give your engine a name.';
  if (!features.length) return 'Pick at least one feature.';
  if (new Set(features).size !== features.length) return 'A feature can only go in once.';
  for (const id of features) {
    if (!isEngineFeature(id)) return 'Unknown engine feature.';
    if (!state.researched.includes(id)) return `${featureById(id).name} isn't researched yet.`;
  }
  const cost = engineCost(state, features.length);
  if (cost > state.cash) return `You need $${cost.toLocaleString('en-US')} to build this engine.`;
  return null;
}

/** Starts building an engine. Returns an error message, or null on success. */
export function startEngine(state: GameState, name: string, features: readonly string[]): string | null {
  const err = engineBlocker(state, name, features);
  if (err) return err;
  const cost = engineCost(state, features.length);
  state.cash -= cost;
  // Keep the features in research order, however they were picked.
  const ordered = ENGINE_FEATURES.map((f) => f.id).filter((id) => features.includes(id));
  state.activity = { kind: 'engine', name: name.trim(), features: ordered, startedWeek: state.week, weeks: engineWeeks(state, ordered.length), weeksDone: 0, cost };
  return null;
}

/** A week of engine work: the team learns as it goes (research points like a game week) until the engine is done. */
export function tickEngine(state: GameState, p: EngineProject, events: SimEvent[]): void {
  p.weeksDone++;
  state.rp = Math.floor(state.rp) + wholeNumber(state, weeklyRp(state));
  if (p.weeksDone < p.weeks) return;
  const engine: Engine = { id: nextEngineId(state), name: p.name, features: p.features, builtWeek: state.week };
  (state.engines ??= []).push(engine);
  state.activity = null;
  notify(state, `${engine.name} is ready: +${Math.round(engineTechBonus(engine.features) * 100)}% tech points in games made with it.`, 'good');
  events.push({ type: 'engineDone', engine });
}

function nextEngineId(state: GameState): number {
  return Math.max(0, ...(state.engines ?? []).map((e) => e.id)) + 1;
}

/** Name ideas for a new engine: the studio's first word, an engine-ish word, and a version number. */
const ENGINE_WORDS = ['Engine', 'Tech', 'Forge', 'Core', 'Motor', 'Works', 'Kit', 'Frame'];

export function suggestEngineName(state: GameState, rand: () => number = Math.random): string {
  const base = state.studioName.trim().split(/\s+/)[0] || 'Studio';
  const word = ENGINE_WORDS[Math.floor(rand() * ENGINE_WORDS.length)];
  const version = (state.engines?.length ?? 0) + 1;
  return `${base} ${word}${version > 1 ? ` ${version}` : ''}`.slice(0, 32);
}

/**
 * Saves from before custom engines: the engine upgrades they researched were global
 * tech bonuses. They become one ready-built engine with those features, and a game in
 * development keeps using it, so nobody loses anything.
 */
export function migrateEngines(state: GameState): void {
  if (state.engines) return;
  state.engines = [];
  const features = ENGINE_FEATURES.map((f) => f.id).filter((id) => state.researched.includes(id));
  if (!features.length) return;
  const engine: Engine = { id: 1, name: suggestEngineName(state, () => 0), features, builtWeek: state.week };
  state.engines.push(engine);
  if (state.activity?.kind === 'game' && state.activity.engine === undefined) state.activity.engine = engine.id;
}
