/**
 * Rewards for watching an optional video ad (Android app only). Each one has a
 * cooldown in game weeks, so they help without replacing the real economy.
 */
import { friendly, priceIndex } from './economy';
import { boostWeeks, monthlyCosts, notify, weeklyRp } from './sim';
import type { GameState } from './types';

export type RewardId = 'investor' | 'espresso' | 'research';

export interface Reward {
  id: RewardId;
  icon: string;
  name: string;
  desc: string;
  /** Game weeks before it can be claimed again. */
  cooldown: number;
}

export const REWARDS: Reward[] = [
  { id: 'investor', icon: '💼', name: 'Investor visit', desc: 'An angel investor tops up your cash.', cooldown: 12 },
  { id: 'espresso', icon: '☕', name: 'Free Espresso Bar', desc: 'Four weeks of +20% design and tech points, on the house.', cooldown: 8 },
  { id: 'research', icon: '🔬', name: 'Research grant', desc: 'A university shares its findings with your team.', cooldown: 12 },
];

/** Espresso Bar weeks a reward gives (the same as buying it). */
const ESPRESSO_WEEKS = 4;

export function rewardById(id: string): Reward {
  const r = REWARDS.find((x) => x.id === id);
  if (!r) throw new Error(`Unknown reward ${id}`);
  return r;
}

/** Cash from an investor: about a month of running costs, never less than a small studio's. */
export function investorCash(state: GameState): number {
  return friendly(Math.max(monthlyCosts(state), 6000 * priceIndex(state.week)));
}

/** RP from a research grant: about eight weeks of development. */
export function researchGrant(state: GameState): number {
  return Math.max(10, Math.round(weeklyRp(state) * 8));
}

/** What the reward gives right now, for the button label. */
export function rewardAmount(state: GameState, id: RewardId): string {
  if (id === 'investor') return `+$${investorCash(state).toLocaleString('en-US')}`;
  if (id === 'research') return `+${researchGrant(state)} RP`;
  return `+${ESPRESSO_WEEKS} weeks`;
}

/** Game weeks until a reward can be claimed again (0 = now). */
export function rewardCooldown(state: GameState, id: RewardId): number {
  const last = state.adRewards?.[id];
  if (last === undefined) return 0;
  return Math.max(0, last + rewardById(id).cooldown - state.week);
}

/** Why a reward can't be claimed right now, or null if it can. */
export function rewardBlocker(state: GameState, id: RewardId): string | null {
  if (state.over) return 'The game is over.';
  const wait = rewardCooldown(state, id);
  if (wait > 0) return `Available again in ${wait} week${wait === 1 ? '' : 's'}.`;
  if (id === 'espresso' && state.activity?.kind !== 'game') return 'Only while making a game.';
  return null;
}

/** Gives the reward (call once the ad has been watched). Returns an error message, or null on success. */
export function claimReward(state: GameState, id: RewardId): string | null {
  const blocked = rewardBlocker(state, id);
  if (blocked) return blocked;
  if (id === 'investor') {
    const cash = investorCash(state);
    state.cash += cash;
    notify(state, `An investor believes in you: +$${cash.toLocaleString('en-US')}.`, 'good');
  } else if (id === 'research') {
    const rp = researchGrant(state);
    state.rp += rp;
    notify(state, `Research grant: +${rp} RP.`, 'good');
  } else {
    state.boosts = { ...state.boosts, coffee: boostWeeks(state, 'coffee') + ESPRESSO_WEEKS };
    notify(state, `Free Espresso Bar for ${ESPRESSO_WEEKS} weeks!`, 'good');
  }
  state.adRewards = { ...state.adRewards, [id]: state.week };
  return null;
}

/** Months of running costs (at least a small studio's) a bailout leaves in the bank once the debt is paid off. */
export const BAILOUT_MONTHS = 3;

/** A bailout pays off the debt and leaves a few months of running costs, so the studio has time to recover. */
export function bailoutCash(state: GameState): number {
  return friendly(Math.max(0, -state.cash) + BAILOUT_MONTHS * investorCash(state));
}

/** The first bankruptcy in a save can be undone once by watching a video. */
export function canBailout(state: GameState): boolean {
  return state.over === 'bankrupt' && !state.bailoutUsed;
}

/** Rescues a bankrupt studio (call once the ad has been watched). Returns an error message, or null on success. */
export function claimBailout(state: GameState): string | null {
  if (!canBailout(state)) return state.bailoutUsed ? 'You have already had your bailout.' : 'The studio is not bankrupt.';
  const cash = bailoutCash(state);
  state.cash += cash;
  state.debtStrikes = 0;
  state.over = null;
  state.bailoutUsed = true;
  notify(state, `A bailout saved the studio: +$${cash.toLocaleString('en-US')}. There won't be another one!`, 'good');
  return null;
}
