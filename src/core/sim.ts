import {
  AREAS,
  FIRST_NAMES,
  GENRES,
  LAST_NAMES,
  MARKETING,
  OFFICES,
  PHASES,
  PLATFORMS,
  RESEARCH,
  SIZES,
  TITLE_WORDS_A,
  TITLE_WORDS_B,
  TOPICS,
  genreById,
  isPlatformAvailable,
  marketingById,
  platformById,
  platformGenreFit,
  platformUsers,
  sizeById,
  topicById,
} from './data';
import { int, pick, random, range } from './rng';
import { hasSequel, sequelSalesMult, seriesNumber } from './sequels';
import { average, clamp, evaluate, normalizeFocus, rollReviews, scoreFactor } from './scoring';
import { START_YEAR, TOTAL_WEEKS, WEEKS_PER_MONTH, WEEKS_PER_YEAR, yearFraction, yearOf } from './time';
import type {
  ContractOffer,
  GameProject,
  GameSpec,
  GameState,
  NoticeKind,
  ReleaseReport,
  ReleasedGame,
  SimEvent,
  Staff,
} from './types';

export const SAVE_VERSION = 1;
export const SALES_WEEKS = 16;
const SALES_DECAY = 0.8;
const MAX_NOTICES = 40;
/** Weekly chance that a developer gets in the zone, and how much more they produce while there. */
export const ZONE_CHANCE = 0.06;
export const ZONE_BOOST = 1.8;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function createGame(studioName: string, seed = Date.now()): GameState {
  const state: GameState = {
    version: SAVE_VERSION,
    rng: seed | 0,
    week: 0,
    studioName: studioName.trim() || 'Garage Games',
    cash: 40000,
    fans: 0,
    rp: 0,
    officeLevel: 0,
    staff: [],
    candidates: [],
    nextId: 1,
    researched: [],
    topics: TOPICS.filter((t) => t.cost === 0).map((t) => t.id),
    licenses: ['pc'],
    activity: null,
    contractOffers: [],
    released: [],
    knowledge: { combos: {}, areas: {}, balance: {} },
    notices: [],
    bestPPW: 0,
    totalRevenue: 0,
    debtStrikes: 0,
    over: null,
  };
  state.staff.push({ id: state.nextId++, name: 'You', design: 3, tech: 3, speed: 1, salary: 0, founder: true, hiredWeek: 0 });
  refreshContracts(state);
  refreshCandidates(state);
  notify(state, `${state.studioName} opens its doors in a humble garage. Time to make some games!`, 'good');
  return state;
}

// ---------------------------------------------------------------------------
// Derived values
// ---------------------------------------------------------------------------

export function currentYear(state: GameState): number {
  return yearOf(state.week);
}

export function availablePlatforms(state: GameState) {
  const year = yearFraction(state.week);
  return PLATFORMS.filter((p) => isPlatformAvailable(p, year));
}

export function monthlyCosts(state: GameState): number {
  return OFFICES[state.officeLevel].rent + state.staff.reduce((a, s) => a + s.salary, 0);
}

export function officeCapacity(state: GameState): number {
  return OFFICES[state.officeLevel].capacity;
}

export function hasResearch(state: GameState, id: string): boolean {
  return state.researched.includes(id);
}

export function techMultiplier(state: GameState): number {
  let m = 1;
  if (hasResearch(state, 'engine2')) m *= 1.15;
  if (hasResearch(state, 'engine3')) m *= 1.15;
  if (hasResearch(state, 'engine4')) m *= 1.2;
  return m;
}

export function designMultiplier(state: GameState): number {
  let m = 1;
  if (hasResearch(state, 'design1')) m *= 1.15;
  if (hasResearch(state, 'design2')) m *= 1.15;
  if (hasResearch(state, 'design3')) m *= 1.2;
  return m;
}

export function bugMultiplier(state: GameState): number {
  let m = 1;
  if (hasResearch(state, 'qa1')) m *= 0.7;
  if (hasResearch(state, 'qa2')) m *= 0.7;
  return m;
}

export function availableSizes(state: GameState) {
  return SIZES.filter((s) => !s.research || hasResearch(state, s.research));
}

