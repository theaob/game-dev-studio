import {
  FIT_LABELS,
  PERFECT_FIT,
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
import { GENRE_LEVEL_BONUS, TOPIC_LEVEL_BONUS, EXPERTISE_MIN_SCORE, genreHits, hitsToNextLevel, topicHits, expertiseLevel } from '../core/expertise';
import {
  availableGenres,
  availableMarketing,
  availablePlatforms,
  availableSizes,
  boostWeeks,
  gameCost,
  hasUpgrade,
  staffWeeklyPoints,
  storeBlocker,
  storePrice,
  SALES_WEEKS,
  boothBlocker,
  promoBlocker,
  salesPushBlocker,
} from '../core/sim';
import { SEQUEL_TOO_SOON_WEEKS, sequelCandidates, sequelSalesMult, seriesNumber } from '../core/sequels';
import { WEEKS_PER_YEAR, formatShortDate, yearFraction, yearOf } from '../core/time';
import { RIVAL_CLASH_MULT, RIVAL_CLASH_WEEKS, rivalClash, trendMult } from '../core/industry';
import { onSale, paybackWeek, profit, returnMultiple, revenueRank, totalCost, verdict } from '../core/results';
import { moneyChart, spendBar, weeklyChart } from './charts';
import { REWARDS, bailoutCash, canBailout, rewardAmount, rewardBlocker, type Reward } from '../core/rewards';
import type { MonetizationView } from './monetization';
import { BOOTHS, EXPO_BOOKING_WEEKS, MAX_HYPE, PROMOS, SALES_PUSHES, boothById, boothPrice, hypeEffect, promoPrice, salesPushPrice, weeksToExpo } from '../core/marketing';
import type { GameProject, GameSpec, GameState, ReleaseReport } from '../core/types';
import { esc, money, num, scoreClass } from './format';
import type { StoreItem } from '../core/data';
import { DECOR, FLOOR_PAINTS, WALL_PAINTS, decorPrice, isPlaced, ownsDecor, paintPrice, trophyCount } from '../core/decor';
import type { DecorItem, Paint } from '../core/decor';
import { acclaimTag, polishPicker } from './views';
import { acclaimOf, beloved, longAwaitedHype, sequelHype } from '../core/acclaim';
import { marketingCost, sizeCost } from '../core/economy';
import { ACHIEVEMENTS } from '../core/achievements';
import type { Unlock } from '../save';
import type { PlayGamesView } from './play-games';

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
  | { kind: 'decor' }
  | { kind: 'marketing' }
  | { kind: 'expo' }
  | { kind: 'achievements' }
  | { kind: 'gameOver' };

/** The web build: no ads, no purchases. */
const NO_ADS: MonetizationView = { native: false, rewardedReady: false, adFree: false, privacyOptions: false, busy: false };

export const OUTLETS = ['Game Weekly', 'Pixel Press', 'PlayZone', 'Joystick Journal'];

export function renderSheet(
  state: GameState | null,
  sheet: Sheet,
  ads: MonetizationView = NO_ADS,
  unlocked: Record<string, Unlock> = {},
  play: PlayGamesView = { available: false, signedIn: false },
): string {
  switch (sheet.kind) {
    case 'welcome':
      return welcome(sheet.name);
    case 'help':
      return help();
    case 'achievements':
      return achievements(unlocked, play);
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
      return menu(sheet.saved, ads, unlocked);
    case 'gameOver':
      return gameOver(state, ads);
    case 'contracts':
      return contracts(state);
    case 'store':
      return store(state, ads);
    case 'decor':
      return decorSheet(state);
    case 'marketing':
      return marketing(state);
    case 'expo':
      return expoResults(state);
  }
}

function welcome(name: string): string {
  return `
    <div class="big-emoji">🎮</div>
    <h3 class="center">Game Dev Studio</h3>
    <p class="muted center">It's 1985. You have a garage, a computer and $60,000. Can you build a legendary game studio?</p>
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
      <p><b>Marketing.</b> Pick an ad budget when you start a game. Tap 📣 Promote while making it to build hype with previews and trailers, and book a booth at the yearly GameExpo. A game with good points builds hype on its own by word of mouth. Hype sells more copies of a good game, but a hyped flop gets a backlash. After launch, 📣 Push sales runs ads or a discount sale. Research the Marketing Department to add press tours, TV commercials and TV ad blitzes.</p>
      <p><b>Read the news.</b> Each year has a trending genre and topic (marked 🔥 when you start a game) that sell better. Rival studios release games too: right after a rival's hit, the same topic and genre sells less for a while. The News tab also shows which platforms are growing or on their way out.</p>
      <p><b>The cat.</b> Sometimes the studio cat curls up on a developer's lap, and they work 30% faster while it stays. You can carry the cat over and drop it on someone too, but it needs some alone time between laps.</p>
      <p><b>Store.</b> Spend cash on power-ups: boosts like an espresso bar or pizza night last a few weeks of development, and studio upgrades help forever. Find it next to Contracts, or tap ⚡ Boost while making a game.</p>
      <p><b>Awards.</b> A game that reviews 9.0 or better is a 🏅 Critics' Choice, and 9.5 or better a 👑 Masterpiece. Its sequel starts development with hype already built: the better the original and the longer fans have waited, the more. Those fans never get bored: the hype doesn't fade, and they don't tire of a long series. Each new year, the best-reviewed game of the last one, yours or a rival's, is named 🏆 Game of the Year: winning brings fans, more sales if it's still selling, and extra hype for its sequel.</p>
      <p><b>Track your results.</b> Tap any game to see what it cost, what it made each week, when it paid for itself and whether it was a hit or a flop. The Games tab charts the profit of every release.</p>
      <p><b>Free with a video.</b> In the Android app, the Store has rewards for watching an optional video: an investor's cash, a free Espresso Bar or a research grant. Each one can be claimed again after a few weeks.</p>
      <p><b>Raise the bar.</b> Players expect each game to beat your last one, and the industry keeps moving. Grow your team, train them and research better tech.</p>
      <p><b>Stay solvent.</b> Rent and salaries are paid monthly. Three months in the red and you're bankrupt. Contract work pays the bills.</p>
      <p><b>Grow.</b> Earn research points (RP) to unlock topics, bigger games and better engines. You earn RP every week you're making a game (more with a bigger team) and with every release (more for better reviews). Move offices to hire more people.</p>
      <p>The game runs from 1985 to 2025. Tap ❚❚ to pause anytime. Your progress is saved automatically.</p>
    </div>
    <div class="btn-row"><button class="btn" data-action="close">Got it</button></div>`;
}

const RECEPTION = [
  { face: '😬', title: "Players won't get it", text: (t: string, g: string) => `${t} and ${g} don't mix. Expect harsh reviews.`, cls: 'bad' },
  { face: '😐', title: 'Mixed reception', text: (t: string, g: string) => `Some players will enjoy a ${t} ${g} game, but many won't be convinced.`, cls: 'mid' },
  { face: '🙂', title: 'Players will like it', text: (t: string, g: string) => `${t} ${g} is a solid combination that fans enjoy.`, cls: 'good' },
  { face: '🤩', title: 'Players will love it', text: (t: string, g: string) => `${t} ${g} games are a proven hit!`, cls: 'great' },
  { face: '💞', title: 'A perfect match', text: (t: string, g: string) => `${t} and ${g} were made for each other. Players can't get enough.`, cls: 'perfect' },
];

/** The team's know-how in the genre and topic, for the reception card. */
function knowHowNote(state: GameState, genre: string, topic: string): string {
  const g = genreById(genre).name;
  const gHits = genreHits(state.released, genre);
  const gLevel = expertiseLevel(gHits);
  const tLevel = expertiseLevel(topicHits(state.released, topic));
  const pct = Math.round((GENRE_LEVEL_BONUS * (gLevel - 1) + TOPIC_LEVEL_BONUS * (tLevel - 1)) * 100);
  const next = hitsToNextLevel(gHits);
  const tip = next === null ? '' : ` ${next === 1 ? 'One more' : next} ${g} hit${next > 1 ? 's' : ''} (${EXPERTISE_MIN_SCORE}+ reviews) to reach Lv ${gLevel + 1}.`;
  return `🧠 Team know-how: ${g} <b>Lv ${gLevel}</b>, ${esc(topicById(topic).name)} <b>Lv ${tLevel}</b>${pct ? `: <b>+${pct}%</b> design and tech` : ''}.${tip}`;
}

/**
 * How players are expected to receive a topic + genre combination. Only revealed
 * once the player has discovered the combination by releasing a game with it.
 */
function receptionPreview(state: GameState, d: Pick<GameSpec, 'topic' | 'genre' | 'sequelOf'>, platformId?: string): string {
  const topic = topicById(d.topic).name;
  const genre = genreById(d.genre);
  const fit = state.knowledge.combos[`${d.topic}|${d.genre}`];
  const news = [...newsNotes(state, d.genre, d.topic), knowHowNote(state, d.genre, d.topic)];
  if (fit === undefined) {
    return `
    <div class="reception unknown mt">
      <div class="face">❓</div>
      <div class="grow">
        <b>Unknown reception</b>
        <div class="sub">You haven't released a ${esc(topic)} ${genre.name} game yet. Make one to discover how players react.</div>
        ${news.length ? `<ul class="reception-notes">${news.map((n) => `<li>${n}</li>`).join('')}</ul>` : ''}
      </div>
    </div>`;
  }
  const r = RECEPTION[fit];
  const notes: string[] = [...news];
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
        <div class="meter" aria-label="Combination rating ${FIT_LABELS[fit]}">${FIT_LABELS.map((_, i) => `<i class="${i <= fit ? 'on' : ''}"></i>`).join('')}<span>${FIT_LABELS[fit]}</span></div>
        <div class="sub">${esc(r.text(topic, genre.name))}</div>
        ${notes.length ? `<ul class="reception-notes">${notes.map((n) => `<li>${n}</li>`).join('')}</ul>` : ''}
      </div>
    </div>`;
}

/** What the News tab says about this idea: this year's trend and rivals' recent hits. */
function newsNotes(state: GameState, genre: string, topic: string): string[] {
  const notes: string[] = [];
  const t = trendMult(state, genre, topic);
  if (t > 1) notes.push(`🔥 On trend this year: <b>+${Math.round((t - 1) * 100)}% sales</b>.`);
  const clash = rivalClash(state, genre, topic);
  if (clash) {
    const months = Math.max(1, Math.ceil((RIVAL_CLASH_WEEKS - (state.week - clash.week)) / 4));
    notes.push(`⚔️ ${esc(clash.studio)}'s hit <b>${esc(clash.name)}</b> is still fresh: <b>${Math.round((RIVAL_CLASH_MULT - 1) * 100)}% sales</b> for about ${months} more month${months > 1 ? 's' : ''}.`);
  }
  return notes;
}

