import { OFFICES, PHASES, PLATFORMS, RESEARCH, STORE, TOPICS, genreById, platformById, platformUsers, sizeById, topicById } from '../core/data';
import { TREND_GENRE_BONUS, TREND_TOPIC_BONUS } from '../core/industry';
import { profit, verdict } from '../core/results';
import { GOTY_ICON, acclaimOf } from '../core/acclaim';
import { profitChart, sparkline } from './charts';
import {
  SALES_WEEKS,
  boostWeeks,
  catLapStaff,
  HEADHUNT_WEEKS,
  ROCKSTAR_SALARY_MULT,
  headhuntBlocker,
  headhuntFee,
  monthlyCosts,
  officeCapacity,
  polishYield,
  staffSalary,
  researchBlocker,
  researchCost,
  trainingCost,
} from '../core/sim';
import { WEEKS_PER_YEAR, formatDate, formatShortDate, yearOf } from '../core/time';
import { EXPO_BOOKING_WEEKS, weeksToExpo } from '../core/marketing';
import type { GameProject, GameState, PolishMode, ReleasedGame, Staff } from '../core/types';
import { esc, money, num, scoreClass } from './format';
import { officeCost, officeRent } from '../core/economy';

export type Tab = 'studio' | 'games' | 'research' | 'staff' | 'news';
export const SPEEDS = [0, 1, 2, 4];

/** Game HUD: studio and date, play/speed controls, and resource chips. Stat values are filled in by the app. */
export function renderTopbar(state: GameState, speed: number, lastSpeed: number): string {
  const paused = speed === 0;
  const shown = paused ? lastSpeed : speed;
  return `
  <div class="hud-row">
    <button class="hud-pill studio-pill" data-action="menu" aria-label="Menu">
      <span class="studio-logo">🎮</span>
      <span class="studio-text"><b>${esc(state.studioName)}</b><small>${formatDate(state.week)}</small></span>
    </button>
    <div class="grow"></div>
    <button class="hud-btn ${paused ? 'paused' : ''}" data-action="toggle-pause" aria-label="${paused ? 'Play' : 'Pause'}">${paused ? '▶' : '❚❚'}</button>
    <button class="hud-btn speed-btn" data-action="cycle-speed" aria-label="Speed ${SPEEDS[shown]}x">${SPEEDS[shown]}×</button>
  </div>
  <div class="hud-res">
    <div class="res" data-stat="cash"><i>💰</i><b>${money(state.cash)}</b></div>
    <div class="res" data-stat="fans"><i>❤️</i><b>${num(state.fans)}</b></div>
    <div class="res" data-stat="rp"><i>🔬</i><b>${Math.floor(state.rp)} RP</b></div>
  </div>`;
}

export function renderNav(tab: Tab, state: GameState, unreadNews: number): string {
  const canResearch = [...RESEARCH.map((r) => r.id), ...TOPICS.map((t) => t.id)].some((id) => !researchBlocker(state, id));
  const items: [Tab, string, string, boolean][] = [
    ['studio', '🏠', 'Studio', false],
    ['games', '🏆', 'Games', false],
    ['research', '🔬', 'Research', canResearch],
    ['staff', '👥', 'Team', false],
    ['news', '📰', 'News', unreadNews > 0 && tab !== 'news'],
  ];
  return `<nav class="tabs">${items
    .map(
      ([id, icon, label, dot]) =>
        `<button data-action="tab" data-arg="${id}" class="${tab === id ? 'on' : ''}" aria-label="${label}"><span class="tab-icon">${icon}</span><small>${label}</small>${dot ? '<i class="dot"></i>' : ''}</button>`,
    )
    .join('')}</nav>`;
}

// ---------------------------------------------------------------------------
// Studio: an action dock floating over the office
// ---------------------------------------------------------------------------

