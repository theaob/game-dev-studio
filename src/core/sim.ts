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
  storeItemById,
  GENRE_TITLES,
  TOPIC_TITLE_WORDS,
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
import type { StoreItemId } from './data';
import {
  EXPO_BOOKING_WEEKS,
  EXPO_WEEK,
  HYPE_DECAY,
  MAX_HYPE,
  boothById,
  boothPrice,
  hypeEffect,
  promoById,
  promoPrice,
  salesPushPrice,
  weeksToExpo,
} from './marketing';
import type { BoothId, PromoId, SalesPushId } from './marketing';
import { STARTING_CASH, founderSalary, friendly, marketingCost, officeCost, officeRent, priceIndex, reachableUsers, sizeCost } from './economy';
import { int, pick, random, range } from './rng';
import { RIVAL_CLASH_MULT, newTrend, rivalClash, tickIndustry, trendMult } from './industry';
import { hasSequel, sequelSalesMult, seriesNumber } from './sequels';
import { acclaimFor, sequelHype } from './acclaim';
import { average, clamp, evaluate, normalizeFocus, rollReviews, scoreFactor } from './scoring';
import { START_YEAR, TOTAL_WEEKS, WEEKS_PER_MONTH, WEEKS_PER_YEAR, yearFraction, yearOf } from './time';
import type {
  ContractOffer,
  GameProject,
  GameSpec,
  GenreId,
  PolishMode,
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
    cash: STARTING_CASH,
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
  newTrend(state);
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
  return officeRent(state, state.officeLevel) + state.staff.reduce((a, s) => a + staffSalary(state, s), 0);
}

/** What someone costs per month; the founder's wage follows the price index. */
export function staffSalary(state: GameState, s: Staff): number {
  return s.founder ? founderSalary(state) : s.salary;
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
  return m * storeOutputMultiplier(state);
}

export function designMultiplier(state: GameState): number {
  let m = 1;
  if (hasResearch(state, 'design1')) m *= 1.15;
  if (hasResearch(state, 'design2')) m *= 1.15;
  if (hasResearch(state, 'design3')) m *= 1.2;
  return m * storeOutputMultiplier(state);
}

export function bugMultiplier(state: GameState): number {
  let m = 1;
  if (hasResearch(state, 'qa1')) m *= 0.7;
  if (hasResearch(state, 'qa2')) m *= 0.7;
  if (hasUpgrade(state, 'tests')) m *= 0.85;
  return m;
}

// ---------------------------------------------------------------------------
// Store power-ups

export function hasUpgrade(state: GameState, id: StoreItemId): boolean {
  return state.upgrades?.includes(id) ?? false;
}

/** Game-development weeks left on a boost (0 when inactive). */
export function boostWeeks(state: GameState, id: StoreItemId): number {
  return state.boosts?.[id] ?? 0;
}

/** Output from store items: the espresso bar boost and ergonomic chairs. */
export function storeOutputMultiplier(state: GameState): number {
  return (boostWeeks(state, 'coffee') > 0 ? 1.2 : 1) * (hasUpgrade(state, 'chairs') ? 1.05 : 1);
}

/** Chance per week that someone not already in the zone gets in it. */
export function zoneChance(state: GameState): number {
  return ZONE_CHANCE * (boostWeeks(state, 'pizza') > 0 ? 3 : 1) * (hasUpgrade(state, 'headphones') ? 1.5 : 1);
}

/** Price today: boosts scale with team size, and everything with the years like salaries. */
export function storePrice(state: GameState, id: StoreItemId): number {
  const item = storeItemById(id);
  const team = item.kind === 'upgrade' ? 1 : Math.max(1, state.staff.length);
  return friendly(item.price * team * priceIndex(state.week));
}

