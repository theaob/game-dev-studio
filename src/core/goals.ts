/**
 * Studio goals: three short objectives at a time, picked from the studio's state
 * and era, so there is always something near to aim for between offices. Each
 * one pays cash, research points or fans, and a new goal takes its place.
 * Goals start once the first game is out; only what happens after a goal is set
 * counts towards it.
 */
import { OFFICES, PLATFORMS, RESEARCH, TOPICS, genreById, isPlatformAvailable, platformById, topicById } from './data';
import { friendly, priceIndex } from './economy';
import { BOOTHS, EXPO_WEEK, boothPrice, type BoothId } from './marketing';
import { random } from './rng';
import { sequelCandidates } from './sequels';
import { availableGenres, availablePlatforms, monthlyCosts, officeCapacity, researchBlocker, weeklyRp } from './sim';
import { WEEKS_PER_YEAR, yearFraction, yearOf } from './time';
import type { GameState, ReleasedGame } from './types';

export const GOAL_SLOTS = 3;
/** Weeks to finish a goal, by difficulty (1 = a year, 3 = two years). */
export const GOAL_WEEKS = [0, 48, 72, 96];
/** Weeks between swaps: the player can trade one goal they don't fancy for a new one. */
export const GOAL_SWAP_WEEKS = 24;

export type GoalKind = 'hit' | 'acclaim' | 'fans' | 'cash' | 'sequel' | 'booth' | 'platform' | 'combo' | 'trend' | 'sales' | 'team' | 'research' | 'office';
export type GoalRewardKind = 'cash' | 'rp' | 'fans';

export interface Goal {
  id: number;
  kind: GoalKind;
  /** The number to reach: a review score, fans, cash, copies, people, research items. */
  target: number;
  /** What the goal is about: a genre, platform, booth or office level, or "genre|topic" for a trend. */
  subject?: string;
  /** Week the goal was set: releases from then on count. */
  since: number;
  /** For counting goals: the count when the goal was set. */
  base?: number;
  /** Last week to do it in: an unfinished goal makes way for a new one. */
  until: number;
  reward: { kind: GoalRewardKind; amount: number };
}

export interface GoalsState {
  active: Goal[];
  /** Goals completed in this career. */
  done: number;
  nextId: number;
  /** Week of the last swap. */
  swapWeek?: number;
  /** Kinds set most recently, so the same goal doesn't come straight back. */
  recent?: GoalKind[];
}

interface Template {
  kind: GoalKind;
  /** 1 = quick, 3 = a real stretch. Scales the reward. */
  difficulty: number;
  /** How often it comes up, among the ones that fit. */
  weight: number;
  /** Preferred reward. */
  reward: GoalRewardKind;
  offer: (s: GameState) => Pick<Goal, 'target' | 'subject' | 'base'> | null;
}

const releasedSince = (s: GameState, g: Goal): ReleasedGame[] => s.released.filter((r) => r.releaseWeek >= g.since);
const bestScore = (s: GameState) => s.released.reduce((a, g) => Math.max(a, g.score), 0);
const researchedCount = (s: GameState) => s.researched.length + s.topics.length;
const researchLeft = (s: GameState) => RESEARCH.filter((r) => !s.researched.includes(r.id)).length + TOPICS.filter((t) => !s.topics.includes(t.id)).length;
const boothRank = (id: string) => BOOTHS.findIndex((b) => b.id === id);