/** `cashOffer`: the text of a "watch a video for cash" chip, when the studio is in the red (Android only). */
export function renderDock(state: GameState, cashOffer = ''): string {
  const selling = state.released.filter((g) => g.weeksOnMarket < SALES_WEEKS);
  const ticker = selling.length
    ? `<button class="ticker" data-action="tab" data-arg="games">📈 ${selling.length} on sale · ${money(selling.reduce((a, g) => a + g.revenue, 0))} earned</button>`
    : '';
  const offer = cashOffer ? `<button class="ticker expo" data-action="ad-reward" data-arg="investor">${esc(cashOffer)}</button>` : '';
  return `${offer}${expoChip(state)}${ticker}${renderActivity(state)}`;
}

/** While GameExpo booking is open: a reminder that opens the Marketing sheet. */
function expoChip(state: GameState): string {
  const weeks = weeksToExpo(state, WEEKS_PER_YEAR);
  if (weeks === null || weeks < 1 || weeks > EXPO_BOOKING_WEEKS) return '';
  const booked = state.expo?.year === yearOf(state.week);
  const when = `${weeks} week${weeks === 1 ? '' : 's'}`;
  return booked
    ? `<button class="ticker" data-action="marketing">🎪 GameExpo in ${when} · booth booked</button>`
    : `<button class="ticker expo" data-action="marketing">🎪 GameExpo in ${when} · Book a booth</button>`;
}

// ---------------------------------------------------------------------------
// News
// ---------------------------------------------------------------------------

export function renderNews(state: GameState): string {
  const year = yearOf(state.week);
  const ind = state.industry;
  const trend = ind?.trend;
  const trendCard = trend
    ? `
  <h2>🔥 Trending in ${trend.year}</h2>
  <div class="list">
    <div class="list-item">
      <div class="emoji">${genreById(trend.genre).icon}</div>
      <div class="grow"><div class="name">${genreById(trend.genre).name} games</div><div class="sub">Hot genre this year</div></div>
      <span class="tag good">+${Math.round((TREND_GENRE_BONUS - 1) * 100)}% sales</span>
    </div>
    <div class="list-item">
      <div class="emoji">${topicById(trend.topic).icon}</div>
      <div class="grow"><div class="name">${topicById(trend.topic).name}</div><div class="sub">${state.topics.includes(trend.topic) ? 'Hot topic this year' : 'Hot topic this year · research it to use it'}</div></div>
      <span class="tag good">+${Math.round((TREND_TOPIC_BONUS - 1) * 100)}% sales</span>
    </div>
  </div>
  <p class="sub mt-s">A new trend starts every January. Both together sell ${Math.round((TREND_GENRE_BONUS * TREND_TOPIC_BONUS - 1) * 100)}% more.</p>`
    : '';

  // Platforms on sale, biggest audience first, with where they're heading.
  const live = PLATFORMS.filter((p) => platformUsers(p, year + 0.5) > 0).sort((a, b) => platformUsers(b, year + 0.5) - platformUsers(a, year + 0.5));
  const platformRows = live.map((p) => {
    const now = platformUsers(p, year + 0.5);
    const next = platformUsers(p, year + 1.5);
    const dir = p.end !== undefined && p.end <= year + 1 ? '<span class="tag bad">Ends next year</span>' : next > now * 1.05 ? '<span class="tag good">▲ Growing</span>' : next < now * 0.95 ? '<span class="tag mid">▼ Shrinking</span>' : '<span class="tag">Steady</span>';
    const owned = p.license > 0 && state.licenses.includes(p.id) ? ' · licensed' : '';
    return `
    <div class="list-item">
      <div class="emoji">${p.icon}</div>
      <div class="grow"><div class="name">${esc(p.name)}</div><div class="sub">${p.kind} · ${num(now * 1e6)} players${owned}</div></div>
      ${dir}
    </div>`;
  });
  const coming = PLATFORMS.filter((p) => p.start === year + 1);
  const comingRows = coming.map(
    (p) => `
    <div class="list-item">
      <div class="emoji">${p.icon}</div>
      <div class="grow"><div class="name">${esc(p.name)}</div><div class="sub">${p.kind} · arrives in ${p.start}</div></div>
      <span class="tag">Coming soon</span>
    </div>`,
  );

  const headlines = ind ? [...ind.headlines].reverse().slice(0, 40) : [];
  const groups: { label: string; items: string[] }[] = [];
  for (const h of headlines) {
    const label = formatShortDate(h.week);
    if (groups[groups.length - 1]?.label !== label) groups.push({ label, items: [] });
    groups[groups.length - 1].items.push(`<div class="headline ${h.kind}"><span class="hl-icon">${h.icon}</span><span>${esc(h.text)}</span></div>`);
  }
  const feed = groups.length
    ? groups.map((g) => `<h3 class="news-date">${g.label}</h3><div class="card news-card">${g.items.join('')}</div>`).join('')
    : '<div class="card empty">No headlines yet.</div>';

  const log = [...state.notices].reverse().slice(0, 30);
  return `
  ${trendCard}
  <h2>Platforms</h2>
  <div class="list">${platformRows.join('')}${comingRows.join('')}</div>
  <h2>Headlines</h2>
  ${feed}
  <details class="studio-log mt">
    <summary>Studio log</summary>
    <div class="list">${log.map((n) => `<div class="notice ${n.kind}"><div class="when">${formatShortDate(n.week)}</div>${esc(n.text)}</div>`).join('')}</div>
  </details>`;
}