/** Why an item can't be bought right now, or null if it can. */
export function storeBlocker(state: GameState, id: StoreItemId): string | null {
  const item = storeItemById(id);
  if (item.kind === 'upgrade' && hasUpgrade(state, id)) return 'Already owned.';
  if (id === 'bugbash') {
    const p = state.activity;
    if (!p || p.kind !== 'game') return 'Only while making a game.';
    if (p.bugs <= 0) return 'No bugs to fix.';
  }
  if (storePrice(state, id) > state.cash) return 'Not enough cash.';
  return null;
}

/** Buys a store item. Returns an error message, or null on success. */
export function buyStoreItem(state: GameState, id: StoreItemId): string | null {
  const blocked = storeBlocker(state, id);
  if (blocked) return blocked;
  const item = storeItemById(id);
  state.cash -= storePrice(state, id);
  if (item.kind === 'boost') {
    state.boosts = { ...state.boosts, [id]: boostWeeks(state, id) + (item.weeks ?? 0) };
  } else if (item.kind === 'upgrade') {
    state.upgrades = [...(state.upgrades ?? []), id];
  } else if (id === 'bugbash' && state.activity?.kind === 'game') {
    const p = state.activity;
    p.bugs -= Math.min(p.bugs, Math.max(1, Math.round(p.bugs * 0.4)));
  }
  return null;
}

// ---------------------------------------------------------------------------
// The studio cat. Now and then, while a game is being made, it curls up on
// someone's lap, and a purring cat makes that developer work faster.

/** Output multiplier for whoever has the cat on their lap. */
export const CAT_LAP_BOOST = 1.3;
/** Weekly chance, during development, that the cat picks a lap. */
export const CAT_LAP_CHANCE = 0.15;
/** Weeks the cat wants to itself after a lap visit. */
export const CAT_COOLDOWN_WEEKS = 3;
/** How long the cat stays when the player puts it on a lap. */
export const CAT_PLACED_WEEKS = 3;

export function catBoost(state: GameState, staffId: number): number {
  return state.cat?.lap?.staffId === staffId ? CAT_LAP_BOOST : 1;
}

/** Who has the cat on their lap, if anyone. */
export function catLapStaff(state: GameState): Staff | undefined {
  const id = state.cat?.lap?.staffId;
  return id === undefined ? undefined : state.staff.find((s) => s.id === id);
}

/** The player puts the cat on someone's lap. Returns an error message, or null on success. */
export function placeCatOnLap(state: GameState, staffId: number): string | null {
  const s = state.staff.find((x) => x.id === staffId);
  if (!s) return 'Staff member not found.';
  if (state.cat?.lap?.staffId === staffId) return null;
  if ((state.cat?.cooldown ?? 0) > 0) return 'The cat wants some alone time.';
  state.cat = { lap: { staffId, weeks: CAT_PLACED_WEEKS } };
  return null;
}

/** The player lifts the cat off a lap: the boost ends and the cat wants some space. */
export function catLeaveLap(state: GameState): void {
  if (!state.cat?.lap) return;
  state.cat = { cooldown: CAT_COOLDOWN_WEEKS };
}

function tickCat(state: GameState, events: SimEvent[]) {
  const cat = (state.cat ??= {});
  if (cat.lap) {
    const owner = state.staff.find((s) => s.id === cat.lap!.staffId);
    cat.lap.weeks--;
    if (!owner || cat.lap.weeks <= 0) {
      events.push({ type: 'catLeft', staffId: cat.lap.staffId });
      state.cat = { cooldown: CAT_COOLDOWN_WEEKS };
    }
    return;
  }
  if (cat.cooldown) {
    cat.cooldown--;
    if (!cat.cooldown) delete cat.cooldown;
    return;
  }
  // Only working laps are warm enough: the cat picks someone while a game is in development.
  if (state.activity?.kind !== 'game' || !state.staff.length) return;
  if (random(state) >= CAT_LAP_CHANCE) return;
  const s = pick(state, state.staff);
  state.cat = { lap: { staffId: s.id, weeks: int(state, 2, 4) } };
  events.push({ type: 'catLap', staffId: s.id, name: s.name });
}