export function availableMarketing(state: GameState) {
  return MARKETING.filter((m) => !m.research || hasResearch(state, m.research));
}

export interface CostBreakdown {
  license: number;
  size: number;
  marketing: number;
  total: number;
}

export function gameCost(state: GameState, spec: Pick<GameSpec, 'platform' | 'size' | 'marketing'>): CostBreakdown {
  const license = state.licenses.includes(spec.platform) ? 0 : platformById(spec.platform).license;
  const size = sizeById(spec.size).cost;
  const marketing = marketingById(spec.marketing).cost;
  return { license, size, marketing, total: license + size + marketing };
}

export function salaryFor(state: GameState, design: number, tech: number): number {
  const years = yearFraction(state.week) - START_YEAR;
  return Math.round(((800 + (design + tech) * 350) * (1 + 0.03 * years)) / 50) * 50;
}

// ---------------------------------------------------------------------------
// Actions — each returns an error message, or null on success.
// ---------------------------------------------------------------------------

export function validateGame(state: GameState, spec: GameSpec): string | null {
  if (state.over) return 'The game is over.';
  if (state.activity) return 'Your team is busy.';
  if (!spec.name.trim()) return 'Give your game a name.';
  if (!state.topics.includes(spec.topic)) return 'Topic not researched.';
  if (!GENRES.some((g) => g.id === spec.genre)) return 'Pick a genre.';
  const platform = PLATFORMS.find((p) => p.id === spec.platform);
  if (!platform || !isPlatformAvailable(platform, yearFraction(state.week))) return 'Platform not available.';
  if (!availableSizes(state).some((s) => s.id === spec.size)) return 'Game size not researched.';
  if (!availableMarketing(state).some((m) => m.id === spec.marketing)) return 'Marketing not available.';
  if (spec.sequelOf !== undefined) {
    const original = state.released.find((g) => g.id === spec.sequelOf);
    if (!original) return 'The original game could not be found.';
    if (hasSequel(state, original.id)) return `${original.name} already has a sequel.`;
    if (original.topic !== spec.topic || original.genre !== spec.genre) return "A sequel keeps the original's topic and genre.";
  }
  const cost = gameCost(state, spec).total;
  if (cost > state.cash) return `You need $${cost.toLocaleString('en-US')} to start this project.`;
  return null;
}

export function startGame(state: GameState, spec: GameSpec, firstFocus: number[]): string | null {
  const err = validateGame(state, spec);
  if (err) return err;
  const cost = gameCost(state, spec);
  state.cash -= cost.total;
  if (cost.license > 0) {
    state.licenses.push(spec.platform);
    notify(state, `Bought a ${platformById(spec.platform).name} dev kit license.`, 'info');
  }
  const project: GameProject = {
    ...spec,
    name: spec.name.trim(),
    kind: 'game',
    startedWeek: state.week,
    phaseWeeks: sizeById(spec.size).phaseWeeks,
    phase: 0,
    weekInPhase: 0,
    focus: [firstFocus.slice(), [50, 50, 50], [50, 50, 50]],
    awaitingFocus: false,
    polishWeeks: 0,
    design: 0,
    tech: 0,
    bugs: 0,
    areaPoints: AREAS.map(() => 0),
    contrib: {},
    cost: cost.total,
  };
  state.activity = project;
  return null;
}

/** Sets the focus for the phase that is waiting for input and resumes development. */
export function setPhaseFocus(state: GameState, focus: number[]): string | null {
  const p = state.activity;
  if (!p || p.kind !== 'game' || !p.awaitingFocus) return 'Nothing is waiting for focus.';
  p.focus[p.phase] = focus.slice();
  p.awaitingFocus = false;
  return null;
}

export function startContract(state: GameState, offerId: number): string | null {
  if (state.over) return 'The game is over.';
  if (state.activity) return 'Your team is busy.';
  const offer = state.contractOffers.find((o) => o.id === offerId);
  if (!offer) return 'That contract is gone.';
  state.contractOffers = state.contractOffers.filter((o) => o.id !== offerId);
  state.activity = { kind: 'contract', offer, weeksDone: 0 };
  return null;
}

