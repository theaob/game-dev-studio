import {
  FIT_LABELS,
  GENRES,
  PHASES,
  genreById,
  platformById,
  platformGenreFit,
  platformUsers,
  sizeById,
  topicById,
} from '../core/data';
import { normalizeFocus } from '../core/scoring';
import {
  availableMarketing,
  availablePlatforms,
  availableSizes,
  gameCost,
  staffWeeklyPoints,
} from '../core/sim';
import { formatShortDate, yearFraction } from '../core/time';
import type { GameSpec, GameState, ReleaseReport } from '../core/types';
import { esc, money, num, scoreClass } from './format';

export type Sheet =
  | { kind: 'welcome'; name: string }
  | { kind: 'newGame'; step: 1 | 2; draft: GameSpec; error?: string }
  | { kind: 'focus'; phase: number; values: number[]; spec?: GameSpec; error?: string }
  | { kind: 'devComplete' }
  | { kind: 'review'; report: ReleaseReport; shown: number }
  | { kind: 'gameDetail'; id: number }
  | { kind: 'menu'; saved?: boolean }
  | { kind: 'help' }
  | { kind: 'confirm'; text: string; action: string; arg?: string; confirmLabel: string }
  | { kind: 'gameOver' };

export const OUTLETS = ['Game Weekly', 'Pixel Press', 'PlayZone', 'Joystick Journal'];

export function renderSheet(state: GameState | null, sheet: Sheet): string {
  switch (sheet.kind) {
    case 'welcome':
      return welcome(sheet.name);
    case 'help':
      return help();
    case 'confirm':
      return `
        <h3>Are you sure?</h3>
        <p class="muted">${esc(sheet.text)}</p>
        <div class="btn-row">
          <button class="btn ghost" data-action="close">Cancel</button>
          <button class="btn danger" data-action="${sheet.action}" data-arg="${sheet.arg ?? ''}">${esc(sheet.confirmLabel)}</button>
        </div>`;
  }
  if (!state) return '';
  switch (sheet.kind) {
    case 'newGame':
      return sheet.step === 1 ? newGameStep1(state, sheet.draft, sheet.error) : newGameStep2(state, sheet.draft, sheet.error);
    case 'focus':
      return focusSheet(state, sheet);
    case 'devComplete':
      return devComplete(state);
    case 'review':
      return review(sheet.report, sheet.shown);
    case 'gameDetail':
      return gameDetail(state, sheet.id);
    case 'menu':
      return menu(sheet.saved);
    case 'gameOver':
      return gameOver(state);
  }
}

function welcome(name: string): string {
  return `
    <div class="big-emoji">🎮</div>
    <h3 class="center">Game Dev Studio</h3>
    <p class="muted center">It's 1985. You have a garage, a computer and $40,000. Can you build a legendary game studio?</p>
    <h4>Name your studio</h4>
    <input class="text-input" data-bind="studio" maxlength="28" value="${esc(name)}" placeholder="Garage Games" autocomplete="off" />
    <div class="btn-row"><button class="btn big" data-action="start-studio">Start</button></div>
    <div class="btn-row"><button class="btn ghost" data-action="help">How to play</button></div>`;
}

function help(): string {
  return `
    <h3>How to play</h3>
    <div class="help">
      <p><b>Make games.</b> Pick a name, a topic and a genre. Some combinations work much better than others, and you learn which after each release.</p>
      <p><b>Choose a platform.</b> Platforms come and go over the decades. Bigger audiences sell more, and some platforms suit some genres better. Consoles need a one-time dev kit license.</p>
      <p><b>Set the focus.</b> Development has 3 phases with 3 areas each. Put your team's effort where the genre needs it. Reviews reveal what matters.</p>
      <p><b>Design vs Tech.</b> Every genre has a sweet spot between creative (design) and technical (tech) points.</p>
      <p><b>Polish.</b> Bugs hurt reviews. After development you can keep polishing before you release.</p>
      <p><b>Raise the bar.</b> Players expect each game to beat your last one, and the industry keeps moving. Grow your team, train them and research better tech.</p>
      <p><b>Stay solvent.</b> Rent and salaries are paid monthly. Three months in the red and you're bankrupt. Contract work pays the bills.</p>
      <p><b>Grow.</b> Earn research points (RP) to unlock topics, bigger games and better engines. Move offices to hire more people.</p>
      <p>The game runs from 1985 to 2025. Tap ❚❚ to pause anytime. Your progress is saved automatically.</p>
    </div>
    <div class="btn-row"><button class="btn" data-action="close">Got it</button></div>`;
}

