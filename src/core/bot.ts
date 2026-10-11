/**
 * Simple automated players used by tests to check that a full playthrough
 * works and that the economy is balanced (smart play wins, careless play struggles).
 */
import { OFFICES, RESEARCH, TOPICS, genreById, platformGenreFit, platformUsers, topicFit } from './data';
import {
  availableGenres,
  availableMarketing,
  availablePlatforms,
  availableSizes,
  bookBooth,
  doResearch,
  gameCost,
  hire,
  monthlyCosts,
  officeCapacity,
  pushSales,
  releaseGame,
  researchBlocker,
  runPromo,
  setPhaseFocus,
  startContract,
  startGame,
  tick,
  train,
  upgradeOffice,
} from './sim';
import { RIVAL_CLASH_MULT, rivalClash, trendMult } from './industry';
import { yearFraction } from './time';
import type { GameSpec, GameState, ReleaseReport } from './types';

/**
 * smart: plays well. naive: careless solo developer. eager: grows like the smart
 * bot (hires, upgrades, big budgets) but designs games carelessly. casual: an
 * average player: sensible but not optimal combos, even focus sliders, a little
 * polishing, cautious hiring and no training.
 */
export type BotStyle = 'smart' | 'naive' | 'eager' | 'casual';

function smartFocus(genre: string, phase: number): number[] {
  const imp = genreById(genre).importance.slice(phase * 3, phase * 3 + 3);
  return imp.map((v) => (v > 1 ? 60 : v < 1 ? 15 : 35));
}

export function botTurn(state: GameState, style: BotStyle, reports: ReleaseReport[]): void {
  const act = state.activity;

  if (act?.kind === 'game') {
    // Marketing: everyone sensible runs a preview; the smart bot hypes bigger games and goes to GameExpo.
    if (style === 'smart' || style === 'casual') runPromo(state, 'preview');
    if (style === 'smart' && act.size !== 'small') {
      runPromo(state, 'trailer');
      if (state.cash > monthlyCosts(state) * 12) runPromo(state, 'influencers');
      if (act.size === 'large' && state.cash > monthlyCosts(state) * 18) runPromo(state, 'tv_spot');
    }
    if (style === 'smart' && state.cash > monthlyCosts(state) * 6) bookBooth(state, act.size === 'small' ? 'small' : 'medium');
    if (act.awaitingFocus) setPhaseFocus(state, style === 'smart' ? smartFocus(act.genre, act.phase) : [50, 50, 50]);
    if (act.phase >= 3) {
      const total = act.design + act.tech;
      const done =
        style === 'smart' ? act.bugs / total < 0.015 || act.polishWeeks >= 6 : style === 'casual' ? act.bugs / total < 0.03 || act.polishWeeks >= 2 : true;
      if (done) {
        const r = releaseGame(state);
        if (typeof r !== 'string') reports.push(r);
      }
    }
    return;
  }

  if (style !== 'naive') {
    for (const r of [...RESEARCH.map((x) => x.id), ...TOPICS.map((t) => t.id)]) {
      if (!researchBlocker(state, r)) doResearch(state, r);
    }
    if (style !== 'casual') {
      for (const st of state.staff) {
        const skill = st.design <= st.tech ? 'design' : 'tech';
        if (state.cash > monthlyCosts(state) * 12) train(state, st.id, skill);
      }
    }
    const next = OFFICES[state.officeLevel + 1];
    if (next && state.cash > next.cost * (style === 'casual' ? 3 : 2.5)) upgradeOffice(state);
    const cushion = style === 'casual' ? 10 : 8;
    while (state.staff.length < officeCapacity(state) && state.candidates.length && state.cash > monthlyCosts(state) * cushion) {
      const best = [...state.candidates].sort((a, b) => b.design + b.tech - (a.design + a.tech))[0];
      if (hire(state, best.id)) break;
    }
  }

  if (style === 'smart') {
    for (const g of state.released) if (g.weeksOnMarket < 4 && g.score >= 7) pushSales(state, g.id, 'ads');
  }

  if (act) return;

  const reserve = monthlyCosts(state) * 3 + 5000;
  if (state.cash < reserve && state.contractOffers.length) {
    startContract(state, state.contractOffers[0].id);
    return;
  }

  const spec = style === 'smart' ? smartSpec(state) : style === 'casual' ? smartSpec(state, 2, true) : style === 'eager' ? eagerSpec(state) : naiveSpec(state);
  if (!spec) {
    if (state.contractOffers.length) startContract(state, state.contractOffers[0].id);
    return;
  }
  const focus = style === 'smart' ? smartFocus(spec.genre, 0) : [50, 50, 50];
  if (startGame(state, spec, focus) && state.contractOffers.length) {
    startContract(state, state.contractOffers[0].id);
  }
}