export function researchCost(id: string): number {
  const item = RESEARCH.find((r) => r.id === id);
  if (item) return item.cost;
  return topicById(id).cost;
}

export function researchBlocker(state: GameState, id: string): string | null {
  const item = RESEARCH.find((r) => r.id === id);
  if (item) {
    if (hasResearch(state, id)) return 'Already researched.';
    if (item.requires && !hasResearch(state, item.requires)) {
      return `Requires ${RESEARCH.find((r) => r.id === item.requires)!.name}.`;
    }
    if (item.minOffice !== undefined && state.officeLevel < item.minOffice) {
      return `Requires a ${OFFICES[item.minOffice].name}.`;
    }
  } else {
    if (!TOPICS.some((t) => t.id === id)) return 'Unknown research.';
    if (state.topics.includes(id)) return 'Already researched.';
  }
  if (state.rp < researchCost(id)) return 'Not enough research points.';
  return null;
}

export function doResearch(state: GameState, id: string): string | null {
  const err = researchBlocker(state, id);
  if (err) return err;
  state.rp -= researchCost(id);
  const item = RESEARCH.find((r) => r.id === id);
  if (item) {
    state.researched.push(id);
    notify(state, `Research complete: ${item.name}.`, 'good');
  } else {
    state.topics.push(id);
    notify(state, `New topic unlocked: ${topicById(id).name}.`, 'good');
  }
  return null;
}

export function hire(state: GameState, candidateId: number): string | null {
  const c = state.candidates.find((s) => s.id === candidateId);
  if (!c) return 'Candidate not found.';
  if (state.staff.length >= officeCapacity(state)) return 'Your office is full. Upgrade to hire more staff.';
  if (state.cash < c.salary) return `Hiring costs a recruiting fee of one month's salary ($${c.salary.toLocaleString('en-US')}).`;
  state.cash -= c.salary;
  state.candidates = state.candidates.filter((s) => s.id !== candidateId);
  state.staff.push({ ...c, hiredWeek: state.week });
  notify(state, `${c.name} joined the team!`, 'good');
  return null;
}

export function fire(state: GameState, staffId: number): string | null {
  const s = state.staff.find((x) => x.id === staffId);
  if (!s) return 'Staff member not found.';
  if (s.founder) return "You can't fire yourself.";
  state.staff = state.staff.filter((x) => x.id !== staffId);
  notify(state, `${s.name} left the studio.`, 'info');
  return null;
}

export function trainingCost(state: GameState, s: Staff, skill: 'design' | 'tech') {
  return { cash: Math.max(2000, s.salary || salaryFor(state, s.design, s.tech)), rp: Math.round(5 + s[skill] * 4) };
}

/** Sends a staff member on a course: +0.5 to a skill. Uses research points and money. */
export function train(state: GameState, staffId: number, skill: 'design' | 'tech'): string | null {
  const s = state.staff.find((x) => x.id === staffId);
  if (!s) return 'Staff member not found.';
  if (s[skill] >= 10) return 'Already at maximum skill.';
  const cost = trainingCost(state, s, skill);
  if (state.rp < cost.rp) return `Training needs ${cost.rp} RP.`;
  if (state.cash < cost.cash) return `Training costs $${cost.cash.toLocaleString('en-US')}.`;
  state.rp -= cost.rp;
  state.cash -= cost.cash;
  s[skill] = Math.min(10, Math.round((s[skill] + 0.5) * 10) / 10);
  return null;
}

export function upgradeOffice(state: GameState): string | null {
  const next = OFFICES[state.officeLevel + 1];
  if (!next) return 'You already have the biggest office.';
  if (state.cash < next.cost) return `Moving costs $${next.cost.toLocaleString('en-US')}.`;
  state.cash -= next.cost;
  state.officeLevel++;
  notify(state, `Moved into a ${next.name}! Room for ${next.capacity} people.`, 'good');
  return null;
}