function renderActivity(state: GameState): string {
  const a = state.activity;
  if (!a) {
    const offers = state.contractOffers.length;
    return `
    <div class="dock-actions" id="activity">
      <button class="btn big pulse" data-action="new-game">🎮 New Game</button>
      <button class="btn tile" data-action="contracts" ${offers ? '' : 'disabled'}>📝<small>Contracts</small>${offers ? `<i class="badge">${offers}</i>` : ''}</button>
      <button class="btn tile" data-action="store">🛒<small>Store</small></button>
    </div>`;
  }

  if (a.kind === 'contract') {
    const pct = (a.weeksDone / a.offer.weeks) * 100;
    return `
    <div class="dock-card" id="activity">
      <div class="row">
        <span class="dock-icon">📝</span>
        <div class="grow">
          <div class="dock-title">${esc(a.offer.title)}</div>
          <div class="sub">Week ${a.weeksDone}/${a.offer.weeks} · ${money(a.offer.pay)} · +${a.offer.rp} RP</div>
        </div>
      </div>
      <div class="bar live mt-s"><i style="width:${pct}%"></i></div>
    </div>`;
  }

  const topic = topicById(a.topic);
  const genre = genreById(a.genre);
  const platform = platformById(a.platform);
  const polishing = a.phase >= 3;
  const pct = polishing ? 100 : ((a.phase * a.phaseWeeks + a.weekInPhase) / (a.phaseWeeks * 3)) * 100;
  const steps = [...PHASES.map((p) => p.name), 'Polish'];
  return `
  <div class="dock-card" id="activity">
    <div class="row">
      <span class="dock-icon">${topic.icon}</span>
      <div class="grow">
        <div class="dock-title">${esc(a.name)}</div>
        <div class="sub dock-sub">${genre.name} · ${platform.name} · ${sizeById(a.size).name}${a.sequelOf !== undefined ? ' · Sequel' : ''}</div>
      </div>
      <button class="boost-btn" data-action="store" aria-label="Store: boosts and upgrades">⚡<small>Boost</small></button>
    </div>
    ${activeBoosts(state)}
    <div class="hype-row">
      <span class="hype-label">📣 Hype</span>
      <div class="hype-bar"><i style="width:${Math.round(a.hype ?? 0)}%"></i></div>
      <b>${Math.round(a.hype ?? 0)}</b>
      <button class="btn small" data-action="marketing">Promote</button>
    </div>
    <div class="steps-row">
      <span class="phase-chip">${polishing ? '🧹 Polish' : `${a.phase + 1}/3 ${PHASES[a.phase].name}`}</span>
      <div class="steps">${steps.map((_, i) => `<i class="${i < a.phase ? 'done' : i === a.phase ? 'now' : ''}"></i>`).join('')}</div>
    </div>
    <div class="bar ${polishing ? '' : 'live'}"><i style="width:${pct}%"></i></div>
    <div class="counters" id="counters">
      <div class="counter c-design"><b>${Math.round(a.design)}</b><small>Design</small></div>
      <div class="counter c-tech"><b>${Math.round(a.tech)}</b><small>Tech</small></div>
      <div class="counter c-bugs"><b>${Math.round(a.bugs)}</b><small>Bugs</small></div>
    </div>
    ${polishing ? polishPicker(a) : ''}
    ${polishing ? '<button class="btn big pulse mt-s" data-action="release">🚀 Release</button>' : ''}
  </div>`;
}