/** Boosts only count down while a game is being made. */
function tickBoosts(state: GameState) {
  if (!state.boosts) return;
  for (const [id, w] of Object.entries(state.boosts)) {
    if (!w || w <= 1) delete state.boosts[id];
    else state.boosts[id] = w - 1;
  }
}

export function availableSizes(state: GameState) {
  return SIZES.filter((s) => !s.research || hasResearch(state, s.research));
}

export function availableMarketing(state: GameState) {
  return MARKETING.filter((m) => (!m.research || hasResearch(state, m.research)) && (!m.fromYear || yearOf(state.week) >= m.fromYear));
}

export interface CostBreakdown {
  license: number;
  size: number;
  marketing: number;
  total: number;
}

export function gameCost(state: GameState, spec: Pick<GameSpec, 'platform' | 'size' | 'marketing'>): CostBreakdown {
  const license = state.licenses.includes(spec.platform) ? 0 : platformById(spec.platform).license;
  const size = sizeCost(state, spec.size);
  const marketing = marketingCost(state, spec.marketing, spec.size);
  return { license, size, marketing, total: license + size + marketing };
}

export function salaryFor(state: GameState, design: number, tech: number): number {
  return Math.round(((800 + (design + tech) * 350) * priceIndex(state.week)) / 50) * 50;
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
  // A sequel to an award winner: players are waiting for it from day one.
  const original = spec.sequelOf !== undefined ? state.released.find((g) => g.id === spec.sequelOf) : undefined;
  const hype = original ? sequelHype(original) : 0;
  if (original && hype > 0) notify(state, `Fans of ${original.name} can't wait for the sequel: +${hype} hype.`, 'good');
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
    spend: { budget: cost.license + cost.size, marketing: cost.marketing, team: 0 },
    ...(hype > 0 ? { hype } : {}),
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
  if (state.cat?.lap?.staffId === staffId) state.cat = { cooldown: CAT_COOLDOWN_WEEKS };
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
  const cost = officeCost(state, state.officeLevel + 1);
  if (state.cash < cost) return `Moving costs $${cost.toLocaleString('en-US')}.`;
  state.cash -= cost;
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
  const audience = (reachableUsers(users) * 1e6 * 0.0008 + 3000) * sf * platformGenreFit(platform, p.genre) * size.unitMult * market.salesMult;
  const fanBuyers = state.fans * 0.2 * (score / 10) * Math.sqrt(size.unitMult);
  // Hype: launch buzz for a game that delivers, a backlash for one that doesn't.
  const hype = p.hype ?? 0;
  const buzz = hypeEffect(hype, score, market.salesMult);
  // The industry: this year's trend sells, a rival's recent hit with the same idea takes a share.
  const trend = trendMult(state, p.genre, p.topic);
  const clash = rivalClash(state, p.genre, p.topic);
  const clashMult = clash ? RIVAL_CLASH_MULT : 1;
  const targetUnits = Math.round((audience * range(state, 0.85, 1.15) + fanBuyers) * sequelMult * buzz.salesMult * trend * clashMult);
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
    hype: Math.round(hype),
    acclaim: acclaimFor(score)?.id,
    spend: p.spend ? { ...p.spend } : undefined,
    weekly: { units: [], revenue: [] },
  };

  // Learning: knowledge about combos, area importance and balance.
  const insights: ReleaseReport['insights'] = [];
  const award = acclaimFor(score);
  if (award) insights.push({ text: `${award.icon} ${award.name}! Critics are raving, and a sequel would start with fans already excited.`, kind: 'good' });
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
  if (hype >= 5) {
    const pct = Math.round((buzz.salesMult - 1) * 100);
    if (pct > 0) insights.push({ text: `The hype paid off: +${pct}% launch sales.`, kind: 'good' });
    else if (pct < 0) {
      const lost = Math.round(state.fans * (1 - buzz.fansMult) * 0.2);
      state.fans = Math.max(0, state.fans - lost);
      insights.push({ text: `Backlash: players were promised more. ${pct}% sales${lost ? ` and ${lost.toLocaleString('en-US')} fans lost` : ''}.`, kind: 'bad' });
    } else insights.push({ text: "The hype didn't move sales: the reviews were only average.", kind: 'info' });
  }
  if (trend > 1) insights.push({ text: `Riding this year's trend: +${Math.round((trend - 1) * 100)}% sales.`, kind: 'good' });
  if (clash) insights.push({ text: `${clash.studio}'s ${clash.name} got there first: ${Math.round((clashMult - 1) * 100)}% sales.`, kind: 'bad' });
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

  // Shipping teaches the most: a well-reviewed, bigger game earns more research points.
  const rpEarned = Math.round(score * RP_PER_SCORE_POINT * sizeXp);
  state.rp += rpEarned;
  state.bestPPW = Math.max(state.bestPPW, ev.ppw);
  state.released.push(game);
  for (const s of state.staff) s.zone = 0;
  state.activity = null;
  notify(state, `${game.name} released to an average score of ${score.toFixed(1)}.`, score >= 7 ? 'good' : score < 5 ? 'bad' : 'info');
  if (award) notify(state, `${award.icon} ${game.name} is a ${award.name}!`, 'good');
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