function newGameStep1(state: GameState, d: GameSpec, error?: string): string {
  const combo = d.topic && d.genre ? state.knowledge.combos[`${d.topic}|${d.genre}`] : undefined;
  return `
    <h3>New game</h3>
    <p class="muted">Step 1 of 3 · Concept</p>
    <h4>Title</h4>
    <div class="row">
      <input class="text-input grow" data-bind="name" maxlength="32" value="${esc(d.name)}" placeholder="Game title" autocomplete="off" />
      <button class="icon-btn" data-action="random-name" aria-label="Random name">🎲</button>
    </div>
    <h4>Genre</h4>
    <div class="chips">
      ${GENRES.map((g) => `<button class="chip ${d.genre === g.id ? 'on' : ''}" data-action="pick-genre" data-arg="${g.id}">${g.icon} ${g.name}</button>`).join('')}
    </div>
    <h4>Topic</h4>
    <div class="chips">
      ${state.topics
        .map((id) => {
          const t = topicById(id);
          const known = d.genre ? state.knowledge.combos[`${id}|${d.genre}`] : undefined;
          const dot = known !== undefined ? `<i class="fit fit-${known}" title="${FIT_LABELS[known]}"></i>` : '';
          return `<button class="chip ${d.topic === id ? 'on' : ''}" data-action="pick-topic" data-arg="${id}">${t.icon} ${t.name}${dot}</button>`;
        })
        .join('')}
    </div>
    <p class="sub mt">${
      combo !== undefined
        ? `You know this combo is <span class="tag ${combo >= 3 ? 'good' : combo >= 2 ? 'good' : combo >= 1 ? 'mid' : 'bad'}">${FIT_LABELS[combo]}</span>`
        : d.topic && d.genre
          ? 'You have not tried this combination yet.'
          : 'Coloured dots show combos you already know.'
    }</p>
    ${error ? `<div class="error">${esc(error)}</div>` : ''}
    <div class="btn-row">
      <button class="btn ghost" data-action="close">Cancel</button>
      <button class="btn" data-action="ng-next" ${d.topic && d.genre ? '' : 'disabled'}>Next →</button>
    </div>`;
}

