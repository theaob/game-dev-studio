import { GENRES, PLATFORMS, TOPICS } from '../core/data';
import type { GameSpec } from '../core/types';
import { esc } from './format';

/** What a cover is drawn from: a draft, a game in development or a released game all fit. */
export type CoverSource = Pick<GameSpec, 'name' | 'genre' | 'topic' | 'platform'> & {
  /** The cover's own seed, rolled when the game is planned. */
  cover?: number;
  id?: number;
  series?: number;
};

export type CoverSize = 'xs' | 'sm' | 'md' | 'lg';

/** A colour for each genre, so covers of one genre look like they belong together. */
export function genreHue(genre: string): number {
  const i = GENRES.findIndex((g) => g.id === genre);
  return i < 0 ? 35 : (i * 37 + 8) % 360;
}

/** A fresh cover seed for a new game. */
export function rollCover(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

/** Older saves have no cover seed: derive a steady one from the game itself. */
function hashSeed(g: CoverSource): number {
  const text = `${g.id ?? ''}|${g.name}|${g.topic}|${g.genre}`;
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The seed a game's cover is drawn from: the same game always gets the same cover. */
export function coverSeed(g: CoverSource): number {
  return g.cover ?? hashSeed(g);
}

/** A small mulberry32 generator, local to one cover so drawing it never touches the game's RNG. */
function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    let t = (s = (s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Background patterns, each from two colours (a, b) and an accent (c). */
const PATTERNS: ((a: string, b: string, c: string, r: () => number) => string)[] = [
  // Sun rays
  (a, b, _c, r) => `repeating-conic-gradient(from ${Math.round(r() * 360)}deg at ${30 + Math.round(r() * 40)}% ${55 + Math.round(r() * 30)}%, ${a} 0 10deg, ${b} 10deg 20deg)`,
  // Diagonal stripes
  (a, b, _c, r) => {
    const w = 1 + Math.round(r() * 2);
    return `repeating-linear-gradient(${r() < 0.5 ? 45 : -45}deg, ${a} 0 ${w}em, ${b} ${w}em ${w * 2}em)`;
  },
  // Polka dots
  (a, b) => `radial-gradient(circle, ${b} 0.6em, transparent 0.7em) 0 0 / 2.5em 2.5em, ${a}`,
  // Sunset over the horizon
  (a, b, c, r) => {
    const y = 50 + Math.round(r() * 20);
    return `radial-gradient(circle at 50% ${y}%, ${c} 2.6em, transparent 2.7em), linear-gradient(${a} ${y}%, ${b} ${y}%)`;
  },
  // Retro grid
  (a, b) => `linear-gradient(${b} 0.15em, transparent 0.15em) 0 0 / 1.6em 1.6em, linear-gradient(90deg, ${b} 0.15em, transparent 0.15em) 0 0 / 1.6em 1.6em, ${a}`,
  // Bold diagonal split
  (a, b, _c, r) => `linear-gradient(${110 + Math.round(r() * 60)}deg, ${a} 50%, ${b} 50%)`,
  // Checkerboard
  (a, b) => `repeating-conic-gradient(${a} 0 25%, ${b} 0 50%) 0 0 / 2.4em 2.4em`,
  // Target rings
  (a, b, _c, r) => `repeating-radial-gradient(circle at ${Math.round(r() * 100)}% ${Math.round(r() * 100)}%, ${a} 0 0.9em, ${b} 0.9em 1.8em)`,
  // Soft glow
  (a, b, c) => `radial-gradient(circle at 30% 20%, ${c}, transparent 60%), linear-gradient(150deg, ${a}, ${b})`,
];

/** Where the topic art sits on the cover. */
const LAYOUTS = ['center', 'corner', 'tilt', 'duo', 'peek'] as const;

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/**
 * A box cover for a game, drawn from its seed: a background pattern in the genre's colours,
 * the topic as the hero, a genre badge, the platform on the spine and, at the larger sizes,
 * the title. The same game always draws the same cover.
 */
export function coverArt(g: CoverSource, size: CoverSize = 'sm'): string {
  const r = seeded(coverSeed(g));
  const pickOf = <T>(items: readonly T[]): T => items[Math.floor(r() * items.length)];
  const hue = genreHue(g.genre) + Math.round((r() - 0.5) * 50);
  const dark = r() < 0.35;
  const sat = 55 + Math.round(r() * 30);
  const a = `hsl(${hue} ${sat}% ${dark ? 26 : 60}%)`;
  const b = `hsl(${hue + 20 + Math.round(r() * 40)} ${sat}% ${dark ? 36 : 48}%)`;
  const c = `hsl(${hue + 150 + Math.round(r() * 60)} 90% ${dark ? 62 : 80}%)`;
  const bg = pickOf(PATTERNS)(a, b, c, r);
  const layout = pickOf(LAYOUTS);
  const tilt = Math.round((r() - 0.5) * 30);
  const titleStyle = pickOf(['plain', 'caps', 'slab'] as const);
  const spine = r() < 0.55;

  const genre = GENRES.find((x) => x.id === g.genre);
  const topic = TOPICS.find((x) => x.id === g.topic);
  const platform = PLATFORMS.find((x) => x.id === g.platform);
  const hero = topic?.icon ?? genre?.icon ?? '🎮';
  const series = g.series ?? 1;
  const showTitle = size === 'lg' && g.name.trim();

  return `
    <div class="cover cover-${size} lay-${layout}${dark ? ' dark' : ''}" style="background:${bg};--tilt:${tilt}deg" aria-hidden="true">
      ${spine && platform ? `<span class="cv-spine">${platform.icon}</span>` : ''}
      <span class="cv-hero">${hero}</span>
      ${topic && genre ? `<span class="cv-genre">${genre.icon}</span>` : ''}
      ${series > 1 ? `<span class="cv-part">${ROMAN[series] ?? series}</span>` : ''}
      ${showTitle ? `<span class="cv-title t-${titleStyle}">${esc(g.name)}</span>` : ''}
    </div>`;
}
