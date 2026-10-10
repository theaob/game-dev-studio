/**
 * Late-game spending for a studio that has outgrown the Store: big investments
 * that help forever, and buying rival studios. Both open up once the studio has
 * moved to the Campus, when there's nothing else left to buy.
 */
import { friendly, priceIndex } from './economy';
import { headline, activeRivals, RIVALS } from './industry';
import { notify, rockstarCandidate } from './sim';
import { yearOf } from './time';
import { sizeById } from './data';
import type { GameState, SizeId } from './types';

/** Big investments and acquisitions need the Campus. */
export const VENTURE_OFFICE = 3;

export type VentureId = 'mocap' | 'engine_team' | 'publishing' | 'esports';

export interface Venture {
  id: VentureId;
  name: string;
  icon: string;
  desc: string;
  /** Price in 1985 dollars; rises with the years like everything else. */
  price: number;
  fromYear?: number;
}

export const VENTURES: Venture[] = [
  { id: 'mocap', name: 'Motion Capture Stage', icon: '🎬', desc: 'Actors in dotted suits make jaw-dropping trailers: promos and GameExpo build 25% more hype.', price: 1_500_000, fromYear: 1995 },
  { id: 'engine_team', name: 'Engine Division', icon: '⚙️', desc: 'A team that only works on your in-house engine: large games take a week less per phase to make.', price: 4_000_000 },
  { id: 'esports', name: 'Esports League', icon: '🏟️', desc: 'Stadium tournaments for your games: 15% more fans from every copy sold.', price: 6_000_000, fromYear: 2005 },
  { id: 'publishing', name: 'Worldwide Publishing', icon: '🌍', desc: 'Your own offices on every continent: every new release sells 10% more copies.', price: 10_000_000 },
];

/** What the ventures give when owned. */
export const MOCAP_HYPE = 1.25;
export const ENGINE_TEAM_WEEKS_SAVED = 1;
export const PUBLISHING_SALES = 1.1;
export const ESPORTS_FANS = 1.15;

export function ventureById(id: string): Venture {
  const v = VENTURES.find((x) => x.id === id);
  if (!v) throw new Error(`Unknown venture ${id}`);
  return v;
}

export function hasVenture(state: GameState, id: VentureId): boolean {
  return state.ventures?.includes(id) ?? false;
}

/** Hype multiplier for promos and GameExpo booths. */
export function ventureHypeMult(state: GameState): number {
  return hasVenture(state, 'mocap') ? MOCAP_HYPE : 1;
}

/** Development weeks per phase for a new game of this size. */
export function phaseWeeks(state: GameState, size: SizeId): number {
  const weeks = sizeById(size).phaseWeeks;
  return size === 'large' && hasVenture(state, 'engine_team') ? weeks - ENGINE_TEAM_WEEKS_SAVED : weeks;
}

export function venturePrice(state: GameState, id: VentureId): number {
  return friendly(ventureById(id).price * priceIndex(state.week));
}

function campusBlocker(state: GameState): string | null {
  return state.officeLevel < VENTURE_OFFICE ? 'Needs the Campus.' : null;
}

/** Why a venture can't be bought right now, or null if it can. */
export function ventureBlocker(state: GameState, id: VentureId): string | null {
  const v = ventureById(id);
  if (hasVenture(state, id)) return 'Already owned.';
  const campus = campusBlocker(state);
  if (campus) return campus;
  if (v.fromYear && yearOf(state.week) < v.fromYear) return `Available from ${v.fromYear}.`;
  if (venturePrice(state, id) > state.cash) return 'Not enough cash.';
  return null;
}

export function buyVenture(state: GameState, id: VentureId): string | null {
  const blocked = ventureBlocker(state, id);
  if (blocked) return blocked;
  const v = ventureById(id);
  state.cash -= venturePrice(state, id);
  state.ventures = [...(state.ventures ?? []), id];
  headline(state, v.icon, `${state.studioName} opens its own ${v.name}.`, 'good');
  return null;
}

// ---------------------------------------------------------------------------
// Acquisitions: buy out a rival studio. It stops competing (no more rival hits
// stealing your sales, one less contender for Game of the Year), its fans become
// yours, and its star developer asks to join you.

/** Share of your fans a bought studio brings (scaled by its quality), and the least it brings. */
export const ACQUIRE_FANS_SHARE = 0.03;
export const ACQUIRE_MIN_FANS = 10_000;
export const ACQUIRE_RP = 50;

/** Rivals that are open for business and haven't been bought yet. */
export function acquirableRivals(state: GameState) {
  const owned = state.acquired ?? [];
  return activeRivals(yearOf(state.week)).filter((r) => !owned.includes(r.name));
}

function rivalByName(name: string) {
  return RIVALS.find((r) => r.name === name);
}

/** Better studios cost more: about $7M for a 7.0 studio, in 1985 dollars. */
export function acquisitionPrice(state: GameState, name: string): number {
  const r = rivalByName(name);
  if (!r) return 0;
  return friendly(r.quality * r.quality * 150_000 * priceIndex(state.week));
}

export function acquisitionFans(state: GameState, name: string): number {
  const r = rivalByName(name);
  if (!r) return 0;
  return Math.round(Math.max(ACQUIRE_MIN_FANS, state.fans * ACQUIRE_FANS_SHARE) * (r.quality / 7));
}

export function acquireBlocker(state: GameState, name: string): string | null {
  if (!rivalByName(name)) return 'Unknown studio.';
  if (state.acquired?.includes(name)) return 'Already yours.';
  const campus = campusBlocker(state);
  if (campus) return campus;
  if (!acquirableRivals(state).some((r) => r.name === name)) return 'Not open for business.';
  if (acquisitionPrice(state, name) > state.cash) return 'Not enough cash.';
  return null;
}

export function acquireRival(state: GameState, name: string): string | null {
  const blocked = acquireBlocker(state, name);
  if (blocked) return blocked;
  const price = acquisitionPrice(state, name);
  const fans = acquisitionFans(state, name);
  state.cash -= price;
  state.fans += fans;
  state.rp += ACQUIRE_RP;
  state.acquired = [...(state.acquired ?? []), name];
  const star = rockstarCandidate(state);
  state.candidates.unshift(star);
  headline(state, '🤝', `${state.studioName} buys ${name} for $${price.toLocaleString('en-US')}.`, 'good');
  notify(state, `${name} is yours! +${fans.toLocaleString('en-US')} fans, +${ACQUIRE_RP} RP, and their star developer ${star.name} wants to join you (see the Team tab).`, 'good');
  return null;
}