/** Chips for boosts that are running, e.g. "☕ 3w". */
function activeBoosts(state: GameState): string {
  const chips = STORE.filter((x) => x.kind === 'boost' && boostWeeks(state, x.id) > 0).map(
    (x) => `<span class="boost-chip" title="${x.name}">${x.icon} ${boostWeeks(state, x.id)}w</span>`,
  );
  const lap = catLapStaff(state);
  if (lap && state.cat?.lap) {
    const who = lap.name === 'You' ? 'You' : lap.name.split(' ')[0];
    chips.push(`<span class="boost-chip" title="The cat is on ${esc(lap.name)}'s lap: +30% output">🐈 ${esc(who)} ${state.cat.lap.weeks}w</span>`);
  }
  return chips.length ? `<div class="boost-chips">${chips.join('')}</div>` : '';
}

/** What to polish: squash bugs, or add more design or tech points (with shrinking returns). */
export function polishPicker(p: GameProject): string {
  const mode = p.polishMode ?? 'bugs';
  const yieldPct = Math.round(polishYield(p) * 100);
  const options: [PolishMode, string, string][] = [
    ['bugs', '🐛', 'Bugs'],
    ['design', '🎨', 'Design'],
    ['tech', '⚙️', 'Tech'],
  ];
  const hint =
    mode === 'bugs'
      ? 'Squashing bugs every week.'
      : yieldPct < 10
        ? `Hardly adding any ${mode} now. Time to fix bugs or release.`
        : `Adding ${mode} points at ${yieldPct}% strength · drops each week · new bugs slip in.`;
  return `
    <div class="polish-modes" role="radiogroup" aria-label="What to polish">
      ${options.map(([id, icon, label]) => `<button class="polish-mode ${mode === id ? 'on' : ''}" role="radio" aria-checked="${mode === id}" data-action="polish-mode" data-arg="${id}"><span>${icon}</span>${label}</button>`).join('')}
    </div>
    <div class="sub polish-hint">${hint}</div>`;
}

function renderOnMarket(state: GameState): string {
  const selling = state.released.filter((g) => g.weeksOnMarket < SALES_WEEKS);
  if (!selling.length) return '';
  return `
  <h2>On sale now</h2>
  <div class="list">
    ${selling.map((g) => gameRow(g, `Week ${g.weeksOnMarket}/${SALES_WEEKS} · ${num(g.unitsSold)} sold · ${money(g.revenue)}${g.pushes?.length ? ` · ${g.pushes.map((x) => (x === 'sale' ? '🏷️' : '📣')).join('')}` : ''}`, sparkline(g))).join('')}
  </div>
  <button class="btn ghost mt-s wide" data-action="marketing">📣 Push sales</button>`;
}

/** "🏅 Critics' Choice" and "🏆 Game of the Year" badges for a recognized game, or nothing. */
export function acclaimTag(g: ReleasedGame): string {
  const a = acclaimOf(g);
  const goty = g.goty !== undefined ? ` <span class="tag acclaim goty">${GOTY_ICON} Game of the Year ${g.goty}</span>` : '';
  return (a ? ` <span class="tag acclaim ${a.id}">${a.icon} ${a.name}</span>` : '') + goty;
}

