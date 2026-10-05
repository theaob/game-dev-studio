import {
  FIT_LABELS,
  GENRES,
  PHASES,
  STORE,
  genreById,
  platformById,
  platformGenreFit,
  platformUsers,
  sizeById,
  topicById,
} from '../core/data';
import { normalizeFocus, repeatMultiplier } from '../core/scoring';
import {
  availableMarketing,
  availablePlatforms,
  availableSizes,
  boostWeeks,
  gameCost,
  hasUpgrade,
  staffWeeklyPoints,
  storeBlocker,
  storePrice,
} from '../core/sim';
import { SEQUEL_TOO_SOON_WEEKS, sequelCandidates, sequelSalesMult, seriesNumber } from '../core/sequels';
import { formatShortDate, yearFraction } from '../core/time';
import type { GameProject, GameSpec, GameState, ReleaseReport } from '../core/types';
import { esc, money, num, scoreClass } from './format';
import type { StoreItem } from '../core/data';
import { polishPicker } from './views';

export type Sheet =
  | { kind: 'welcome'; name: string }
  /** `nameEdited`: the player typed their own title, so picking a genre won't replace it. */
  | { kind: 'newGame'; step: 1 | 2; draft: GameSpec; error?: string; nameEdited?: boolean }
  | { kind: 'focus'; phase: number; values: number[]; spec?: GameSpec; error?: string }
  | { kind: 'devComplete' }
  | { kind: 'review'; report: ReleaseReport; shown: number }
  | { kind: 'gameDetail'; id: number }
  | { kind: 'menu'; saved?: boolean }
  | { kind: 'help' }
  | { kind: 'confirm'; text: string; action: string; arg?: string; confirmLabel: string }
  | { kind: 'contracts' }
  | { kind: 'store' }
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
    case 'contracts':
      return contracts(state);
    case 'store':
      return store(state);
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
      <p><b>Polish.</b> After development you can keep polishing before you release: fix bugs (they hurt reviews), or add more design or tech points to fix the game's balance. Design and tech polishing gives less each week.</p>
      <p><b>The cat.</b> Sometimes the studio cat curls up on a developer's lap, and they work 30% faster while it stays. You can carry the cat over and drop it on someone too, but it needs some alone time between laps.</p>
      <p><b>Store.</b> Spend cash on power-ups: boosts like an espresso bar or pizza night last a few weeks of development, and studio upgrades help forever. Find it next to Contracts, or tap ⚡ Boost while making a game.</p>
      <p><b>Raise the bar.</b> Players expect each game to beat your last one, and the industry keeps moving. Grow your team, train them and research better tech.</p>
      <p><b>Stay solvent.</b> Rent and salaries are paid monthly. Three months in the red and you're bankrupt. Contract work pays the bills.</p>
      <p><b>Grow.</b> Earn research points (RP) to unlock topics, bigger games and better engines. Move offices to hire more people.</p>
      <p>The game runs from 1985 to 2025. Tap ❚❚ to pause anytime. Your progress is saved automatically.</p>
    </div>
    <div class="btn-row"><button class="btn" data-action="close">Got it</button></div>`;
}

const RECEPTION = [
  { face: '😬', title: "Players won't get it", text: (t: string, g: string) => `${t} and ${g} don't mix. Expect harsh reviews.`, cls: 'bad' },
  { face: '😐', title: 'Mixed reception', text: (t: string, g: string) => `Some players will enjoy a ${t} ${g} game, but many won't be convinced.`, cls: 'mid' },
  { face: '🙂', title: 'Players will like it', text: (t: string, g: string) => `${t} ${g} is a solid combination that fans enjoy.`, cls: 'good' },
  { face: '🤩', title: 'Players will love it', text: (t: string, g: string) => `${t} ${g} games are a proven hit!`, cls: 'great' },
];

/**
 * How players are expected to receive a topic + genre combination. Only revealed
 * once the player has discovered the combination by releasing a game with it.
 */