/** Research points per release, per review point (times the size bonus). */
export const RP_PER_SCORE_POINT = 1.2;

/**
 * Research points a week of game development teaches the studio: a base for
 * the studio itself plus a share per person, so a solo founder still makes
 * steady progress (contracts teach half as much).
 */
export function weeklyRp(state: GameState): number {
  return 1 + 0.5 * state.staff.length;
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
    tickBoosts(state);
  } else if (act?.kind === 'contract') {
    act.weeksDone++;
    state.rp = Math.floor(state.rp) + wholeNumber(state, weeklyRp(state) * 0.5);
    if (act.weeksDone >= act.offer.weeks) {
      state.cash += act.offer.pay;
      state.rp += act.offer.rp;
      state.activity = null;
      notify(state, `Contract "${act.offer.title}" done: +$${act.offer.pay.toLocaleString('en-US')}, +${act.offer.rp} RP.`, 'good');
      events.push({ type: 'contractDone', offer: act.offer });
    }
  }

  tickCat(state, events);
  tickSales(state);

  tickExpo(state);
  tickIndustry(state);
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
  // The team's salaries and rent while they work on it count towards what the game cost.
  if (p.spend) p.spend.team += Math.round(monthlyCosts(state) / WEEKS_PER_MONTH);
  if (p.hype) p.hype = Math.round(p.hype * HYPE_DECAY * 10) / 10;
  // Saves from before points were whole numbers.
  p.bugs = Math.round(p.bugs);
  p.design = Math.round(p.design);
  p.tech = Math.round(p.tech);
  state.rp = Math.floor(state.rp);

  if (p.phase >= 3) {
    p.polishWeeks++;
    if ((p.polishMode ?? 'bugs') === 'bugs') {
      // The team squashes bugs, one whole bug at a time, at least one per week.
      const fixPower = state.staff.reduce((a, s) => a + s.tech * s.speed * catBoost(state, s.id), 0) * (hasResearch(state, 'qa2') ? 0.75 : 0.5);
      const fixed = Math.min(p.bugs, Math.max(1, Math.round(fixPower * range(state, 0.8, 1.2))));
      p.bugs -= fixed;
      events.push({ type: 'points', design: 0, tech: 0, bugs: -fixed });
    } else {
      polishPoints(state, p, p.polishMode as 'design' | 'tech', events);
    }
    return;
  }

  let design = 0;
  let tech = 0;
  const noise = range(state, 0.85, 1.15);
  let bugWeight = 0;
  // Raw (fractional) output per person and area, scaled once the week's whole-number totals are known.
  const shares: { c: { design: number; tech: number }; area: number; d: number; t: number }[] = [];
  for (const s of state.staff) {
    if (!s.zone && random(state) < zoneChance(state)) {
      s.zone = int(state, 2, 3);
      events.push({ type: 'zone', staffId: s.id, name: s.name });
    }
    // In the zone: much more output, and focused work makes fewer bugs. A cat on the lap helps too.
    const boost = (s.zone ? ZONE_BOOST : 1) * catBoost(state, s.id);
    const pts = staffWeeklyPoints(state, s, p.phase, p.focus[p.phase]);
    const c = (p.contrib[s.id] ??= { design: 0, tech: 0 });
    pts.forEach((a, i) => {
      const d = a.design * noise * boost;
      const t = a.tech * noise * boost;
      design += d;
      tech += t;
      bugWeight += (d + t) * (s.zone ? 0.5 : 1);
      shares.push({ c, area: p.phase * 3 + i, d, t });
    });
    if (s.zone) s.zone--;
  }
  // Points are gained in whole numbers; random rounding keeps the long-run average.
  const designGain = wholeNumber(state, design);
  const techGain = wholeNumber(state, tech);
  const dk = design > 0 ? designGain / design : 0;
  const tk = tech > 0 ? techGain / tech : 0;
  for (const sh of shares) {
    sh.c.design += sh.d * dk;
    sh.c.tech += sh.t * tk;
    p.areaPoints[sh.area] += sh.d * dk + sh.t * tk;
  }
  const bugs = wholeNumber(state, bugWeight * 0.12 * bugMultiplier(state) * range(state, 0.6, 1.4));
  p.design += designGain;
  p.tech += techGain;
  p.bugs += bugs;
  state.rp += wholeNumber(state, weeklyRp(state));
  events.push({ type: 'points', design: designGain, tech: techGain, bugs });

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