function gameRow(g: ReleasedGame, detail: string, aside = ''): string {
  return `
  <button class="list-item" data-action="game-detail" data-arg="${g.id}">
    <div class="score ${scoreClass(g.score)}">${g.score.toFixed(1)}</div>
    <div class="grow">
      <div class="name">${esc(g.name)}${(g.series ?? 1) > 1 ? ` <span class="tag">Part ${g.series}</span>` : ''}${acclaimTag(g)}</div>
      <div class="sub">${topicById(g.topic).name} ${genreById(g.genre).name} · ${platformById(g.platform).name}</div>
      <div class="sub">${detail}</div>
    </div>
    ${aside}
  </button>`;
}

// ---------------------------------------------------------------------------
// Games
// ---------------------------------------------------------------------------

export function renderGames(state: GameState): string {
  const games = state.released;
  if (!games.length) {
    return `<h2>Your games</h2><div class="card empty">You haven't released any games yet.<br/>Head to the Studio tab to start one!</div>`;
  }
  const avg = games.reduce((a, g) => a + g.score, 0) / games.length;
  const totalProfit = games.reduce((a, g) => a + profit(g), 0);
  const hits = games.filter((g) => ['blockbuster', 'hit'].includes(verdict(g).id)).length;
  const awards = games.filter((g) => acclaimOf(g)).length;
  const goty = games.filter((g) => g.goty !== undefined).length;
  const flops = games.filter((g) => verdict(g).id === 'flop').length;
  const best = games.reduce((a, g) => (g.score > a.score ? g : a));
  const top = games.reduce((a, g) => (g.revenue > a.revenue ? g : a));
  return `
  ${renderOnMarket(state)}
  <h2>Hall of fame</h2>
  <div class="stats" style="grid-template-columns:1fr 1fr 1fr">
    <div class="stat"><small>Games</small><b>${games.length}</b></div>
    <div class="stat"><small>Avg score</small><b>${avg.toFixed(1)}</b></div>
    <div class="stat"><small>Revenue</small><b>${money(state.totalRevenue)}</b></div>
  </div>
  <h2>Profit per game</h2>
  <div class="card chart-card">
    <div class="chart-head">
      <small class="sub">Total ${totalProfit >= 0 ? 'profit' : 'loss'} from all games</small>
      <b>${totalProfit >= 0 ? '▲ ' : '▼ '}${money(Math.abs(totalProfit))}</b>
      <div class="chips-row"><span class="tag good">⭐ ${hits} hit${hits === 1 ? '' : 's'}</span><span class="tag bad">💸 ${flops} flop${flops === 1 ? '' : 's'}</span></div>
    </div>
    ${profitChart(games)}
  </div>
  <div class="card mt">
    <div class="sub">Best reviewed</div>
    <div class="row"><div class="grow"><b>${esc(best.name)}</b>${acclaimTag(best)}</div><span class="tag good">${best.score.toFixed(1)}</span></div>
    ${awards ? `<div class="sub mt">🏅 ${awards} game${awards === 1 ? '' : 's'} recognized by the critics (9.0 or better)</div>` : ''}
    ${goty ? `<div class="sub mt">${GOTY_ICON} ${goty} Game of the Year award${goty === 1 ? '' : 's'}</div>` : ''}
    <div class="sub mt">Best seller</div>
    <div class="row"><div class="grow"><b>${esc(top.name)}</b></div><span class="tag">${money(top.revenue)}</span></div>
  </div>
  ${releasesByYear(games)}`;
}

/** "Mar 1997 · 💸 Flop · -$12.0K" or "⭐ Hit · +$1.20M" for a game list row. */
function resultLine(g: ReleasedGame): string {
  const vd = verdict(g);
  const p = profit(g);
  return `${formatShortDate(g.releaseWeek)} · ${vd.icon} ${vd.label} · ${p >= 0 ? '+' : '-'}${money(Math.abs(p))}`;
}

