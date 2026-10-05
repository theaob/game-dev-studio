/**
 * Animated pixel-art office. Everything is drawn procedurally onto a small
 * low-resolution canvas, which is then scaled up with nearest-neighbour
 * filtering so it stays crisp on any phone screen.
 */
import { OFFICES } from '../core/data';
import type { GameState, Staff } from '../core/types';

const CELL_W = 48;
const CELL_H = 40;
const WALL_H = 22;
const MAX_COLS = 4;

type Mode = 'idle' | 'work' | 'polish';

interface Bubble {
  text: string;
  age: number;
  life: number;
}

/** A coffee break: walk to the machine, sip, walk back. */
interface CoffeeBreak {
  stage: 'out' | 'sip' | 'back';
  t: number;
  slot: number;
  /** Seconds to walk between desk and machine. */
  trip: number;
}

const WALK_SPEED = 18; // logical px per second
const SIP_TIME = 3.5;

const LINES = {
  design: ['💡', '🎨', '✏️', '🤔', 'Ooh!', 'What if…'],
  tech: ['⌨️', '{ }', '⚙️', '🤔', 'Compiles!', '01101'],
  polish: ['🐛!', 'Fixed!', '🔨', 'Found one', '✅', 'Why?!'],
  idle: ['💤', '🎮', '😴', '📺', '🍕', 'Lunch?'],
  zone: ['🔥', '⚡', 'Flow!', '🤯', 'Unstoppable'],
  sip: ['☕', 'Ahh…', '😌', 'Mmm'],
};

type Gesture = 'type' | 'lean' | 'think' | 'sip' | 'point' | 'look' | 'stretch' | 'relax' | 'swivel';

/** Seconds each gesture lasts before the next one is picked. */
const GESTURE_SECONDS = 2.6;

const GESTURES: Record<'work' | 'polish' | 'idle', [Gesture, number][]> = {
  work: [['type', 0.55], ['lean', 0.1], ['think', 0.1], ['sip', 0.08], ['point', 0.07], ['look', 0.06], ['stretch', 0.04]],
  polish: [['type', 0.45], ['point', 0.2], ['think', 0.15], ['lean', 0.1], ['sip', 0.05], ['look', 0.05]],
  idle: [['relax', 0.55], ['swivel', 0.2], ['stretch', 0.1], ['sip', 0.15]],
};

