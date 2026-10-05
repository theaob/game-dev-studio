/**
 * Animated pixel-art office. Everything is drawn procedurally onto a small
 * low-resolution canvas, which is then scaled up with nearest-neighbour
 * filtering so it stays crisp on any phone screen.
 */
import { OFFICES } from '../core/data';
import { yearOf } from '../core/time';
import type { GameState, Staff } from '../core/types';
import { CAT_ID, CODE, DESK_WOOD, LINES, SIP_TIME, WALK_SPEED, daylight, eraFor, gestureFor, lookFor, pickLine, shade } from './office-common';
import type { Bubble, Cat, CoffeeBreak, Daylight, Era, Look, Mode } from './office-common';

const CELL_W = 48;
const CELL_H = 40;
const WALL_H = 22;
const MAX_COLS = 4;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
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
  private cat: Cat = { x: 20, dir: 1, mode: 'sleep', t: 0, target: 20 };
  /** Where each person (and the cat) is on screen, for taps. Logical pixels. */
  private hitboxes: { id: number; x: number; y: number; w: number; h: number; name: string }[] = [];
  private era: Era = 'crt-mono';
  private level = 0;

  constructor() {
    this.el = document.createElement('canvas');
    this.el.className = 'office';
    this.el.setAttribute('role', 'img');
    this.ctx = this.el.getContext('2d')!;
    this.lc = this.low.getContext('2d')!;
    this.el.addEventListener('click', (e) => this.onTap(e));
  }

  /** Tapping someone makes them wave; tapping the cat gets a purr. */
  private onTap(e: MouseEvent) {
    const r = this.el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * this.lw;
    const y = ((e.clientY - r.top) / r.height) * this.lh;
    // Topmost first: the cat and walkers are drawn last.
    for (let i = this.hitboxes.length - 1; i >= 0; i--) {
      const h = this.hitboxes[i];
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) {
        if (h.id === CAT_ID) {
          this.say(CAT_ID, pickLine(['❤️', 'Purr…', 'Mrrp!', '😺']), 1.8);
          if (this.cat.mode === 'sleep') this.cat = { ...this.cat, mode: 'sit', t: 0 };
        } else {
          this.say(h.id, `👋 ${h.name === 'You' ? 'Hey boss!' : h.name.split(' ')[0]}`, 2);
        }
        return;
      }
    }
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
    // Reduce Motion turns off particles, walks and the roaming cat; small character animations stay.
    const time = t / 1000;

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
    if (running) this.clock += dt;
    const tick = running ? dt : 0;
    this.era = eraFor(yearOf(state.week));
    this.level = state.officeLevel;
    const light = daylight(this.clock);
    this.drawRoom(c, state.officeLevel, lw, lh, time, light);
    this.hitboxes = [];
    this.staffIds = state.staff.map((x) => x.id);
    for (const id of [...this.breaks.keys()]) if (!this.staffIds.includes(id)) this.breaks.delete(id);
    for (const id of [...this.bubbles.keys()]) if (id !== CAT_ID && !this.staffIds.includes(id)) this.bubbles.delete(id);

    const offsetX = Math.floor((lw - cols * CELL_W) / 2);
    const deskAt = (i: number) => ({ x: offsetX + (i % cols) * CELL_W, y: WALL_H - 10 + Math.floor(i / cols) * CELL_H });
    const machine = { x: lw - 12, y: WALL_H - 14 };
    this.drawCoffeeMachine(c, machine.x, machine.y, time);

    const zoners: { x: number; y: number; s: Staff }[] = [];
    const glows: { x: number; y: number; color: string; r: number }[] = [];
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
        this.hitboxes.push({ id: s!.id, x: wx - 4, y: wy - 17, w: 9, h: 18, name: s!.name });
        continue;
      }
      this.drawDesk(c, x, y, s, mode, animating, inZone, time);
      if (s) {
        const color = inZone ? '255,190,80' : mode === 'idle' ? '124,92,255' : mode === 'polish' ? '120,255,190' : '90,170,255';
        glows.push({ x: x + 24, y: y + 18, r: 20, color });
        if (lookFor(s).prop === 4 && !this.dualMonitors()) glows.push({ x: x + 10, y: y + 24, r: 12, color: '255,200,120' });
      }
      if (!s) continue;
      anchors.set(s.id, { x: x + 30, y: y + 19 });
      this.hitboxes.push({ id: s.id, x: x + 14, y: y + 18, w: 20, h: 24, name: s.name });
      if (inZone) zoners.push({ x, y, s });
      if (animating && !this.reducedMotion) this.emitWork(x, y, inZone, mode, dt);
      this.maybeChatter(s, mode, inZone, tick, state.staff.length);
    }
    // Walkers go on top of the desks, back-to-front.
    walkers.sort((a, b) => a.y - b.y).forEach((w) => this.drawWalker(c, w.s, w.x, w.y, w.stage, w.t, time));

    // The studio cat roams the strip of floor in front of the desks.
    const catY = lh - 3;
    this.updateCat(tick, lw);
    this.drawCat(c, catY, time);
    anchors.set(CAT_ID, { x: this.cat.x + 3, y: catY - 6 });
    this.hitboxes.push({ id: CAT_ID, x: this.cat.x - 2, y: catY - 8, w: 11, h: 9, name: 'cat' });

    this.updateParticles(c, dt);
    this.drawLighting(c, lw, lh, light, glows, time);

    // Scale up crisply.
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, this.el.width, this.el.height);
    ctx.drawImage(this.low, 0, 0, this.el.width, this.el.height);

    // Soft vignette pulls the eye to the middle.
    const W = this.el.width;
    const Hh = this.el.height;
    const v = ctx.createRadialGradient(W / 2, Hh / 2, Math.min(W, Hh) * 0.35, W / 2, Hh / 2, Math.max(W, Hh) * 0.75);
    v.addColorStop(0, 'rgba(10,8,20,0)');
    v.addColorStop(1, 'rgba(10,8,20,0.38)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, Hh);

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

  /** Sky colour for windows at this time of day. */
  private sky(light: Daylight): { top: string; bottom: string; night: boolean } {
    if (light.sun < -0.25) return { top: '#0f1430', bottom: '#1f2a55', night: true };
    if (light.dusk > 0.3) return { top: '#4a5aa8', bottom: '#f29a5a', night: false };
    return { top: '#5aa8e8', bottom: '#a8dcf5', night: false };
  }

  private drawSkyPane(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, light: Daylight, time: number) {
    const sky = this.sky(light);
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, sky.top);
    g.addColorStop(1, sky.bottom);
    c.fillStyle = g;
    c.fillRect(x, y, w, h);
    c.save();
    c.beginPath();
    c.rect(x, y, w, h);
    c.clip();
    if (sky.night) {
      // Twinkling stars and a crescent moon.
      c.fillStyle = '#ffffff';
      for (let i = 0; i < w * h * 0.04; i++) {
        const sx = x + ((i * 37 + 11) % w);
        const sy = y + ((i * 53 + 7) % h);
        if ((i + Math.floor(time * 2)) % 9) c.fillRect(sx, sy, 1, 1);
      }
      c.fillStyle = '#f4f1d8';
      c.fillRect(x + w - 6, y + 2, 3, 3);
      c.fillStyle = sky.top;
      c.fillRect(x + w - 5, y + 2, 2, 2);
    } else {
      // The sun travels across the sky, and a cloud drifts by.
      const sunX = x + (light.tod - 0.25) * 2 * w;
      c.fillStyle = light.dusk > 0.3 ? '#ffb05a' : '#fff2b0';
      c.fillRect(Math.round(sunX), y + 2 + Math.round((1 - light.sun) * (h - 5)), 3, 3);
      c.fillStyle = 'rgba(255,255,255,0.85)';
      const cx = x + ((time * 2) % (w + 10)) - 8;
      c.fillRect(Math.round(cx), y + 3, 6, 2);
      c.fillRect(Math.round(cx) + 2, y + 2, 3, 1);
    }
    c.restore();
  }

  private drawRoom(c: CanvasRenderingContext2D, level: number, w: number, h: number, time: number, light: Daylight) {
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
      this.drawSkyPane(c, wx + 1, 4, 26, 10, light, time);
      rect(wx + 13, 4, 1, 10, '#e8dccf');
      rect(wx - 1, 15, 30, 1, '#cfc2b3');
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
      this.drawSkyPane(c, 0, 0, w, floorY, light, time);
      const night = this.sky(light).night;
      for (let x = 0; x < w; x += 7) {
        const bh = 6 + ((x * 37) % 11);
        rect(x, floorY - bh, 6, bh, night ? '#1d2546' : '#4a5a86');
        for (let wy = floorY - bh + 2; wy < floorY - 1; wy += 3) {
          // Most office windows light up at night; a few stay lit in the day.
          const lit = night ? (x + wy) % 5 !== 0 : (x * 7 + wy * 3) % 9 === 0;
          if (lit) rect(x + 2, wy, 1, 1, '#ffe7a3');
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
    if (level > 0) {
      // Pendant ceiling lamps.
      const n = Math.max(1, Math.round(w / 64));
      for (let i = 0; i < n; i++) {
        const lx = Math.round(((i + 0.5) * w) / n);
        rect(lx, 0, 1, 2, '#15131f');
        rect(lx - 2, 2, 5, 1, level === 3 ? '#c8c3e6' : '#2a2836');
        rect(lx - 1, 3, 3, 1, '#ffe7a3');
      }
    }
    // Floor depth: the back of the room is a little darker than the front.
    const fg = c.createLinearGradient(0, floorY, 0, h);
    fg.addColorStop(0, 'rgba(0,0,0,0.18)');
    fg.addColorStop(1, 'rgba(255,255,255,0.03)');
    c.fillStyle = fg;
    c.fillRect(0, floorY, w, h - floorY);
    rect(0, floorY, w, 1, 'rgba(0,0,0,0.25)');
  }

  /** Night falls: dim the room, then add light from screens and lamps. */
  private drawLighting(c: CanvasRenderingContext2D, w: number, h: number, light: Daylight, glows: { x: number; y: number; color: string; r: number }[], time: number) {
    if (light.dusk > 0) {
      c.fillStyle = `rgba(255,140,60,${(light.dusk * 0.08).toFixed(3)})`;
      c.fillRect(0, 0, w, h);
    }
    if (light.dark <= 0.01) return;
    c.fillStyle = `rgba(10,8,35,${light.dark.toFixed(3)})`;
    c.fillRect(0, 0, w, h);
    c.save();
    c.globalCompositeOperation = 'lighter';
    const strength = light.dark * 1.4;
    for (const g of glows) {
      const flicker = 1 + Math.sin(time * 13 + g.x) * 0.04;
      const rg = c.createRadialGradient(g.x, g.y, 1, g.x, g.y, g.r);
      rg.addColorStop(0, `rgba(${g.color},${(0.45 * strength * flicker).toFixed(3)})`);
      rg.addColorStop(1, `rgba(${g.color},0)`);
      c.fillStyle = rg;
      c.fillRect(g.x - g.r, g.y - g.r, g.r * 2, g.r * 2);
    }
    // Ceiling lights (a bare bulb in the garage).
    const n = Math.max(1, Math.round(w / 64));
    const lamps = this.level === 0 ? [w / 2] : Array.from({ length: n }, (_, i) => ((i + 0.5) * w) / n);
    for (const lx of lamps) {
      const rg = c.createRadialGradient(lx, 2, 1, lx, 14, 34);
      rg.addColorStop(0, `rgba(255,214,150,${(0.5 * strength).toFixed(3)})`);
      rg.addColorStop(1, 'rgba(255,214,150,0)');
      c.fillStyle = rg;
      c.fillRect(lx - 40, 0, 80, 50);
    }
    c.restore();
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
    const gt = this.clock;
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

    const wood = DESK_WOOD[Math.min(this.level, DESK_WOOD.length - 1)];
    const dual = this.dualMonitors();

    // Desk with a shadow, a highlighted top edge and a darker front.
    rect(7, 42, 34, 1, 'rgba(0,0,0,0.22)');
    rect(6, 29, 36, 1, shade(wood, 0.25));
    rect(6, 30, 36, 3, wood);
    rect(6, 33, 36, 1, shade(wood, -0.35));
    rect(8, 34, 2, 8, shade(wood, -0.3));
    rect(38, 34, 2, 8, shade(wood, -0.3));

    // Desk item, and the mug (which goes with them on a coffee break, or up to their lips).
    if (s && look && !dual) this.drawProp(c, x, y, look, time);
    const mugX = dual ? 8 : 36;
    if (s && !away && gesture?.g !== 'sip') {
      rect(mugX, 26, 3, 3, '#e8e8f0');
      rect(mugX, 26, 3, 1, '#ffffff');
      rect(mugX + 3, 27, 1, 1, '#e8e8f0');
      if (Math.sin(time * 1.3 + (look?.phase ?? 0) * 10) > 0.4) rect(mugX + 1, 24 - Math.floor((time * 3) % 2), 1, 1, '#ffffff66');
    }

    // Monitor(s) for the era.
    const scr = this.drawMonitor(c, x, y, dual);
    this.drawScreen(c, x + scr.x, y + scr.y, scr.w, scr.h, s, mode, animating, zone, time, look);
    if (scr.crt) {
      // Scanlines and a little glass glare.
      c.fillStyle = 'rgba(0,0,0,0.14)';
      for (let ly = 1; ly < scr.h; ly += 2) c.fillRect(x + scr.x, y + scr.y + ly, scr.w, 1);
      c.fillStyle = 'rgba(255,255,255,0.1)';
      c.fillRect(x + scr.x + 1, y + scr.y + 1, 3, 1);
      c.fillRect(x + scr.x + 1, y + scr.y + 2, 1, 2);
    }
    if (dual) {
      // A second, portrait monitor with docs on it.
      rect(37, 14, 9, 12, '#15131f');
      rect(41, 26, 1, 3, '#2a2a33');
      rect(39, 29, 5, 1, '#2a2a33');
      c.fillStyle = s && !away ? '#e8e8f0' : '#0c0b12';
      c.fillRect(x + 38, y + 15, 7, 10);
      if (s && !away) {
        c.fillStyle = '#9a98b0';
        for (let ly = 0; ly < 4; ly++) c.fillRect(x + 39, y + 16 + ly * 2, 3 + ((s.id + ly) % 3), 1);
      }
    }

    if (away) {
      // Sticky note on the monitor while they're away.
      rect(scr.x + scr.w - 4, scr.y - 1, 4, 4, '#ffd25c');
      rect(scr.x + scr.w - 3, scr.y, 2, 1, '#8a6a1a');
    }
    const chair = this.level >= 2 ? '#2a2836' : this.level === 1 ? '#3a2f4a' : '#4a3a2f';
    if (!s || !look || away || !gesture) {
      this.drawChair(c, x, y, chair);
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

    // Chair (stays put while they sway)
    this.drawChair(c, x, y, chair);
    // Shoulders / shirt, lit from above
    P(17, hy + 8, 14, 7, look.shirt);
    P(17, hy + 8, 14, 1, '#ffffff33');
    P(17, hy + 13, 14, 2, shade(look.shirt, -0.22));

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
    P(22, hy + 7, 4, 2, shade(look.skin, -0.15));
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
    // A highlight on the hair.
    if (look.style !== 3) H(21, hy, 6, 1, shade(look.hair, 0.28));
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

  private dualMonitors(): boolean {
    return this.era === 'wide' && this.level >= 2;
  }

  /** Draws the monitor body for the current era and returns the screen area (desk-relative). */
  private drawMonitor(c: CanvasRenderingContext2D, x: number, y: number, dual: boolean) {
    const rect = (rx: number, ry: number, rw: number, rh: number, col: string) => {
      c.fillStyle = col;
      c.fillRect(x + rx, y + ry, rw, rh);
    };
    if (this.era === 'crt-mono' || this.era === 'crt') {
      // Chunky beige CRT.
      const beige = '#d8cfb8';
      rect(12, 9, 24, 17, beige);
      rect(12, 9, 24, 1, shade(beige, 0.3));
      rect(12, 25, 24, 1, shade(beige, -0.25));
      rect(14, 11, 20, 13, '#3a3a30');
      rect(19, 26, 10, 3, shade(beige, -0.1));
      rect(17, 28, 14, 1, shade(beige, -0.25));
      rect(33, 24, 1, 1, '#3ddc97');
      return { x: 15, y: 12, w: 18, h: 11, crt: true };
    }
    if (this.era === 'lcd') {
      // Silver flat panel.
      const silver = '#b8bcc8';
      rect(13, 10, 22, 16, silver);
      rect(13, 10, 22, 1, shade(silver, 0.3));
      rect(23, 26, 2, 3, shade(silver, -0.2));
      rect(19, 29, 10, 1, shade(silver, -0.3));
      return { x: 14, y: 11, w: 20, h: 13, crt: false };
    }
    // Thin-bezel widescreen.
    const ox = dual ? -2 : 0;
    rect(10 + ox, 11, 27, 14, '#15131f');
    rect(23 + ox, 25, 2, 4, '#2a2a33');
    rect(19 + ox, 29, 10, 1, '#2a2a33');
    return { x: 11 + ox, y: 12, w: 25, h: 12, crt: false };
  }

  private drawChair(c: CanvasRenderingContext2D, x: number, y: number, col: string) {
    const rect = (rx: number, ry: number, rw: number, rh: number, cc: string) => {
      c.fillStyle = cc;
      c.fillRect(x + rx, y + ry, rw, rh);
    };
    rect(15, 43, 18, 1, 'rgba(0,0,0,0.25)');
    // Star base and wheels
    rect(23, 41, 2, 1, '#1b1a24');
    rect(18, 42, 12, 1, '#1b1a24');
    rect(17, 42, 1, 1, '#0d0c12');
    rect(30, 42, 1, 1, '#0d0c12');
    // Backrest with rounded corners
    rect(17, 33, 14, 8, col);
    rect(16, 34, 16, 6, col);
    rect(17, 33, 14, 1, shade(col, 0.22));
    rect(16, 39, 16, 1, shade(col, -0.3));
    rect(17, 40, 14, 1, shade(col, -0.3));
  }

  /** A personal item on the left of the desk. */
  private drawProp(c: CanvasRenderingContext2D, x: number, y: number, look: Look, time: number) {
    const rect = (rx: number, ry: number, rw: number, rh: number, col: string) => {
      c.fillStyle = col;
      c.fillRect(x + rx, y + ry, rw, rh);
    };
    switch (look.prop) {
      case 0: {
        // Potted plant, swaying gently.
        const sway = Math.round(Math.sin(time * 1.2 + look.phase * 9) * 0.6);
        rect(8, 26, 4, 3, '#b5653a');
        rect(8, 26, 4, 1, '#c97a4a');
        rect(7 + sway, 23, 6, 3, '#3d9a5a');
        rect(9 + sway, 21, 2, 2, '#4fbf6f');
        break;
      }
      case 1: // Rubber duck, for rubber-duck debugging.
        rect(8, 27, 4, 2, '#ffd25c');
        rect(10, 25, 2, 2, '#ffd25c');
        rect(12, 26, 1, 1, '#ff8a3b');
        rect(11, 25, 1, 1, '#15131f');
        break;
      case 2: // Stack of design docs.
        rect(7, 27, 6, 2, '#e8e8f0');
        rect(8, 26, 5, 1, '#d8d8e4');
        rect(8, 28, 3, 1, '#9a98b0');
        break;
      case 3: // Little robot figurine with a blinking eye.
        rect(9, 24, 3, 3, '#9aa3b8');
        rect(10, 25, 1, 1, Math.floor(time * 1.5 + look.phase * 5) % 2 ? '#ff5c6c' : '#5a2a30');
        rect(8, 27, 5, 2, '#7c87a0');
        rect(10, 23, 1, 1, '#9aa3b8');
        break;
      case 4: // Desk lamp.
        rect(7, 28, 4, 1, '#2a2836');
        rect(8, 23, 1, 5, '#2a2836');
        rect(8, 22, 4, 2, '#ffad3b');
        rect(9, 24, 2, 1, '#ffe7a3');
        break;
      default: // Cactus.
        rect(9, 27, 3, 2, '#c98b5e');
        rect(10, 23, 1, 4, '#3d9a5a');
        rect(9, 24, 1, 2, '#3d9a5a');
        rect(11, 25, 1, 1, '#3d9a5a');
        rect(10, 22, 1, 1, '#ff5c9a');
    }
  }

  // -------------------------------------------------------------------------
  // The studio cat
  // -------------------------------------------------------------------------

  private updateCat(dt: number, w: number) {
    const cat = this.cat;
    if (dt === 0 || this.reducedMotion) return;
    cat.t += dt;
    if (cat.mode === 'walk') {
      cat.x += 7 * dt * cat.dir;
      if ((cat.dir > 0 && cat.x >= cat.target) || (cat.dir < 0 && cat.x <= cat.target)) {
        cat.x = cat.target;
        cat.mode = Math.random() < 0.4 ? 'sleep' : 'sit';
        cat.t = 0;
        if (cat.mode === 'sleep' && Math.random() < 0.5) this.say(CAT_ID, '💤', 2.5);
      }
    } else {
      const rest = cat.mode === 'sleep' ? 14 : 5;
      if (cat.t > rest && Math.random() < dt * 0.5) {
        cat.target = 4 + Math.random() * (w - 16);
        cat.dir = cat.target > cat.x ? 1 : -1;
        cat.mode = 'walk';
        cat.t = 0;
        if (Math.random() < 0.25) this.say(CAT_ID, pickLine(['Meow', '🐟?', 'Mrrp']), 1.6);
      }
    }
    cat.x = Math.max(2, Math.min(w - 10, cat.x));
  }

  private drawCat(c: CanvasRenderingContext2D, y: number, time: number) {
    const cat = this.cat;
    const x = Math.round(cat.x);
    const fur = '#e8913a';
    const stripe = '#b5652a';
    const eye = '#15131f';
    // Mirror the sprite when walking left.
    const R = (rx: number, ry: number, rw: number, rh: number, col: string) => {
      c.fillStyle = col;
      c.fillRect(x + (cat.dir > 0 ? rx : 8 - rx - rw), y + ry, rw, rh);
    };
    R(0, 0, 9, 1, 'rgba(0,0,0,0.25)');
    if (cat.mode === 'sleep') {
      const breathe = Math.floor(time * 1.5) % 2;
      R(1, -3 - breathe, 5, 3 + breathe, fur);
      R(2, -3 - breathe, 1, 3 + breathe, stripe);
      R(4, -3 - breathe, 1, 3 + breathe, stripe);
      R(0, -1, 2, 1, fur);
      R(5, -4, 3, 3, fur);
      R(5, -5, 1, 1, fur);
      R(7, -5, 1, 1, fur);
      R(6, -3, 2, 1, stripe);
    } else if (cat.mode === 'sit') {
      const swish = Math.floor(time * 2) % 2;
      R(2, -5, 4, 4, fur);
      R(3, -5, 1, 4, stripe);
      R(4, -8, 3, 3, fur);
      R(4, -9, 1, 1, fur);
      R(6, -9, 1, 1, fur);
      if (Math.floor(time * 0.7) % 5) {
        R(5, -7, 1, 1, eye);
        R(6, -7, 1, 1, eye);
      }
      R(swish, -1, 2, 1, fur);
    } else {
      const step = Math.floor(time * 8) % 2;
      R(1, -4, 6, 3, fur);
      R(2, -4, 1, 3, stripe);
      R(4, -4, 1, 3, stripe);
      R(6, -6, 3, 3, fur);
      R(6, -7, 1, 1, fur);
      R(8, -7, 1, 1, fur);
      R(8, -5, 1, 1, eye);
      R(1 + step, -1, 1, 1, stripe);
      R(5 - step, -1, 1, 1, stripe);
      R(0, -6, 1, 3, fur);
      R(-1 + step, -7, 1, 1, fur);
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
      if (this.era === 'crt-mono') col = seed % 3 ? '#4cff7a' : '#2fbf5a';
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
