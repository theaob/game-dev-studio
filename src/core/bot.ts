/**
 * Simple automated players used by tests to check that a full playthrough
 * works and that the economy is balanced (smart play wins, careless play struggles).
 */
import { GENRES, OFFICES, RESEARCH, TOPICS, genreById, platformGenreFit, platformUsers, topicFit } from './data';
import {
  availableMarketing,
  availablePlatforms,
  availableSizes,
  doResearch,
  gameCost,
  hire,
  monthlyCosts,
  officeCapacity,
  releaseGame,
  researchBlocker,
  setPhaseFocus,
  startContract,
  startGame,
  tick,
  train,
  upgradeOffice,
} from './sim';
import { yearFraction } from './time';
import type { GameSpec, GameState, ReleaseReport } from './types';

export type BotStyle = 'smart' | 'naive';

function smartFocus(genre: string, phase: number): number[] {
  const imp = genreById(genre).importance.slice(phase * 3, phase * 3 + 3);
  return imp.map((v) => (v > 1 ? 60 : v < 1 ? 15 : 35));
}

export function botTurn(state: GameState, style: BotStyle, reports: ReleaseReport[]): void {
  const act = state.activity;

  if (act?.kind === 'game') {
    if (act.awaitingFocus) setPhaseFocus(state, style === 'smart' ? smartFocus(act.genre, act.phase) : [50, 50, 50]);
    if (act.phase >= 3) {
      const total = act.design + act.tech;
      const done = style === 'naive' || act.bugs / total < 0.015 || act.polishWeeks >= 6;
      if (done) {
        const r = releaseGame(state);
        if (typeof r !== 'string') reports.push(r);
      }
    }
    return;
  }

  if (style === 'smart') {
    for (const r of [...RESEARCH.map((x) => x.id), ...TOPICS.map((t) => t.id)]) {
      if (!researchBlocker(state, r)) doResearch(state, r);
    }
    for (const st of state.staff) {
      const skill = st.design <= st.tech ? 'design' : 'tech';
      if (state.cash > monthlyCosts(state) * 12) train(state, st.id, skill);
    }
    const next = OFFICES[state.officeLevel + 1];
    if (next && state.cash > next.cost * 2.5) upgradeOffice(state);
    while (state.staff.length < officeCapacity(state) && state.candidates.length && state.cash > monthlyCosts(state) * 8) {
      const best = [...state.candidates].sort((a, b) => b.design + b.tech - (a.design + a.tech))[0];
      if (hire(state, best.id)) break;
    }
  }

  if (act) return;

  const reserve = monthlyCosts(state) * 3 + 5000;
  if (state.cash < reserve && state.contractOffers.length) {
    startContract(state, state.contractOffers[0].id);
    return;
  }

  const spec = style === 'smart' ? smartSpec(state) : naiveSpec(state);
  if (!spec) {
    if (state.contractOffers.length) startContract(state, state.contractOffers[0].id);
    return;
  }
  const focus = style === 'smart' ? smartFocus(spec.genre, 0) : [50, 50, 50];
  if (startGame(state, spec, focus) && state.contractOffers.length) {
    startContract(state, state.contractOffers[0].id);
  }
}

function smartSpec(state: GameState): GameSpec | null {
  const year = yearFraction(state.week);
  const recent = state.released.slice(-3);
  let best: { spec: GameSpec; value: number } | null = null;
  const sizes = availableSizes(state).filter((s) => state.staff.length >= s.minStaff);
  const marketing = availableMarketing(state);
  for (const platform of availablePlatforms(state)) {
    for (const genre of GENRES) {
      for (const topic of state.topics) {
        if (recent.some((g) => g.topic === topic && g.genre === genre.id)) continue;
        const fit = topicFit(topic, genre.id);
        if (fit < 3) continue;
        for (const size of sizes) {
          for (const m of marketing) {
            const spec: GameSpec = { name: `Game ${state.released.length + 1}`, topic, genre: genre.id, platform: platform.id, size: size.id, marketing: m.id };
            const cost = gameCost(state, spec).total;
            if (cost > state.cash - monthlyCosts(state) * 4) continue;
            const value = (platformUsers(platform, year) + 5) * platformGenreFit(platform, genre.id) * size.unitMult * m.salesMult * platform.priceMult - cost / 20000;
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
  const genre = GENRES[(n * 3) % GENRES.length].id;
  const spec: GameSpec = { name: `Game ${n + 1}`, topic, genre, platform: 'pc', size: 'small', marketing: 'none' };
  return gameCost(state, spec).total <= state.cash ? spec : null;
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