function hash01(n: number): number {
  let h = n | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * What someone is doing right now. Deterministic per person and time, so each
 * developer has their own rhythm without storing any state. `p` is 0..1 progress.
 */
function gestureFor(id: number, look: Look, t: number, mode: Mode, zone: boolean): { g: Gesture; p: number } {
  const tt = t + look.phase * 37;
  const n = Math.floor(tt / GESTURE_SECONDS);
  const p = (tt % GESTURE_SECONDS) / GESTURE_SECONDS;
  const r = hash01(n * 131 + id * 7919);
  if (zone) return { g: r < 0.7 ? 'type' : 'lean', p };
  let acc = 0;
  for (const [g, w] of GESTURES[mode]) {
    acc += w;
    if (r < acc) return { g, p };
  }
  return { g: mode === 'idle' ? 'relax' : 'type', p };
}

function pickLine(list: string[]): string {
  return list[Math.floor(Math.random() * list.length)];
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
}

interface Look {
  skin: string;
  hair: string;
  shirt: string;
  style: number;
  phase: number;
}

const SKINS = ['#f5d0b5', '#e8b48f', '#c98b5e', '#a0673f', '#6e4329', '#ffdfc4'];
const HAIRS = ['#2b1d14', '#5a3a1e', '#a0522d', '#e2b45a', '#1a1a2e', '#c0c0c8', '#d8452e', '#6b3fa0'];
const SHIRTS = ['#4f7cff', '#ff5c9a', '#3ddc97', '#ffad3b', '#9b6bff', '#2ec4d6', '#e8e8f0', '#ff6b4a'];
const CODE = ['#7c5cff', '#4fb3ff', '#3ddc97', '#ffad3b', '#ff5c9a', '#c8c3e6'];

/** Stable appearance derived from the staff id, so people keep their look. */
function lookFor(s: Staff): Look {
  let h = (s.id * 2654435761) >>> 0;
  const next = (n: number) => {
    h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
    return h % n;
  };
  return {
    skin: SKINS[next(SKINS.length)],
    hair: HAIRS[next(HAIRS.length)],
    shirt: SHIRTS[next(SHIRTS.length)],
    style: next(4),
    phase: next(1000) / 1000,
  };
}

export class OfficeScene {
  readonly el: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private low = document.createElement('canvas');
  private lc: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private lastT = 0;
  private lw = 0;
  private lh = 0;
  private reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  /** When each staff member got in the zone (scene time), for the entrance burst. */
  private zoneStart = new Map<number, number>();
  /** Scene clock in seconds; only advances while the game is running. */
  private clock = 0;
  private bubbles = new Map<number, Bubble>();
  private breaks = new Map<number, CoffeeBreak>();
  private staffIds: number[] = [];

  constructor() {
    this.el = document.createElement('canvas');
    this.el.className = 'office';
    this.el.setAttribute('role', 'img');
    this.ctx = this.el.getContext('2d')!;
    this.lc = this.low.getContext('2d')!;
  }

  /** Called when the simulation reports someone got in the zone. */
  celebrate(staffId: number) {
    this.zoneStart.set(staffId, this.lastT / 1000);
    // Inspiration strikes: rush back from the coffee machine.
    const b = this.breaks.get(staffId);
    if (b && b.stage !== 'back') {
      // Turn around from wherever they are on the way out.
      b.t = b.stage === 'out' ? Math.max(0, b.trip - b.t) : 0;
      b.stage = 'back';
    }
    this.say(staffId, '🔥', 2.5);
  }

  /** Shows a speech bubble above someone. */
  say(staffId: number, text: string, life = 2.4) {
    this.bubbles.set(staffId, { text, age: 0, life });
  }

  /** Everyone reacts at once, e.g. to reviews or a paid contract. */
  cheer(lines: string[]) {
    this.staffIds.forEach((id, i) => {
      // Stagger slightly so it doesn't look robotic.
      this.bubbles.set(id, { text: pickLine(lines), age: -i * 0.15, life: 2.8 });
    });
  }

  draw(state: GameState, t: number, running: boolean) {
    const dt = Math.min(0.1, (t - (this.lastT || t)) / 1000);
    this.lastT = t;
    const time = this.reducedMotion ? 0 : t / 1000;

    const capacity = OFFICES[state.officeLevel].capacity;
    const desks = Math.max(capacity, state.staff.length);
    const cols = Math.min(desks, MAX_COLS);
    const rows = Math.ceil(desks / cols);
    const lw = Math.max(96, cols * CELL_W);
    const lh = WALL_H + rows * CELL_H + 4;
    this.resize(lw, lh);

    const act = state.activity;
    const mode: Mode = !act ? 'idle' : act.kind === 'game' && act.phase >= 3 ? 'polish' : 'work';
    const animating = running && mode !== 'idle';

    const c = this.lc;
    this.drawRoom(c, state.officeLevel, lw, lh, time);

    if (running) this.clock += dt;
    const tick = running ? dt : 0;
    this.staffIds = state.staff.map((x) => x.id);
    for (const id of [...this.breaks.keys()]) if (!this.staffIds.includes(id)) this.breaks.delete(id);
    for (const id of [...this.bubbles.keys()]) if (!this.staffIds.includes(id)) this.bubbles.delete(id);

    const offsetX = Math.floor((lw - cols * CELL_W) / 2);
    const deskAt = (i: number) => ({ x: offsetX + (i % cols) * CELL_W, y: WALL_H - 10 + Math.floor(i / cols) * CELL_H });
    const machine = { x: lw - 12, y: WALL_H - 14 };
    this.drawCoffeeMachine(c, machine.x, machine.y, time);

    const zoners: { x: number; y: number; s: Staff }[] = [];
    const anchors = new Map<number, { x: number; y: number }>();
    const walkers: { s: Staff; x: number; y: number; stage: CoffeeBreak['stage']; t: number }[] = [];
    for (let i = 0; i < desks; i++) {
      const { x, y } = deskAt(i);
      const s = state.staff[i];
      const inZone = !!s?.zone && act?.kind === 'game' && mode === 'work';
      const from = { x: x + 24, y: y + 42 };
      const spot = (slot: number) => ({ x: machine.x - 2 - slot * 7, y: WALL_H + 3 });
      const tripFor = (slot: number) => Math.hypot(spot(slot).x - from.x, spot(slot).y - from.y) / WALK_SPEED;
      const brk = s ? this.updateBreak(s, mode, inZone, tick, state.staff.length, tripFor) : undefined;
      if (brk) {
        // Away from the desk: empty chair, locked screen, a figure walking about.
        this.drawDesk(c, x, y, s, 'idle', false, false, time, true);
        const to = spot(brk.slot);
        const f = brk.stage === 'sip' ? 1 : Math.min(1, brk.t / brk.trip);
        const p = brk.stage === 'back' ? 1 - f : f;
        const wx = from.x + (to.x - from.x) * p;
        const wy = from.y + (to.y - from.y) * p;
        walkers.push({ s: s!, x: wx, y: wy, stage: brk.stage, t: brk.t });
        anchors.set(s!.id, { x: wx + 3, y: wy - 16 });
        continue;
      }
      this.drawDesk(c, x, y, s, mode, animating, inZone, time);
      if (!s) continue;
      anchors.set(s.id, { x: x + 30, y: y + 19 });
      if (inZone) zoners.push({ x, y, s });
      if (animating && !this.reducedMotion) this.emitWork(x, y, inZone, mode, dt);
      this.maybeChatter(s, mode, inZone, tick, state.staff.length);
    }
    // Walkers go on top of the desks, back-to-front.
    walkers.sort((a, b) => a.y - b.y).forEach((w) => this.drawWalker(c, w.s, w.x, w.y, w.stage, w.t, time));

    this.updateParticles(c, dt);

    // Scale up crisply.
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, this.el.width, this.el.height);
    ctx.drawImage(this.low, 0, 0, this.el.width, this.el.height);

    // Labels drawn at full resolution so the text is sharp.
    const k = this.el.width / lw;
    for (const z of zoners) {
      const since = time - (this.zoneStart.get(z.s.id) ?? -10);
      const pop = since >= 0 && since < 0.4 ? 0.6 + since : 1;
      const bob = Math.sin(time * 6) * 1.2;
      ctx.save();
      ctx.translate((z.x + CELL_W / 2) * k, (z.y + 6 + bob) * k);
      ctx.scale(pop, pop);
      ctx.font = `900 ${Math.max(10, 5.5 * k)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.lineWidth = Math.max(3, k * 1.4);
      ctx.strokeStyle = '#2a1600';
      ctx.strokeText('IN THE ZONE', 0, 0);
      ctx.fillStyle = `hsl(${45 + Math.sin(time * 8) * 12}, 100%, 62%)`;
      ctx.fillText('IN THE ZONE', 0, 0);
      ctx.restore();
    }
    this.drawBubbles(ctx, anchors, k, tick);

    const working = state.staff.filter((s) => s.zone && act?.kind === 'game').map((s) => s.name);
    const onBreak = state.staff.filter((s) => this.breaks.has(s.id)).map((s) => s.name);
    this.el.setAttribute(
      'aria-label',
      `${OFFICES[state.officeLevel].name} with ${state.staff.length} ${state.staff.length === 1 ? 'person' : 'people'} ${mode === 'idle' ? 'relaxing' : 'working'}${working.length ? `. In the zone: ${working.join(', ')}` : ''}${onBreak.length ? `. On a coffee break: ${onBreak.join(', ')}` : ''}.`,
    );
  }

  private resize(lw: number, lh: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cssW = this.el.clientWidth || 360;
    const w = Math.round(cssW * dpr);
    const h = Math.round((cssW * lh * dpr) / lw);
    if (lw !== this.lw || lh !== this.lh) {
      this.low.width = this.lw = lw;
      this.low.height = this.lh = lh;
      this.el.style.aspectRatio = `${lw} / ${lh}`;
      this.particles = [];
    }
    if (this.el.width !== w || this.el.height !== h) {
      this.el.width = w;
      this.el.height = h;
    }
  }

  // -------------------------------------------------------------------------
  // Room
  // -------------------------------------------------------------------------

  private drawRoom(c: CanvasRenderingContext2D, level: number, w: number, h: number, time: number) {
    const rect = (x: number, y: number, rw: number, rh: number, col: string) => {
      c.fillStyle = col;
      c.fillRect(x, y, rw, rh);
    };
    const floorY = WALL_H;
    if (level === 0) {
      // Garage: concrete, roll-up door ribs, a bare bulb.
      rect(0, 0, w, floorY, '#5b5868');
      for (let y = 2; y < floorY - 2; y += 3) rect(6, y, w - 12, 1, '#4a4757');
      rect(0, floorY, w, h - floorY, '#3d3a46');
      rect(Math.floor(w * 0.7), h - 8, 10, 3, '#34313b');
      rect(Math.floor(w * 0.15), floorY + 4, 6, 2, '#47434f');
      rect(Math.floor(w / 2), 0, 1, 4, '#222');
      const glow = 0.18 + Math.sin(time * 3) * 0.02;
      c.fillStyle = `rgba(255, 220, 140, ${glow})`;
      c.beginPath();
      c.arc(Math.floor(w / 2) + 0.5, 5, 9, 0, Math.PI * 2);
      c.fill();
      rect(Math.floor(w / 2) - 1, 4, 3, 3, '#ffe7a3');
    } else if (level === 1) {
      // Small office: warm wall, a window, a plant.
      rect(0, 0, w, floorY, '#8a6f5a');
      rect(0, floorY - 2, w, 2, '#6d5545');
      rect(0, floorY, w, h - floorY, '#4a3a33');
      for (let x = 0; x < w; x += 8) rect(x, floorY, 1, h - floorY, '#433530');
      const wx = Math.floor(w / 2) - 14;
      rect(wx, 3, 28, 12, '#e8dccf');
      rect(wx + 1, 4, 26, 10, '#7ec8f2');
      rect(wx + 4 + ((time * 2) % 22), 6, 5, 2, '#ffffff');
      rect(wx + 13, 4, 1, 10, '#e8dccf');
      rect(4, floorY - 6, 6, 6, '#b5653a');
      rect(3, floorY - 13, 8, 7, '#3d9a5a');
      rect(5, floorY - 15, 4, 3, '#4fbf6f');
    } else if (level === 2) {
      // Studio floor: purple wall, posters, a clock.
      rect(0, 0, w, floorY, '#3c2f63');
      rect(0, floorY - 2, w, 2, '#2c2249');
      rect(0, floorY, w, h - floorY, '#2a2440');
      for (let x = 0; x < w; x += 6) for (let y = floorY; y < h; y += 6) rect(x + ((y / 6) % 2) * 3, y, 1, 1, '#332c4d');
      const posters = ['#ff5c9a', '#3ddc97', '#ffad3b', '#4fb3ff'];
      posters.forEach((col, i) => {
        const px = 8 + i * Math.floor((w - 16) / 4);
        rect(px, 4, 9, 12, '#1d1830');
        rect(px + 1, 5, 7, 10, col);
        rect(px + 2, 7, 3, 3, '#ffffff88');
      });
      const cx = w - 22;
      rect(cx - 3, 3, 7, 7, '#e8e8f0');
      const a = time * 0.5;
      rect(cx + Math.round(Math.cos(a) * 2), 6 + Math.round(Math.sin(a) * 2), 1, 1, '#222');
    } else {
      // Campus: floor-to-ceiling windows with a city skyline and a neon sign.
      rect(0, 0, w, floorY, '#1b2440');
      for (let x = 0; x < w; x += 7) {
        const bh = 6 + ((x * 37) % 11);
        rect(x, floorY - bh, 6, bh, '#2b3760');
        for (let wy = floorY - bh + 2; wy < floorY - 1; wy += 3) {
          if ((x + wy) % 5 !== 0) rect(x + 2, wy, 1, 1, (x + wy + Math.floor(time)) % 7 ? '#ffe7a3' : '#2b3760');
        }
      }
      for (let x = 0; x < w; x += 24) rect(x, 0, 1, floorY, '#3a4670');
      rect(0, floorY - 1, w, 1, '#3a4670');
      rect(0, floorY, w, h - floorY, '#232a3d');
      for (let x = 0; x < w; x += 12) rect(x, floorY, 6, h - floorY, '#262e43');
      const on = Math.sin(time * 2) > -0.8;
      c.fillStyle = on ? '#ff5c9a' : '#5a2a44';
      c.fillRect(4, 3, 14, 1);
      c.fillRect(4, 7, 14, 1);
      c.fillRect(4, 3, 1, 5);
      c.fillRect(17, 3, 1, 5);
    }
  }

  // -------------------------------------------------------------------------
  // Desk & person
  // -------------------------------------------------------------------------

  private drawDesk(c: CanvasRenderingContext2D, x: number, y: number, s: Staff | undefined, mode: Mode, animating: boolean, zone: boolean, time: number, away = false) {
    const rect = (rx: number, ry: number, rw: number, rh: number, col: string) => {
      c.fillStyle = col;
      c.fillRect(x + rx, y + ry, rw, rh);
    };
    const look = s ? lookFor(s) : null;
    // Body language runs on the scene clock, so everyone freezes mid-motion when the game is paused.
    const gt = this.reducedMotion ? 0 : this.clock;
    const gesture = s && look && !away ? gestureFor(s.id, look, gt, mode, zone) : null;

    // Zone aura behind everything at this desk.
    if (zone && look) {
      const pulse = 0.35 + Math.sin(time * 7 + look.phase * 6) * 0.12;
      const g = c.createRadialGradient(x + 24, y + 30, 2, x + 24, y + 30, 22);
      g.addColorStop(0, `rgba(255, 210, 80, ${pulse})`);
      g.addColorStop(1, 'rgba(255, 120, 40, 0)');
      c.fillStyle = g;
      c.fillRect(x, y + 4, CELL_W, CELL_H);
    }

    // Desk
    rect(6, 30, 36, 3, '#8a5a3b');
    rect(6, 33, 36, 1, '#5e3c27');
    rect(8, 34, 2, 8, '#5e3c27');
    rect(38, 34, 2, 8, '#5e3c27');

    // Mug on the desk (it goes with them on a coffee break, or up to their lips)
    if (!away && gesture?.g !== 'sip') {
      rect(36, 27, 3, 3, '#e8e8f0');
      rect(39, 28, 1, 1, '#e8e8f0');
    }
    if (s && !away && gesture?.g !== 'sip' && Math.sin(time * 1.3 + (look?.phase ?? 0) * 10) > 0.4) rect(37, 25 - Math.floor((time * 3) % 2), 1, 1, '#ffffff66');

    // Monitor
    rect(13, 10, 22, 16, '#15131f');
    rect(23, 26, 2, 4, '#15131f');
    rect(19, 29, 10, 1, '#15131f');
    this.drawScreen(c, x + 14, y + 11, 20, 13, s, mode, animating, zone, time, look);

    if (away) {
      // Sticky note on the monitor while they're away.
      rect(30, 11, 4, 4, '#ffd25c');
      rect(31, 12, 2, 1, '#8a6a1a');
    }
    if (!s || !look || away || !gesture) {
      // Empty chair
      rect(17, 32, 14, 9, '#2a2836');
      rect(23, 41, 2, 2, '#1b1a24');
      return;
    }

    // Person, seen from behind, sitting at the desk.
    const { g, p } = gesture;
    const typingNow = (g === 'type' || g === 'lean' || g === 'look') && (animating || this.reducedMotion);
    const speed = zone ? 22 : g === 'lean' ? 16 : 11;
    const beatN = Math.floor(gt * speed + look.phase * 10);
    const beat = typingNow ? beatN % 2 : 0;
    // Hands travel back and forth across the keyboard.
    const slide = typingNow ? [0, 1, 0, -1][Math.floor(beatN / 3) % 4] : 0;

    let dx = 0; // body sway
    let dy = mode === 'idle' ? 1 : 0; // slump back when idle
    let hdx = 0; // head turn
    let hdy = 0; // head nod
    if (g === 'type') {
      dx = Math.round(Math.sin(gt * 0.9 + look.phase * 6) * 0.7);
      hdy = beatN % 8 === 0 ? 1 : 0; // nod along to the rhythm
    } else if (g === 'lean') {
      dy -= 2; // lean in towards the monitor
      hdy = beatN % 6 === 0 ? 1 : 0;
    } else if (g === 'look') {
      hdx = p < 0.5 ? 1 : -1; // glance at a neighbour, then the other way
    } else if (g === 'think') {
      hdx = 1;
    } else if (g === 'swivel') {
      dx = Math.round(Math.sin(gt * 2.4 + look.phase * 4) * 1.5);
    }
    if (zone) dy -= Math.floor(gt * 10) % 2;
    const hy = 21 + dy;
    const P = (rx: number, ry: number, rw: number, rh: number, col: string) => rect(rx + dx, ry, rw, rh, col);
    const H = (rx: number, ry: number, rw: number, rh: number, col: string) => rect(rx + dx + hdx, ry + hdy, rw, rh, col);

    // Chair back (stays put while they sway)
    rect(16, 34, 16, 8, '#2a2836');
    rect(23, 42, 2, 1, '#1b1a24');
    // Shoulders / shirt
    P(17, hy + 8, 14, 7, look.shirt);
    P(17, hy + 8, 14, 1, '#ffffff33');

    // Lower arms: on the keyboard, or behind the head when relaxing.
    const relaxing = g === 'relax' || g === 'swivel';
    const rightBusy = g === 'think' || g === 'point' || g === 'sip' || g === 'stretch';
    if (relaxing) {
      P(15, hy + 2, 3, 6, look.shirt);
      P(30, hy + 2, 3, 6, look.shirt);
    } else if (g !== 'stretch') {
      P(15 + slide, hy + 9 - beat * 2, 3, 4, look.shirt);
      P(15 + slide, hy + 8 - beat * 2, 3, 1, look.skin);
      if (!rightBusy) {
        P(30 + slide, hy + 9 - (1 - beat) * 2, 3, 4, look.shirt);
        P(30 + slide, hy + 8 - (1 - beat) * 2, 3, 1, look.skin);
      }
    }

    // Neck & head
    P(22, hy + 7, 4, 2, look.skin);
    H(20, hy, 8, 8, look.skin);
    H(19, hy + 3, 1, 2, look.skin);
    H(28, hy + 3, 1, 2, look.skin);
    // Hair (from behind)
    switch (look.style) {
      case 0: // short
        H(20, hy, 8, 5, look.hair);
        H(20, hy - 1, 8, 1, look.hair);
        break;
      case 1: // long
        H(19, hy - 1, 10, 7, look.hair);
        H(19, hy + 6, 2, 4, look.hair);
        H(27, hy + 6, 2, 4, look.hair);
        H(21, hy + 6, 6, 3, look.hair);
        break;
      case 2: // bun
        H(20, hy - 1, 8, 6, look.hair);
        H(22, hy - 4, 4, 3, look.hair);
        break;
      default: // headphones
        H(20, hy, 8, 4, look.hair);
        H(19, hy - 1, 10, 1, '#15131f');
        H(18, hy + 2, 2, 4, '#15131f');
        H(28, hy + 2, 2, 4, '#15131f');
    }
    // Turning the head shows a cheek and an eye.
    if (hdx > 0) {
      H(26, hy + 2, 2, 4, look.skin);
      H(27, hy + 3, 1, 1, '#15131f');
    } else if (hdx < 0) {
      H(20, hy + 2, 2, 4, look.skin);
      H(20, hy + 3, 1, 1, '#15131f');
    }
    if (zone) {
      // A little headband of fire.
      const f = Math.floor(time * 12) % 3;
      H(20, hy - 2 - (f === 0 ? 1 : 0), 2, 2, '#ffad3b');
      H(23, hy - 3 - (f === 1 ? 1 : 0), 2, 3, '#ff6b4a');
      H(26, hy - 2 - (f === 2 ? 1 : 0), 2, 2, '#ffd25c');
    }

    // Raised arms go in front of the head.
    if (g === 'think') {
      // Scratching their head.
      const scratch = Math.floor(gt * 8) % 2;
      P(29, hy + 2, 3, 8, look.shirt);
      P(28, hy + 1 - scratch, 2, 2, look.skin);
    } else if (g === 'point') {
      // Pointing at something on the screen.
      const tap = Math.floor(gt * 4) % 2;
      P(29, hy + 1, 3, 8, look.shirt);
      P(30, hy - 1, 2, 2, look.skin);
      P(31, hy - 3 + tap, 1, 2, look.skin);
    } else if (g === 'sip') {
      // A sip from the mug, lifted at the start and the end of the gesture.
      const lift = p > 0.25 && p < 0.75 ? 2 : 0;
      P(29, hy + 4, 3, 6, look.shirt);
      P(30, hy + 4 - lift, 2, 1, look.skin);
      P(28, hy + 1 - lift, 3, 3, '#e8e8f0');
      P(31, hy + 2 - lift, 1, 1, '#e8e8f0');
      if (Math.floor(time * 3) % 2) P(29, hy - 1 - lift, 1, 1, '#ffffff88');
    } else if (g === 'stretch') {
      // Arms straight up, with a little wiggle at the top.
      const reach = p > 0.2 && p < 0.8 ? 2 : 0;
      P(15, hy - 3 - reach, 3, 12 + reach, look.shirt);
      P(30, hy - 3 - reach, 3, 12 + reach, look.shirt);
      P(15, hy - 5 - reach, 3, 2, look.skin);
      P(30, hy - 5 - reach, 3, 2, look.skin);
    }
  }

  private drawScreen(
    c: CanvasRenderingContext2D,
    sx: number,
    sy: number,
    w: number,
    h: number,
    s: Staff | undefined,
    mode: Mode,
    animating: boolean,
    zone: boolean,
    time: number,
    look: Look | null,
  ) {
    if (!s) {
      c.fillStyle = '#0c0b12';
      c.fillRect(sx, sy, w, h);
      return;
    }
    if (mode === 'idle') {
      // Screensaver: a bouncing pixel.
      c.fillStyle = '#10142a';
      c.fillRect(sx, sy, w, h);
      const px = Math.abs(((time * 6 + (look?.phase ?? 0) * 40) % (2 * (w - 2))) - (w - 2));
      const py = Math.abs(((time * 4 + (look?.phase ?? 0) * 20) % (2 * (h - 2))) - (h - 2));
      c.fillStyle = '#7c5cff';
      c.fillRect(sx + Math.floor(px), sy + Math.floor(py), 2, 2);
      return;
    }
    c.fillStyle = zone ? '#2a1f08' : mode === 'polish' ? '#1f1014' : '#0f1424';
    c.fillRect(sx, sy, w, h);
    // Scrolling code lines
    const rate = animating ? (zone ? 9 : 3) : 0;
    const scroll = time * rate + (look?.phase ?? 0) * 50;
    const first = Math.floor(scroll);
    const frac = scroll - first;
    for (let i = 0; i < 7; i++) {
      const line = first + i;
      const ly = sy + 1 + Math.round((i - frac) * 2);
      if (ly < sy || ly >= sy + h - 1) continue;
      const seed = (line * 9301 + 49297 + (s.id * 233)) % 233280;
      const indent = (seed % 4) * 2;
      const len = 3 + (seed % 11);
      let col = CODE[seed % CODE.length];
      if (mode === 'polish') col = seed % 3 === 0 ? '#ff5c6c' : '#3ddc97';
      if (zone) col = seed % 2 ? '#ffd25c' : '#ffad3b';
      c.fillStyle = col;
      c.fillRect(sx + 1 + indent, ly, Math.min(len, w - 2 - indent), 1);
    }
    // Blinking cursor
    if (animating && Math.floor(time * 3) % 2) {
      c.fillStyle = '#ffffff';
      c.fillRect(sx + 2 + Math.floor((time * 7) % (w - 4)), sy + h - 2, 1, 1);
    }
    // Screen glow on the zone
    if (zone) {
      c.fillStyle = `rgba(255, 220, 120, ${0.12 + Math.sin(time * 9) * 0.06})`;
      c.fillRect(sx, sy, w, h);
    }
  }

  // -------------------------------------------------------------------------
  // Coffee breaks
  // -------------------------------------------------------------------------

  /** Advances (or maybe starts) someone's coffee break. Returns it while they're away. */
  private updateBreak(s: Staff, mode: Mode, zone: boolean, dt: number, people: number, tripFor: (slot: number) => number): CoffeeBreak | undefined {
    let b = this.breaks.get(s.id);
    if (!b) {
      if (this.reducedMotion || zone || dt === 0) return undefined;
      const perSecond = mode === 'idle' ? 1 / 20 : mode === 'polish' ? 1 / 55 : 1 / 40;
      const maxAway = Math.max(1, Math.floor(people / 3));
      if (this.breaks.size >= maxAway || Math.random() > perSecond * dt) return undefined;
      const used = new Set([...this.breaks.values()].map((x) => x.slot));
      let slot = 0;
      while (used.has(slot)) slot++;
      b = { stage: 'out', t: 0, slot, trip: Math.max(0.5, tripFor(slot)) };
      this.breaks.set(s.id, b);
      if (Math.random() < 0.5) this.say(s.id, '☕?', 1.6);
      return b;
    }
    b.t += dt;
    if (b.stage === 'out' && b.t >= b.trip) {
      b.stage = 'sip';
      b.t = 0;
      this.say(s.id, pickLine(LINES.sip), 2);
    } else if (b.stage === 'sip' && b.t >= SIP_TIME) {
      b.stage = 'back';
      b.t = 0;
    } else if (b.stage === 'back' && b.t >= b.trip) {
      this.breaks.delete(s.id);
      return undefined;
    }
    return b;
  }

  private drawCoffeeMachine(c: CanvasRenderingContext2D, x: number, y: number, time: number) {
    const rect = (rx: number, ry: number, rw: number, rh: number, col: string) => {
      c.fillStyle = col;
      c.fillRect(x + rx, y + ry, rw, rh);
    };
    rect(-2, 12, 12, 2, '#6d5545'); // counter
    rect(0, 0, 8, 12, '#3a3a48');
    rect(0, 0, 8, 2, '#22222c');
    rect(2, 4, 4, 2, '#15131f');
    rect(1, 3, 1, 1, Math.floor(time * 2) % 2 ? '#ff5c6c' : '#5a2a30');
    rect(3, 8, 2, 3, '#22222c');
    rect(3, 10, 2, 1, '#e8e8f0');
  }

  private drawWalker(c: CanvasRenderingContext2D, s: Staff, x: number, y: number, stage: CoffeeBreak['stage'], t: number, time: number) {
    const look = lookFor(s);
    const px = Math.round(x) - 3;
    const py = Math.round(y);
    const rect = (rx: number, ry: number, rw: number, rh: number, col: string) => {
      c.fillStyle = col;
      c.fillRect(px + rx, py + ry, rw, rh);
    };
    const walking = stage !== 'sip';
    const step = walking ? Math.floor(t * 8) % 2 : 0;
    const facingCamera = stage !== 'out';
    // Shadow
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fillRect(px - 1, py, 8, 1);
    // Legs
    rect(1, -3 + step, 2, 3 - step, '#2a2836');
    rect(4, -3 + (1 - step), 2, 3 - (1 - step), '#2a2836');
    // Body
    rect(0, -9, 7, 6, look.shirt);
    // Head
    rect(1, -15, 6, 6, look.skin);
    rect(1, -16, 6, 2, look.hair);
    if (!facingCamera) rect(1, -15, 6, 4, look.hair);
    if (look.style === 1) {
      rect(0, -15, 1, 5, look.hair);
      rect(7, -15, 1, 5, look.hair);
    }
    if (look.style === 2) rect(3, -18, 2, 2, look.hair);
    if (facingCamera) {
      rect(2, -12, 1, 1, '#15131f');
      rect(5, -12, 1, 1, '#15131f');
    }
    // Mug in hand
    if (stage === 'sip') {
      const lift = Math.sin(t * 2.2) > 0.3 ? 3 : 0;
      rect(7, -7 - lift, 2, 2, look.shirt);
      rect(7, -9 - lift, 3, 2, '#e8e8f0');
      if (Math.floor(time * 3) % 2) rect(8, -11 - lift, 1, 1, '#ffffff88');
    } else if (stage === 'back') {
      rect(7, -7, 2, 2, '#e8e8f0');
    }
  }

  // -------------------------------------------------------------------------
  // Speech bubbles
  // -------------------------------------------------------------------------

  /** Occasional context-aware chatter from people at their desks. */
  private maybeChatter(s: Staff, mode: Mode, zone: boolean, dt: number, people: number) {
    if (dt === 0 || this.bubbles.has(s.id)) return;
    const maxBubbles = Math.max(2, Math.ceil(people / 3));
    if (this.bubbles.size >= maxBubbles) return;
    const perSecond = zone ? 1 / 5 : mode === 'idle' ? 1 / 14 : 1 / 16;
    if (Math.random() > perSecond * dt) return;
    const list = zone ? LINES.zone : mode === 'idle' ? LINES.idle : mode === 'polish' ? LINES.polish : s.design >= s.tech ? LINES.design : LINES.tech;
    this.say(s.id, pickLine(list));
  }

  private drawBubbles(ctx: CanvasRenderingContext2D, anchors: Map<number, { x: number; y: number }>, k: number, dt: number) {
    const size = Math.max(11, 4.8 * k);
    ctx.font = `700 ${size}px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    for (const [id, b] of this.bubbles) {
      b.age += dt;
      if (b.age >= b.life) {
        this.bubbles.delete(id);
        continue;
      }
      const a = anchors.get(id);
      if (!a || b.age < 0) continue;
      const pop = this.reducedMotion ? 1 : Math.min(1, 0.4 + b.age / 0.18);
      const alpha = Math.min(1, (b.life - b.age) / 0.3);
      const pad = size * 0.45;
      const w = ctx.measureText(b.text).width + pad * 2;
      const h = size + pad * 1.2;
      // Anchor is the tail tip; the bubble sits above and to the right, kept inside the canvas.
      const tipX = a.x * k;
      const tipY = a.y * k;
      let bx = tipX - size * 0.3;
      bx = Math.max(2, Math.min(this.el.width - w - 2, bx));
      const by = Math.max(2, tipY - h - size * 0.5);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(tipX, tipY);
      ctx.scale(pop, pop);
      ctx.translate(-tipX, -tipY);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#15131f';
      ctx.lineWidth = Math.max(1.5, k * 0.5);
      roundedRect(ctx, bx, by, w, h, h / 2.4);
      ctx.fill();
      ctx.stroke();
      // Tail
      const tx = Math.max(bx + h / 2.4, Math.min(bx + w - h / 2.4, tipX));
      ctx.beginPath();
      ctx.moveTo(tx - size * 0.3, by + h - 1);
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(tx + size * 0.15, by + h - 1);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(tx - size * 0.3, by + h);
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(tx + size * 0.15, by + h);
      ctx.stroke();
      ctx.fillStyle = '#1d1a2d';
      ctx.fillText(b.text, bx + w / 2, by + h / 2 + 1);
      ctx.restore();
    }
  }

  // -------------------------------------------------------------------------
  // Particles
  // -------------------------------------------------------------------------

  private emitWork(x: number, y: number, zone: boolean, mode: Mode, dt: number) {
    const rate = zone ? 28 : 1.2;
    if (Math.random() > rate * dt) return;
    const colors = zone ? ['#ffd25c', '#ffad3b', '#ff6b4a', '#ffffff'] : mode === 'polish' ? ['#3ddc97'] : ['#4fb3ff', '#ffad3b'];
    this.particles.push({
      x: x + 14 + Math.random() * 20,
      y: y + (zone ? 22 + Math.random() * 14 : 12),
      vx: (Math.random() - 0.5) * (zone ? 14 : 4),
      vy: zone ? -14 - Math.random() * 14 : -6,
      life: 0,
      max: zone ? 0.7 + Math.random() * 0.5 : 1.1,
      color: colors[Math.floor(Math.random() * colors.length)],
    });
  }

  private updateParticles(c: CanvasRenderingContext2D, dt: number) {
    const alive: Particle[] = [];
    for (const p of this.particles) {
      p.life += dt;
      if (p.life >= p.max) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      c.globalAlpha = 1 - p.life / p.max;
      c.fillStyle = p.color;
      c.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      alive.push(p);
    }
    c.globalAlpha = 1;
    this.particles = alive.slice(-300);
  }
}

/** Rounded rectangle path (CanvasRenderingContext2D.roundRect is missing on older iOS). */
function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
