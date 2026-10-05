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

  constructor() {
    this.el = document.createElement('canvas');
    this.el.className = 'office';
    this.el.setAttribute('role', 'img');
    this.ctx = this.el.getContext('2d')!;
    this.lc = this.low.getContext('2d')!;
  }

  /** Called when the simulation reports someone got in the zone. */
  celebrate(staffId: number) {
    this.zoneStart.set(staffId, this.lastT);
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

    const offsetX = Math.floor((lw - cols * CELL_W) / 2);
    const zoners: { x: number; y: number; s: Staff }[] = [];
    for (let i = 0; i < desks; i++) {
      const x = offsetX + (i % cols) * CELL_W;
      const y = WALL_H - 10 + Math.floor(i / cols) * CELL_H;
      const s = state.staff[i];
      const inZone = !!s?.zone && act?.kind === 'game' && mode === 'work';
      this.drawDesk(c, x, y, s, mode, animating, inZone, time);
      if (s && inZone) zoners.push({ x, y, s });
      if (s && animating && !this.reducedMotion) this.emitWork(x, y, inZone, mode, dt);
    }

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
      const pop = since < 0.4 ? 0.6 + since : 1;
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

    const working = state.staff.filter((s) => s.zone && act?.kind === 'game').map((s) => s.name);
    this.el.setAttribute(
      'aria-label',
      `${OFFICES[state.officeLevel].name} with ${state.staff.length} ${state.staff.length === 1 ? 'person' : 'people'} ${mode === 'idle' ? 'relaxing' : 'working'}${working.length ? `. In the zone: ${working.join(', ')}` : ''}.`,
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
      rect(w - 10, floorY - 6, 6, 6, '#b5653a');
      rect(w - 11, floorY - 13, 8, 7, '#3d9a5a');
      rect(w - 9, floorY - 15, 4, 3, '#4fbf6f');
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
      const cx = w - 8;
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

  private drawDesk(c: CanvasRenderingContext2D, x: number, y: number, s: Staff | undefined, mode: Mode, animating: boolean, zone: boolean, time: number) {
    const rect = (rx: number, ry: number, rw: number, rh: number, col: string) => {
      c.fillStyle = col;
      c.fillRect(x + rx, y + ry, rw, rh);
    };
    const look = s ? lookFor(s) : null;

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

    // Mug on the desk
    rect(36, 27, 3, 3, '#e8e8f0');
    rect(39, 28, 1, 1, '#e8e8f0');
    if (s && Math.sin(time * 1.3 + (look?.phase ?? 0) * 10) > 0.4) rect(37, 25 - Math.floor((time * 3) % 2), 1, 1, '#ffffff66');

    // Monitor
    rect(13, 10, 22, 16, '#15131f');
    rect(23, 26, 2, 4, '#15131f');
    rect(19, 29, 10, 1, '#15131f');
    this.drawScreen(c, x + 14, y + 11, 20, 13, s, mode, animating, zone, time, look);

    if (!s || !look) {
      // Empty chair
      rect(17, 32, 14, 9, '#2a2836');
      rect(23, 41, 2, 2, '#1b1a24');
      return;
    }

    // Person, seen from behind, sitting at the desk.
    const typing = animating && mode !== 'idle';
    const speed = zone ? 22 : 12;
    const beat = typing ? Math.floor(time * speed + look.phase * 10) % 2 : 0;
    const lean = mode === 'idle' ? 1 : 0;
    const bob = zone ? Math.floor(time * 10) % 2 : 0;
    const hy = 21 + lean - bob;

    // Chair back
    rect(16, 34, 16, 8, '#2a2836');
    rect(23, 42, 2, 1, '#1b1a24');
    // Shoulders / shirt
    rect(17, hy + 8, 14, 7, look.shirt);
    rect(17, hy + 8, 14, 1, '#ffffff33');
    // Arms reaching to the keyboard (alternate while typing)
    if (mode === 'idle') {
      // Hands behind the head, relaxing.
      rect(15, hy + 2, 3, 6, look.shirt);
      rect(30, hy + 2, 3, 6, look.shirt);
    } else {
      rect(15, hy + 9 - beat, 3, 4, look.shirt);
      rect(30, hy + 9 - (1 - beat), 3, 4, look.shirt);
      rect(15, hy + 8 - beat, 3, 1, look.skin);
      rect(30, hy + 8 - (1 - beat), 3, 1, look.skin);
    }
    // Neck & head
    rect(22, hy + 7, 4, 2, look.skin);
    rect(20, hy, 8, 8, look.skin);
    rect(19, hy + 3, 1, 2, look.skin);
    rect(28, hy + 3, 1, 2, look.skin);
    // Hair (from behind)
    switch (look.style) {
      case 0: // short
        rect(20, hy, 8, 5, look.hair);
        rect(20, hy - 1, 8, 1, look.hair);
        break;
      case 1: // long
        rect(19, hy - 1, 10, 7, look.hair);
        rect(19, hy + 6, 2, 4, look.hair);
        rect(27, hy + 6, 2, 4, look.hair);
        rect(21, hy + 6, 6, 3, look.hair);
        break;
      case 2: // bun
        rect(20, hy - 1, 8, 6, look.hair);
        rect(22, hy - 4, 4, 3, look.hair);
        break;
      default: // headphones
        rect(20, hy, 8, 4, look.hair);
        rect(19, hy - 1, 10, 1, '#15131f');
        rect(18, hy + 2, 2, 4, '#15131f');
        rect(28, hy + 2, 2, 4, '#15131f');
    }
    if (zone) {
      // A little headband of fire.
      const f = Math.floor(time * 12) % 3;
      rect(20, hy - 2 - (f === 0 ? 1 : 0), 2, 2, '#ffad3b');
      rect(23, hy - 3 - (f === 1 ? 1 : 0), 2, 3, '#ff6b4a');
      rect(26, hy - 2 - (f === 2 ? 1 : 0), 2, 2, '#ffd25c');
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