/** The "New game or sequel?" picker and, for a sequel, what to expect. */
function sequelPicker(state: GameState, d: GameSpec): string {
  const candidates = sequelCandidates(state);
  if (!candidates.length) return '';
  const original = d.sequelOf !== undefined ? state.released.find((g) => g.id === d.sequelOf) : undefined;
  const chips = [
    `<button class="chip ${original ? '' : 'on'}" data-action="pick-sequel" data-arg="none">✨ New game</button>`,
    // The 8 best-reviewed candidates, listed in release order.
    ...candidates
      .slice(0, 8)
      .sort((a, b) => a.releaseWeek - b.releaseWeek || a.id - b.id)
      .map(
        (g) =>
          `<button class="chip ${original?.id === g.id ? 'on' : ''}" data-action="pick-sequel" data-arg="${g.id}">🔁 ${esc(g.name)}${acclaimOf(g) ? ` ${acclaimOf(g)!.icon}` : ''}${g.goty !== undefined ? ' 🏆' : ''} <small class="muted">${yearOf(g.releaseWeek)}</small> <span class="tag ${g.score >= 7.5 ? 'good' : g.score >= 5 ? 'mid' : 'bad'}">${g.score.toFixed(1)}</span></button>`,
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
    const award = acclaimOf(original);
    const why = [award ? `a ${award.name}` : '', original.goty !== undefined ? `Game of the Year ${original.goty}` : ''].filter(Boolean).join(' and ');
    if (why) notes.unshift(`<li>${award?.icon ?? '🏆'} ${esc(original.name)} is ${why}: the sequel starts with <b>+${sequelHype(original, state.week)} hype</b>, and its fans stay excited all through development.</li>`);
    const waited = longAwaitedHype(original, state.week);
    if (waited > 0) notes.splice(1, 0, `<li>⏰ Fans have waited ${Math.floor((state.week - original.releaseWeek) / WEEKS_PER_YEAR)} years for this, so <b>+${waited}</b> of that hype comes from the long wait.</li>`);
    if (state.week - original.releaseWeek < SEQUEL_TOO_SOON_WEEKS) notes.push(`<li>⏳ ${esc(original.name)} came out less than a year ago. A rushed sequel reviews worse.</li>`);
    if (part >= 4) notes.push(beloved(original) ? `<li>❤️ Part ${part}, but fans of an award winner never tire of the series.</li>` : `<li>🥱 Part ${part} of a long series: players are starting to tire of it.</li>`);
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
      ${availableGenres(state)
        .map((g) => {
          const level = expertiseLevel(genreHits(state.released, g.id));
          const lv = level > 1 ? ` <small class="lv">Lv ${level}</small>` : '';
          return `<button class="chip ${d.genre === g.id ? 'on' : ''}" data-action="pick-genre" data-arg="${g.id}">${g.icon} ${g.name}${lv}${state.industry?.trend?.genre === g.id ? ' 🔥' : ''}</button>`;
        })
        .join('')}
    </div>
    <h4>Topic</h4>
    <div class="chips">
      ${state.topics
        .map((id) => {
          const t = topicById(id);
          const known = d.genre ? state.knowledge.combos[`${id}|${d.genre}`] : undefined;
          const dot = known === PERFECT_FIT ? ' 💞' : known !== undefined ? `<i class="fit fit-${known}" title="${FIT_LABELS[known]}"></i>` : '';
          return `<button class="chip ${d.topic === id ? 'on' : ''}" data-action="pick-topic" data-arg="${id}">${t.icon} ${t.name}${state.industry?.trend?.topic === id ? ' 🔥' : ''}${dot}</button>`;
        })
        .join('')}
    </div>`
    }
    ${d.topic && d.genre ? receptionPreview(state, d) : '<p class="sub mt">Coloured dots show combinations you have already discovered, and 💞 a perfect one.</p>'}
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
          <span class="grow"><b>${s.name}</b><br/><span class="sub">${s.phaseWeeks * 3} weeks · ${money(sizeCost(state, s.id))} · ${s.minStaff > 1 ? `best with ${s.minStaff}+ staff` : 'solo friendly'}</span></span>
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
          <span class="grow"><b>${m.name}</b><br/><span class="sub">${m.cost ? `${money(marketingCost(state, m.id, d.size))} · ` : ''}${m.salesMult > 1 ? `+${Math.round((m.salesMult - 1) * 100)}% sales` : 'word of mouth only'}</span></span>
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
        ${acclaimOf(g) ? `<div class="mt-s">${acclaimTag(g).trim()}</div>` : ''}
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
  const selling = onSale(g);
  const vd = verdict(g);
  const mult = returnMultiple(g);
  const p = profit(g);
  const pay = paybackWeek(g);
  const rank = revenueRank(state.released, g);
  const multText = !isFinite(mult) ? '' : mult >= 1 ? `${mult.toFixed(1)}× its cost` : `${Math.round(mult * 100)}% of its cost back`;
  const payText = pay !== null ? `Paid for itself in week ${pay} on sale.` : g.weekly?.revenue.length ? (selling ? "Hasn't paid for itself yet." : 'Never paid for itself.') : '';
  return `
    <h3>${esc(g.name)}</h3>
    ${acclaimTag(g) ? `<p>${acclaimTag(g).trim()}</p>` : ''}
    ${prequel || next ? `<p class="sub">${prequel ? `Part ${seriesNumber(g)} · sequel to <b>${esc(prequel.name)}</b> (${prequel.score.toFixed(1)})` : 'Part 1'}${next ? ` · followed by <b>${esc(next.name)}</b> (${next.score.toFixed(1)})` : ''}</p>` : ''}
    <p class="muted">${topicById(g.topic).name} ${genreById(g.genre).name} · ${platformById(g.platform).name} · ${sizeById(g.size).name} · ${formatShortDate(g.releaseWeek)}</p>
    <div class="verdict v-${vd.id} mt">
      <span class="emoji">${vd.icon}</span>
      <div class="grow"><b>${vd.label}${selling ? ' so far' : ''}</b><div class="sub">${selling ? 'On track to make' : 'Made'} ${multText}${rank <= 3 && state.released.length > 1 ? ` · your #${rank} best seller` : ` · #${rank} of ${state.released.length} by revenue`}</div></div>
    </div>
    <div class="stats kpis mt">
      <div class="stat"><small>Revenue</small><b>${money(g.revenue)}</b></div>
      <div class="stat"><small>${p >= 0 ? 'Profit' : 'Loss'}</small><b>${p >= 0 ? '▲ ' : '▼ '}${money(Math.abs(p))}</b></div>
      <div class="stat"><small>Copies</small><b>${num(g.unitsSold)}</b></div>
      <div class="stat"><small>Score</small><b>${g.score.toFixed(1)}</b></div>
    </div>
    ${selling ? `<p class="sub mt-s">Still selling: week ${g.weeksOnMarket} of ${SALES_WEEKS}.</p>` : ''}
    <h4>Money made vs cost</h4>
    ${moneyChart(g)}
    ${payText ? `<p class="sub">${payText}</p>` : ''}
    ${g.weekly?.units.length ? `<h4>Copies sold per week</h4>${weeklyChart(g)}` : ''}
    ${g.spend ? `<h4>Where the money went · ${money(totalCost(g))}</h4>${spendBar(g)}` : ''}
    <h4>Reviews</h4>
    <div class="reviews">
      ${g.reviews.map((r, i) => `<div class="review"><div class="outlet">${OUTLETS[i]}</div><div class="num" style="animation:none">${r}</div></div>`).join('')}
    </div>
    <div class="summary">
      ${g.spend ? '' : `<div class="line"><span>Upfront cost</span><span>${money(g.cost)}</span></div>`}
      <div class="line"><span>Fans gained</span><span>${num(g.fansGained)}</span></div>
      <div class="line"><span>Design / Tech / Bugs</span><span>${g.design} / ${g.tech} / ${g.bugs}</span></div>
      <div class="line"><span>Development time</span><span>${g.devWeeks} weeks</span></div>
    </div>
    <div class="btn-row"><button class="btn ghost" data-action="close">Close</button></div>`;
}

function menu(saved: boolean | undefined, ads: MonetizationView, unlocked: Record<string, Unlock>): string {
  // Ads and purchases only exist in the Android app.
  const shop = ads.native
    ? `
      ${
        ads.adFree
          ? '<div class="option"><span class="emoji">💖</span><span class="grow"><b>Ads removed</b><br/><span class="sub">Thanks for supporting the game! Optional videos for rewards stay available.</span></span></div>'
          : `<button class="option" data-action="remove-ads" ${ads.busy ? 'disabled' : ''}><span class="emoji">🚫</span><span class="grow"><b>Remove ads${ads.removeAdsPrice ? ` · ${esc(ads.removeAdsPrice)}` : ''}</b><br/><span class="sub">One-time purchase. No more full-screen ads; optional reward videos stay.</span></span></button>`
      }
      <button class="option" data-action="restore-purchases"><span class="emoji">♻️</span><span class="grow"><b>Restore purchases</b><br/><span class="sub">Bought "Remove ads" on another phone? Get it back here.</span></span></button>
      ${ads.privacyOptions ? '<button class="option" data-action="privacy-options"><span class="emoji">🔒</span><span class="grow"><b>Privacy options</b><br/><span class="sub">Change your ad consent choices.</span></span></button>' : ''}`
    : '';
  return `
    <h3>Menu</h3>
    <div class="options mt">
      <button class="option" data-action="help"><span class="emoji">📖</span><span class="grow"><b>How to play</b></span></button>
      <button class="option" data-action="achievements"><span class="emoji">🏆</span><span class="grow"><b>Achievements</b><br/><span class="sub">${unlockedCount(unlocked)} of ${ACHIEVEMENTS.length} unlocked</span></span></button>
      <button class="option" data-action="save"><span class="emoji">💾</span><span class="grow"><b>Save game</b>${saved ? ' <span class="tag good">Saved!</span>' : '<br/><span class="sub">The game also saves automatically every month.</span>'}</span></button>
      ${shop}
      <button class="option" data-action="ask-reset"><span class="emoji">🔄</span><span class="grow"><b>Start over</b><br/><span class="sub">Delete this save and found a new studio.</span></span></button>
    </div>
    <div class="btn-row"><button class="btn ghost" data-action="close">Close</button></div>`;
}

function unlockedCount(unlocked: Record<string, Unlock>): number {
  return ACHIEVEMENTS.filter((a) => unlocked[a.id]).length;
}

function achievements(unlocked: Record<string, Unlock>, play: PlayGamesView): string {
  const done = unlockedCount(unlocked);
  const rows = ACHIEVEMENTS.map((a) => {
    const u = unlocked[a.id];
    const when = u ? `<br/><span class="sub">Unlocked ${yearOf(u.week)} · ${esc(u.studio)}</span>` : '';
    return `
      <div class="option achievement${u ? '' : ' locked'}">
        <span class="emoji">${u ? a.icon : '🔒'}</span>
        <span class="grow"><b>${esc(a.name)}</b><br/><span class="sub">${esc(a.desc)}</span>${when}</span>
        ${u ? '<span class="tag good">✓</span>' : ''}
      </div>`;
  }).join('');
  return `
    <h3>Achievements</h3>
    <p class="muted">${done} of ${ACHIEVEMENTS.length} unlocked. They stay on this device when you start over.</p>
    ${
      play.available
        ? `<div class="options mt"><button class="option" data-action="play-achievements"><span class="emoji">🎮</span><span class="grow"><b>Google Play Games</b><br/><span class="sub">${play.signedIn ? 'Your achievements are also on your Play Games profile.' : 'Sign in to collect your achievements on your Play Games profile too.'}</span></span></button></div>`
        : ''
    }
    <div class="bar mt"><i style="width:${Math.round((done / ACHIEVEMENTS.length) * 100)}%"></i></div>
    <div class="options mt">${rows}</div>
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

/** A reward for watching an optional video, with what it gives now or why not. */
function rewardRow(state: GameState, r: Reward, ads: MonetizationView): string {
  const blocked = rewardBlocker(state, r.id) ?? (ads.busy ? 'Just a moment…' : !ads.rewardedReady ? 'Loading a video…' : null);
  return `
    <div class="option store-item">
      <span class="emoji">${r.icon}</span>
      <span class="grow"><b>${r.name}</b> <span class="tag good">${esc(rewardAmount(state, r.id))}</span><br/><span class="sub">${r.desc}</span>${
        blocked ? `<br/><span class="sub warn">${esc(blocked)}</span>` : ''
      }</span>
      <button class="btn small" data-action="ad-reward" data-arg="${r.id}" ${blocked ? 'disabled' : ''}>▶ Watch</button>
    </div>`;
}

function store(state: GameState, ads: MonetizationView): string {
  const boosts = STORE.filter((x) => x.kind !== 'upgrade');
  const upgrades = STORE.filter((x) => x.kind === 'upgrade');
  return `
    <h3>Store</h3>
    <p class="muted">Power-ups for your team. Boosts only count down while a game is in development.</p>
    ${ads.native ? `<h4>Free with a video</h4><div class="options">${REWARDS.map((r) => rewardRow(state, r, ads)).join('')}</div>` : ''}
    <h4>Boosts</h4>
    <div class="options">${boosts.map((x) => storeRow(state, x)).join('')}</div>
    <h4>Studio upgrades</h4>
    <div class="options">${upgrades.map((x) => storeRow(state, x)).join('')}</div>
    <h4>Studio look</h4>
    <div class="options">
      <button class="option" data-action="decor"><span class="emoji">🎨</span><span class="grow"><b>Decorate</b><br/><span class="sub">Paint the walls and floor, and buy decorations for the office.</span></span></button>
    </div>
    <div class="btn-row"><button class="btn ghost" data-action="close">Close</button></div>`;
}

/** One row of colour swatches for the walls or the floor, with "Original" first. */
function swatches(state: GameState, surface: 'wall' | 'floor', paints: Paint[]): string {
  const current = state.decor?.[surface] ?? '';
  const price = paintPrice(state);
  const swatch = (id: string, name: string, color: string | null) => {
    const on = id === current;
    const cost = id ? price : 0;
    return `<button class="swatch${on ? ' on' : ''}${color ? '' : ' original'}" data-action="paint-${surface}" data-arg="${id}" ${on || cost > state.cash ? 'disabled' : ''} aria-label="${name}${on ? ' (current)' : ''}" title="${name}"${color ? ` style="--swatch:${color}"` : ''}></button>`;
  };
  return `<div class="swatches">${swatch('', 'Original', null)}${paints.map((p) => swatch(p.id, p.name, p.color)).join('')}</div>`;
}

function decorRow(state: GameState, item: DecorItem): string {
  const owned = ownsDecor(state, item.id);
  const placed = isPlaced(state, item.id);
  const price = decorPrice(state, item.id);
  const blocked = !owned && price > state.cash ? 'Not enough cash.' : null;
  const status = placed ? '<span class="tag good">On show</span>' : owned ? '<span class="tag">In storage</span>' : '';
  const extra = item.id === 'trophies' && owned ? ` You have ${trophyCount(state)} so far.` : '';
  const button = owned
    ? `<button class="btn small${placed ? ' ghost' : ''}" data-action="toggle-decor" data-arg="${item.id}">${placed ? 'Put away' : 'Place'}</button>`
    : `<button class="btn small" data-action="buy-decor" data-arg="${item.id}" ${blocked ? 'disabled' : ''}>Buy · ${money(price)}</button>`;
  return `
    <div class="option store-item">
      <span class="emoji">${item.icon}</span>
      <span class="grow"><b>${item.name}</b> ${status}<br/><span class="sub">${item.desc}${extra}</span>${blocked ? `<br/><span class="sub warn">${blocked}</span>` : ''}</span>
      ${button}
    </div>`;
}

function decorSheet(state: GameState): string {
  const wall = WALL_PAINTS.find((p) => p.id === state.decor?.wall)?.name ?? 'Original';
  const floor = FLOOR_PAINTS.find((p) => p.id === state.decor?.floor)?.name ?? 'Original';
  return `
    <h3>Decorate</h3>
    <p class="muted">Make the studio yours. It's just for looks, and it comes with you when you move.</p>
    <h4>Walls · ${wall}</h4>
    ${swatches(state, 'wall', WALL_PAINTS)}
    <h4>Floor · ${floor}</h4>
    ${swatches(state, 'floor', FLOOR_PAINTS)}
    <p class="sub">A new colour costs ${money(paintPrice(state))}. Going back to the original is free.</p>
    <h4>Decorations</h4>
    <p class="sub">Buy once, then place or put away for free.</p>
    <div class="options">${DECOR.map((d) => decorRow(state, d)).join('')}</div>
    <div class="btn-row"><button class="btn ghost" data-action="store">Back to Store</button><button class="btn ghost" data-action="close">Close</button></div>`;
}

/** One buyable marketing option: icon, name, what it does, and a price button (or why not). */
function marketingRow(icon: string, name: string, desc: string, status: string, action: string, arg: string, price: number, blocked: string | null, done: boolean): string {
  return `
    <div class="option store-item">
      <span class="emoji">${icon}</span>
      <span class="grow"><b>${name}</b> ${status}<br/><span class="sub">${desc}</span>${blocked && !done ? `<br/><span class="sub warn">${blocked}</span>` : ''}</span>
      <button class="btn small" data-action="${action}" data-arg="${arg}" ${blocked ? 'disabled' : ''}>${done ? 'Done' : price ? money(price) : 'Free'}</button>
    </div>`;
}

function marketing(state: GameState): string {
  const parts: string[] = ['<h3>Marketing</h3>'];
  const p = state.activity;

  // Hype for the game in development.
  if (p?.kind === 'game') {
    const hype = Math.round(p.hype ?? 0);
    parts.push(`
    <h4>Build hype for ${esc(p.name)}</h4>
    <div class="hype-row big">
      <span class="hype-label">📣 Hype</span>
      <div class="hype-bar"><i style="width:${hype}%"></i></div>
      <b>${hype}</b>
    </div>
    <p class="sub">Hype grows by word of mouth while the game is shaping up well, and fades a little every week when it isn't. At launch it boosts sales and fans, but only if the reviews live up to it: a hyped flop gets a backlash.</p>
    <div class="options">${PROMOS.map((pr) => {
      const done = !!p.promos?.includes(pr.id);
      return marketingRow(pr.icon, pr.name, `${pr.desc} +${pr.hype} hype.`, done ? '<span class="tag good">Done</span>' : '', 'promo', pr.id, promoPrice(state, pr.id), promoBlocker(state, pr.id), done);
    }).join('')}</div>`);
  }

  // GameExpo.
  const weeks = weeksToExpo(state, WEEKS_PER_YEAR);
  const year = yearOf(state.week);
  const booked = state.expo?.year === year ? boothById(state.expo.booth) : null;
  let expo: string;
  const result = state.expo?.year === year ? state.expo.report : undefined;
  if (result) {
    expo = `<p class="sub">Your ${boothById(result.booth).name.toLowerCase()} won ${num(result.fansAfter - result.fansBefore)} fans${result.game ? ` and +${Math.round((result.hypeAfter ?? 0) - (result.hypeBefore ?? 0))} hype for ${esc(result.game)}` : ''}.</p>
    <div class="options"><button class="option" data-action="expo-results"><span class="emoji">🎪</span><span class="grow"><b>See what GameExpo did</b></span></button></div>`;
  } else if (booked) {
    expo = `<p class="sub">Your ${booked.name.toLowerCase()} is booked${weeks ? ` · opens in ${weeks} week${weeks === 1 ? '' : 's'}` : ''}. ${p?.kind === 'game' ? `${esc(p.name)} will be on show.` : 'Start a game before then to show it off.'}</p>`;
  } else if (weeks !== null && weeks >= 1 && weeks <= EXPO_BOOKING_WEEKS) {
    expo = `<p class="sub">Opens in ${weeks} week${weeks === 1 ? '' : 's'}. A game in development gets hype and you win fans; with nothing to show, you win fewer fans.</p>
    <div class="options">${BOOTHS.map((b) => marketingRow('🎪', b.name, `+${b.hype} hype, +${b.fans.toLocaleString('en-US')} fans.`, '', 'booth', b.id, boothPrice(state, b.id), boothBlocker(state, b.id), false)).join('')}</div>`;
  } else {
    const next = weeks === null || weeks < 1 ? year + 1 : year;
    expo = `<p class="sub">GameExpo ${next} is in June. Booking opens ${EXPO_BOOKING_WEEKS} weeks before.</p>`;
  }
  parts.push(`<h4>🎪 GameExpo ${booked || result || (weeks !== null && weeks >= 1) ? year : year + 1}</h4>${expo}`);

  // Games on sale.
  const selling = state.released.filter((g) => g.weeksOnMarket < SALES_WEEKS);
  parts.push('<h4>Games on sale</h4>');
  if (!selling.length) parts.push('<p class="sub">Nothing on sale right now.</p>');
  for (const g of selling) {
    parts.push(`<p class="sub"><b>${esc(g.name)}</b> · ${SALES_WEEKS - g.weeksOnMarket} weeks left on the charts</p>
    <div class="options">${SALES_PUSHES.map((sp) => {
      const done = !!g.pushes?.includes(sp.id);
      return marketingRow(sp.icon, sp.name, sp.desc, done ? '<span class="tag good">Done</span>' : '', 'push', `${g.id}:${sp.id}`, salesPushPrice(state, sp.id), salesPushBlocker(state, g.id, sp.id), done);
    }).join('')}</div>`);
  }
  parts.push('<div class="btn-row"><button class="btn ghost" data-action="close">Close</button></div>');
  return parts.join('');
}

/** What this year's GameExpo booth did: hype for the game on show, fans won, and what it cost. */
function expoResults(state: GameState): string {
  const r = state.expo?.report;
  if (!r) return '';
  const booth = boothById(r.booth);
  const fans = r.fansAfter - r.fansBefore;
  const hasHype = r.game !== undefined && r.hypeBefore !== undefined && r.hypeAfter !== undefined;
  const hype = hasHype ? Math.round(r.hypeAfter! - r.hypeBefore!) : 0;
  // The most hype can do at launch: with reviews of 7+ and no big ad campaign.
  const boostBefore = hasHype ? Math.round((hypeEffect(r.hypeBefore!, 10).salesMult - 1) * 100) : 0;
  const boostAfter = hasHype ? Math.round((hypeEffect(r.hypeAfter!, 10).salesMult - 1) * 100) : 0;
  const capped = hasHype && hype < booth.hype && r.hypeAfter! >= MAX_HYPE;
  const fansPct = r.fansBefore > 0 ? Math.round((fans / r.fansBefore) * 100) : null;
  return `
    <div class="big-emoji">🎪</div>
    <h3 class="center">GameExpo ${r.year}</h3>
    <p class="muted center">${booth.name}${r.game ? ` · showing <b>${esc(r.game)}</b>` : ' · nothing new to show'}</p>
    <div class="counters">
      ${hasHype ? `<div class="counter"><b>+${hype}</b><small>Hype</small></div>` : ''}
      <div class="counter"><b>+${num(fans)}</b><small>Fans</small></div>
      ${r.price !== undefined ? `<div class="counter"><b>${money(r.price)}</b><small>Cost</small></div>` : ''}
    </div>
    <div class="summary">
      ${
        hasHype
          ? `<div class="line"><span>📣 Hype for ${esc(r.game!)}</span><b>${Math.round(r.hypeBefore!)} → ${Math.round(r.hypeAfter!)}</b></div>
      <div class="line"><span>Sales boost at launch (reviews 7+)</span><b>+${boostBefore}% → +${boostAfter}%</b></div>`
          : ''
      }
      <div class="line"><span>👥 Fans</span><b>${num(r.fansBefore)} → ${num(r.fansAfter)}${fansPct !== null ? ` (+${fansPct}%)` : ''}</b></div>
    </div>
    <p class="sub">${
      hasHype
        ? `${capped ? 'Hype was already near the top, so the booth could only add part of its +' + booth.hype + '. ' : ''}Hype fades a little every week until launch unless the game is shaping up well. Great reviews turn it into extra sales and fans; a flop that was hyped up gets a backlash.`
        : `With no game in development, the booth won half the usual ${num(booth.fans)} fans. Start a game before next year's expo to build hype too.`
    } More fans means more copies sold for every game you release.</p>
    <div class="btn-row"><button class="btn big" data-action="close">Continue</button></div>`;
}

/** The first bankruptcy in a save can be undone once with a video (Android app only). */
function bailoutOffer(state: GameState, ads: MonetizationView): string {
  if (!ads.native || !canBailout(state)) return '';
  const waiting = ads.busy ? 'Just a moment…' : !ads.rewardedReady ? 'Loading a video…' : null;
  return `
    <div class="option store-item">
      <span class="emoji">🏦</span>
      <span class="grow"><b>Bailout</b> <span class="tag good">+${money(bailoutCash(state))}</span><br/><span class="sub">Watch a video and the bank pays off your debt and gives you three months of running costs. One bailout per studio.</span>${
        waiting ? `<br/><span class="sub warn">${waiting}</span>` : ''
      }</span>
      <button class="btn small" data-action="bailout" ${waiting ? 'disabled' : ''}>▶ Watch</button>
    </div>`;
}

function gameOver(state: GameState, ads: MonetizationView): string {
  const games = state.released;
  const avg = games.length ? games.reduce((a, g) => a + g.score, 0) / games.length : 0;
  const best = games.length ? games.reduce((a, g) => (g.score > a.score ? g : a)) : null;
  const bankrupt = state.over === 'bankrupt';
  const bailout = bankrupt ? bailoutOffer(state, ads) : '';
  return `
    <div class="big-emoji">${bankrupt ? '💸' : '🏆'}</div>
    <h3 class="center">${bankrupt ? 'Bankrupt!' : 'A legendary career'}</h3>
    <p class="muted center">${bankrupt ? (bailout ? 'The money ran out. But the bank is willing to give you one more chance.' : 'The money ran out. Every great studio has a failure or two. Try again!') : `${esc(state.studioName)} has reached ${formatShortDate(state.week)}. Time to retire.`}</p>
    ${bailout ? `<div class="options">${bailout}</div>` : ''}
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
