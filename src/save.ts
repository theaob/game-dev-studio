import { SAVE_VERSION } from './core/sim';
import type { GameState } from './core/types';

const KEY = 'game-dev-studio/save';

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as GameState;
    if (state.version !== SAVE_VERSION) return null;
    return state;
  } catch {
    return null;
  }
}

export function saveGame(state: GameState): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

// Achievements belong to the device, not the save: starting over keeps them.
const ACHIEVEMENTS_KEY = 'game-dev-studio/achievements';

/** When an achievement was unlocked: the in-game week and the studio that did it. */
export interface Unlock {
  week: number;
  studio: string;
}

export function loadAchievements(): Record<string, Unlock> {
  try {
    const raw = localStorage.getItem(ACHIEVEMENTS_KEY);
    const data = raw ? (JSON.parse(raw) as unknown) : null;
    return data && typeof data === 'object' ? (data as Record<string, Unlock>) : {};
  } catch {
    return {};
  }
}

export function saveAchievements(unlocked: Record<string, Unlock>): void {
  try {
    localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(unlocked));
  } catch {
    // ignore
  }
}
