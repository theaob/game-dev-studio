/**
 * The wider games industry: a yearly trend (a hot genre and topic that sell
 * better), rival studios releasing games, platform rumours and a yearly
 * round-up. It all shows up as headlines on the News tab.
 */
import { GENRES, PLATFORMS, TOPICS, genreById, topicById } from './data';
import { pick, random, range } from './rng';
import { SALES_WEEKS, notify, randomTitle } from './sim';
import { GOTY_ICON, GOTY_SALES_BOOST, gotyFans } from './acclaim';
import { WEEKS_PER_YEAR, yearOf } from './time';
import type { GameState, GenreId, IndustryState, NoticeKind } from './types';

/** Sales bonus for a game in the trending genre / on the trending topic. */
export const TREND_GENRE_BONUS = 1.15;
export const TREND_TOPIC_BONUS = 1.1;
/** A rival's hit with the same topic and genre this recently takes some of your sales. */
export const RIVAL_CLASH_WEEKS = 26;
export const RIVAL_CLASH_MULT = 0.85;
export const RIVAL_HIT_SCORE = 8;
/** Chance per week that some rival releases a game. */
const RIVAL_RELEASE_CHANCE = 0.15;
const MAX_HEADLINES = 80;

export interface Rival {
  name: string;
  /** Year the studio opens (and starts releasing games). */
  from: number;
  /** Year it closes, if it does. */
  until?: number;
  /** Typical review score. */
  quality: number;
  genres: GenreId[];
}

export const RIVALS: Rival[] = [
  { name: 'Bitwise Bros', from: 1985, until: 1999, quality: 6.5, genres: ['action', 'puzzle'] },
  { name: 'Lunar Soft', from: 1985, quality: 7, genres: ['adventure', 'rpg'] },
  { name: 'Ironclad Interactive', from: 1987, quality: 7.3, genres: ['strategy', 'simulation'] },
  { name: 'Pixelforge', from: 1990, quality: 7.6, genres: ['action', 'rpg'] },
  { name: 'Quokka Games', from: 1993, until: 2012, quality: 6.4, genres: ['casual', 'puzzle'] },
  { name: 'Northwind Studios', from: 1997, quality: 8, genres: ['rpg', 'adventure'] },
  { name: 'Hexagon Labs', from: 2001, quality: 7.4, genres: ['strategy', 'simulation', 'puzzle'] },
  { name: 'Cobalt Entertainment', from: 2004, quality: 7.8, genres: ['action', 'adventure'] },
  { name: 'Tiny Lantern', from: 2009, quality: 7.2, genres: ['puzzle', 'casual', 'adventure'] },
  { name: 'Spark & Moss', from: 2013, quality: 7.5, genres: ['casual', 'simulation'] },
];

export function activeRivals(year: number): Rival[] {
  return RIVALS.filter((r) => year >= r.from && (r.until === undefined || year < r.until));
}

function industry(state: GameState): IndustryState {
  return (state.industry ??= { headlines: [], rivalGames: [] });
}

export function headline(state: GameState, icon: string, text: string, kind: NoticeKind = 'info') {
  const ind = industry(state);
  ind.headlines.push({ week: state.week, icon, text, kind });
  if (ind.headlines.length > MAX_HEADLINES) ind.headlines.splice(0, ind.headlines.length - MAX_HEADLINES);
}

/** Picks this year's hot genre and topic (never the same as last year's). */
export function newTrend(state: GameState) {
  const ind = industry(state);
  const year = yearOf(state.week);
  const genre = pick(state, GENRES.filter((g) => g.id !== ind.trend?.genre)).id;
  const topic = pick(state, TOPICS.filter((t) => t.id !== ind.trend?.topic)).id;
  ind.trend = { year, genre, topic };
  const owned = state.topics.includes(topic) ? '' : ' (research it to cash in)';
  headline(state, '🔥', `${year} trend: players can't get enough of ${genreById(genre).name} games, and ${topicById(topic).name} is the topic everyone is talking about${owned}.`, 'good');
}

/** Sales multiplier from this year's trend. */
export function trendMult(state: GameState, genre: string, topic: string): number {
  const t = state.industry?.trend;
  if (!t) return 1;
  return (t.genre === genre ? TREND_GENRE_BONUS : 1) * (t.topic === topic ? TREND_TOPIC_BONUS : 1);
}

/** A recent rival hit with the same topic and genre, if any. */
export function rivalClash(state: GameState, genre: string, topic: string) {
  return state.industry?.rivalGames.find(
    (g) => g.genre === genre && g.topic === topic && g.score >= RIVAL_HIT_SCORE && state.week - g.week < RIVAL_CLASH_WEEKS,
  );
}

