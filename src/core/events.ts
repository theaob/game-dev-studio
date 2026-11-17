/**
 * Decision events: now and then something happens to the studio and the player
 * picks what to do about it. The team offers to crunch, a rival tries to poach a
 * star, a publisher offers to fund a game, a build leaks, a launch ships with a
 * nasty bug, a magazine wants a cover, a streamer plays a game, a charity asks for
 * a donation. One or two a year, never back to back, and only once the studio has
 * released a game. They give every year something to react to, and every choice
 * has a cost.
 */
import { friendly, priceIndex } from './economy';
import { activeRivals } from './industry';
import { MAX_HYPE } from './marketing';
import { int, pick, random } from './rng';
import { SALES_WEEKS, monthlyCosts, notify, staffWeeklyPoints } from './sim';
import { ventureHypeMult } from './ventures';
import { WEEKS_PER_YEAR, yearOf } from './time';
import type { GameProject, GameState, ReleasedGame, Staff } from './types';

export type DecisionId = 'crunch' | 'poach' | 'publisher' | 'leak' | 'launch_bug' | 'cover' | 'streamer' | 'charity';

/** A decision waiting for the player, saved with the game. */
export interface PendingDecision {
  id: DecisionId;
  week: number;
  staffId?: number;
  gameId?: number;
  rival?: string;
  /** Money involved, fixed when the event happens so the card and the outcome agree. */
  amount?: number;
}

/** What a decision is about, looked up from the pending decision. */
export interface DecisionContext {
  d: PendingDecision;
  staff?: Staff;
  game?: ReleasedGame;
  project?: GameProject;
}

export interface DecisionChoice {
  label: string;
  /** What will happen, shown under the button. */
  hint: (c: DecisionContext) => string;
  /** Applies the choice; returns what happened, for a toast. */
  apply: (s: GameState, c: DecisionContext) => string;
}

export interface DecisionDef {
  id: DecisionId;
  icon: string;
  title: string;
  text: (c: DecisionContext) => string;
  choices: DecisionChoice[];
  /** The choice the test bots make. */
  botChoice: number;
}

/** Weekly chance of an event, once one is allowed. */
export const DECISION_CHANCE = 0.045;
/** Weeks after one event before another can happen. */
export const DECISION_GAP_WEEKS = 12;
/** A publisher takes this share of a funded game's sales. */
export const PUBLISHER_CUT = 0.3;
/** Share of the team that may walk out after a crunch, per person. */
export const CRUNCH_QUIT_CHANCE = 0.15;
/** A counter-offer raises the salary by this much. */
export const COUNTER_OFFER_RAISE = 1.25;
/** Years before a rival tries to hire the same person again. */
export const POACH_GAP_YEARS = 5;

const n = (v: number) => Math.round(v).toLocaleString('en-US');
const usd = (v: number) => `$${n(v)}`;

function remaining(g: ReleasedGame): number {
  return Math.max(0, g.targetUnits - g.unitsSold);
}

function onMarket(g: ReleasedGame): boolean {
  return g.weeksOnMarket < SALES_WEEKS;
}

/** Two weeks of the team's output in the current phase. */
function crunchPoints(s: GameState, p: GameProject): { design: number; tech: number } {
  let design = 0;
  let tech = 0;
  for (const st of s.staff) {
    for (const a of staffWeeklyPoints(s, st, p.phase, p.focus[p.phase])) {
      design += a.design;
      tech += a.tech;
    }
  }
  return { design: Math.round(design * 2), tech: Math.round(tech * 2) };
}