/** Every release in order, oldest first, grouped by year. */
function releasesByYear(games: ReleasedGame[]): string {
  const years = new Map<number, ReleasedGame[]>();
  for (const g of [...games].sort((a, b) => a.releaseWeek - b.releaseWeek || a.id - b.id)) {
    const y = yearOf(g.releaseWeek);
    if (!years.has(y)) years.set(y, []);
    years.get(y)!.push(g);
  }
  return [...years]
    .map(
      ([y, list]) => `
  <h2>${y}</h2>
  <div class="list">
    ${list.map((g) => gameRow(g, resultLine(g))).join('')}
  </div>`,
    )
    .join('');
}

// ---------------------------------------------------------------------------
// Research
// ---------------------------------------------------------------------------

export function renderResearch(state: GameState): string {
  const groups: Record<string, string[]> = {};
  for (const r of RESEARCH) {
    const done = state.researched.includes(r.id);
    (groups[r.category] ??= []).push(researchRow(state, r.id, '🧪', r.name, r.desc, done));
  }
  const topics = TOPICS.filter((t) => t.cost > 0).map((t) =>
    researchRow(state, t.id, t.icon, t.name, 'New game topic', state.topics.includes(t.id)),
  );
  return `
  ${Object.entries(groups)
    .map(([cat, rows]) => `<h2>${cat}</h2><div class="list">${rows.join('')}</div>`)
    .join('')}
  <h2>Topics</h2>
  <div class="list">${topics.join('')}</div>`;
}