/** Ends polishing and releases the game. */
export function releaseGame(state: GameState): ReleaseReport | string {
  const p = state.activity;
  if (!p || p.kind !== 'game' || p.phase < 3) return 'Nothing to release.';

  const ev = evaluate(state, p);
  const reviews = rollReviews(state, ev.score);
  const score = average(reviews);
  const size = sizeById(p.size);
  const platform = platformById(p.platform);
  const market = marketingById(p.marketing);
  const year = yearFraction(state.week);
  const years = year - START_YEAR;

  const users = platformUsers(platform, year);
  const sf = scoreFactor(score);
  const original = p.sequelOf !== undefined ? state.released.find((g) => g.id === p.sequelOf) : undefined;
  // A sequel sells to the original's fans (or suffers from its reputation).
  const sequelMult = original ? sequelSalesMult(original) : 1;
  const audience = (users * 1e6 * 0.0008 + 3000) * sf * platformGenreFit(platform, p.genre) * size.unitMult * market.salesMult;
  const fanBuyers = state.fans * 0.2 * (score / 10) * Math.sqrt(size.unitMult);
  const targetUnits = Math.round((audience * range(state, 0.85, 1.15) + fanBuyers) * sequelMult);
  const unitPrice = size.price * platform.priceMult * (1 + 0.025 * years);

  const game: ReleasedGame = {
    id: state.nextId++,
    name: p.name,
    topic: p.topic,
    genre: p.genre,
    platform: p.platform,
    size: p.size,
    marketing: p.marketing,
    releaseWeek: state.week,
    devWeeks: state.week - p.startedWeek,
    design: Math.round(p.design),
    tech: Math.round(p.tech),
    bugs: Math.round(p.bugs),
    ppw: ev.ppw,
    score,
    reviews,
    targetUnits,
    unitsSold: 0,
    revenue: 0,
    weeksOnMarket: 0,
    fansGained: 0,
    unitPrice,
    cost: p.cost,
    sequelOf: original?.id,
    series: original ? seriesNumber(original) + 1 : 1,
  };

  // Learning: knowledge about combos, area importance and balance.
  const insights: ReleaseReport['insights'] = [];
  const genre = genreById(p.genre);
  const topic = topicById(p.topic);
  const comboKey = `${p.topic}|${p.genre}`;
  state.knowledge.combos[comboKey] = ev.fit;
  const fitText = [
    `${topic.name} and ${genre.name} don't really go together.`,
    `${topic.name} + ${genre.name} is an okay combination.`,
    `${topic.name} + ${genre.name} is a good combination.`,
    `${topic.name} + ${genre.name} is a great combination!`,
  ][ev.fit];
  insights.push({ text: fitText, kind: ev.fit >= 2 ? 'good' : 'bad' });

  const known = (state.knowledge.areas[p.genre] ??= AREAS.map(() => false));
  const hidden = known.map((k, i) => (k ? -1 : i)).filter((i) => i >= 0);
  for (let n = 0; n < 3 && hidden.length; n++) {
    const i = hidden.splice(int(state, 0, hidden.length - 1), 1)[0];
    known[i] = true;
    const imp = genre.importance[i];
    const label = imp > 1 ? 'is important' : imp < 1 ? 'matters little' : 'is fairly standard';
    insights.push({ text: `For ${genre.name} games, ${AREAS[i].name} ${label}.`, kind: 'info' });
  }
  if (!state.knowledge.balance[p.genre]) {
    state.knowledge.balance[p.genre] = true;
  }
  const diff = ev.designShare - ev.designTarget;
  if (diff > 0.08) insights.push({ text: `${genre.name} players wanted more technical polish (tech points).`, kind: 'bad' });
  else if (diff < -0.08) insights.push({ text: `${genre.name} players wanted more creative depth (design points).`, kind: 'bad' });
  else insights.push({ text: 'The design/tech balance felt just right.', kind: 'good' });

  if (ev.align >= 0.7) insights.push({ text: 'Your focus during development was spot on.', kind: 'good' });
  else if (ev.align < 0.4) insights.push({ text: 'The team spent time on the wrong things for this genre.', kind: 'bad' });
  if (ev.bugRatio > 0.06) insights.push({ text: 'Reviewers complained about bugs. Polish longer next time.', kind: 'bad' });
  if (original) {
    const pct = Math.round((sequelMult - 1) * 100);
    if (pct > 0) insights.push({ text: `Fans of ${original.name} lined up for the sequel: +${pct}% sales.`, kind: 'good' });
    else if (pct < 0) insights.push({ text: `${original.name}'s reputation held the sequel back: ${pct}% sales.`, kind: 'bad' });
    if (ev.repeatMult < 1) insights.push({ text: `It came out too soon after ${original.name}. Give a series time to breathe.`, kind: 'bad' });
    if (score >= original.score + 0.5) insights.push({ text: `Reviewers say it's even better than ${original.name}!`, kind: 'good' });
    else if (score <= original.score - 0.5) insights.push({ text: `Fans felt it didn't live up to ${original.name}.`, kind: 'bad' });
    else insights.push({ text: `A worthy follow-up to ${original.name}.`, kind: 'info' });
  } else if (ev.repeatMult < 1) {
    insights.push({ text: 'Players feel they have seen this from you recently.', kind: 'bad' });
  }
  if (ev.pointsRatio < 0.9 && state.released.length > 0) insights.push({ text: 'Fans expected a bigger step up from your previous work.', kind: 'bad' });
  if (ev.staffMult < 1) insights.push({ text: `A ${size.name.toLowerCase()} game really needs a team of ${size.minStaff}+.`, kind: 'bad' });
  const pFit = platformGenreFit(platform, p.genre);
  if (pFit > 1.05) insights.push({ text: `${platform.name} owners love ${genre.name} games.`, kind: 'good' });
  else if (pFit < 0.95) insights.push({ text: `${genre.name} games are a hard sell on ${platform.name}.`, kind: 'bad' });

  // Experience for the team.
  const sizeXp = { small: 1, medium: 1.6, large: 2.5 }[p.size];
  for (const s of state.staff) {
    const c = p.contrib[s.id];
    if (!c) continue;
    const tot = c.design + c.tech || 1;
    s.design = Math.min(10, s.design + 0.16 * sizeXp * (c.design / tot) * 2 * (0.5 + random(state) * 0.5));
    s.tech = Math.min(10, s.tech + 0.16 * sizeXp * (c.tech / tot) * 2 * (0.5 + random(state) * 0.5));
  }

  const rpEarned = Math.round((score / 2) * sizeXp);
  state.rp += rpEarned;
  state.bestPPW = Math.max(state.bestPPW, ev.ppw);
  state.released.push(game);
  for (const s of state.staff) s.zone = 0;
  state.activity = null;
  notify(state, `${game.name} released to an average score of ${score.toFixed(1)}.`, score >= 7 ? 'good' : score < 5 ? 'bad' : 'info');
  return { game, insights, rpEarned };
}