function newGameStep2(state: GameState, d: GameSpec, error?: string): string {
  const year = yearFraction(state.week);
  const cost = gameCost(state, d);
  const size = sizeById(d.size);
  const sizes = availableSizes(state);
  const marketing = availableMarketing(state);
  return `
    <h3>New game</h3>
    <p class="muted">Step 2 of 3 · ${esc(d.name)} · ${topicById(d.topic).name} ${genreById(d.genre).name}</p>
    <h4>Platform</h4>
    <div class="options">
      ${availablePlatforms(state)
        .map((p) => {
          const fit = platformGenreFit(p, d.genre);
          const owned = state.licenses.includes(p.id);
          const fitTag = fit > 1.05 ? `<span class="tag good">Loves ${genreById(d.genre).name}</span>` : fit < 0.95 ? `<span class="tag bad">Weak for ${genreById(d.genre).name}</span>` : '';
          return `
        <button class="option ${d.platform === p.id ? 'on' : ''}" data-action="pick-platform" data-arg="${p.id}">
          <span class="emoji">${p.icon}</span>
          <span class="grow">
            <b>${p.name}</b> <span class="sub">${p.kind}</span><br/>
            <span class="sub">${num(platformUsers(p, year) * 1e6)} users · ${owned ? 'Licensed' : `License ${money(p.license)}`}${p.priceMult < 1 ? ' · low prices' : ''}</span>
            ${fitTag ? `<br/>${fitTag}` : ''}
          </span>
        </button>`;
        })
        .join('')}
    </div>
    <h4>Size</h4>
    <div class="options">
      ${sizes
        .map(
          (s) => `
        <button class="option ${d.size === s.id ? 'on' : ''}" data-action="pick-size" data-arg="${s.id}">
          <span class="grow"><b>${s.name}</b><br/><span class="sub">${s.phaseWeeks * 3} weeks · ${s.cost ? money(s.cost) : 'no extra cost'} · ${s.minStaff > 1 ? `best with ${s.minStaff}+ staff` : 'solo friendly'}</span></span>
        </button>`,
        )
        .join('')}
    </div>
    ${state.staff.length < size.minStaff ? `<p class="error">Your team is small for a ${size.name.toLowerCase()} game. Quality will suffer.</p>` : ''}
    ${
      marketing.length > 1
        ? `<h4>Marketing</h4><div class="options">${marketing
            .map(
              (m) => `
        <button class="option ${d.marketing === m.id ? 'on' : ''}" data-action="pick-marketing" data-arg="${m.id}">
          <span class="grow"><b>${m.name}</b><br/><span class="sub">${m.cost ? `${money(m.cost)} · ` : ''}${m.salesMult > 1 ? `+${Math.round((m.salesMult - 1) * 100)}% sales` : 'word of mouth only'}</span></span>
        </button>`,
            )
            .join('')}</div>`
        : ''
    }
    <div class="summary">
      ${cost.license ? `<div class="line"><span>Dev kit license</span><span>${money(cost.license)}</span></div>` : ''}
      ${cost.size ? `<div class="line"><span>Production budget</span><span>${money(cost.size)}</span></div>` : ''}
      ${cost.marketing ? `<div class="line"><span>Marketing</span><span>${money(cost.marketing)}</span></div>` : ''}
      <div class="line total"><span>Upfront cost</span><span>${money(cost.total)}</span></div>
      <div class="line sub"><span>Cash after</span><span>${money(state.cash - cost.total)}</span></div>
    </div>
    ${error ? `<div class="error">${esc(error)}</div>` : ''}
    <div class="btn-row">
      <button class="btn ghost" data-action="ng-back">← Back</button>
      <button class="btn" data-action="ng-focus" ${cost.total > state.cash ? 'disabled' : ''}>Next →</button>
    </div>`;
}

function importanceTag(state: GameState, genre: string, areaIndex: number): string {
  const known = state.knowledge.areas[genre]?.[areaIndex];
  if (!known) return '<span class="tag">?</span>';
  const imp = genreById(genre).importance[areaIndex];
  if (imp > 1) return '<span class="tag good">▲ Important</span>';
  if (imp < 1) return '<span class="tag bad">▼ Minor</span>';
  return '<span class="tag mid">● Standard</span>';
}

export function focusLean(state: GameState, phase: number, values: number[]): { design: number; tech: number } {
  let design = 0;
  let tech = 0;
  for (const s of state.staff) {
    for (const a of staffWeeklyPoints(state, s, phase, values)) {
      design += a.design;
      tech += a.tech;
    }
  }
  return { design, tech };
}

