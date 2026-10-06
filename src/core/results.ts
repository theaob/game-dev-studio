/** How a released game did: what it cost, what it made, and how successful it was. */
import { SALES_WEEKS } from './sim';
import type { ReleasedGame } from './types';

/** Everything spent on the game. Old saves only know the production cost. */
export function totalCost(g: ReleasedGame): number {
  const s = g.spend;
  return s ? s.budget + s.marketing + s.team : g.cost;
}

export function profit(g: ReleasedGame): number {
  return g.revenue - totalCost(g);
}

export function onSale(g: ReleasedGame): boolean {
  return g.weeksOnMarket < SALES_WEEKS;
}

/** Expected lifetime revenue: what it made so far plus the copies it is still expected to sell. */
export function projectedRevenue(g: ReleasedGame): number {
  return g.revenue + Math.max(0, g.targetUnits - g.unitsSold) * g.unitPrice;
}

export interface Verdict {
  id: 'blockbuster' | 'hit' | 'success' | 'even' | 'flop';
  label: string;
  icon: string;
}

export const VERDICTS: Verdict[] = [
  { id: 'blockbuster', label: 'Blockbuster', icon: '🏆' },
  { id: 'hit', label: 'Hit', icon: '⭐' },
  { id: 'success', label: 'Success', icon: '👍' },
  { id: 'even', label: 'Broke even', icon: '😐' },
  { id: 'flop', label: 'Flop', icon: '💸' },
];

/** Revenue as a multiple of cost: 1 = broke even. Uses the projection while the game is still selling. */
export function returnMultiple(g: ReleasedGame): number {
  const cost = totalCost(g);
  const revenue = onSale(g) ? projectedRevenue(g) : g.revenue;
  return cost > 0 ? revenue / cost : Infinity;
}

export function verdict(g: ReleasedGame): Verdict {
  const m = returnMultiple(g);
  const id = m >= 5 ? 'blockbuster' : m >= 2.5 ? 'hit' : m >= 1.2 ? 'success' : m >= 0.9 ? 'even' : 'flop';
  return VERDICTS.find((v) => v.id === id)!;
}

/** Cumulative revenue at the end of each week on the market (index 0 = launch, before any sales). */
export function cumulativeRevenue(g: ReleasedGame): number[] {
  const out = [0];
  for (const r of g.weekly?.revenue ?? []) out.push(out[out.length - 1] + r);
  return out;
}

/** The week on the market in which the game paid back its cost, or null if it hasn't (or isn't known). */
export function paybackWeek(g: ReleasedGame): number | null {
  const cost = totalCost(g);
  const cum = cumulativeRevenue(g);
  for (let w = 1; w < cum.length; w++) if (cum[w] >= cost) return w;
  return null;
}

/** 1-based rank among all releases by revenue. */
export function revenueRank(games: ReleasedGame[], g: ReleasedGame): number {
  return games.filter((x) => x.revenue > g.revenue).length + 1;
}