/** The best-selling spec it can afford; `minFit` 3 only takes great topic/genre matches, 2 takes good ones too. */
function smartSpec(state: GameState, minFit = 3, modestAds = false): GameSpec | null {
  const year = yearFraction(state.week);
  const recent = state.released.slice(-3);
  let best: { spec: GameSpec; value: number } | null = null;
  const sizes = availableSizes(state).filter((s) => state.staff.length >= s.minStaff);
  const marketing = availableMarketing(state);
  // An average player sizes ads to the game: none for small, magazine ads for medium, up to a big campaign for large.
  const allowed: Record<string, string[]> = { small: ['none'], medium: ['none', 'ads'], large: ['none', 'ads', 'campaign'] };
  const adsFor = (size: string) => (modestAds ? marketing.filter((m) => allowed[size].includes(m.id)) : marketing);
  for (const platform of availablePlatforms(state)) {
    for (const genre of availableGenres(state)) {
      for (const topic of state.topics) {
        if (recent.some((g) => g.topic === topic && g.genre === genre.id)) continue;
        const fit = topicFit(topic, genre.id);
        if (fit < minFit) continue;
        for (const size of sizes) {
          for (const m of adsFor(size.id)) {
            const spec: GameSpec = { name: `Game ${state.released.length + 1}`, topic, genre: genre.id, platform: platform.id, size: size.id, marketing: m.id };
            const cost = gameCost(state, spec).total;
            if (cost > state.cash - monthlyCosts(state) * 4) continue;
            // The smart bot reads the news: it chases trends and avoids a rival's recent hit.
            const news = modestAds ? 1 : trendMult(state, genre.id, topic) * (rivalClash(state, genre.id, topic) ? RIVAL_CLASH_MULT : 1);
            const value = (platformUsers(platform, year) + 5) * platformGenreFit(platform, genre.id) * size.unitMult * m.salesMult * platform.priceMult * news - cost / 20000;
            if (!best || value > best.value) best = { spec, value };
          }
        }
      }
    }
  }
  return best?.spec ?? null;
}

function naiveSpec(state: GameState): GameSpec | null {
  const n = state.released.length;
  const topic = state.topics[n % state.topics.length];
  const genres = availableGenres(state);
  const genre = genres[(n * 3) % genres.length].id;
  const spec: GameSpec = { name: `Game ${n + 1}`, topic, genre, platform: 'pc', size: 'small', marketing: 'none' };
  return gameCost(state, spec).total <= state.cash ? spec : null;
}

/** Big, well-marketed games on the biggest platform, but with whatever topic and genre comes to mind. */
function eagerSpec(state: GameState): GameSpec | null {
  const n = state.released.length;
  const year = yearFraction(state.week);
  const topic = state.topics[(n * 7) % state.topics.length];
  const genres = availableGenres(state);
  const genre = genres[(n * 3) % genres.length].id;
  const platform = [...availablePlatforms(state)].sort((a, b) => platformUsers(b, year) - platformUsers(a, year))[0];
  const sizes = availableSizes(state).filter((s) => state.staff.length >= s.minStaff).reverse();
  const marketing = [...availableMarketing(state)].reverse();
  for (const size of sizes) {
    for (const m of marketing) {
      const spec: GameSpec = { name: `Game ${n + 1}`, topic, genre, platform: platform.id, size: size.id, marketing: m.id };
      if (gameCost(state, spec).total <= state.cash - monthlyCosts(state) * 2) return spec;
    }
  }
  return null;
}

export function playThrough(state: GameState, style: BotStyle, maxWeeks = Infinity) {
  const reports: ReleaseReport[] = [];
  let weeks = 0;
  while (!state.over && weeks < maxWeeks) {
    botTurn(state, style, reports);
    tick(state);
    weeks++;
  }
  return reports;
}
