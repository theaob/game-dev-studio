import { OFFICES, PHASES, RESEARCH, TOPICS, genreById, platformById, sizeById, topicById } from '../core/data';
import {
  SALES_WEEKS,
  monthlyCosts,
  officeCapacity,
  researchBlocker,
  researchCost,
  trainingCost,
} from '../core/sim';
import { formatDate, formatShortDate } from '../core/time';
import type { GameState, ReleasedGame, Staff } from '../core/types';
import { esc, money, num, scoreClass } from './format';

export type Tab = 'studio' | 'games' | 'research' | 'staff' | 'news';
export const SPEEDS = [0, 1, 2, 4];

export function renderTopbar(state: GameState, speed: number): string {
  return `
  <div class="topbar">
    <div class="topbar-row">
      <div class="studio">
        <div class="studio-name">${esc(state.studioName)}</div>
        <div class="date">${formatDate(state.week)}</div>
      </div>
      <div class="speed" role="group" aria-label="Game speed">
        ${SPEEDS.map((s, i) => `<button data-action="speed" data-arg="${i}" class="${i === speed ? 'on' : ''}" aria-label="${s === 0 ? 'Pause' : `Speed ${s}x`}">${s === 0 ? '❚❚' : '▶'.repeat(Math.min(i, 3))}</button>`).join('')}
      </div>
      <button class="icon-btn" data-action="menu" aria-label="Menu">☰</button>
    </div>
    <div class="stats">
      <div class="stat ${state.cash < 0 ? 'neg' : ''}"><small>Cash</small><b>${money(state.cash)}</b></div>
      <div class="stat"><small>Fans</small><b>${num(state.fans)}</b></div>
      <div class="stat"><small>Research</small><b>${Math.floor(state.rp)} RP</b></div>
    </div>
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
    .map(([id, icon, label, dot]) => `<button data-action="tab" data-arg="${id}" class="${tab === id ? 'on' : ''}"><span>${icon}</span>${label}${dot ? '<i class="dot"></i>' : ''}</button>`)
    .join('')}</nav>`;
}

// ---------------------------------------------------------------------------
// Studio
// ---------------------------------------------------------------------------

export function renderStudio(state: GameState): string {
  return `
    ${renderActivity(state)}
    ${renderOnMarket(state)}`;
}

// ---------------------------------------------------------------------------
// News
// ---------------------------------------------------------------------------

export function renderNews(state: GameState): string {
  if (!state.notices.length) return '<h2>News</h2><div class="card empty">Nothing has happened yet.</div>';
  // Newest first, grouped by month.
  const groups: { label: string; items: string[] }[] = [];
  for (const n of [...state.notices].reverse()) {
    const label = formatShortDate(n.week);
    if (groups[groups.length - 1]?.label !== label) groups.push({ label, items: [] });
    groups[groups.length - 1].items.push(`<div class="notice ${n.kind}">${esc(n.text)}</div>`);
  }
  return groups.map((g) => `<h2>${g.label}</h2><div class="list">${g.items.join('')}</div>`).join('');
}

function renderActivity(state: GameState): string {
  const a = state.activity;
  if (!a) {
    return `
    <div class="card hero" id="activity">
      <div class="card-title">Your team is ready</div>
      <div class="sub">Start a new game, or take on contract work to pay the bills.</div>
      <div class="btn-row"><button class="btn big" data-action="new-game">🎮 Develop a new game</button></div>
    </div>
    <h2>Contract work</h2>
    <div class="list">
      ${
        state.contractOffers
          .map(
            (o) => `
        <div class="list-item">
          <div class="emoji">📝</div>
          <div class="grow">
            <div class="name">${esc(o.title)}</div>
            <div class="sub">${o.weeks} weeks · ${money(o.pay)} · +${o.rp} RP</div>
          </div>
          <button class="btn small ghost" data-action="contract" data-arg="${o.id}">Take</button>
        </div>`,
          )
          .join('') || '<div class="empty">No offers right now. Check back next month.</div>'
      }
    </div>`;
  }

  if (a.kind === 'contract') {
    const pct = (a.weeksDone / a.offer.weeks) * 100;
    return `
    <div class="card" id="activity">
      <div class="sub">Contract work</div>
      <div class="card-title">${esc(a.offer.title)}</div>
      <div class="mt bar"><i style="width:${pct}%"></i></div>
      <div class="sub mt">Week ${a.weeksDone} of ${a.offer.weeks} · pays ${money(a.offer.pay)} and ${a.offer.rp} RP</div>
    </div>`;
  }

  const topic = topicById(a.topic);
  const genre = genreById(a.genre);
  const platform = platformById(a.platform);
  const polishing = a.phase >= 3;
  const pct = polishing ? 100 : ((a.phase * a.phaseWeeks + a.weekInPhase) / (a.phaseWeeks * 3)) * 100;
  return `
  <div class="card" id="activity">
    <div class="row">
      <div class="big-emoji" style="font-size:40px;margin:0">${topic.icon}</div>
      <div class="grow">
        <div class="card-title">${esc(a.name)}</div>
        <div class="sub">${topic.name} ${genre.name} · ${platform.name} · ${sizeById(a.size).name}</div>
      </div>
    </div>
    <div class="phases">
      ${PHASES.map((p, i) => `<span class="${i < a.phase ? 'done' : i === a.phase ? 'now' : ''}">${i < a.phase ? '✓ ' : ''}${p.name}</span>`).join('')}
      <span class="${polishing ? 'now' : ''}">Polish</span>
    </div>
    <div class="bar"><i style="width:${pct}%"></i></div>
    <div class="counters" id="counters">
      <div class="counter c-design"><b>${Math.round(a.design)}</b><small>Design</small></div>
      <div class="counter c-tech"><b>${Math.round(a.tech)}</b><small>Tech</small></div>
      <div class="counter c-bugs"><b>${Math.round(a.bugs)}</b><small>Bugs</small></div>
    </div>
    ${
      polishing
        ? `<div class="sub mt">Development finished! The team is squashing bugs (${a.polishWeeks} week${a.polishWeeks === 1 ? '' : 's'} of polish). Release whenever you're ready.</div>
           <div class="btn-row"><button class="btn big" data-action="release">🚀 Release game</button></div>`
        : ''
    }
  </div>`;
}