export const DECISIONS: DecisionDef[] = [
  {
    id: 'crunch',
    icon: '🌙',
    title: 'Crunch time?',
    text: (c) => `The team says ${c.project!.name} could use a push. They offer to work nights and weekends for two weeks.`,
    choices: [
      {
        label: 'Crunch',
        hint: () => 'Two extra weeks of points, more bugs, and some people may burn out and quit.',
        apply: (s, c) => {
          const p = c.project!;
          const pts = crunchPoints(s, p);
          p.design += pts.design;
          p.tech += pts.tech;
          p.bugs += Math.round((pts.design + pts.tech) * 0.2);
          const quit = s.staff.filter((x) => !x.founder && random(s) < CRUNCH_QUIT_CHANCE);
          const who = quit.length ? quit[0] : undefined;
          if (who) {
            s.staff = s.staff.filter((x) => x.id !== who.id);
            if (s.cat?.lap?.staffId === who.id) s.cat = { cooldown: 3 };
          }
          return `+${n(pts.design)} design, +${n(pts.tech)} tech.${who ? ` ${who.name} burned out and quit.` : ' Everyone made it through.'}`;
        },
      },
      {
        label: 'Go home on time',
        hint: () => 'Nothing changes. The team is grateful.',
        apply: () => 'The team went home on time.',
      },
    ],
    botChoice: 1,
  },
  {
    id: 'poach',
    icon: '🕵️',
    title: 'A rival is hiring',
    text: (c) => `${c.d.rival} offered ${c.staff!.name} a big job. They'll stay if you match it.`,
    choices: [
      {
        label: 'Counter-offer',
        hint: (c) => `Their salary goes up ${Math.round((COUNTER_OFFER_RAISE - 1) * 100)}%, to ${usd(c.staff!.salary * COUNTER_OFFER_RAISE)} a month.`,
        apply: (s, c) => {
          c.staff!.salary = Math.round((c.staff!.salary * COUNTER_OFFER_RAISE) / 50) * 50;
          c.staff!.poachedWeek = s.week;
          return `${c.staff!.name} is staying.`;
        },
      },
      {
        label: 'Let them go',
        hint: () => 'They leave for the rival studio.',
        apply: (s, c) => {
          s.staff = s.staff.filter((x) => x.id !== c.staff!.id);
          if (s.cat?.lap?.staffId === c.staff!.id) s.cat = { cooldown: 3 };
          return `${c.staff!.name} left for ${c.d.rival}.`;
        },
      },
    ],
    botChoice: 0,
  },
  {
    id: 'publisher',
    icon: '🤝',
    title: 'A publisher calls',
    text: (c) => `A publisher likes the sound of ${c.project!.name}. They'll pay back everything you've spent on it so far if they can keep ${Math.round(PUBLISHER_CUT * 100)}% of its sales.`,
    choices: [
      {
        label: 'Take the deal',
        hint: (c) => `+${usd(c.d.amount ?? 0)} now, ${Math.round(PUBLISHER_CUT * 100)}% of the game's sales go to the publisher.`,
        apply: (s, c) => {
          const p = c.project!;
          const amount = c.d.amount ?? 0;
          s.cash += amount;
          p.publisherCut = PUBLISHER_CUT;
          // What the publisher paid back no longer counts as the studio's cost.
          if (p.spend) {
            const budget = Math.min(p.spend.budget, amount);
            p.spend.budget -= budget;
            p.spend.marketing = Math.max(0, p.spend.marketing - (amount - budget));
          }
          return `The publisher paid ${usd(amount)}.`;
        },
      },
      {
        label: 'Self-publish',
        hint: () => 'Keep every sale, and the risk.',
        apply: (_s, c) => `${c.project!.name} stays all yours.`,
      },
    ],
    botChoice: 1,
  },
  {
    id: 'leak',
    icon: '💾',
    title: 'A build leaked',
    text: (c) => `An early build of ${c.project!.name} is all over the internet.`,
    choices: [
      {
        label: 'Call it a demo',
        hint: () => 'Usually builds hype. Sometimes players hate what they see.',
        apply: (s, c) => {
          const p = c.project!;
          const before = p.hype ?? 0;
          const good = random(s) < 0.75;
          p.hype = Math.max(0, Math.min(MAX_HYPE, before + (good ? 15 * ventureHypeMult(s) : -10)));
          return good ? `Players loved the demo: +${Math.round(p.hype - before)} hype.` : `Players hated the unfinished build: ${Math.round(p.hype - before)} hype.`;
        },
      },
      {
        label: 'Send the lawyers',
        hint: (c) => `Costs ${usd(c.d.amount ?? 0)}. Nothing else changes.`,
        apply: (s, c) => {
          s.cash -= c.d.amount ?? 0;
          return 'The leak is gone.';
        },
      },
    ],
    botChoice: 1,
  },
  {
    id: 'launch_bug',
    icon: '🐛',
    title: 'Game-breaking bug',
    text: (c) => `Players found a bug in ${c.game!.name} that wipes their save files.`,
    choices: [
      {
        label: 'Patch it',
        hint: (c) => `Costs ${usd(c.d.amount ?? 0)} in overtime.`,
        apply: (s, c) => {
          s.cash -= c.d.amount ?? 0;
          const g = c.game!;
          if (g.spend) g.spend.team += c.d.amount ?? 0;
          return `${g.name} is patched. Players noticed.`;
        },
      },
      {
        label: 'Leave it',
        hint: () => 'A quarter fewer of the copies it has left to sell, and some fans leave.',
        apply: (s, c) => {
          const g = c.game!;
          g.targetUnits -= Math.round(remaining(g) * 0.25);
          const lost = Math.round(s.fans * 0.01);
          s.fans = Math.max(0, s.fans - lost);
          return `Word got around: fewer sales of ${g.name}${lost ? ` and ${n(lost)} fans lost` : ''}.`;
        },
      },
    ],
    botChoice: 0,
  },
  {
    id: 'cover',
    icon: '📰',
    title: 'Cover story',
    text: (c) => `Game Weekly wants ${c.game!.name} on its cover, with a photo shoot at the studio.`,
    choices: [
      {
        label: 'Do the shoot',
        hint: (c) => `Costs ${usd(c.d.amount ?? 0)}. More sales and new fans.`,
        apply: (s, c) => {
          const g = c.game!;
          s.cash -= c.d.amount ?? 0;
          if (g.spend) g.spend.marketing += c.d.amount ?? 0;
          g.targetUnits += Math.round(remaining(g) * 0.08);
          const fans = Math.max(100, Math.round(s.fans * 0.01));
          s.fans += fans;
          g.fansGained += fans;
          return `${g.name} made the cover: +${n(fans)} fans.`;
        },
      },
      {
        label: 'Too busy',
        hint: () => 'Nothing changes.',
        apply: () => 'Maybe next time.',
      },
    ],
    botChoice: 0,
  },
  {
    id: 'streamer',
    icon: '🎥',
    title: 'A streamer went viral',
    text: (c) => `A famous streamer played ${c.game!.name} for eight hours straight. Millions watched.`,
    choices: [
      {
        label: 'Amazing!',
        hint: () => 'Many more copies of what it has left to sell.',
        apply: (_s, c) => {
          const g = c.game!;
          g.targetUnits += Math.round(remaining(g) * 0.15);
          return `${g.name} is flying off the shelves.`;
        },
      },
    ],
    botChoice: 0,
  },
  {
    id: 'charity',
    icon: '💝',
    title: 'Holiday charity bundle',
    text: (c) => `A holiday charity bundle asks to include ${c.game!.name}. All the money goes to a children's hospital.`,
    choices: [
      {
        label: 'Donate it',
        hint: () => 'No money for you, but players love it.',
        apply: (s, c) => {
          const fans = Math.max(50, Math.round(s.fans * 0.005));
          s.fans += fans;
          c.game!.fansGained += fans;
          return `Players loved it: +${n(fans)} fans.`;
        },
      },
      {
        label: 'Not this time',
        hint: () => 'Nothing changes.',
        apply: () => 'Maybe next time.',
      },
    ],
    botChoice: 0,
  },
];

