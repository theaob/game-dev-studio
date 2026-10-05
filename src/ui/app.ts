import { availablePlatforms, createGame, doResearch, fire, hire, randomTitle, bookBooth, buyStoreItem, catLeaveLap, pushSales, runPromo, placeCatOnLap, releaseGame, setPhaseFocus, setPolishMode, startContract, startGame, tick, train, upgradeOffice, validateGame } from '../core/sim';
import { storeItemById } from '../core/data';
import type { BoothId, PromoId, SalesPushId } from '../core/marketing';
import { normalizeFocus } from '../core/scoring';
import { sequelName } from '../core/sequels';
import type { GameSpec, GameState, GenreId, MarketingId, NoticeKind, PolishMode, SimEvent, SizeId } from '../core/types';
import { clearSave, loadGame, saveGame } from '../save';
import { OfficeScene } from './office';
import { OfficeLoading, hasWebGL } from './office-loading';
import { CAT_ID } from './office-common';
import type { OfficeView } from './office-view';
import { money, num } from './format';
import { focusLean, renderSheet, type Sheet } from './sheets';
import { SPEEDS, renderDock, renderGames, renderNav, renderNews, renderResearch, renderStaff, renderTopbar, type Tab } from './views';

type StatKey = 'cash' | 'fans' | 'rp';

/** Real-time milliseconds per in-game week at 1x speed. */
const WEEK_MS = 1500;

/** Sheets that must be answered and can't be dismissed by tapping outside. */
const BLOCKING: Sheet['kind'][] = ['welcome', 'focus', 'review', 'gameOver'];

/** How long to wait for the 3D office before settling on the 2D one. */
const OFFICE3D_TIMEOUT_MS = 10_000;

export class App {
  private state: GameState | null;
  private tab: Tab = 'studio';
  private speed = 1;
  private sheet: Sheet | null = null;
  private queue: Sheet[] = [];
  private acc = 0;
  private last = 0;
  private reviewTimer = 0;
  private html: Record<string, string> = {};
  private els: Record<'top' | 'scroll' | 'scene' | 'dock' | 'main' | 'nav' | 'sheet' | 'fx' | 'toasts', HTMLElement>;
  /** Speed to resume at when un-pausing. */
  private lastSpeed = 1;
  /** Starts as the 2D office and upgrades to 3D once three.js has loaded (if WebGL works). */
  private office: OfficeView = hasWebGL() ? new OfficeLoading() : new OfficeScene();
  /** Values currently shown in the top bar; they glide towards the real ones. */
  private shownStats: Record<StatKey, number> | null = null;
  private lastStats: Record<StatKey, number> | null = null;
  /** Identifies the newest headline the player has seen on the News tab. */
  private newsSeen = '';
  private lastDraw = 0;