/** Share of a normal development week's output that a polishing week adds. */
export const POLISH_RATE = 0.5;
/** Each further design/tech polishing week yields this much of the previous one. */
export const POLISH_DECAY = 0.8;

/**
 * Polishing design or tech: the team adds points of one kind (using the last
 * phase's focus), with diminishing returns so polishing can't go on forever.
 * New work brings a few new bugs and nobody is fixing them.
 */
function polishPoints(state: GameState, p: GameProject, kind: 'design' | 'tech', events: SimEvent[]) {
  const n = p.pointPolishWeeks ?? 0;
  p.pointPolishWeeks = n + 1;
  const mult = POLISH_RATE * Math.pow(POLISH_DECAY, n) * range(state, 0.85, 1.15);
  let raw = 0;
  for (const s of state.staff) {
    const skill = kind === 'design' ? s.design * designMultiplier(state) : s.tech * techMultiplier(state);
    raw += skill * s.speed * mult * catBoost(state, s.id);
  }
  const gain = wholeNumber(state, raw);
  const bugs = wholeNumber(state, raw * 0.06 * bugMultiplier(state) * range(state, 0.6, 1.4));
  if (kind === 'design') p.design += gain;
  else p.tech += gain;
  p.bugs += bugs;
  for (const s of state.staff) {
    const c = (p.contrib[s.id] ??= { design: 0, tech: 0 });
    c[kind] += gain / state.staff.length;
  }
  events.push({ type: 'points', design: kind === 'design' ? gain : 0, tech: kind === 'tech' ? gain : 0, bugs });
}

/** Chooses what the team polishes once development is complete. */
export function setPolishMode(state: GameState, mode: PolishMode): string | null {
  const p = state.activity;
  if (!p || p.kind !== 'game' || p.phase < 3) return 'Nothing to polish.';
  p.polishMode = mode;
  return null;
}

/** How much a design/tech polishing week adds right now, relative to the first one (1 → 0). */
export function polishYield(p: GameProject): number {
  return Math.pow(POLISH_DECAY, p.pointPolishWeeks ?? 0);
}

function salesWeight(week: number): number {
  return ((1 - SALES_DECAY) * Math.pow(SALES_DECAY, week)) / (1 - Math.pow(SALES_DECAY, SALES_WEEKS));
}