function renderOnMarket(state: GameState): string {
  const selling = state.released.filter((g) => g.weeksOnMarket < SALES_WEEKS);
  if (!selling.length) return '';
  return `
  <h2>On sale now</h2>
  <div class="list">
    ${selling.map((g) => gameRow(g, `${num(g.unitsSold)} sold · ${money(g.revenue)}`)).join('')}
  </div>`;
}

function gameRow(g: ReleasedGame, detail: string): string {
  return `
  <button class="list-item" data-action="game-detail" data-arg="${g.id}">
    <div class="score ${scoreClass(g.score)}">${g.score.toFixed(1)}</div>
    <div class="grow">
      <div class="name">${esc(g.name)}</div>
      <div class="sub">${topicById(g.topic).name} ${genreById(g.genre).name} · ${platformById(g.platform).name}</div>
      <div class="sub">${detail}</div>
    </div>
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
  const best = games.reduce((a, g) => (g.score > a.score ? g : a));
  const top = games.reduce((a, g) => (g.revenue > a.revenue ? g : a));
  return `
  <h2>Hall of fame</h2>
  <div class="stats" style="grid-template-columns:1fr 1fr 1fr">
    <div class="stat"><small>Games</small><b>${games.length}</b></div>
    <div class="stat"><small>Avg score</small><b>${avg.toFixed(1)}</b></div>
    <div class="stat"><small>Revenue</small><b>${money(state.totalRevenue)}</b></div>
  </div>
  <div class="card mt">
    <div class="sub">Best reviewed</div>
    <div class="row"><div class="grow"><b>${esc(best.name)}</b></div><span class="tag good">${best.score.toFixed(1)}</span></div>
    <div class="sub mt">Best seller</div>
    <div class="row"><div class="grow"><b>${esc(top.name)}</b></div><span class="tag">${money(top.revenue)}</span></div>
  </div>
  <h2>All releases</h2>
  <div class="list">
    ${[...games].reverse().map((g) => gameRow(g, `${formatShortDate(g.releaseWeek)} · ${num(g.unitsSold)} sold · ${money(g.revenue)}`)).join('')}
  </div>`;
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
  <div class="card mt">
    <div class="sub">Research points are earned while developing games and doing contracts.</div>
    <div class="card-title mt">🔬 ${Math.floor(state.rp)} RP available</div>
  </div>
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
        <div class="sub">${state.staff.length} / ${office.capacity} people · rent ${money(office.rent)}/mo</div>
        <div class="sub">Monthly costs: <b>${money(monthlyCosts(state))}</b></div>
      </div>
    </div>
    ${
      next
        ? `<div class="btn-row"><button class="btn ghost" data-action="office" ${state.cash < next.cost ? 'disabled' : ''}>Move to ${next.name} · ${money(next.cost)}</button></div>
           <div class="sub mt">${next.name}: room for ${next.capacity}, rent ${money(next.rent)}/mo.</div>`
        : ''
    }
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
        <div class="emoji">🧑‍💻</div>
        <div class="grow">
          <div class="name">${esc(c.name)}</div>
          <div class="sub">${money(c.salary)}/mo · speed ${c.speed.toFixed(1)}x</div>
          ${skillBars(c)}
        </div>
        <button class="btn small" data-action="hire" data-arg="${c.id}" ${full || state.cash < c.salary ? 'disabled' : ''}>Hire</button>
      </div>`,
        )
        .join('') || '<div class="empty">No applicants right now. New ones arrive every few months.</div>'
    }
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
      <div class="sub">${s.founder ? 'No salary' : `${money(s.salary)}/mo`} · speed ${s.speed.toFixed(1)}x</div>
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