/** A round number at or above `v`: 1,000, 1,500, 2,000, 2,500, 5,000, 10,000... */
export function roundUp(v: number): number {
  if (v <= 0) return 0;
  const mag = 10 ** Math.floor(Math.log10(v));
  for (const step of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (step * mag >= v) return step * mag;
  return 10 * mag;
}

const TEMPLATES: Template[] = [
  {
    kind: 'hit',
    difficulty: 2,
    weight: 3,
    reward: 'cash',
    offer: (s) => {
      const genres = availableGenres(s);
      // Lean towards genres the studio hasn't had a hit in yet.
      const fresh = genres.filter((g) => !s.released.some((r) => r.genre === g.id && r.score >= 7));
      const pool = fresh.length ? fresh : genres;
      const genre = pool[Math.floor(random(s) * pool.length)];
      return { subject: genre.id, target: bestScore(s) >= 8.5 ? 8 : 7 };
    },
  },
  {
    kind: 'acclaim',
    difficulty: 3,
    weight: 1,
    reward: 'fans',
    offer: (s) => (bestScore(s) >= 8 ? { target: 9 } : null),
  },
  {
    kind: 'fans',
    difficulty: 2,
    weight: 2,
    reward: 'cash',
    offer: (s) => ({ target: roundUp(Math.max(1000, s.fans * 1.5)) }),
  },
  {
    kind: 'cash',
    difficulty: 2,
    weight: 1,
    reward: 'rp',
    offer: (s) => (s.cash > 0 ? { target: roundUp(Math.max(s.cash * 1.5, monthlyCosts(s) * 12, 50_000)) } : null),
  },
  {
    kind: 'sequel',
    difficulty: 2,
    weight: 2,
    reward: 'fans',
    offer: (s) => (s.released.length >= 2 && sequelCandidates(s).some((g) => g.score >= 7) ? { target: 1 } : null),
  },
  {
    kind: 'booth',
    difficulty: 1,
    weight: 2,
    reward: 'fans',
    offer: (s) => {
      const year = yearOf(s.week);
      // Not this year if a booth is already booked: that one shouldn't count.
      if (s.expo?.year === year && s.week % WEEKS_PER_YEAR <= EXPO_WEEK) return null;
      const id: BoothId = s.officeLevel >= 2 ? 'big' : s.cash > boothPrice(s, 'medium') * 4 ? 'medium' : 'small';
      return { subject: id, target: 1 };
    },
  },
  {
    kind: 'platform',
    difficulty: 2,
    weight: 2,
    reward: 'cash',
    offer: (s) => {
      const used = new Set(s.released.map((g) => g.platform));
      // A platform with a few years left in it, that the studio has never made a game for.
      const year = yearFraction(s.week);
      const pool = availablePlatforms(s).filter((p) => !used.has(p.id) && (p.end === undefined || p.end - year >= 2));
      if (!pool.length) return null;
      return { subject: pool[Math.floor(random(s) * pool.length)].id, target: 1 };
    },
  },
  {
    kind: 'combo',
    difficulty: 1,
    weight: 2,
    reward: 'rp',
    offer: (s) => ({ base: Object.keys(s.knowledge.combos).length, target: 1 }),
  },
  {
    kind: 'trend',
    difficulty: 2,
    weight: 2,
    reward: 'cash',
    offer: (s) => {
      const t = s.industry?.trend;
      // Only early in the year, so there's time to make a game.
      if (!t || t.year !== yearOf(s.week) || s.week % WEEKS_PER_YEAR > WEEKS_PER_YEAR / 2) return null;
      return { subject: `${t.genre}|${t.topic}`, target: 1 };
    },
  },
  {
    kind: 'sales',
    difficulty: 3,
    weight: 1,
    reward: 'rp',
    offer: (s) => {
      const best = s.released.reduce((a, g) => Math.max(a, g.unitsSold), 0);
      return best >= 1000 ? { target: roundUp(best * 1.2) } : null;
    },
  },
  {
    kind: 'team',
    difficulty: 1,
    weight: 2,
    reward: 'rp',
    offer: (s) => {
      const room = officeCapacity(s) - s.staff.length;
      return room > 0 ? { target: s.staff.length + Math.min(room, 2) } : null;
    },
  },
  {
    kind: 'research',
    difficulty: 1,
    weight: 2,
    reward: 'cash',
    offer: (s) => {
      // Only while there's something to research that the studio could get to.
      const open = [...RESEARCH.map((r) => r.id), ...TOPICS.map((t) => t.id)].filter((id) => {
        const why = researchBlocker(s, id);
        return !why || why === 'Not enough research points.';
      });
      return open.length >= 2 && researchLeft(s) >= 2 ? { base: researchedCount(s), target: 2 } : null;
    },
  },
  {
    kind: 'office',
    difficulty: 3,
    weight: 2,
    reward: 'fans',
    offer: (s) => {
      const next = OFFICES[s.officeLevel + 1];
      // When the move is in sight, not a pipe dream.
      return next && s.cash >= next.cost * 0.4 ? { target: s.officeLevel + 1 } : null;
    },
  },
];

/** How far along a goal is: `value` out of `target`. */
export function goalProgress(s: GameState, g: Goal): { value: number; target: number } {
  const since = releasedSince(s, g);
  const one = (done: boolean) => ({ value: done ? 1 : 0, target: 1 });
  switch (g.kind) {
    case 'hit':
      return one(since.some((r) => r.genre === g.subject && r.score >= g.target));
    case 'acclaim':
      return one(since.some((r) => r.score >= g.target));
    case 'fans':
      return { value: s.fans, target: g.target };
    case 'cash':
      return { value: Math.max(0, s.cash), target: g.target };
    case 'sequel':
      return one(since.some((r) => r.sequelOf !== undefined));
    case 'booth':
      return one(!!s.expo && s.expo.year >= yearOf(g.since) && boothRank(s.expo.booth) >= boothRank(g.subject ?? 'small'));
    case 'platform':
      return one(since.some((r) => r.platform === g.subject));
    case 'combo':
      return { value: Math.min(g.target, Object.keys(s.knowledge.combos).length - (g.base ?? 0)), target: g.target };
    case 'trend': {
      const [genre, topic] = (g.subject ?? '|').split('|');
      return one(since.some((r) => r.genre === genre || r.topic === topic));
    }
    case 'sales':
      return { value: s.released.reduce((a, r) => Math.max(a, r.unitsSold), 0), target: g.target };
    case 'team':
      return { value: s.staff.length, target: g.target };
    case 'research':
      return { value: Math.min(g.target, researchedCount(s) - (g.base ?? 0)), target: g.target };
    case 'office':
      return one(s.officeLevel >= g.target);
  }
}

export function goalDone(s: GameState, g: Goal): boolean {
  const p = goalProgress(s, g);
  return p.value >= p.target;
}

/** Whether the goal can still be done: platforms are discontinued and trends move on. */
export function goalPossible(s: GameState, g: Goal): boolean {
  if (s.week > g.until) return false;
  switch (g.kind) {
    case 'platform': {
      const p = PLATFORMS.find((x) => x.id === g.subject);
      return !!p && isPlatformAvailable(p, yearFraction(s.week));
    }
    case 'trend':
      return s.week <= g.until && yearOf(s.week) === yearOf(g.since);
    case 'research':
      return researchLeft(s) >= g.target - goalProgress(s, g).value;
    case 'team':
      return officeCapacity(s) >= g.target;
    default:
      return true;
  }
}

export function goalIcon(g: Goal): string {
  switch (g.kind) {
    case 'hit':
      return genreById(g.subject!).icon;
    case 'acclaim':
      return '🏅';
    case 'fans':
      return '❤️';
    case 'cash':
      return '💰';
    case 'sequel':
      return '2️⃣';
    case 'booth':
      return '🎪';
    case 'platform':
      return platformById(g.subject!).icon;
    case 'combo':
      return '🧪';
    case 'trend':
      return '🔥';
    case 'sales':
      return '📦';
    case 'team':
      return '🤝';
    case 'research':
      return '🔬';
    case 'office':
      return '🏢';
  }
}

/** "a Puzzle game", "an RPG game". */
const aGenre = (id: string) => {
  const name = genreById(id).name;
  return `${/^(A|E|I|O|U|RPG)/.test(name) ? 'an' : 'a'} ${name}`;
};
const n = (v: number) => v.toLocaleString('en-US');
const cash = (v: number) => (v >= 1_000_000 ? `$${+(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `$${+(v / 1000).toFixed(1)}K` : `$${v}`);

export function goalText(g: Goal): string {
  switch (g.kind) {
    case 'hit':
      return `Release ${aGenre(g.subject!)} game that reviews ${g.target}+`;
    case 'acclaim':
      return `Release a game that reviews ${g.target}+`;
    case 'fans':
      return `Reach ${n(g.target)} fans`;
    case 'cash':
      return `Have ${cash(g.target)} in the bank`;
    case 'sequel':
      return 'Release a sequel';
    case 'booth':
      return g.subject === 'big' ? 'Exhibit on the big stage at GameExpo' : `Book a ${g.subject} booth or bigger at GameExpo`;
    case 'platform':
      return `Release a game on the ${platformById(g.subject!).name}`;
    case 'combo':
      return 'Release a topic and genre combination you haven’t tried';
    case 'trend': {
      const [genre, topic] = g.subject!.split('|');
      return `Ride the trend: release ${aGenre(genre)} game or one about ${topicById(topic).name} this year`;
    }
    case 'sales':
      return `Sell ${n(g.target)} copies of one game`;
    case 'team':
      return `Grow the team to ${g.target} people`;
    case 'research':
      return `Research ${g.target} new things`;
    case 'office':
      return `Move to the ${OFFICES[g.target].name}`;
  }
}

export function rewardText(r: Goal['reward']): string {
  if (r.kind === 'cash') return `+${cash(r.amount)}`;
  if (r.kind === 'rp') return `+${n(r.amount)} RP`;
  return `+${n(r.amount)} fans`;
}

/** What a goal of this difficulty pays right now: about 1.5 months of costs per level, or the RP or fans to match. */
export function rewardFor(s: GameState, kind: GoalRewardKind, difficulty: number): number {
  if (kind === 'cash') return friendly(Math.max(monthlyCosts(s), 6000 * priceIndex(s.week)) * 1.5 * difficulty);
  if (kind === 'rp') return Math.max(10, Math.round(weeklyRp(s) * 6 * difficulty));
  return Math.max(200 * difficulty, roundUp(s.fans * 0.04 * difficulty));
}

function newGoal(s: GameState, gs: GoalsState, exclude: Set<GoalKind>): Goal | null {
  const options: { t: Template; spec: Pick<Goal, 'target' | 'subject' | 'base'> }[] = [];
  for (const t of TEMPLATES) {
    if (exclude.has(t.kind)) continue;
    const spec = t.offer(s);
    if (!spec) continue;
    const probe: Goal = { id: 0, kind: t.kind, since: s.week, until: s.week, ...spec, reward: { kind: t.reward, amount: 0 } };
    // Never hand out a goal that's already met.
    if (goalDone(s, probe)) continue;
    options.push({ t, spec });
  }
  if (!options.length) return null;
  // Kinds set recently come up less.
  const weight = (t: Template) => t.weight * (gs.recent?.includes(t.kind) ? 0.25 : 1);
  let r = random(s) * options.reduce((a, o) => a + weight(o.t), 0);
  const chosen = options.find((o) => (r -= weight(o.t)) < 0) ?? options[options.length - 1];
  const t = chosen.t;
  let until = s.week + GOAL_WEEKS[t.difficulty];
  // A trend only lasts the year.
  if (t.kind === 'trend') until = Math.min(until, (Math.floor(s.week / WEEKS_PER_YEAR) + 1) * WEEKS_PER_YEAR - 1);
  const goal: Goal = { id: gs.nextId++, kind: t.kind, since: s.week, until, ...chosen.spec, reward: { kind: t.reward, amount: rewardFor(s, t.reward, t.difficulty) } };
  gs.recent = [...(gs.recent ?? []), t.kind].slice(-4);
  return goal;
}

function fill(s: GameState, gs: GoalsState) {
  while (gs.active.length < GOAL_SLOTS) {
    const g = newGoal(s, gs, new Set(gs.active.map((x) => x.kind)));
    if (!g) break;
    gs.active.push(g);
  }
}

/** Goals are on once the first game is out (the first game is its own goal). */
export function goalsUnlocked(s: GameState): boolean {
  return s.released.length > 0 && !s.over;
}

function payReward(s: GameState, r: Goal['reward']) {
  if (r.kind === 'cash') s.cash += r.amount;
  else if (r.kind === 'rp') s.rp += r.amount;
  else s.fans += r.amount;
}

/**
 * Pays out finished goals, replaces ones that can no longer be done, and tops the
 * list back up to three. Returns the goals just completed.
 */
export function updateGoals(s: GameState): Goal[] {
  if (!goalsUnlocked(s)) return [];
  const gs = (s.goals ??= { active: [], done: 0, nextId: 1 });
  const completed = gs.active.filter((g) => goalDone(s, g));
  for (const g of completed) payReward(s, g.reward);
  gs.done += completed.length;
  gs.active = gs.active.filter((g) => !completed.includes(g) && goalPossible(s, g));
  fill(s, gs);
  return completed;
}

/** Weeks until the next swap is allowed (0 = now). */
export function swapCooldown(s: GameState): number {
  const last = s.goals?.swapWeek;
  return last === undefined ? 0 : Math.max(0, last + GOAL_SWAP_WEEKS - s.week);
}

/** Trades a goal for a different one. */
export function swapGoal(s: GameState, id: number): string | null {
  const gs = s.goals;
  const i = gs?.active.findIndex((g) => g.id === id) ?? -1;
  if (!gs || i < 0) return 'That goal is gone.';
  const wait = swapCooldown(s);
  if (wait > 0) return `You can swap a goal again in ${wait} week${wait === 1 ? '' : 's'}.`;
  const old = gs.active[i];
  const next = newGoal(s, gs, new Set(gs.active.map((g) => g.kind)));
  if (!next) return 'There are no other goals right now.';
  gs.active[i] = next;
  gs.swapWeek = s.week;
  gs.recent = [...(gs.recent ?? []), old.kind].slice(-4);
  return null;
}