function receptionPreview(state: GameState, d: Pick<GameSpec, 'topic' | 'genre' | 'sequelOf'>, platformId?: string): string {
  const topic = topicById(d.topic).name;
  const genre = genreById(d.genre);
  const fit = state.knowledge.combos[`${d.topic}|${d.genre}`];
  if (fit === undefined) {
    return `
    <div class="reception unknown mt">
      <div class="face">❓</div>
      <div class="grow">
        <b>Unknown reception</b>
        <div class="sub">You haven't released a ${esc(topic)} ${genre.name} game yet. Make one to discover how players react.</div>
      </div>
    </div>`;
  }
  const r = RECEPTION[fit];
  const notes: string[] = [];
  const past = state.released.filter((g) => g.topic === d.topic && g.genre === d.genre);
  const last = past[past.length - 1];
  if (last) notes.push(`📊 Last time, <b>${esc(last.name)}</b> scored <b>${last.score.toFixed(1)}</b>${past.length > 1 ? ` (${past.length} games so far)` : ''}.`);
  // A sequel is meant to repeat the combination; its own notes cover timing.
  const repeat = d.sequelOf !== undefined ? 1 : repeatMultiplier(state.released, d.topic, d.genre);
  if (repeat < 0.9) notes.push('🥱 You released this combination recently. Players may feel they have seen it before.');
  else if (repeat < 1) notes.push(`🥱 Your last game was also ${genre.name}. Some players want variety.`);
  if (state.knowledge.balance[d.genre]) notes.push(`🎯 ${genre.name} fans like about ${Math.round(genre.designTarget * 100)}% design, ${100 - Math.round(genre.designTarget * 100)}% tech.`);
  if (platformId) {
    const platform = platformById(platformId);
    const pf = platformGenreFit(platform, d.genre);
    if (pf > 1.05) notes.push(`🎮 ${platform.name} owners love ${genre.name} games.`);
    else if (pf < 0.95) notes.push(`🎮 ${genre.name} games are a hard sell on ${platform.name}.`);
  }
  return `
    <div class="reception ${r.cls} mt">
      <div class="face">${r.face}</div>
      <div class="grow">
        <b>${r.title}</b>
        <div class="meter" aria-label="Combination rating ${FIT_LABELS[fit]}">${[0, 1, 2, 3].map((i) => `<i class="${i <= fit ? 'on' : ''}"></i>`).join('')}<span>${FIT_LABELS[fit]}</span></div>
        <div class="sub">${esc(r.text(topic, genre.name))}</div>
        ${notes.length ? `<ul class="reception-notes">${notes.map((n) => `<li>${n}</li>`).join('')}</ul>` : ''}
      </div>
    </div>`;
}

/** The "New game or sequel?" picker and, for a sequel, what to expect. */
function sequelPicker(state: GameState, d: GameSpec): string {
  const candidates = sequelCandidates(state);
  if (!candidates.length) return '';
  const original = d.sequelOf !== undefined ? state.released.find((g) => g.id === d.sequelOf) : undefined;
  const chips = [
    `<button class="chip ${original ? '' : 'on'}" data-action="pick-sequel" data-arg="none">✨ New game</button>`,
    ...candidates.slice(0, 8).map(
      (g) =>
        `<button class="chip ${original?.id === g.id ? 'on' : ''}" data-action="pick-sequel" data-arg="${g.id}">🔁 ${esc(g.name)} <span class="tag ${g.score >= 7.5 ? 'good' : g.score >= 5 ? 'mid' : 'bad'}">${g.score.toFixed(1)}</span></button>`,
    ),
  ].join('');
  let info = '';
  if (original) {
    const pct = Math.round((sequelSalesMult(original) - 1) * 100);
    const part = seriesNumber(original) + 1;
    const notes = [
      pct > 0
        ? `<li>📈 Fans of ${esc(original.name)} will buy it: <b>+${pct}% sales</b>.</li>`
        : pct < 0
          ? `<li>📉 ${esc(original.name)} wasn't well liked: <b>${pct}% sales</b>.</li>`
          : `<li>🙂 ${esc(original.name)} was average, so no built-in audience.</li>`,
      `<li>🎯 Reviewers will compare it to the original's <b>${original.score.toFixed(1)}</b>.</li>`,
    ];
    if (state.week - original.releaseWeek < SEQUEL_TOO_SOON_WEEKS) notes.push(`<li>⏳ ${esc(original.name)} came out less than a year ago. A rushed sequel reviews worse.</li>`);
    if (part >= 4) notes.push(`<li>🥱 Part ${part} of a long series: players are starting to tire of it.</li>`);
    info = `
      <div class="sequel-card mt">
        <div class="row"><b class="grow">Part ${part} of the ${esc(original.name.replace(/\s+\d+$/, ''))} series</b><span class="tag">${topicById(original.topic).icon} ${topicById(original.topic).name} ${genreById(original.genre).name}</span></div>
        <ul class="reception-notes">${notes.join('')}</ul>
      </div>`;
  }
  return `
    <h4>New game or sequel?</h4>
    <div class="chips">${chips}</div>
    ${info}`;
}