function rivalRelease(state: GameState) {
  const ind = industry(state);
  const year = yearOf(state.week);
  const rivals = activeRivals(year);
  if (!rivals.length) return;
  const rival = pick(state, rivals);
  // Rivals chase the trend some of the time.
  const trend = ind.trend;
  const genre = trend && random(state) < 0.35 ? (trend.genre as GenreId) : pick(state, rival.genres);
  const topic = trend && random(state) < 0.35 ? trend.topic : pick(state, TOPICS).id;
  const platforms = PLATFORMS.filter((p) => year >= p.start && (p.end === undefined || year < p.end));
  const platform = pick(state, platforms);
  const name = randomTitle(genre, undefined, topic, () => random(state));
  const score = Math.round(Math.min(9.9, Math.max(2.5, rival.quality + range(state, -2, 1.8))) * 10) / 10;
  ind.rivalGames.push({ week: state.week, studio: rival.name, name, genre, topic, score });
  if (ind.rivalGames.length > 30) ind.rivalGames.shift();
  const what = `${topicById(topic).name} ${genreById(genre).name} on ${platform.name}`;
  if (score >= 9) headline(state, '🏆', `${rival.name}'s ${name} (${what}) is a smash hit: ${score.toFixed(1)}. ${topicById(topic).name} ${genreById(genre).name} games will have a hard time for a while.`, 'bad');
  else if (score >= RIVAL_HIT_SCORE) headline(state, '⭐', `${rival.name} released ${name} (${what}) to great reviews: ${score.toFixed(1)}.`, 'info');
  else if (score < 5) headline(state, '💥', `${rival.name}'s ${name} (${what}) flopped with ${score.toFixed(1)}.`, 'info');
  else headline(state, '🎮', `${rival.name} released ${name} (${what}): ${score.toFixed(1)}.`, 'info');
}

function yearlyIndustry(state: GameState) {
  const year = yearOf(state.week);
  const last = year - 1;
  const mine = state.released.filter((g) => yearOf(g.releaseWeek) === last);
  if (mine.length) {
    const avg = mine.reduce((a, g) => a + g.score, 0) / mine.length;
    const revenue = mine.reduce((a, g) => a + g.revenue, 0);
    const best = mine.reduce((a, g) => (g.score > a.score ? g : a));
    headline(
      state,
      '🗓️',
      `${last} in review: ${state.studioName} released ${mine.length} game${mine.length > 1 ? 's' : ''} (average ${avg.toFixed(1)}, $${Math.round(revenue).toLocaleString('en-US')} so far). Best: ${best.name}.`,
      avg >= 7 ? 'good' : avg < 5 ? 'bad' : 'info',
    );
  }
  for (const p of PLATFORMS) {
    if (p.start === year) headline(state, '🚀', `The ${p.name} (${p.kind}) is out now!`, 'good');
    if (p.start === year + 1) headline(state, '👀', `Rumour: a new ${p.kind.toLowerCase()}, the ${p.name}, arrives next year.`);
    if (p.end === year) headline(state, '🪦', `The ${p.name} has been discontinued.`);
    if (p.end === year + 1) headline(state, '📉', `The ${p.name} is on its way out: it will be discontinued next year.`, 'bad');
  }
  for (const r of RIVALS) {
    if (r.from === year && year > RIVALS[0].from) headline(state, '🏢', `A new studio, ${r.name}, has opened its doors.`);
    if (r.until === year) headline(state, '🏚️', `${r.name} has closed down.`, 'bad');
  }
  gameOfTheYear(state, last);
  newTrend(state);
}

/**
 * Names the best-reviewed game released in `year`, the studio's or a rival's
 * (ties go to the studio). A winning studio game gets fans, more sales if it's
 * still on sale, and the award saved on it.
 */
export function gameOfTheYear(state: GameState, year: number) {
  const mine = state.released.filter((g) => yearOf(g.releaseWeek) === year);
  const rivals = (state.industry?.rivalGames ?? []).filter((g) => yearOf(g.week) === year);
  const best = mine.length ? mine.reduce((a, g) => (g.score > a.score ? g : a)) : undefined;
  const rival = rivals.length ? rivals.reduce((a, g) => (g.score > a.score ? g : a)) : undefined;
  if (best && (!rival || best.score >= rival.score)) {
    best.goty = year;
    const fans = gotyFans(state.fans);
    state.fans += fans;
    best.fansGained += fans;
    const remaining = Math.max(0, best.targetUnits - best.unitsSold);
    const onSale = remaining > 0 && best.weeksOnMarket < SALES_WEEKS;
    if (onSale) best.targetUnits += Math.round(remaining * GOTY_SALES_BOOST);
    const sales = onSale ? `, ${Math.round(GOTY_SALES_BOOST * 100)}% more copies of what it has left to sell` : '';
    const beat = rival ? ` It beat ${rival.studio}'s ${rival.name} (${rival.score.toFixed(1)}).` : '';
    headline(state, GOTY_ICON, `Game of the Year ${year}: ${state.studioName}'s ${best.name} (${best.score.toFixed(1)})!${beat}`, 'good');
    notify(state, `${GOTY_ICON} ${best.name} is Game of the Year ${year}! +${fans.toLocaleString('en-US')} fans${sales}.`, 'good');
  } else if (rival) {
    const yours = best && best.score >= RIVAL_HIT_SCORE ? ` Your best, ${best.name} (${best.score.toFixed(1)}), was in the running.` : '';
    headline(state, GOTY_ICON, `Game of the Year ${year}: ${rival.studio}'s ${rival.name} (${rival.score.toFixed(1)}).${yours}`, 'info');
  }
}

/** Weekly industry news. Call after the week has advanced. */
export function tickIndustry(state: GameState) {
  if (!state.industry?.trend) newTrend(state);
  if (state.week % WEEKS_PER_YEAR === 0) yearlyIndustry(state);
  if (random(state) < RIVAL_RELEASE_CHANCE) rivalRelease(state);
}