// ---------------------------------------------------------------------------
// Weekly tick
// ---------------------------------------------------------------------------

/** Points one staff member produces in a week given a phase focus. */
export function staffWeeklyPoints(state: GameState, s: Staff, phase: number, rawFocus: number[]) {
  const f = normalizeFocus(rawFocus);
  const areas = PHASES[phase].areas;
  const perArea = areas.map((a, i) => ({
    design: f[i] * a.designShare * s.design * s.speed * designMultiplier(state),
    tech: f[i] * (1 - a.designShare) * s.tech * s.speed * techMultiplier(state),
  }));
  return perArea;
}

export function tick(state: GameState): SimEvent[] {
  const events: SimEvent[] = [];
  if (state.over) return events;
  const act = state.activity;
  if (act?.kind === 'game' && act.awaitingFocus) {
    events.push({ type: 'needFocus', phase: act.phase });
    return events;
  }

  state.week++;
  const noticeStart = state.notices.length;

  if (act?.kind === 'game') {
    tickProject(state, act, events);
  } else if (act?.kind === 'contract') {
    act.weeksDone++;
    state.rp += 0.15 * state.staff.length;
    if (act.weeksDone >= act.offer.weeks) {
      state.cash += act.offer.pay;
      state.rp += act.offer.rp;
      state.activity = null;
      notify(state, `Contract "${act.offer.title}" done: +$${act.offer.pay.toLocaleString('en-US')}, +${act.offer.rp} RP.`, 'good');
      events.push({ type: 'contractDone', offer: act.offer });
    }
  }

  tickSales(state);

  if (state.week % WEEKS_PER_MONTH === 0) monthly(state);
  if (state.week % WEEKS_PER_YEAR === 0) yearly(state);

  if (!state.over && state.week >= TOTAL_WEEKS) {
    state.over = 'retired';
    notify(state, 'After 41 years, it is time to retire. What a journey!', 'good');
  }

  for (const n of state.notices.slice(noticeStart)) events.push({ type: 'notice', notice: n });
  if (state.over) events.push({ type: 'gameOver', reason: state.over });
  return events;
}