function focusSheet(state: GameState, sheet: Extract<Sheet, { kind: 'focus' }>): string {
  const proj = sheet.spec ?? (state.activity?.kind === 'game' ? state.activity : null);
  if (!proj) return '';
  const genre = genreById(proj.genre);
  const phase = PHASES[sheet.phase];
  const shares = normalizeFocus(sheet.values);
  const lean = focusLean(state, sheet.phase, sheet.values);
  const dPct = Math.round((lean.design / (lean.design + lean.tech || 1)) * 100);
  const balanceKnown = state.knowledge.balance[proj.genre];
  return `
    <h3>Phase ${sheet.phase + 1} of 3: ${phase.name}</h3>
    <p class="muted">${esc(proj.name)} · ${topicById(proj.topic).name} ${genre.name}${sheet.spec ? ' · Step 3 of 3' : ''}</p>
    <p class="sub">Drag the sliders to decide where your team spends its time in this phase.</p>
    ${phase.areas
      .map(
        (a, i) => `
      <div class="slider">
        <div class="slider-head"><span><b>${a.name}</b> ${importanceTag(state, proj.genre, sheet.phase * 3 + i)}</span><b data-share="${i}">${Math.round(shares[i] * 100)}%</b></div>
        <input type="range" min="0" max="100" step="1" value="${sheet.values[i]}" data-focus="${i}" aria-label="${a.name} focus" />
      </div>`,
      )
      .join('')}
    <div class="summary">
      <div class="line"><span style="color:var(--design)">Design <b data-lean="d">${dPct}%</b></span><span style="color:var(--tech)">Tech <b data-lean="t">${100 - dPct}%</b></span></div>
      <div class="lean"><i class="d" data-lean-bar="d" style="width:${dPct}%"></i><i class="t" style="flex:1"></i></div>
      <div class="sub">${
        balanceKnown
          ? `${genre.name} fans like about <b>${Math.round(genre.designTarget * 100)}% design</b> overall.`
          : `Release a ${genre.name} game to learn its ideal design/tech balance.`
      }</div>
    </div>
    ${sheet.error ? `<div class="error">${esc(sheet.error)}</div>` : ''}
    <div class="btn-row">
      ${sheet.spec ? '<button class="btn ghost" data-action="focus-back">← Back</button>' : ''}
      <button class="btn" data-action="focus-go">${sheet.spec ? 'Start development' : 'Continue'}</button>
    </div>`;
}

function devComplete(state: GameState): string {
  const p = state.activity;
  if (!p || p.kind !== 'game') return '';
  const total = p.design + p.tech;
  const bugPct = total ? (p.bugs / total) * 100 : 0;
  return `
    <div class="big-emoji">🎉</div>
    <h3 class="center">${esc(p.name)} is feature complete!</h3>
    <div class="counters">
      <div class="counter c-design"><b>${Math.round(p.design)}</b><small>Design</small></div>
      <div class="counter c-tech"><b>${Math.round(p.tech)}</b><small>Tech</small></div>
      <div class="counter c-bugs"><b>${Math.round(p.bugs)}</b><small>Bugs</small></div>
    </div>
    <p class="muted">${
      bugPct > 6
        ? 'There are still quite a few bugs. Reviewers will notice. Polishing for a few weeks will help.'
        : 'The game is in decent shape. You can release now or polish it a bit more.'
    }</p>
    <div class="btn-row">
      <button class="btn ghost" data-action="close">🧹 Keep polishing</button>
      <button class="btn" data-action="release">🚀 Release now</button>
    </div>`;
}

function review(report: ReleaseReport, shown: number): string {
  const g = report.game;
  const done = shown >= g.reviews.length;
  return `
    <h3>Reviews are in!</h3>
    <p class="muted">${esc(g.name)} · ${topicById(g.topic).name} ${genreById(g.genre).name} · ${platformById(g.platform).name}</p>
    <div class="reviews">
      ${g.reviews
        .map(
          (r, i) => `
        <div class="review">
          <div class="outlet">${OUTLETS[i]}</div>
          ${i < shown ? `<div class="num" style="color:${r >= 8 ? 'var(--good)' : r >= 5 ? '#ffe07d' : 'var(--bad)'}">${r}</div>` : '<div class="num pending">?</div>'}
        </div>`,
        )
        .join('')}
    </div>
    ${
      done
        ? `
      <div class="summary center">
        <div class="sub">Average score</div>
        <div class="score ${scoreClass(g.score)}" style="margin:6px auto;width:64px;height:64px;font-size:24px">${g.score.toFixed(1)}</div>
        <div class="sub">+${report.rpEarned} RP · your team gained experience</div>
      </div>
      <h4>What we learned</h4>
      <ul class="insights">${report.insights.map((i) => `<li class="${i.kind}">${esc(i.text)}</li>`).join('')}</ul>
      <div class="btn-row"><button class="btn big" data-action="close">Continue</button></div>`
        : '<div class="btn-row"><button class="btn ghost" data-action="skip-reviews">Skip</button></div>'
    }`;
}

