/**
 * The party for a recognized game: a trophy bounces in under a ribbon banner,
 * fireworks pop, streamers and emoji rain down, then it all fades away. A plain
 * hit still gets the simple confetti; this is only for awards.
 */
import { GOTY_ICON, acclaimOf } from '../core/acclaim';
import type { ReleasedGame } from '../core/types';
import { esc } from './format';

export type CelebrationTier = 'choice' | 'masterpiece' | 'classic' | 'goty';

export interface Celebration {
  tier: CelebrationTier;
  icon: string;
  title: string;
  /** Firework bursts: bigger awards get more. */
  bursts: number;
  /** What the team shouts in the office. */
  cheer: string[];
}

/** A perfect 10 from every reviewer. */
export const INSTANT_CLASSIC_SCORE = 10;

/** The party a fresh release has earned, or nothing for a game without an award. */
export function releaseCelebration(g: Pick<ReleasedGame, 'acclaim' | 'score'>): Celebration | undefined {
  if (g.score >= INSTANT_CLASSIC_SCORE) {
    return { tier: 'classic', icon: '💎', title: 'Instant Classic!', bursts: 9, cheer: ['💎', 'Perfect!', '🥳', '🎊', 'Legend!'] };
  }
  const a = acclaimOf(g);
  if (!a) return undefined;
  return a.id === 'masterpiece'
    ? { tier: 'masterpiece', icon: a.icon, title: `${a.name}!`, bursts: 7, cheer: ['👑', 'Masterpiece!', '🥳', '🎉'] }
    : { tier: 'choice', icon: a.icon, title: `${a.name}!`, bursts: 5, cheer: ['🏅', 'Award!', '🎉', '🥂'] };
}

/** The party for a Game of the Year win. */
export function gotyCelebration(year: number): Celebration {
  return { tier: 'goty', icon: GOTY_ICON, title: `Game of the Year ${year}!`, bursts: 9, cheer: ['🏆', 'GOTY!', '🥳', '🍾', '🎊'] };
}

const PALETTES: Record<CelebrationTier, string[]> = {
  choice: ['#f2b33d', '#ffe07d', '#dc4b2a', '#23877d', '#fff8ea'],
  masterpiece: ['#ffd25c', '#f2b33d', '#fff1b8', '#e88a1a', '#ffffff'],
  classic: ['#ff5d8f', '#ffd25c', '#5fd3a6', '#5aa9ff', '#b48cff', '#ffffff'],
  goty: ['#ffd25c', '#f2b33d', '#ffffff', '#dc4b2a', '#2f7fc1'],
};

const RAIN = ['🎉', '🥳', '🎊', '⭐', '✨', '🎈'];

/** Throws the party over the whole screen. It never blocks taps and cleans itself up. */
export function throwParty(c: Celebration, gameName: string) {
  document.querySelector('.award-party')?.remove();
  const colors = PALETTES[c.tier];
  const layer = document.createElement('div');
  layer.className = `award-party tier-${c.tier}`;
  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  const pieces: string[] = [];

  for (let b = 0; b < c.bursts; b++) {
    const x = rand(12, 88);
    const y = rand(10, 55);
    const delay = 0.3 + b * 0.32 + rand(0, 0.15);
    const color = colors[b % colors.length];
    const sparks = Array.from({ length: 16 }, (_, i) => {
      const angle = (i / 16) * Math.PI * 2;
      const dist = rand(60, 110);
      return `<i style="--dx:${(Math.cos(angle) * dist).toFixed(0)}px;--dy:${(Math.sin(angle) * dist).toFixed(0)}px"></i>`;
    }).join('');
    pieces.push(`<div class="ap-burst" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;--c:${color};animation-delay:${delay.toFixed(2)}s">${sparks}</div>`);
  }

  for (let i = 0; i < 28; i++) {
    pieces.push(
      `<i class="ap-streamer" style="left:${rand(0, 100).toFixed(1)}%;background:${colors[i % colors.length]};--sway:${rand(-60, 60).toFixed(0)}px;animation-duration:${rand(2.4, 3.6).toFixed(2)}s;animation-delay:${rand(0, 0.8).toFixed(2)}s"></i>`,
    );
  }

  for (let i = 0; i < 18; i++) {
    pieces.push(
      `<span class="ap-rain" style="left:${rand(2, 96).toFixed(1)}%;--sway:${rand(-40, 40).toFixed(0)}px;--spin:${rand(-200, 200).toFixed(0)}deg;animation-duration:${rand(2.6, 3.8).toFixed(2)}s;animation-delay:${rand(0.2, 1.4).toFixed(2)}s">${RAIN[i % RAIN.length]}</span>`,
    );
  }

  const rays = Array.from({ length: 12 }, (_, i) => `<i style="--r:${i * 30}deg"></i>`).join('');
  layer.innerHTML = `
    ${pieces.join('')}
    <div class="ap-stage">
      <div class="ap-rays">${rays}</div>
      <div class="ap-icon">${c.icon}</div>
      <div class="ap-ribbon"><span>${esc(c.title)}</span></div>
      <div class="ap-name">${esc(gameName)}</div>
    </div>`;
  document.body.appendChild(layer);
  window.setTimeout(() => layer.remove(), 5200);
}