function tickProject(state: GameState, p: GameProject, events: SimEvent[]) {
  if (p.phase >= 3) {
    // Polishing: the team squashes bugs.
    p.polishWeeks++;
    p.bugs = Math.round(p.bugs); // saves from before bugs were whole numbers
    const fixPower = state.staff.reduce((a, s) => a + s.tech * s.speed, 0) * (hasResearch(state, 'qa2') ? 0.75 : 0.5);
    // Bugs are squashed one whole bug at a time, at least one per week.
    const fixed = Math.min(p.bugs, Math.max(1, Math.round(fixPower * range(state, 0.8, 1.2))));
    p.bugs -= fixed;
    events.push({ type: 'points', design: 0, tech: 0, bugs: -fixed });
    return;
  }

  let design = 0;
  let tech = 0;
  const noise = range(state, 0.85, 1.15);
  let bugWeight = 0;
  for (const s of state.staff) {
    if (!s.zone && random(state) < ZONE_CHANCE) {
      s.zone = int(state, 2, 3);
      events.push({ type: 'zone', staffId: s.id, name: s.name });
    }
    // In the zone: much more output, and focused work makes fewer bugs.
    const boost = s.zone ? ZONE_BOOST : 1;
    const pts = staffWeeklyPoints(state, s, p.phase, p.focus[p.phase]);
    const c = (p.contrib[s.id] ??= { design: 0, tech: 0 });
    pts.forEach((a, i) => {
      const d = a.design * noise * boost;
      const t = a.tech * noise * boost;
      design += d;
      tech += t;
      bugWeight += (d + t) * (s.zone ? 0.5 : 1);
      c.design += d;
      c.tech += t;
      p.areaPoints[p.phase * 3 + i] += d + t;
    });
    if (s.zone) s.zone--;
  }
  const bugs = wholeNumber(state, bugWeight * 0.12 * bugMultiplier(state) * range(state, 0.6, 1.4));
  p.design += design;
  p.tech += tech;
  p.bugs += bugs;
  state.rp += 0.35 * state.staff.length;
  events.push({ type: 'points', design, tech, bugs });

  p.weekInPhase++;
  if (p.weekInPhase >= p.phaseWeeks) {
    p.phase++;
    p.weekInPhase = 0;
    if (p.phase < 3) {
      p.awaitingFocus = true;
      events.push({ type: 'needFocus', phase: p.phase });
    } else {
      events.push({ type: 'devComplete' });
    }
  }
}

function salesWeight(week: number): number {
  return ((1 - SALES_DECAY) * Math.pow(SALES_DECAY, week)) / (1 - Math.pow(SALES_DECAY, SALES_WEEKS));
}

function tickSales(state: GameState) {
  for (const g of state.released) {
    if (g.weeksOnMarket >= SALES_WEEKS) continue;
    const isLast = g.weeksOnMarket === SALES_WEEKS - 1;
    const units = isLast ? g.targetUnits - g.unitsSold : Math.round(g.targetUnits * salesWeight(g.weeksOnMarket));
    g.weeksOnMarket++;
    g.unitsSold += units;
    const revenue = Math.round(units * g.unitPrice);
    g.revenue += revenue;
    state.cash += revenue;
    state.totalRevenue += revenue;
    const fans = Math.round(units * 0.1 * clamp((g.score - 4) / 6, -0.3, 1));
    g.fansGained += fans;
    state.fans = Math.max(0, state.fans + fans);
    if (isLast) {
      notify(state, `${g.name} left the charts after selling ${g.unitsSold.toLocaleString('en-US')} copies.`, 'info');
    }
  }
}