function gameDetail(state: GameState, id: number): string {
  const g = state.released.find((x) => x.id === id);
  if (!g) return '';
  return `
    <h3>${esc(g.name)}</h3>
    <p class="muted">${topicById(g.topic).name} ${genreById(g.genre).name} · ${platformById(g.platform).name} · ${sizeById(g.size).name} · ${formatShortDate(g.releaseWeek)}</p>
    <div class="reviews">
      ${g.reviews.map((r, i) => `<div class="review"><div class="outlet">${OUTLETS[i]}</div><div class="num" style="animation:none">${r}</div></div>`).join('')}
    </div>
    <div class="summary">
      <div class="line"><span>Average score</span><b>${g.score.toFixed(1)}</b></div>
      <div class="line"><span>Copies sold</span><span>${num(g.unitsSold)}${g.weeksOnMarket < 16 ? ' (still selling)' : ''}</span></div>
      <div class="line"><span>Revenue</span><span>${money(g.revenue)}</span></div>
      <div class="line"><span>Upfront cost</span><span>${money(g.cost)}</span></div>
      <div class="line"><span>Fans gained</span><span>${num(g.fansGained)}</span></div>
      <div class="line"><span>Design / Tech / Bugs</span><span>${g.design} / ${g.tech} / ${g.bugs}</span></div>
      <div class="line"><span>Development time</span><span>${g.devWeeks} weeks</span></div>
    </div>
    <div class="btn-row"><button class="btn ghost" data-action="close">Close</button></div>`;
}

function menu(saved?: boolean): string {
  return `
    <h3>Menu</h3>
    <div class="options mt">
      <button class="option" data-action="help"><span class="emoji">📖</span><span class="grow"><b>How to play</b></span></button>
      <button class="option" data-action="save"><span class="emoji">💾</span><span class="grow"><b>Save game</b>${saved ? ' <span class="tag good">Saved!</span>' : '<br/><span class="sub">The game also saves automatically every month.</span>'}</span></button>
      <button class="option" data-action="ask-reset"><span class="emoji">🔄</span><span class="grow"><b>Start over</b><br/><span class="sub">Delete this save and found a new studio.</span></span></button>
    </div>
    <div class="btn-row"><button class="btn ghost" data-action="close">Close</button></div>`;
}

function gameOver(state: GameState): string {
  const games = state.released;
  const avg = games.length ? games.reduce((a, g) => a + g.score, 0) / games.length : 0;
  const best = games.length ? games.reduce((a, g) => (g.score > a.score ? g : a)) : null;
  const bankrupt = state.over === 'bankrupt';
  return `
    <div class="big-emoji">${bankrupt ? '💸' : '🏆'}</div>
    <h3 class="center">${bankrupt ? 'Bankrupt!' : 'A legendary career'}</h3>
    <p class="muted center">${bankrupt ? 'The money ran out. Every great studio has a failure or two. Try again!' : `${esc(state.studioName)} has reached ${formatShortDate(state.week)}. Time to retire.`}</p>
    <div class="summary">
      <div class="line"><span>Games released</span><b>${games.length}</b></div>
      <div class="line"><span>Average score</span><b>${avg.toFixed(1)}</b></div>
      <div class="line"><span>Total revenue</span><b>${money(state.totalRevenue)}</b></div>
      <div class="line"><span>Fans</span><b>${num(state.fans)}</b></div>
      <div class="line"><span>Final cash</span><b>${money(state.cash)}</b></div>
      ${best ? `<div class="line"><span>Best game</span><b>${esc(best.name)} (${best.score.toFixed(1)})</b></div>` : ''}
    </div>
    <div class="btn-row"><button class="btn big" data-action="reset">Found a new studio</button></div>`;
}
