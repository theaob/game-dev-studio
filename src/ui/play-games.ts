/**
 * Google Play Games Services (Android app only): signs the player in and mirrors the game's
 * achievements to their Play Games profile. The native side is PlayGamesPlugin.java. The
 * Play Games IDs come from the build (PLAY_GAMES_RESOURCES, see README "Google Play Games");
 * without them, and on the web and itch.io, everything here is off.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { playGamesIds } from '../core/achievements';

interface Status {
  configured: boolean;
  authenticated: boolean;
}

interface PlayGamesNative {
  status(): Promise<Status>;
  signIn(): Promise<Status>;
  unlock(options: { id: string }): Promise<void>;
  showAchievements(): Promise<void>;
}

const IDS = playGamesIds(import.meta.env.VITE_PLAY_GAMES_RESOURCES);

export interface PlayGamesView {
  /** Play Games is set up in this build (Android app with achievement IDs). */
  available: boolean;
  signedIn: boolean;
}

export class PlayGames {
  private plugin?: PlayGamesNative;
  private signedIn = false;
  /** Called when the sign-in state changes. */
  onChange: () => void = () => {};

  constructor(private unlocked: () => string[]) {
    if (Capacitor.isNativePlatform() && Object.keys(IDS).length) this.plugin = registerPlugin<PlayGamesNative>('PlayGames');
  }

  view(): PlayGamesView {
    return { available: !!this.plugin, signedIn: this.signedIn };
  }

  /** Checks the automatic sign-in at launch and catches up on achievements earned while signed out. */
  async init(): Promise<void> {
    if (!this.plugin) return;
    try {
      const status = await this.plugin.status();
      if (!status.configured) this.plugin = undefined;
      this.update(status.authenticated);
    } catch {
      this.plugin = undefined;
      this.onChange();
    }
  }

  async signIn(): Promise<boolean> {
    if (!this.plugin) return false;
    try {
      this.update((await this.plugin.signIn()).authenticated);
    } catch {
      // Cancelled or no network: stay signed out.
    }
    return this.signedIn;
  }

  /** Unlocks the Play Games versions of in-game achievements (already-unlocked ones are a no-op there). */
  unlock(ids: string[]): void {
    if (!this.plugin || !this.signedIn) return;
    for (const id of ids) {
      const playId = IDS[id];
      if (playId) void this.plugin.unlock({ id: playId }).catch(() => {});
    }
  }

  async showAchievements(): Promise<boolean> {
    if (!this.plugin) return false;
    if (!this.signedIn && !(await this.signIn())) return false;
    try {
      await this.plugin.showAchievements();
      return true;
    } catch {
      return false;
    }
  }

  private update(signedIn: boolean) {
    const changed = signedIn !== this.signedIn;
    this.signedIn = signedIn;
    if (signedIn) this.unlock(this.unlocked());
    if (changed) this.onChange();
  }
}
