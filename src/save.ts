import { SAVE_VERSION } from './core/sim';
import type { GameState } from './core/types';

const KEY = 'game-dev-studio/save';

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return parseSave(raw);
  } catch {
    return null;
  }
}

/** Reads a save from its text (a cloud save, say), or null if it isn't one this version can load. */
export function parseSave(raw: string): GameState | null {
  try {
    const state = JSON.parse(raw) as GameState;
    return state && typeof state === 'object' && state.version === SAVE_VERSION ? state : null;
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

// The cloud save (Google Play Games, Android app only): when the one this device last wrote,
// loaded or turned down was written. A cloud save newer than that came from another device.
const CLOUD_SYNCED_KEY = 'game-dev-studio/cloud-synced';

export function loadCloudSynced(): number {
  try {
    return Number(localStorage.getItem(CLOUD_SYNCED_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function saveCloudSynced(modified: number): void {
  try {
    localStorage.setItem(CLOUD_SYNCED_KEY, String(modified));
  } catch {
    // ignore
  }
}
