/**
 * Studio customization: wall and floor paint, and decorations bought with cash.
 * Purely cosmetic. Each decoration has its own spot in the room, so once bought it
 * can be placed or put away for free, and it moves along when the studio does.
 */
import { friendly, priceIndex } from './economy';
import type { GameState } from './types';

export interface Paint {
  id: string;
  name: string;
  color: string;
}

/** Wall paints. The office's own colours are "Original" (no id stored). */
export const WALL_PAINTS: Paint[] = [
  { id: 'cream', name: 'Cream', color: '#e3d6bc' },
  { id: 'sage', name: 'Sage', color: '#8fa889' },
  { id: 'sky', name: 'Sky blue', color: '#86a9c4' },
  { id: 'blush', name: 'Blush', color: '#d39a92' },
  { id: 'mustard', name: 'Mustard', color: '#d4a64a' },
  { id: 'teal', name: 'Teal', color: '#3f7f7a' },
  { id: 'plum', name: 'Plum', color: '#6e4d6e' },
  { id: 'charcoal', name: 'Charcoal', color: '#45434c' },
];

export const FLOOR_PAINTS: Paint[] = [
  { id: 'oak', name: 'Light oak', color: '#a9845a' },
  { id: 'walnut', name: 'Walnut', color: '#5e4130' },
  { id: 'concrete', name: 'Concrete', color: '#8a8780' },
  { id: 'terracotta', name: 'Terracotta', color: '#a35a3e' },
  { id: 'mint', name: 'Mint', color: '#6f9e8a' },
  { id: 'navy', name: 'Navy carpet', color: '#2f3b5c' },
];

export type DecorId = 'rug' | 'plants' | 'beanbags' | 'bookshelf' | 'trophies' | 'aquarium' | 'arcade' | 'neon';

export interface DecorItem {
  id: DecorId;
  name: string;
  icon: string;
  desc: string;
  /** Price in 1985 dollars; rises with the years like everything else. */
  price: number;
}

export const DECOR: DecorItem[] = [
  { id: 'rug', name: 'Cozy Rug', icon: '🟫', desc: 'A big soft rug on the floor up front.', price: 2500 },
  { id: 'plants', name: 'Potted Plants', icon: '🪴', desc: 'A leafy corner by the front of the room.', price: 3000 },
  { id: 'beanbags', name: 'Bean Bags', icon: '🛋️', desc: 'Two squashy bean bags for playtesting.', price: 4000 },
  { id: 'bookshelf', name: 'Bookshelf', icon: '📚', desc: 'Programming manuals and game boxes along the side wall.', price: 6000 },
  { id: 'trophies', name: 'Trophy Shelf', icon: '🏆', desc: 'Shows off a trophy for every game that scored 8 or more.', price: 8000 },
  { id: 'aquarium', name: 'Aquarium', icon: '🐠', desc: 'A glowing fish tank. The cat approves.', price: 12000 },
  { id: 'arcade', name: 'Arcade Cabinet', icon: '🕹️', desc: 'A blinking arcade machine for "research".', price: 15000 },
  { id: 'neon', name: 'Neon Sign', icon: '💡', desc: "Your studio's name in neon on the back wall.", price: 20000 },
];

/** A repaint costs this much (1985 dollars); going back to the original colours is free. */
const PAINT_PRICE = 1500;

export function decorById(id: string): DecorItem {
  const item = DECOR.find((x) => x.id === id);
  if (!item) throw new Error(`Unknown decoration ${id}`);
  return item;
}

function paintList(surface: 'wall' | 'floor'): Paint[] {
  return surface === 'wall' ? WALL_PAINTS : FLOOR_PAINTS;
}

/** The custom colour for a surface, or undefined for the office's original look. */
export function paintColor(state: GameState, surface: 'wall' | 'floor'): string | undefined {
  const id = state.decor?.[surface];
  return paintList(surface).find((p) => p.id === id)?.color;
}

export function paintPrice(state: GameState): number {
  return friendly(PAINT_PRICE * priceIndex(state.week));
}

export function decorPrice(state: GameState, id: DecorId): number {
  return friendly(decorById(id).price * priceIndex(state.week));
}

export function ownsDecor(state: GameState, id: DecorId): boolean {
  return state.decor?.owned?.includes(id) ?? false;
}

export function isPlaced(state: GameState, id: DecorId): boolean {
  return state.decor?.placed?.includes(id) ?? false;
}

/** Decorations on show right now, in catalogue order. */
export function placedDecor(state: GameState): DecorId[] {
  return DECOR.filter((d) => isPlaced(state, d.id)).map((d) => d.id);
}

/** Repaints a surface (`id` empty for the original colours). Returns an error message, or null on success. */
export function repaint(state: GameState, surface: 'wall' | 'floor', id: string): string | null {
  const current = state.decor?.[surface] ?? '';
  if (id === current) return 'Already painted that colour.';
  if (id && !paintList(surface).some((p) => p.id === id)) return 'Unknown colour.';
  const price = id ? paintPrice(state) : 0;
  if (price > state.cash) return 'Not enough cash.';
  state.cash -= price;
  const decor = { ...state.decor };
  if (id) decor[surface] = id;
  else delete decor[surface];
  state.decor = decor;
  return null;
}

/** Buys a decoration and places it. Returns an error message, or null on success. */
export function buyDecor(state: GameState, id: DecorId): string | null {
  decorById(id);
  if (ownsDecor(state, id)) return 'Already owned.';
  const price = decorPrice(state, id);
  if (price > state.cash) return 'Not enough cash.';
  state.cash -= price;
  state.decor = { ...state.decor, owned: [...(state.decor?.owned ?? []), id], placed: [...(state.decor?.placed ?? []), id] };
  return null;
}

/** Places an owned decoration, or puts it away. Free. */
export function toggleDecor(state: GameState, id: DecorId): string | null {
  if (!ownsDecor(state, id)) return "You don't own that yet.";
  const placed = state.decor?.placed ?? [];
  state.decor = { ...state.decor, placed: placed.includes(id) ? placed.filter((x) => x !== id) : [...placed, id] };
  return null;
}

/** Changes whenever the studio's look does, so the office scene knows to rebuild. */
export function decorKey(state: GameState): string {
  const trophies = isPlaced(state, 'trophies') ? trophyCount(state) : 0;
  return `${state.decor?.wall ?? ''}/${state.decor?.floor ?? ''}/${placedDecor(state).join('+')}/${trophies}/${isPlaced(state, 'neon') ? state.studioName : ''}`;
}

/** Trophies on the shelf: one per game that scored 8 or more, up to six. */
export function trophyCount(state: GameState): number {
  return Math.min(6, state.released.filter((g) => g.score >= 8).length);
}