function newGameStep1(state: GameState, d: GameSpec, error?: string): string {
  const sequel = d.sequelOf !== undefined;
  return `
    <h3>New game</h3>
    <p class="muted">Step 1 of 3 · Concept</p>
    ${sequelPicker(state, d)}
    ${
      sequel
        ? '<p class="sub mt">A sequel keeps the original\'s topic and genre.</p>'
        : `
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
    </div>`
    }
    ${d.topic && d.genre ? receptionPreview(state, d) : '<p class="sub mt">Coloured dots show combinations you have already discovered.</p>'}
    ${
      d.genre
        ? `
    <h4>Title</h4>
    <div class="row">
      <input class="text-input grow" data-bind="name" maxlength="32" value="${esc(d.name)}" placeholder="Game title" autocomplete="off" />
      <button class="icon-btn" data-action="random-name" aria-label="Suggest another ${genreById(d.genre).name} title">🎲</button>
    </div>`
        : ''
    }
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
    <p class="muted">Step 2 of 3 · ${esc(d.name)} · ${topicById(d.topic).name} ${genreById(d.genre).name}${d.sequelOf !== undefined ? ' · Sequel' : ''}</p>
    ${receptionPreview(state, d, d.platform)}
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
    <p class="muted">${esc(balanceAdvice(p))}</p>
    <h4>Keep polishing</h4>
    ${polishPicker(p)}
    <div class="btn-row">
      <button class="btn big" data-action="release">🚀 Release now</button>
    </div>`;
}

/** How the design/tech split compares to what the genre's players like. */
function balanceAdvice(p: GameProject): string {
  const genre = genreById(p.genre);
  const total = p.design + p.tech;
  const share = total ? Math.round((p.design / total) * 100) : 50;
  const target = Math.round(genre.designTarget * 100);
  if (Math.abs(share - target) <= 5) return `The design/tech balance (${share}% design) suits ${genre.name} players.`;
  const more = share < target ? 'design' : 'tech';
  return `${genre.name} players like about ${target}% design; this game is ${share}%. Polishing ${more} would help.`;
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
        <div class="score ${scoreClass(g.score)}" style="margin:6px auto;width:64px;height:64px;font-size:24px" data-countup="${g.score.toFixed(1)}">${g.score.toFixed(1)}</div>
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
  const prequel = g.sequelOf !== undefined ? state.released.find((x) => x.id === g.sequelOf) : undefined;
  const next = state.released.find((x) => x.sequelOf === g.id);
  return `
    <h3>${esc(g.name)}</h3>
    ${prequel || next ? `<p class="sub">${prequel ? `Part ${seriesNumber(g)} · sequel to <b>${esc(prequel.name)}</b> (${prequel.score.toFixed(1)})` : 'Part 1'}${next ? ` · followed by <b>${esc(next.name)}</b> (${next.score.toFixed(1)})` : ''}</p>` : ''}
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

function contracts(state: GameState): string {
  return `
    <h3>Contract work</h3>
    <p class="muted">Quick jobs that pay the bills and earn research points.</p>
    <div class="options mt">
      ${
        state.contractOffers
          .map(
            (o) => `
        <div class="option contract">
          <span class="emoji">📝</span>
          <span class="grow"><b>${esc(o.title)}</b><br/><span class="sub">${o.weeks} weeks · ${money(o.pay)} · +${o.rp} RP</span></span>
          <button class="btn small" data-action="contract" data-arg="${o.id}">Take</button>
        </div>`,
          )
          .join('') || '<p class="muted center">No offers right now. New ones arrive every month.</p>'
      }
    </div>
    <div class="btn-row"><button class="btn ghost" data-action="close">Close</button></div>`;
}

function storeRow(state: GameState, item: StoreItem): string {
  const blocked = storeBlocker(state, item.id);
  const owned = item.kind === 'upgrade' && hasUpgrade(state, item.id);
  const left = item.kind === 'boost' ? boostWeeks(state, item.id) : 0;
  const status = owned
    ? '<span class="tag good">Owned</span>'
    : left
      ? `<span class="tag good">Active · ${left} week${left === 1 ? '' : 's'} left</span>`
      : item.kind === 'boost'
        ? `<span class="tag">${item.weeks} game weeks</span>`
        : '';
  const label = owned ? 'Owned' : `${left ? 'Extend' : 'Buy'} · ${money(storePrice(state, item.id))}`;
  return `
    <div class="option store-item">
      <span class="emoji">${item.icon}</span>
      <span class="grow"><b>${item.name}</b> ${status}<br/><span class="sub">${item.desc}</span>${
        blocked && !owned ? `<br/><span class="sub warn">${blocked}</span>` : ''
      }</span>
      <button class="btn small" data-action="buy" data-arg="${item.id}" ${blocked ? 'disabled' : ''}>${label}</button>
    </div>`;
}

function store(state: GameState): string {
  const boosts = STORE.filter((x) => x.kind !== 'upgrade');
  const upgrades = STORE.filter((x) => x.kind === 'upgrade');
  return `
    <h3>Store</h3>
    <p class="muted">Power-ups for your team. Boosts only count down while a game is in development.</p>
    <h4>Boosts</h4>
    <div class="options">${boosts.map((x) => storeRow(state, x)).join('')}</div>
    <h4>Studio upgrades</h4>
    <div class="options">${upgrades.map((x) => storeRow(state, x)).join('')}</div>
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