export function decisionById(id: string): DecisionDef {
  const d = DECISIONS.find((x) => x.id === id);
  if (!d) throw new Error(`Unknown decision ${id}`);
  return d;
}

/** Looks up what a pending decision is about. Missing pieces mean it no longer applies. */
export function decisionContext(s: GameState, d: PendingDecision): DecisionContext {
  const project = s.activity?.kind === 'game' ? s.activity : undefined;
  return {
    d,
    staff: d.staffId !== undefined ? s.staff.find((x) => x.id === d.staffId) : undefined,
    game: d.gameId !== undefined ? s.released.find((g) => g.id === d.gameId) : undefined,
    project,
  };
}

/** Whether the pending decision still makes sense (the game, person or project is still there). */
export function decisionValid(s: GameState, d: PendingDecision): boolean {
  const c = decisionContext(s, d);
  switch (d.id) {
    case 'crunch':
    case 'publisher':
    case 'leak':
      return !!c.project && c.project.phase < 3;
    case 'poach':
      return !!c.staff;
    default:
      return !!c.game;
  }
}

/** The events that could happen to the studio this week, already filled in. */
export function eligibleDecisions(s: GameState): PendingDecision[] {
  const week = s.week;
  const out: PendingDecision[] = [];
  const p = s.activity?.kind === 'game' ? s.activity : undefined;
  const developing = p && p.phase < 3 && !p.awaitingFocus ? p : undefined;
  const runCosts = monthlyCosts(s);
  if (developing && developing.phase <= 2 && s.staff.length >= 3) out.push({ id: 'crunch', week });
  // A publisher wants a new game from a small studio, early in development.
  if (developing && developing.phase === 0 && developing.weekInPhase <= 1 && s.officeLevel <= 1 && !developing.publisherCut) {
    const spent = developing.spend ? developing.spend.budget + developing.spend.marketing : developing.cost;
    if (spent > 0) out.push({ id: 'publisher', week, amount: spent });
  }
  if (developing && developing.phase >= 1) out.push({ id: 'leak', week, amount: friendly(runCosts / 2 + 2000 * priceIndex(week)) });
  const rivals = activeRivals(yearOf(week)).filter((r) => !s.acquired?.includes(r.name));
  // Rivals go after stars who've been around a year, and leave each one alone for a few years after.
  const stars = s.staff.filter((x) => !x.founder && x.design + x.tech >= 12 && week - x.hiredWeek >= 48 && week - (x.poachedWeek ?? -Infinity) >= POACH_GAP_YEARS * WEEKS_PER_YEAR);
  if (rivals.length && stars.length) out.push({ id: 'poach', week, staffId: pick(s, stars).id, rival: pick(s, rivals).name });
  const fresh = s.released.filter((g) => onMarket(g) && g.weeksOnMarket <= 4);
  const buggy = fresh.filter((g) => g.bugs / Math.max(1, g.design + g.tech) > 0.03);
  if (buggy.length) out.push({ id: 'launch_bug', week, gameId: pick(s, buggy).id, amount: friendly(runCosts / 2 + 3000 * priceIndex(week)) });
  const hits = s.released.filter((g) => onMarket(g) && g.weeksOnMarket <= 6 && g.score >= 8.5);
  if (hits.length) out.push({ id: 'cover', week, gameId: pick(s, hits).id, amount: friendly(5000 * priceIndex(week)) });
  const liked = s.released.filter((g) => onMarket(g) && g.score >= 7);
  if (yearOf(week) >= 2006 && liked.length) out.push({ id: 'streamer', week, gameId: pick(s, liked).id });
  const old = s.released.filter((g) => !onMarket(g));
  // Charity bundles come around the holidays, in the last month of the year.
  const holidays = week % WEEKS_PER_YEAR >= WEEKS_PER_YEAR - 4;
  if (holidays && s.released.length >= 3 && old.length) out.push({ id: 'charity', week, gameId: pick(s, old).id });
  return out;
}