// ---------------------------------------------------------------------------
// Marketing

/** Why a promo can't run right now, or null if it can. */
export function promoBlocker(state: GameState, id: PromoId): string | null {
  const p = state.activity;
  if (!p || p.kind !== 'game') return 'Only while making a game.';
  const promo = promoById(id);
  if (p.promos?.includes(id)) return 'Already done for this game.';
  if (promo.fromYear && yearOf(state.week) < promo.fromYear) return `Available from ${promo.fromYear}.`;
  if (p.phase < promo.fromPhase) return 'Needs more of the game to show.';
  if (promoPrice(state, id) > state.cash) return 'Not enough cash.';
  return null;
}

/** Runs a promo for the game in development: costs money, builds hype. */
export function runPromo(state: GameState, id: PromoId): string | null {
  const blocked = promoBlocker(state, id);
  if (blocked) return blocked;
  const p = state.activity as GameProject;
  const price = promoPrice(state, id);
  state.cash -= price;
  if (p.spend) p.spend.marketing += price;
  p.hype = Math.min(MAX_HYPE, (p.hype ?? 0) + promoById(id).hype);
  p.promos = [...(p.promos ?? []), id];
  return null;
}

/** Why a booth can't be booked right now, or null if it can. */
export function boothBlocker(state: GameState, id: BoothId): string | null {
  const weeks = weeksToExpo(state, WEEKS_PER_YEAR);
  if (weeks === null || weeks < 1 || weeks > EXPO_BOOKING_WEEKS) return 'Booking opens 8 weeks before GameExpo.';
  if (state.expo?.year === yearOf(state.week)) return 'You already have a booth this year.';
  if (boothPrice(state, id) > state.cash) return 'Not enough cash.';
  return null;
}

export function bookBooth(state: GameState, id: BoothId): string | null {
  const blocked = boothBlocker(state, id);
  if (blocked) return blocked;
  const price = boothPrice(state, id);
  state.cash -= price;
  state.expo = { year: yearOf(state.week), booth: id };
  // The booth shows off the game in development, if there is one.
  const p = state.activity;
  if (p?.kind === 'game' && p.spend) p.spend.marketing += price;
  return null;
}

/** Announces GameExpo when booking opens, and runs it on expo week. */
function tickExpo(state: GameState) {
  const w = state.week % WEEKS_PER_YEAR;
  if (w === EXPO_WEEK - EXPO_BOOKING_WEEKS) {
    notify(state, `GameExpo ${yearOf(state.week)} opens in ${EXPO_BOOKING_WEEKS} weeks. Book a booth to show off your game.`, 'info');
  }
  if (w !== EXPO_WEEK || state.expo?.year !== yearOf(state.week)) return;
  const booth = boothById(state.expo.booth);
  const p = state.activity;
  if (p?.kind === 'game') {
    // A game in development is the star of the show.
    p.hype = Math.min(MAX_HYPE, (p.hype ?? 0) + booth.hype);
    state.fans += booth.fans;
    notify(state, `GameExpo: crowds lined up to play ${p.name}! +${booth.hype} hype, +${booth.fans.toLocaleString('en-US')} fans.`, 'good');
  } else {
    const fans = Math.round(booth.fans / 2);
    state.fans += fans;
    notify(state, `GameExpo: with nothing new to show, the booth won ${fans.toLocaleString('en-US')} fans.`, 'info');
  }
}

/** Why a post-launch push can't run on this game, or null if it can. */
export function salesPushBlocker(state: GameState, gameId: number, id: SalesPushId): string | null {
  const g = state.released.find((x) => x.id === gameId);
  if (!g) return 'Game not found.';
  if (g.weeksOnMarket >= SALES_WEEKS) return 'It has left the charts.';
  if (g.pushes?.includes(id)) return 'Already done for this game.';
  if (salesPushPrice(state, id) > state.cash) return 'Not enough cash.';
  return null;
}