function monthly(state: GameState) {
  const costs = monthlyCosts(state);
  state.cash -= costs;
  if (state.cash < 0) {
    state.debtStrikes++;
    if (state.debtStrikes >= 3) {
      state.over = 'bankrupt';
      notify(state, 'The bank has closed your accounts. The studio is bankrupt.', 'bad');
      return;
    }
    notify(state, `You're in the red! ${3 - state.debtStrikes} month(s) left to recover before bankruptcy.`, 'bad');
  } else {
    state.debtStrikes = 0;
  }
  if (state.activity?.kind !== 'contract') refreshContracts(state);
  if ((state.week / WEEKS_PER_MONTH) % 3 === 0) refreshCandidates(state);
}

function yearly(state: GameState) {
  const year = yearOf(state.week);
  for (const p of PLATFORMS) {
    if (p.start === year) notify(state, `New platform: the ${p.name} (${p.kind}) has launched!`, 'good');
    if (p.end === year) notify(state, `The ${p.name} has been discontinued.`, 'info');
  }
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const CONTRACT_TEMPLATES = [
  'Build a website for a local {biz}',
  'Port a {topic} game to {platform}',
  'Fix bugs in a publisher\'s {topic} game',
  'Prototype a {topic} demo',
  'Make a training sim for a {biz}',
  'Create an ad game for a {biz}',
  'Optimize a {platform} engine',
];
const BUSINESSES = ['bakery', 'bank', 'car dealer', 'museum', 'pizza chain', 'school', 'gym', 'airline'];

function refreshContracts(state: GameState) {
  const years = yearFraction(state.week) - START_YEAR;
  const platforms = availablePlatforms(state);
  state.contractOffers = [0, 1, 2].map(() => {
    const weeks = int(state, 2, 6);
    const title = pick(state, CONTRACT_TEMPLATES)
      .replace('{biz}', pick(state, BUSINESSES))
      .replace('{topic}', topicById(pick(state, state.topics)).name)
      .replace('{platform}', pick(state, platforms).name);
    const pay = Math.round((weeks * (2500 + years * 600) * range(state, 0.8, 1.3) * (1 + 0.25 * (state.staff.length - 1))) / 100) * 100;
    const offer: ContractOffer = { id: state.nextId++, title, weeks, pay, rp: Math.max(1, Math.round(weeks * 0.6 * range(state, 0.7, 1.4))) };
    return offer;
  });
}

function refreshCandidates(state: GameState) {
  const years = yearFraction(state.week) - START_YEAR;
  const hi = Math.min(10, 3.5 + years * 0.18);
  const lo = Math.max(1.5, hi - 3.5);
  state.candidates = [0, 1, 2].map(() => {
    const design = round1(range(state, lo, hi));
    const tech = round1(range(state, lo, hi));
    return {
      id: state.nextId++,
      name: `${pick(state, FIRST_NAMES)} ${pick(state, LAST_NAMES)}`,
      design,
      tech,
      speed: round1(range(state, 0.8, 1.25)),
      salary: salaryFor(state, design, tech),
      hiredWeek: state.week,
    };
  });
}

/** Uses Math.random so suggesting names doesn't shift the deterministic game RNG. */
export function randomTitle(): string {
  const a = TITLE_WORDS_A[Math.floor(Math.random() * TITLE_WORDS_A.length)];
  const b = TITLE_WORDS_B[Math.floor(Math.random() * TITLE_WORDS_B.length)];
  return `${a} ${b}`;
}

export function notify(state: GameState, text: string, kind: NoticeKind) {
  state.notices.push({ week: state.week, text, kind });
  if (state.notices.length > MAX_NOTICES) state.notices.splice(0, state.notices.length - MAX_NOTICES);
}

/** Rounds randomly up or down so whole-number totals keep the same average (2.3 → 3 thirty percent of the time). */
function wholeNumber(state: GameState, v: number): number {
  const base = Math.floor(v);
  return base + (random(state) < v - base ? 1 : 0);
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