/** Called once a week: maybe something happens. Returns the new decision, if any. */
export function rollDecision(s: GameState): PendingDecision | null {
  if (s.decision || s.over || !s.released.length) return null;
  if (s.lastDecisionWeek !== undefined && s.week - s.lastDecisionWeek < DECISION_GAP_WEEKS) return null;
  if (random(s) >= DECISION_CHANCE) return null;
  const all = eligibleDecisions(s);
  // Not the same kind of event twice in a row, when there's anything else.
  const fresh = all.filter((x) => x.id !== s.lastDecisionId);
  const options = fresh.length ? fresh : all;
  if (!options.length) return null;
  const d = options[int(s, 0, options.length - 1)];
  s.decision = d;
  s.lastDecisionWeek = s.week;
  s.lastDecisionId = d.id;
  return d;
}

/** The player picks a choice for the pending decision. Returns what happened, or an error. */
export function resolveDecision(s: GameState, choice: number): { ok: true; text: string } | { ok: false; error: string } {
  const d = s.decision;
  if (!d) return { ok: false, error: 'Nothing to decide.' };
  const def = decisionById(d.id);
  const ch = def.choices[choice];
  if (!ch) return { ok: false, error: 'Pick one of the options.' };
  delete s.decision;
  if (!decisionValid(s, d)) return { ok: true, text: 'Never mind, it sorted itself out.' };
  const text = ch.apply(s, decisionContext(s, d));
  notify(s, `${def.icon} ${def.title}: ${text}`, 'info');
  return { ok: true, text };
}
