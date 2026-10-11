/**
 * Marketing: hype built during development, the yearly GameExpo, and pushes for
 * games already on sale. Definitions and formulas live here; the actions that
 * change the game state are in sim.ts.
 */
import { friendly, priceIndex } from './economy';
import { yearOf } from './time';
import type { GameState, SizeId } from './types';

/** Hype is 0..100. It fades a little every week until launch, unless the game is shaping up well. */
export const MAX_HYPE = 100;
export const HYPE_DECAY = 0.97;

/** How far word of mouth alone can carry hype, and how fast it gets there. */
export const BUZZ_MAX_HYPE = 60;
export const BUZZ_PER_WEEK = 1;

/**
 * Hype after a week of development. `ratio` is the game's points per week so
 * far against what the market expects. A game ahead of expectations gets word
 * of mouth: its hype grows each week towards a level that rises with how far
 * ahead it is. Hype above that level (or for a game that isn't ahead) fades by
 * `decay` a week.
 */
export function weeklyHype(hype: number, ratio: number, decay = HYPE_DECAY): number {
  const buzz = Math.max(0, Math.min(BUZZ_MAX_HYPE, 200 * (ratio - 1)));
  const next = hype < buzz ? Math.min(buzz, hype + BUZZ_PER_WEEK) : Math.max(buzz, hype * decay);
  return Math.round(next * 10) / 10;
}

export type PromoId = 'preview' | 'trailer' | 'influencers' | 'press_tour' | 'tv_spot';

export interface Promo {
  id: PromoId;
  name: string;
  icon: string;
  desc: string;
  /** Price in 1985 money; rises with the price index. */
  price: number;
  hype: number;
  /** Earliest development phase (0-2) it makes sense in: a trailer needs something to show. */
  fromPhase: number;
  fromYear?: number;
  /** Research that unlocks it (the Marketing Department). */
  research?: string;
}

export const PROMOS: Promo[] = [
  { id: 'preview', name: 'Magazine preview', icon: '📰', desc: 'Give a magazine an early look.', price: 3000, hype: 12, fromPhase: 0 },
  { id: 'trailer', name: 'Trailer', icon: '🎬', desc: 'Cut a trailer from what you have so far.', price: 12000, hype: 25, fromPhase: 1 },
  { id: 'influencers', name: 'Influencer campaign', icon: '📱', desc: 'Send early builds to streamers and video creators.', price: 40000, hype: 40, fromPhase: 1, fromYear: 2006 },
  { id: 'press_tour', name: 'Press tour', icon: '🎤', desc: 'Fly the team around to demo the game to the press.', price: 25000, hype: 30, fromPhase: 0, research: 'marketing' },
  { id: 'tv_spot', name: 'TV commercial', icon: '📺', desc: 'A prime-time ad that puts the game in every living room.', price: 80000, hype: 55, fromPhase: 1, research: 'marketing' },
];

export function promoById(id: string): Promo {
  const p = PROMOS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown promo ${id}`);
  return p;
}

/** Promos are sized to the game: a small game's preview is a short magazine piece, a large game's a cover story. */
export const PROMO_SIZE_SCALE: Record<SizeId, number> = { small: 0.4, medium: 1, large: 2.5 };

export function promoPrice(state: Pick<GameState, 'week' | 'activity'>, id: PromoId): number {
  const size = state.activity?.kind === 'game' ? state.activity.size : 'medium';
  return friendly(promoById(id).price * PROMO_SIZE_SCALE[size] * priceIndex(state.week));
}

/**
 * What hype does at launch. Well-reviewed games ride it (up to +40% sales and
 * extra fans); mediocre ones get part of it; a flop that was hyped up gets a
 * backlash (fewer sales and lost fans) that grows with the hype. A game that
 * also has a big ad campaign (`adMult` > 1) gets less from hype, because
 * players have heard of it already.
 */
export function hypeEffect(hype: number, score: number, adMult = 1): { salesMult: number; fansMult: number } {
  const h = Math.max(0, Math.min(MAX_HYPE, hype)) / MAX_HYPE;
  const boost = (0.4 * h) / adMult;
  if (score >= 7) return { salesMult: 1 + boost, fansMult: 1 + 0.6 * h };
  if (score >= 5) return { salesMult: 1 + boost * ((score - 5) / 2), fansMult: 1 };
  // Below 5: the more people were promised, the angrier they are.
  const letdown = ((5 - score) / 4) * h;
  return { salesMult: 1 - 0.35 * letdown, fansMult: 1 - 1.5 * letdown };
}

// ---------------------------------------------------------------------------
// GameExpo: once a year, mid-year.

/** Week of the year (0-based) the expo opens, and how early booths can be booked. */
export const EXPO_WEEK = 24;
export const EXPO_BOOKING_WEEKS = 8;

export type BoothId = 'small' | 'medium' | 'big';

export interface Booth {
  id: BoothId;
  name: string;
  price: number;
  hype: number;
  /** Fans won, before scaling with the studio's reputation. */
  fans: number;
}

export const BOOTHS: Booth[] = [
  { id: 'small', name: 'Small booth', price: 5000, hype: 15, fans: 300 },
  { id: 'medium', name: 'Medium booth', price: 20000, hype: 30, fans: 1000 },
  { id: 'big', name: 'Big stage booth', price: 60000, hype: 50, fans: 3000 },
];

export function boothById(id: string): Booth {
  const b = BOOTHS.find((x) => x.id === id);
  if (!b) throw new Error(`Unknown booth ${id}`);
  return b;
}

export function boothPrice(state: Pick<GameState, 'week'>, id: BoothId): number {
  return friendly(boothById(id).price * priceIndex(state.week));
}

/** Weeks until this year's expo, or null when it's already happened this year. */
export function weeksToExpo(state: Pick<GameState, 'week'>, weeksPerYear: number): number | null {
  const w = state.week % weeksPerYear;
  return w <= EXPO_WEEK ? EXPO_WEEK - w : null;
}

export function expoYear(state: Pick<GameState, 'week'>): number {
  return yearOf(state.week);
}

// ---------------------------------------------------------------------------
// After launch: pushes for a game that's still selling.

export type SalesPushId = 'ads' | 'sale' | 'tv_ads';

export interface SalesPush {
  id: SalesPushId;
  name: string;
  icon: string;
  desc: string;
  /** Price in 1985 money (0 = free). */
  price: number;
  research?: string;
}

export const SALES_PUSHES: SalesPush[] = [
  { id: 'ads', name: 'Ad push', icon: '📣', desc: '+15% on the copies it has left to sell.', price: 10000 },
  { id: 'sale', name: 'Discount sale', icon: '🏷️', desc: '40% off for the rest of its run: 70% more copies and more new fans.', price: 0 },
  { id: 'tv_ads', name: 'TV ad blitz', icon: '📺', desc: '+35% on the copies it has left to sell.', price: 60000, research: 'marketing' },
];

export function salesPushById(id: string): SalesPush {
  const p = SALES_PUSHES.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown sales push ${id}`);
  return p;
}

export function salesPushPrice(state: Pick<GameState, 'week'>, id: SalesPushId): number {
  return friendly(salesPushById(id).price * priceIndex(state.week));
}
