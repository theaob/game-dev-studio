/**
 * Google Play Games Services (Android app only): signs the player in, mirrors the game's
 * achievements to their Play Games profile and submits their best scores to the leaderboards. The native side is PlayGamesPlugin.java. The
 * Play Games IDs come from the build (PLAY_GAMES_RESOURCES, see README "Google Play Games");
 * without them, and on the web and itch.io, everything here is off.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { playGamesIds } from '../core/achievements';
import { LEADERBOARDS, leaderboardIds } from '../core/leaderboards';
import type { GameState } from '../core/types';

interface Status {
  configured: boolean;
  authenticated: boolean;
}

interface PlayGamesNative {
  status(): Promise<Status>;
  signIn(): Promise<Status>;
  unlock(options: { id: string }): Promise<void>;
  showAchievements(): Promise<void>;
  submitScore(options: { id: string; score: number }): Promise<void>;
  showLeaderboards(): Promise<void>;
}

const IDS = playGamesIds(import.meta.env.VITE_PLAY_GAMES_RESOURCES);
const BOARD_IDS = leaderboardIds(import.meta.env.VITE_PLAY_GAMES_RESOURCES);
/** Cash and fans climb every week: send them at most this often (the best score is all that counts). */
const SUBMIT_EVERY_MS = 60_000;

export interface PlayGamesView {
  /** Play Games is set up in this build (Android app with achievement IDs). */
  available: boolean;
  /** The build also has leaderboard IDs. */
  leaderboards: boolean;
  signedIn: boolean;
}

export class PlayGames {
  private plugin?: PlayGamesNative;
  private signedIn = false;
  /** The best score sent to each leaderboard since signing in, and when scores were last sent. */
  private submitted: Record<string, number> = {};
  private lastSubmit = 0;
  /** Called when the sign-in state changes. */
  onChange: () => void = () => {};

  constructor(
    private unlocked: () => string[],
    private state: () => GameState | null,
  ) {
    if (Capacitor.isNativePlatform() && (Object.keys(IDS).length || Object.keys(BOARD_IDS).length)) this.plugin = registerPlugin<PlayGamesNative>('PlayGames');
  }

  view(): PlayGamesView {
    return { available: !!this.plugin, leaderboards: !!this.plugin && Object.keys(BOARD_IDS).length > 0, signedIn: this.signedIn };
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

  /**
   * Submits the studio's leaderboard scores that beat what was last sent. Cash and fans change
   * every week, so unless `now` is set this waits a minute between batches; Play Games keeps
   * each player's best anyway.
   */
  submitScores(s: GameState | null, now = false): void {
    if (!this.plugin || !this.signedIn || !s) return;
    if (!now && Date.now() - this.lastSubmit < SUBMIT_EVERY_MS) return;
    this.lastSubmit = Date.now();
    for (const board of LEADERBOARDS) {
      const id = BOARD_IDS[board.id];
      const score = board.score(s);
      if (!id || score <= 0 || score <= (this.submitted[board.id] ?? 0)) continue;
      this.submitted[board.id] = score;
      void this.plugin.submitScore({ id, score }).catch(() => {});
    }
  }

  showAchievements(): Promise<boolean> {
    return this.show((p) => p.showAchievements());
  }

  showLeaderboards(): Promise<boolean> {
    this.submitScores(this.state(), true);
    return this.show((p) => p.showLeaderboards());
  }

  private async show(open: (plugin: PlayGamesNative) => Promise<void>): Promise<boolean> {
    if (!this.plugin) return false;
    if (!this.signedIn && !(await this.signIn())) return false;
    try {
      await open(this.plugin);
      return true;
    } catch {
      return false;
    }
  }

  private update(signedIn: boolean) {
    const changed = signedIn !== this.signedIn;
    this.signedIn = signedIn;
    if (changed) this.submitted = {};
    if (signedIn) {
      this.unlock(this.unlocked());
      this.submitScores(this.state(), true);
    }
    if (changed) this.onChange();
  }
}
