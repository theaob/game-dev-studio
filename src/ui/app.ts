import { availablePlatforms, createGame, doResearch, fire, hire, randomTitle, releaseGame, setPhaseFocus, startContract, startGame, tick, train, upgradeOffice, validateGame } from '../core/sim';
import { normalizeFocus } from '../core/scoring';
import type { GameSpec, GameState, GenreId, MarketingId, NoticeKind, SimEvent, SizeId } from '../core/types';
import { clearSave, loadGame, saveGame } from '../save';
import { OfficeScene } from './office';
import { focusLean, renderSheet, type Sheet } from './sheets';
import { SPEEDS, renderGames, renderNav, renderResearch, renderStaff, renderStudio, renderTopbar, type Tab } from './views';

/** Real-time milliseconds per in-game week at 1x speed. */
const WEEK_MS = 1500;

/** Sheets that must be answered and can't be dismissed by tapping outside. */
const BLOCKING: Sheet['kind'][] = ['welcome', 'focus', 'review', 'gameOver'];

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
  private els: Record<'top' | 'scene' | 'main' | 'nav' | 'sheet' | 'fx' | 'toasts', HTMLElement>;
  private office = new OfficeScene();
  private lastDraw = 0;

  constructor(root: HTMLElement) {
    root.innerHTML = `<div id="top"></div><div id="scene" class="scene"></div><main id="main"></main><div id="nav"></div><div id="sheet-root"></div><div id="fx"></div><div class="toasts" id="toasts"></div>`;
    const $ = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!;
    this.els = { top: $('top'), scene: $('scene'), main: $('main'), nav: $('nav'), sheet: $('sheet-root'), fx: $('fx'), toasts: $('toasts') };

    this.els.scene.appendChild(this.office.el);
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('input', (e) => this.onInput(e));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.save();
    });
    window.addEventListener('pagehide', () => this.save());

    this.state = loadGame();
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
    // The office animates at ~30fps while visible.
    if (s && this.tab === 'studio' && !document.hidden && t - this.lastDraw > 32) {
      this.lastDraw = t;
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
      case 'contractDone':
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
      this.set('top', renderTopbar(s, this.speed));
      this.els.scene.hidden = this.tab !== 'studio';
      const view = { studio: renderStudio, games: renderGames, research: renderResearch, staff: renderStaff }[this.tab];
      this.set('main', view(s));
      this.set('nav', renderNav(this.tab, s));
    } else {
      this.set('top', '');
      this.els.scene.hidden = true;
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
    const counters = this.els.main.querySelectorAll<HTMLElement>('#counters .counter');
    if (counters.length !== 3) return;
    const items: [number, string, string][] = [
      [design, `+${design.toFixed(1)}`, 'var(--design)'],
      [tech, `+${tech.toFixed(1)}`, 'var(--tech)'],
      [bugs, bugs < 0 ? `−${(-bugs).toFixed(1)}` : `+${bugs.toFixed(1)}`, bugs < 0 ? 'var(--good)' : 'var(--bugs)'],
    ];
    items.forEach(([v, label, color], i) => {
      if (Math.abs(v) < 0.05) return;
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
    if (el.dataset.bind === 'name' && sheet.kind === 'newGame') sheet.draft.name = el.value;
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
        this.acc = 0;
        this.render();
        return;
      case 'tab':
        this.tab = arg as Tab;
        window.scrollTo(0, 0);
        this.render();
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
        const draft: GameSpec = { name: randomTitle(), topic: '', genre: '' as GenreId, platform: 'pc', size: 'small', marketing: 'none' };
        this.open({ kind: 'newGame', step: 1, draft });
        return;
      }
      case 'contract':
        report(startContract(s, Number(arg)));
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
        this.replace({ kind: 'review', report: r, shown: 0 });
        this.render();
        this.reviewTimer = window.setInterval(() => {
          if (this.sheet?.kind !== 'review') return window.clearInterval(this.reviewTimer);
          this.sheet.shown++;
          this.vibrate(10);
          this.renderSheet();
          if (this.sheet.shown >= 4) window.clearInterval(this.reviewTimer);
        }, 650);
        return;
      }
      case 'skip-reviews':
        if (sheet?.kind === 'review') {
          window.clearInterval(this.reviewTimer);
          sheet.shown = 4;
          this.renderSheet();
        }
        return;
      case 'game-detail':
        this.open({ kind: 'gameDetail', id: Number(arg) });
        return;

      // New game wizard
      case 'random-name':
        if (sheet?.kind === 'newGame') {
          sheet.draft.name = randomTitle();
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
          if (name === 'pick-genre') d.genre = arg as GenreId;
          if (name === 'pick-topic') d.topic = arg;
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
        report(hire(s, Number(arg)));
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