function researchRow(state: GameState, id: string, icon: string, name: string, desc: string, done: boolean): string {
  const blocker = researchBlocker(state, id);
  const cost = researchCost(id);
  const hint = !done && blocker && !blocker.startsWith('Not enough') ? `<div class="sub" style="color:var(--tech)">${esc(blocker)}</div>` : '';
  return `
  <div class="list-item">
    <div class="emoji">${icon}</div>
    <div class="grow">
      <div class="name">${esc(name)}</div>
      <div class="sub">${esc(desc)}</div>
      ${hint}
    </div>
    ${
      done
        ? '<span class="tag good">Done</span>'
        : `<button class="btn small ${blocker ? 'ghost' : ''}" data-action="research" data-arg="${id}" ${blocker ? 'disabled' : ''}>${cost} RP</button>`
    }
  </div>`;
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export function renderStaff(state: GameState): string {
  const office = OFFICES[state.officeLevel];
  const next = OFFICES[state.officeLevel + 1];
  const full = state.staff.length >= officeCapacity(state);
  return `
  <h2>Office</h2>
  <div class="card">
    <div class="row">
      <div class="grow">
        <div class="card-title">${office.name}</div>
        <div class="sub">${state.staff.length} / ${office.capacity} people · rent ${money(officeRent(state, state.officeLevel))}/mo</div>
        <div class="sub">Monthly costs: <b>${money(monthlyCosts(state))}</b></div>
      </div>
    </div>
    ${
      next
        ? `<div class="btn-row"><button class="btn ghost" data-action="office" ${state.cash < officeCost(state, state.officeLevel + 1) ? 'disabled' : ''}>Move to ${next.name} · ${money(officeCost(state, state.officeLevel + 1))}</button></div>
           <div class="sub mt">${next.name}: room for ${next.capacity}, rent ${money(officeRent(state, state.officeLevel + 1))}/mo.</div>`
        : ''
    }
    <div class="btn-row"><button class="btn ghost" data-action="decor">🎨 Decorate</button></div>
  </div>
  <h2>Team</h2>
  <div class="list">${state.staff.map((s) => staffRow(state, s)).join('')}</div>
  <h2>Job applicants</h2>
  ${full ? `<div class="sub" style="margin:0 4px 8px">Your office is full${next ? ' — move to a bigger one to hire' : ''}.</div>` : ''}
  <div class="list">
    ${
      state.candidates
        .map(
          (c) => `
      <div class="list-item" style="align-items:flex-start">
        <div class="emoji">${c.rockstar ? '🎸' : '🧑‍💻'}</div>
        <div class="grow">
          <div class="name">${esc(c.name)}${c.rockstar ? ' <span class="tag good">Rockstar</span>' : ''}</div>
          <div class="sub">${money(c.salary)}/mo · speed ${c.speed.toFixed(1)}x</div>
          ${skillBars(c)}
        </div>
        <button class="btn small" data-action="hire" data-arg="${c.id}" ${full || state.cash < c.salary ? 'disabled' : ''}>Hire</button>
      </div>`,
        )
        .join('') || '<div class="empty">No applicants right now. New ones arrive every few months.</div>'
    }
  </div>
  ${headhuntCard(state)}`;
}

function headhuntCard(state: GameState): string {
  const waiting = state.candidates.some((c) => c.rockstar);
  const status = state.headhunt
    ? `Searching… ${state.headhunt.weeks} week${state.headhunt.weeks === 1 ? '' : 's'} left.`
    : waiting
      ? 'Your rockstar is waiting above.'
      : '';
  return `
  <div class="list mt">
    <div class="list-item" style="align-items:flex-start">
      <div class="emoji">🎸</div>
      <div class="grow">
        <div class="name">Search for a rockstar</div>
        <div class="sub">A headhunter finds a rare developer with top skills and extra speed in ${HEADHUNT_WEEKS} weeks. Rockstars ask for ${Math.round((ROCKSTAR_SALARY_MULT - 1) * 100)}% more pay.</div>
        ${status ? `<div class="sub" style="margin-top:4px"><b>${status}</b></div>` : ''}
      </div>
      ${state.headhunt || waiting ? '' : `<button class="btn small" data-action="headhunt" ${headhuntBlocker(state) ? 'disabled' : ''}>${money(headhuntFee(state))}</button>`}
    </div>
  </div>`;
}

function staffRow(state: GameState, s: Staff): string {
  const d = trainingCost(state, s, 'design');
  const t = trainingCost(state, s, 'tech');
  return `
  <div class="list-item" style="align-items:flex-start">
    <div class="emoji">${s.founder ? '😎' : '🧑‍💻'}</div>
    <div class="grow">
      <div class="name">${esc(s.name)}${s.founder ? ' <span class="tag">Founder</span>' : ''}</div>
      <div class="sub">${s.founder ? `Founder · ${money(staffSalary(state, s))}/mo` : `${money(s.salary)}/mo`} · speed ${s.speed.toFixed(1)}x</div>
      ${skillBars(s)}
      <div class="btn-row" style="margin-top:10px">
        <button class="btn small ghost" data-action="train" data-arg="${s.id}:design" ${s.design >= 10 || state.rp < d.rp || state.cash < d.cash ? 'disabled' : ''}>📘 Design · ${d.rp} RP</button>
        <button class="btn small ghost" data-action="train" data-arg="${s.id}:tech" ${s.tech >= 10 || state.rp < t.rp || state.cash < t.cash ? 'disabled' : ''}>🔧 Tech · ${t.rp} RP</button>
      </div>
      <div class="sub" style="margin-top:4px">Training also costs ${money(d.cash)}.</div>
    </div>
    ${s.founder ? '' : `<button class="btn small danger" data-action="fire" data-arg="${s.id}" aria-label="Let ${esc(s.name)} go">✕</button>`}
  </div>`;
}

function skillBars(s: Staff): string {
  return `
  <div class="skills">
    <span>Design</span><div class="bar d"><i style="width:${s.design * 10}%"></i></div><b>${s.design.toFixed(1)}</b>
    <span>Tech</span><div class="bar t"><i style="width:${s.tech * 10}%"></i></div><b>${s.tech.toFixed(1)}</b>
  </div>`;
}