  constructor(root: HTMLElement) {
    // A full-screen world with the interface floating on top, like a mobile game:
    // the office fills the screen, the HUD sits on top, an action dock above the
    // tab bar, and the other tabs slide up as panels over the world.
    root.innerHTML = `<div id="scene" class="stage"></div><div id="top" class="hud"></div><div id="dock" class="dock"></div><div id="scroll" class="panel scroll"><main id="main"></main></div><div id="nav"></div><div id="sheet-root"></div><div id="fx"></div><div class="toasts" id="toasts"></div>`;
    const $ = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!;
    this.els = { top: $('top'), scroll: $('scroll'), scene: $('scene'), dock: $('dock'), main: $('main'), nav: $('nav'), sheet: $('sheet-root'), fx: $('fx'), toasts: $('toasts') };
    this.enableSwipeToClose();

    this.els.scene.appendChild(this.office.el);
    this.wireOffice(this.office);
    this.loadOffice3D();
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('input', (e) => this.onInput(e));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.save();
    });
    window.addEventListener('pagehide', () => this.save());

    this.state = loadGame();
    this.markNewsRead();
    if (!this.state) this.open({ kind: 'welcome', name: '' });
    else this.resumePrompts();

    this.render();
    requestAnimationFrame((t) => this.loop(t));
  }

  // -------------------------------------------------------------------------
  // Loop
  // -------------------------------------------------------------------------

  private loop(t: number) {
    const dt = Math.min(250, t - (this.last || t));
    this.last = t;
    const s = this.state;
    if (s && !s.over && !this.sheet && SPEEDS[this.speed] > 0 && !document.hidden) {
      this.acc += dt * SPEEDS[this.speed];
      let steps = 0;
      while (this.acc >= WEEK_MS && !this.sheet && steps++ < 4) {
        this.acc -= WEEK_MS;
        this.step();
      }
    }
    this.updateStats(dt);
    // The office animates at ~30fps while visible.
    if (s && this.tab === 'studio' && !document.hidden && t - this.lastDraw > 32) {
      this.lastDraw = t;
      const top = this.els.top.getBoundingClientRect().bottom;
      const bottom = window.innerHeight - this.els.dock.getBoundingClientRect().top;
      this.office.setInsets?.(top, bottom);
      this.office.draw(s, t, !s.over && !this.sheet && SPEEDS[this.speed] > 0);
    }
    requestAnimationFrame((n) => this.loop(n));
  }

  private step() {
    const s = this.state!;
    const events = tick(s);
    for (const ev of events) this.handle(ev);
    if (s.week % 4 === 0) this.save();
    this.render();
  }

  private handle(ev: SimEvent) {
    switch (ev.type) {
      case 'points':
        this.bubbles(ev.design, ev.tech, ev.bugs);
        break;
      case 'needFocus':
        if (this.sheet?.kind !== 'focus') this.open({ kind: 'focus', phase: ev.phase, values: [50, 50, 50] });
        break;
      case 'devComplete':
        this.open({ kind: 'devComplete' });
        break;
      case 'notice':
        this.toast(ev.notice.text, ev.notice.kind);
        break;
      case 'gameOver':
        this.save();
        this.open({ kind: 'gameOver' });
        break;
      case 'zone':
        this.office.celebrate(ev.staffId);
        this.toast(ev.name === 'You' ? "🔥 You're in the zone!" : `🔥 ${ev.name} is in the zone!`, 'good');
        this.vibrate(25);
        break;
      case 'catLap': {
        const whose = ev.name === 'You' ? 'your' : `${ev.name.split(' ')[0]}'s`;
        this.toast(`🐈 The cat curled up on ${whose} lap: +30% output while it stays.`, 'good');
        break;
      }
      case 'catLeft':
        break;
      case 'contractDone':
        this.office.cheer(['💰', 'Paid!', '💵']);
        this.vibrate(15);
        break;
    }
  }

  /** Re-opens prompts that were pending when the game was saved. */
  private resumePrompts() {
    const s = this.state!;
    if (s.over) this.open({ kind: 'gameOver' });
    else if (s.activity?.kind === 'game' && s.activity.awaitingFocus) {
      this.open({ kind: 'focus', phase: s.activity.phase, values: [50, 50, 50] });
    }
  }

  /**
   * Cash, fans and research glide to their new values and flash green or red
   * when they change. Only the text is touched, so taps on the top bar are never lost.
   */
  private updateStats(dtMs: number) {
    const s = this.state;
    if (!s) {
      this.shownStats = this.lastStats = null;
      return;
    }
    const target: Record<StatKey, number> = { cash: s.cash, fans: s.fans, rp: Math.floor(s.rp) };
    const shown = (this.shownStats ??= { ...target });
    const last = (this.lastStats ??= { ...target });
    for (const key of ['cash', 'fans', 'rp'] as StatKey[]) {
      const el = this.els.top.querySelector<HTMLElement>(`[data-stat="${key}"]`);
      if (!el) continue;
      const diff = target[key] - shown[key];
      if (Math.abs(diff) < 1) shown[key] = target[key];
      else shown[key] += diff * Math.min(1, (dtMs / 1000) * 7);
      const change = target[key] - last[key];
      if (Math.abs(change) >= (key === 'cash' ? 500 : 1)) {
        el.classList.remove('up', 'down');
        void el.offsetWidth; // restart the flash animation
        el.classList.add(change > 0 ? 'up' : 'down');
        last[key] = target[key];
      }
      const v = shown[key];
      const text = key === 'cash' ? money(v) : key === 'fans' ? num(v) : `${Math.floor(v)} RP`;
      const b = el.querySelector('b')!;
      if (b.textContent !== text) b.textContent = text;
      if (key === 'cash') el.classList.toggle('neg', target.cash < 0);
    }
  }

  /** Slide freshly shown content in. */
  private animateIn(el: HTMLElement) {
    el.classList.remove('enter');
    void el.offsetWidth;
    el.classList.add('enter');
  }

  /** After the last review lands: count the average up, and throw confetti for a hit. */
  private onReviewsShown(score: number) {
    const el = this.els.sheet.querySelector<HTMLElement>('[data-countup]');
    if (el && !el.dataset.done) {
      el.dataset.done = '1';
      const end = Number(el.dataset.countup);
      const start = performance.now();
      const stepFn = (now: number) => {
        const p = Math.min(1, (now - start) / 800);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = (end * eased).toFixed(1);
        if (p < 1) requestAnimationFrame(stepFn);
      };
      requestAnimationFrame(stepFn);
    }
    if (score >= 8) this.confetti();
  }

  private confetti() {
    const layer = document.createElement('div');
    layer.className = 'confetti';
    const colors = ['#dc4b2a', '#f2b33d', '#23877d', '#2f7fc1', '#2b2622', '#fff8ea'];
    for (let i = 0; i < 90; i++) {
      const p = document.createElement('i');
      p.style.left = `${Math.random() * 100}%`;
      p.style.background = colors[i % colors.length];
      p.style.setProperty('--drift', `${(Math.random() - 0.5) * 160}px`);
      p.style.setProperty('--spin', `${(Math.random() - 0.5) * 1440}deg`);
      p.style.animationDuration = `${1.8 + Math.random() * 1.4}s`;
      p.style.animationDelay = `${Math.random() * 0.4}s`;
      if (i % 3 === 0) p.style.borderRadius = '50%';
      layer.appendChild(p);
    }
    document.body.appendChild(layer);
    window.setTimeout(() => layer.remove(), 4000);
  }

  /** Drag a sheet down to dismiss it, like a native bottom sheet. */
  private enableSwipeToClose() {
    let startY = 0;
    let dy = 0;
    let sheetEl: HTMLElement | null = null;
    const host = this.els.sheet;
    host.addEventListener(
      'touchstart',
      (e) => {
        const el = (e.target as HTMLElement).closest<HTMLElement>('.sheet');
        if (!el || el.scrollTop > 0 || !this.sheet || BLOCKING.includes(this.sheet.kind)) return;
        if ((e.target as HTMLElement).closest('input, textarea')) return;
        sheetEl = el;
        startY = e.touches[0].clientY;
        dy = 0;
      },
      { passive: true },
    );
    host.addEventListener(
      'touchmove',
      (e) => {
        if (!sheetEl) return;
        dy = Math.max(0, e.touches[0].clientY - startY);
        if (sheetEl.scrollTop > 0) dy = 0;
        sheetEl.style.transition = 'none';
        sheetEl.style.transform = `translateY(${dy}px)`;
      },
      { passive: true },
    );
    host.addEventListener('touchend', () => {
      if (!sheetEl) return;
      const el = sheetEl;
      sheetEl = null;
      el.style.transition = '';
      if (dy > 110) {
        this.close();
      } else {
        el.style.transform = '';
      }
    });
  }

  /**
   * Loads the three.js office while a loading card shows. The 2D office is only a
   * fallback (no WebGL, download failed or too slow), and once it's on screen it
   * stays for the session, so the office never visibly switches style mid-game.
   */
  private loadOffice3D() {
    if (!(this.office instanceof OfficeLoading)) return;
    const fallback = () => {
      if (this.office instanceof OfficeLoading) this.swapOffice(new OfficeScene());
    };
    const timer = window.setTimeout(fallback, OFFICE3D_TIMEOUT_MS);
    import('./office3d')
      .then(({ createOffice3D }) => {
        window.clearTimeout(timer);
        if (!(this.office instanceof OfficeLoading)) return;
        const view = createOffice3D();
        if (!view) return fallback();
        view.onLost = () => this.swapOffice(new OfficeScene());
        this.swapOffice(view);
      })
      .catch(() => {
        window.clearTimeout(timer);
        fallback();
      });
  }

  private swapOffice(view: OfficeView) {
    this.office.el.replaceWith(view.el);
    this.office = view;
    this.wireOffice(view);
    this.lastDraw = 0;
  }

  /** Lets the office tell the game when the player moves the cat on or off a lap. */
  private wireOffice(view: OfficeView) {
    view.onCatLap = (staffId) => {
      const s = this.state;
      if (!s) return false;
      const err = placeCatOnLap(s, staffId);
      if (err) {
        this.office.say(CAT_ID, '😾', 1.6);
        this.toast(err, 'info');
        return false;
      }
      const who = s.staff.find((x) => x.id === staffId);
      if (who) this.toast(`🐈 The cat curled up on ${who.name === 'You' ? 'your' : who.name.split(' ')[0] + "'s"} lap: +30% output while it stays.`, 'good');
      this.save();
      this.render();
      return true;
    };
    view.onCatLeave = () => {
      if (!this.state) return;
      catLeaveLap(this.state);
      this.save();
      this.render();
    };
  }

  /** Identifies a headline on the News tab. */
  private headlineKey(i: number): string {
    const h = this.state?.industry?.headlines[i];
    return h ? `${h.week}|${h.text}` : '';
  }

  private markNewsRead() {
    const n = this.state?.industry?.headlines.length ?? 0;
    if (this.state) this.newsSeen = this.headlineKey(n - 1);
  }

  private unreadNews(): number {
    const list = this.state?.industry?.headlines ?? [];
    for (let i = list.length - 1; i >= 0; i--) if (this.headlineKey(i) === this.newsSeen) return list.length - 1 - i;
    return Math.min(list.length, 9);
  }

  private save() {
    if (this.state) saveGame(this.state);
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  private set(key: keyof typeof this.els, html: string) {
    if (this.html[key] === html) return;
    this.html[key] = html;
    this.els[key].innerHTML = html;
  }

  private render() {
    const s = this.state;
    if (s) {
      this.set('top', renderTopbar(s, this.speed, this.lastSpeed));
      this.updateStats(0);
      if (this.tab === 'news') this.markNewsRead();
      const studio = this.tab === 'studio';
      this.els.dock.hidden = !studio;
      this.els.scroll.hidden = studio;
      if (studio) {
        this.set('dock', renderDock(s));
      } else {
        const titles: Record<Exclude<Tab, 'studio'>, [string, string]> = {
          games: ['Games', `${s.released.length} released`],
          research: ['Research', `🔬 ${Math.floor(s.rp)} RP`],
          staff: ['Team', `${s.staff.length} ${s.staff.length === 1 ? 'person' : 'people'}`],
          news: ['News', ''],
        };
        const tab = this.tab as Exclude<Tab, 'studio'>;
        const [title, extra] = titles[tab];
        const view = { games: renderGames, research: renderResearch, staff: renderStaff, news: renderNews }[tab];
        this.set('main', `<header class="panel-head"><h1>${title}</h1>${extra ? `<span class="panel-chip">${extra}</span>` : ''}</header>${view(s)}`);
      }
      this.set('nav', renderNav(this.tab, s, this.unreadNews()));
    } else {
      this.set('top', '');
      this.els.dock.hidden = true;
      this.els.scroll.hidden = true;
      this.set('main', '');
      this.set('nav', '');
    }
    this.renderSheet();
  }

  private renderSheet() {
    const host = this.els.sheet;
    if (!this.sheet) {
      host.innerHTML = '';
      this.html.sheet = '';
      return;
    }
    const inner = renderSheet(this.state, this.sheet);
    const existing = host.querySelector<HTMLElement>('.sheet');
    if (existing && host.dataset.kind === this.sheet.kind) {
      if (this.html.sheet !== inner) existing.innerHTML = inner;
    } else {
      host.innerHTML = `<div class="overlay" data-overlay><div class="sheet" role="dialog" aria-modal="true">${inner}</div></div>`;
      host.dataset.kind = this.sheet.kind;
      host.querySelector<HTMLInputElement>('input.text-input')?.focus({ preventScroll: true });
    }
    this.html.sheet = inner;
  }

  private open(sheet: Sheet) {
    if (this.sheet) {
      this.queue.push(sheet);
      return;
    }
    this.sheet = sheet;
    this.renderSheet();
  }

  /** Swaps the current sheet for another one without animation glitches. */
  private replace(sheet: Sheet) {
    this.sheet = sheet;
    this.els.sheet.dataset.kind = '';
    this.renderSheet();
  }

  private close() {
    window.clearInterval(this.reviewTimer);
    this.sheet = this.queue.shift() ?? null;
    this.els.sheet.dataset.kind = '';
    this.acc = 0;
    this.render();
  }

  private toast(text: string, kind: NoticeKind = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    this.els.toasts.appendChild(el);
    while (this.els.toasts.children.length > 3) this.els.toasts.firstElementChild!.remove();
    window.setTimeout(() => el.classList.add('out'), 2600);
    window.setTimeout(() => el.remove(), 3000);
  }

  private bubbles(design: number, tech: number, bugs: number) {
    if (this.tab !== 'studio') return;
    const counters = this.els.dock.querySelectorAll<HTMLElement>('#counters .counter');
    if (counters.length !== 3) return;
    const items: [number, string, string][] = [
      // All points are whole numbers: shown as e.g. "+12", "+2 🐛" or "−3 🐛".
      [design, `+${design}`, 'var(--design)'],
      [tech, `+${tech}`, 'var(--tech)'],
      [bugs, bugs < 0 ? `−${-bugs} 🐛` : `+${bugs} 🐛`, bugs < 0 ? 'var(--good)' : 'var(--bugs)'],
    ];
    items.forEach(([v, label, color], i) => {
      if (!v) return;
      const r = counters[i].getBoundingClientRect();
      const b = document.createElement('span');
      b.className = 'bubble';
      b.textContent = label;
      b.style.color = color;
      b.style.left = `${r.left + r.width / 2 - 18 + (Math.random() * 20 - 10)}px`;
      b.style.top = `${r.top - 6}px`;
      this.els.fx.appendChild(b);
      window.setTimeout(() => b.remove(), 1200);
    });
  }

  private vibrate(ms: number) {
    try {
      navigator.vibrate?.(ms);
    } catch {
      // not supported
    }
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  private onInput(e: Event) {
    const el = e.target as HTMLInputElement;
    const sheet = this.sheet;
    if (!sheet) return;
    if (el.dataset.bind === 'studio' && sheet.kind === 'welcome') sheet.name = el.value;
    if (el.dataset.bind === 'name' && sheet.kind === 'newGame') {
      sheet.draft.name = el.value;
      sheet.nameEdited = el.value.trim() !== '';
    }
    if (el.dataset.focus !== undefined && sheet.kind === 'focus') {
      sheet.values[Number(el.dataset.focus)] = Number(el.value);
      this.updateFocusLabels(sheet);
    }
  }

  /** Updates slider labels in place so dragging stays smooth. */
  private updateFocusLabels(sheet: Extract<Sheet, { kind: 'focus' }>) {
    const host = this.els.sheet;
    normalizeFocus(sheet.values).forEach((v, i) => {
      const el = host.querySelector(`[data-share="${i}"]`);
      if (el) el.textContent = `${Math.round(v * 100)}%`;
    });
    if (!this.state) return;
    const lean = focusLean(this.state, sheet.phase, sheet.values);
    const d = Math.round((lean.design / (lean.design + lean.tech || 1)) * 100);
    host.querySelector('[data-lean="d"]')!.textContent = `${d}%`;
    host.querySelector('[data-lean="t"]')!.textContent = `${100 - d}%`;
    host.querySelector<HTMLElement>('[data-lean-bar="d"]')!.style.width = `${d}%`;
  }

  private onClick(e: Event) {
    const target = e.target as HTMLElement;
    if (target.hasAttribute('data-overlay')) {
      if (this.sheet && !BLOCKING.includes(this.sheet.kind)) this.close();
      return;
    }
    const btn = target.closest<HTMLElement>('[data-action]');
    if (!btn || (btn as HTMLButtonElement).disabled) return;
    this.vibrate(5);
    this.action(btn.dataset.action!, btn.dataset.arg ?? '');
  }

  private action(name: string, arg: string) {
    const s = this.state;
    const sheet = this.sheet;
    const report = (err: string | null) => {
      if (err) this.toast(err, 'bad');
      this.render();
      return !err;
    };

    switch (name) {
      // Global
      case 'speed':
        this.speed = Number(arg);
        if (this.speed > 0) this.lastSpeed = this.speed;
        this.acc = 0;
        this.render();
        return;
      case 'toggle-pause':
        this.speed = this.speed === 0 ? this.lastSpeed : 0;
        this.acc = 0;
        this.render();
        return;
      case 'cycle-speed':
        // 1× → 2× → 4× → 1×, and un-pause.
        this.lastSpeed = this.speed === 0 ? this.lastSpeed : (this.speed % (SPEEDS.length - 1)) + 1;
        this.speed = this.lastSpeed;
        this.acc = 0;
        this.render();
        return;
      case 'tab':
        if (this.tab !== arg) {
          this.tab = arg as Tab;
          this.els.scroll.scrollTop = 0;
          this.vibrate(6);
          this.render();
          this.animateIn(this.els.main);
        }
        return;
      case 'menu':
        this.open({ kind: 'menu' });
        return;
      case 'help':
        if (sheet?.kind === 'welcome') this.queue.unshift(sheet);
        this.replace({ kind: 'help' });
        return;
      case 'close':
        this.close();
        return;
      case 'save':
        if (s && saveGame(s) && sheet?.kind === 'menu') {
          sheet.saved = true;
          this.renderSheet();
        }
        return;
      case 'ask-reset':
        this.replace({ kind: 'confirm', text: 'This deletes your current studio for good.', action: 'reset', confirmLabel: 'Delete & restart' });
        return;
      case 'reset':
        clearSave();
        this.state = null;
        this.queue = [];
        this.tab = 'studio';
        this.sheet = null;
        this.open({ kind: 'welcome', name: '' });
        this.render();
        return;
      case 'start-studio': {
        const name = sheet?.kind === 'welcome' ? sheet.name : '';
        this.state = createGame(name);
        this.markNewsRead();
        this.save();
        this.close();
        this.toast('Tip: start with a small game, or take a contract for quick cash.', 'info');
        return;
      }
    }

    if (!s) return;

    switch (name) {
      // Studio
      case 'new-game': {
        const draft: GameSpec = { name: '', topic: '', genre: '' as GenreId, platform: 'pc', size: 'small', marketing: 'none' };
        this.open({ kind: 'newGame', step: 1, draft });
        return;
      }
      case 'contracts':
        this.open({ kind: 'contracts' });
        return;
      case 'store':
        this.open({ kind: 'store' });
        return;
      case 'marketing':
        this.open({ kind: 'marketing' });
        return;
      case 'promo':
      case 'booth':
      case 'push': {
        const err =
          name === 'promo'
            ? runPromo(s, arg as PromoId)
            : name === 'booth'
              ? bookBooth(s, arg as BoothId)
              : pushSales(s, Number(arg.split(':')[0]), arg.split(':')[1] as SalesPushId);
        if (report(err)) {
          this.office.cheer(name === 'push' ? ['📈', 'Sales!', '💸'] : name === 'booth' ? ['🎪', 'Expo!', '🤩'] : ['📣', 'Hype!', '🔥']);
          if (sheet?.kind === 'marketing') this.renderSheet();
        }
        return;
      }
      case 'buy': {
        const item = storeItemById(arg);
        const bugsBefore = s.activity?.kind === 'game' ? s.activity.bugs : 0;
        if (report(buyStoreItem(s, item.id))) {
          this.office.cheer(item.cheer);
          if (item.id === 'bugbash' && s.activity?.kind === 'game') {
            // Close the store so the player sees the bug counter drop.
            if (sheet?.kind === 'store') this.close();
            const fixed = bugsBefore - s.activity.bugs;
            window.setTimeout(() => this.bubbles(0, 0, -fixed), 250);
          } else if (sheet?.kind === 'store') {
            this.renderSheet();
          }
        }
        return;
      }
      case 'contract':
        if (sheet?.kind === 'contracts') this.close();
        report(startContract(s, Number(arg)));
        return;
      case 'polish-mode':
        if (sheet?.kind === 'devComplete') this.close();
        report(setPolishMode(s, arg as PolishMode));
        return;
      case 'release': {
        if (sheet?.kind === 'devComplete') this.sheet = null;
        const r = releaseGame(s);
        if (typeof r === 'string') {
          report(r);
          return;
        }
        this.vibrate(20);
        this.save();
        // The team reacts once the review screen closes.
        const sc = r.game.score;
        this.office.cheer(sc >= 8 ? ['🎉', '🥳', 'Yes!', '🏆'] : sc >= 6 ? ['🙂', 'Not bad', '👍'] : sc >= 4 ? ['😐', 'Meh', '🤷'] : ['😩', 'Ouch', '💔']);
        this.replace({ kind: 'review', report: r, shown: 0 });
        this.render();
        this.reviewTimer = window.setInterval(() => {
          if (this.sheet?.kind !== 'review') return window.clearInterval(this.reviewTimer);
          this.sheet.shown++;
          this.vibrate(10);
          this.renderSheet();
          if (this.sheet.shown >= 4) {
            window.clearInterval(this.reviewTimer);
            this.onReviewsShown(this.sheet.report.game.score);
          }
        }, 650);
        return;
      }
      case 'skip-reviews':
        if (sheet?.kind === 'review') {
          window.clearInterval(this.reviewTimer);
          sheet.shown = 4;
          this.renderSheet();
          this.onReviewsShown(sheet.report.game.score);
        }
        return;
      case 'game-detail':
        this.open({ kind: 'gameDetail', id: Number(arg) });
        return;

      // New game wizard
      case 'random-name':
        if (sheet?.kind === 'newGame') {
          if (sheet.draft.genre) sheet.draft.name = randomTitle(sheet.draft.genre, sheet.draft.name, sheet.draft.topic || undefined);
          sheet.nameEdited = false;
          this.renderSheet();
        }
        return;
      case 'pick-sequel':
        if (sheet?.kind === 'newGame') {
          const d = sheet.draft;
          const original = arg === 'none' ? undefined : s.released.find((g) => g.id === Number(arg));
          if (original) {
            d.sequelOf = original.id;
            d.topic = original.topic;
            d.genre = original.genre;
            d.name = sequelName(original);
          } else if (d.sequelOf !== undefined) {
            d.sequelOf = undefined;
            d.name = d.genre ? randomTitle(d.genre, undefined, d.topic || undefined) : '';
            sheet.nameEdited = false;
          }
          sheet.error = undefined;
          this.renderSheet();
        }
        return;
      case 'pick-genre':
      case 'pick-topic':
      case 'pick-platform':
      case 'pick-size':
      case 'pick-marketing':
        if (sheet?.kind === 'newGame') {
          const d = sheet.draft;
          if (name === 'pick-genre') {
            // The title is chosen after the genre: suggest one that fits, unless the player wrote their own.
            if (d.genre !== arg && !sheet.nameEdited) d.name = randomTitle(arg as GenreId, undefined, d.topic || undefined);
            d.genre = arg as GenreId;
          }
          if (name === 'pick-topic') {
            // ...and it picks up the topic too, once there's a genre to go with it.
            if (d.topic !== arg && d.genre && !sheet.nameEdited) d.name = randomTitle(d.genre, d.name, arg);
            d.topic = arg;
          }
          if (name === 'pick-platform') d.platform = arg;
          if (name === 'pick-size') d.size = arg as SizeId;
          if (name === 'pick-marketing') d.marketing = arg as MarketingId;
          sheet.error = undefined;
          this.renderSheet();
        }
        return;
      case 'ng-next':
        if (sheet?.kind === 'newGame') {
          if (!sheet.draft.name.trim()) {
            sheet.error = 'Give your game a name.';
          } else {
            sheet.step = 2;
            sheet.error = undefined;
            if (!availablePlatforms(s).some((p) => p.id === sheet.draft.platform)) sheet.draft.platform = 'pc';
          }
          this.replace(sheet);
        }
        return;
      case 'ng-back':
        if (sheet?.kind === 'newGame') {
          sheet.step = 1;
          this.replace(sheet);
        }
        return;
      case 'ng-focus':
        if (sheet?.kind === 'newGame') {
          const err = validateGame(s, sheet.draft);
          if (err) {
            sheet.error = err;
            this.renderSheet();
          } else {
            this.replace({ kind: 'focus', phase: 0, values: [50, 50, 50], spec: sheet.draft });
          }
        }
        return;
      case 'focus-back':
        if (sheet?.kind === 'focus' && sheet.spec) this.replace({ kind: 'newGame', step: 2, draft: sheet.spec });
        return;
      case 'focus-go':
        if (sheet?.kind === 'focus') {
          const err = sheet.spec ? startGame(s, sheet.spec, sheet.values) : setPhaseFocus(s, sheet.values);
          if (err) {
            sheet.error = err;
            this.renderSheet();
          } else {
            this.close();
          }
        }
        return;

      // Research & staff
      case 'research':
        report(doResearch(s, arg));
        return;
      case 'hire':
        if (report(hire(s, Number(arg)))) this.office.say(Number(arg), '👋 Hi!', 3);
        return;
      case 'fire': {
        const who = s.staff.find((x) => x.id === Number(arg));
        if (who) this.open({ kind: 'confirm', text: `Let ${who.name} go? They won't come back.`, action: 'fire-yes', arg, confirmLabel: 'Let go' });
        return;
      }
      case 'fire-yes':
        this.close();
        report(fire(s, Number(arg)));
        return;
      case 'train': {
        const [id, skill] = arg.split(':');
        if (report(train(s, Number(id), skill as 'design' | 'tech'))) this.toast('Training complete: +0.5 skill', 'good');
        return;
      }
      case 'office':
        report(upgradeOffice(s));
        return;
    }
  }
}
