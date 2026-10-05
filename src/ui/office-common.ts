/**
 * Behaviour shared by the 2D and 3D office scenes: who people look like, what
 * they are doing, the day/night cycle and which computers fit the era.
 */
import type { Staff } from '../core/types';

export type Mode = 'idle' | 'work' | 'polish';

export interface Bubble {
  text: string;
  age: number;
  life: number;
}

/** A coffee break: walk to the machine, sip, walk back. */
export interface CoffeeBreak {
  stage: 'out' | 'sip' | 'back';
  t: number;
  slot: number;
  /** Seconds to walk between desk and machine. */
  trip: number;
}

export const WALK_SPEED = 18; // logical px per second
export const SIP_TIME = 3.5;

export const LINES = {
  design: ['💡', '🎨', '✏️', '🤔', 'Ooh!', 'What if…'],
  tech: ['⌨️', '{ }', '⚙️', '🤔', 'Compiles!', '01101'],
  polish: ['🐛!', 'Fixed!', '🔨', 'Found one', '✅', 'Why?!'],
  idle: ['💤', '🎮', '😴', '📺', '🍕', 'Lunch?'],
  zone: ['🔥', '⚡', 'Flow!', '🤯', 'Unstoppable'],
  sip: ['☕', 'Ahh…', '😌', 'Mmm'],
};

export type Gesture = 'type' | 'lean' | 'think' | 'sip' | 'point' | 'look' | 'stretch' | 'relax' | 'swivel';

/** Seconds each gesture lasts before the next one is picked. */
export const GESTURE_SECONDS = 2.6;

export const GESTURES: Record<'work' | 'polish' | 'idle', [Gesture, number][]> = {
  work: [['type', 0.55], ['lean', 0.1], ['think', 0.1], ['sip', 0.08], ['point', 0.07], ['look', 0.06], ['stretch', 0.04]],
  polish: [['type', 0.45], ['point', 0.2], ['think', 0.15], ['lean', 0.1], ['sip', 0.05], ['look', 0.05]],
  idle: [['relax', 0.55], ['swivel', 0.2], ['stretch', 0.1], ['sip', 0.15]],
};

export function hash01(n: number): number {
  let h = n | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * What someone is doing right now. Deterministic per person and time, so each
 * developer has their own rhythm without storing any state. `p` is 0..1 progress.
 */
export function gestureFor(id: number, look: Look, t: number, mode: Mode, zone: boolean): { g: Gesture; p: number } {
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

/** Seconds of play for one full day/night cycle. */
export const DAY_SECONDS = 120;

/** Computer hardware changes with the decades. */
export type Era = 'crt-mono' | 'crt' | 'lcd' | 'wide';

export function eraFor(year: number): Era {
  if (year < 1990) return 'crt-mono';
  if (year < 2000) return 'crt';
  if (year < 2010) return 'lcd';
  return 'wide';
}

/** Desk furniture gets nicer as the studio grows. */
export const DESK_WOOD = ['#7a6a55', '#8a5a3b', '#5c5f73', '#d9d4c7'];

const shadeCache = new Map<string, string>();
/** Lightens (f > 0) or darkens (f < 0) a #rrggbb colour. */
export function shade(hex: string, f: number): string {
  const key = hex + f;
  const hit = shadeCache.get(key);
  if (hit) return hit;
  const n = parseInt(hex.slice(1, 7), 16);
  const target = f < 0 ? 0 : 255;
  const mix = (v: number) => Math.round(v + (target - v) * Math.abs(f));
  const out = `rgb(${mix(n >> 16)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
  shadeCache.set(key, out);
  return out;
}

export type Daylight = { tod: number; sun: number; dark: number; dusk: number };

/** Time of day 0..1 (0 = midnight, 0.5 = noon) and how dark the room is. */
export function daylight(clock: number): Daylight {
  const tod = (clock / DAY_SECONDS + 0.35) % 1;
  const sun = Math.cos((tod - 0.5) * Math.PI * 2); // 1 at noon, -1 at midnight
  const dark = Math.max(0, Math.min(0.5, (0.2 - sun) * 0.55));
  const dusk = Math.max(0, 1 - Math.abs(sun) * 4); // around sunrise and sunset
  return { tod, sun, dark, dusk };
}

export const CAT_ID = -1;

export interface Cat {
  x: number;
  dir: 1 | -1;
  mode: 'walk' | 'sit' | 'sleep';
  t: number;
  target: number;
}

export function pickLine(list: string[]): string {
  return list[Math.floor(Math.random() * list.length)];
}


export interface Look {
  skin: string;
  hair: string;
  shirt: string;
  style: number;
  phase: number;
  /** Desk item: 0 plant, 1 rubber duck, 2 papers, 3 robot figurine, 4 lamp, 5 cactus. */
  prop: number;
}

export const SKINS = ['#f5d0b5', '#e8b48f', '#c98b5e', '#a0673f', '#6e4329', '#ffdfc4'];
export const HAIRS = ['#2b1d14', '#5a3a1e', '#a0522d', '#e2b45a', '#1a1a2e', '#c0c0c8', '#d8452e', '#6b3fa0'];
export const SHIRTS = ['#4f7cff', '#ff5c9a', '#3ddc97', '#ffad3b', '#9b6bff', '#2ec4d6', '#e8e8f0', '#ff6b4a'];
export const CODE = ['#7c5cff', '#4fb3ff', '#3ddc97', '#ffad3b', '#ff5c9a', '#c8c3e6'];

/** Stable appearance derived from the staff id, so people keep their look. */
export function lookFor(s: Staff): Look {
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
    prop: next(6),
  };
}