/** Ad push (+25% of the copies left to sell) or discount sale (40% off, 70% more copies, more fans). */
export function pushSales(state: GameState, gameId: number, id: SalesPushId): string | null {
  const blocked = salesPushBlocker(state, gameId, id);
  if (blocked) return blocked;
  const g = state.released.find((x) => x.id === gameId)!;
  const price = salesPushPrice(state, id);
  state.cash -= price;
  if (g.spend) g.spend.marketing += price;
  const remaining = Math.max(0, g.targetUnits - g.unitsSold);
  if (id === 'ads') g.targetUnits += Math.round(remaining * 0.15);
  else {
    g.targetUnits += Math.round(remaining * 0.7);
    g.unitPrice *= 0.6;
  }
  g.pushes = [...(g.pushes ?? []), id];
  return null;
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
    if (g.weekly) {
      g.weekly.units.push(units);
      g.weekly.revenue.push(revenue);
    }
    state.cash += revenue;
    state.totalRevenue += revenue;
    let fans = units * 0.1 * clamp((g.score - 4) / 6, -0.3, 1);
    if (fans > 0) fans *= hypeEffect(g.hype ?? 0, g.score, marketingById(g.marketing).salesMult).fansMult * (g.pushes?.includes('sale') ? 1.5 : 1);
    fans = Math.round(fans);
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
  // Yearly pay review: salaries keep up with the market rate for each person's skills.
  for (const s of state.staff) if (!s.founder) s.salary = Math.max(s.salary, salaryFor(state, s.design, s.tech));
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

/** Contract pay covers this multiple of the studio's running costs for the contract's weeks. */
const CONTRACT_MARGIN = 1.5;

function refreshContracts(state: GameState) {
  const platforms = availablePlatforms(state);
  state.contractOffers = [0, 1, 2].map(() => {
    const weeks = int(state, 2, 6);
    const title = pick(state, CONTRACT_TEMPLATES)
      .replace('{biz}', pick(state, BUSINESSES))
      .replace('{topic}', topicById(pick(state, state.topics)).name)
      .replace('{platform}', pick(state, platforms).name);
    // Contracts pay the bills with a little to spare: a safety net, not a way to get rich.
    const pay = friendly(weeks * ((monthlyCosts(state) / WEEKS_PER_MONTH) * CONTRACT_MARGIN + 800 * priceIndex(state.week)) * range(state, 0.85, 1.2));
    const offer: ContractOffer = { id: state.nextId++, title, weeks, pay, rp: Math.max(2, Math.round(weeks * 1.2 * range(state, 0.7, 1.4))) };
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

/**
 * Suggests a title that fits the genre and, once it's chosen, the topic, avoiding
 * `avoid` (the current suggestion) so a re-roll always changes it. Uses
 * Math.random by default so suggesting names doesn't shift the deterministic
 * game RNG; tests pass a seeded `rand`.
 */
export function randomTitle(genre: GenreId, avoid?: string, topic?: string, rand: () => number = Math.random): string {
  const t = GENRE_TITLES[genre];
  const words = topic ? TOPIC_TITLE_WORDS[topic] : undefined;
  const pick = <T>(list: T[]) => list[Math.floor(rand() * list.length)];
  for (let i = 0; i < 10; i++) {
    // With a topic, most suggestions mention it; the rest keep the genre's classic patterns for variety.
    const useTopic = !!words && rand() < 0.8;
    const pattern = pick(useTopic ? t.topicPatterns : t.patterns);
    const raw = pattern.replace('{t}', words ? pick(words) : '').replace('{a}', pick(t.a)).replace('{b}', pick(t.b));
    // Capitalise the start and after a colon ("the Twelve Moons: Saga" -> "The Twelve Moons: Saga").
    const title = raw.replace(/(^|: )([a-z])/g, (_, pre: string, c: string) => pre + c.toUpperCase());
    if (title !== avoid) return title;
  }
  return avoid ?? '';
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
