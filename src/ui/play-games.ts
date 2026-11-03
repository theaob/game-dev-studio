/**
 * Google Play Games Services (Android app only): signs the player in, mirrors the game's
 * achievements to their Play Games profile, submits their best scores to the leaderboards and
 * keeps a copy of the save in their Play Games account (see cloud-save.ts). The native side is PlayGamesPlugin.java. The
 * Play Games IDs come from the build (PLAY_GAMES_RESOURCES, see README "Google Play Games");
 * without them, and on the web and itch.io, everything here is off.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { playGamesIds } from '../core/achievements';
import { LEADERBOARDS, leaderboardIds } from '../core/leaderboards';
import { formatShortDate } from '../core/time';
import type { GameState } from '../core/types';
import { saveCloudSynced } from '../save';
import type { CloudSave } from './cloud-save';

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
  loadSnapshot(options: { name: string }): Promise<{ found: boolean; data?: string; modified?: number }>;
  saveSnapshot(options: { name: string; data: string; description: string }): Promise<{ modified: number }>;
}

const IDS = playGamesIds(import.meta.env.VITE_PLAY_GAMES_RESOURCES);
const BOARD_IDS = leaderboardIds(import.meta.env.VITE_PLAY_GAMES_RESOURCES);
/** Cash and fans climb every week: send them at most this often (the best score is all that counts). */
const SUBMIT_EVERY_MS = 60_000;
/** The cloud save's slot name, and how often it's written while playing (it's also written on leaving the app). */
const SNAPSHOT = 'studio';
const UPLOAD_EVERY_MS = 2 * 60_000;

export interface PlayGamesView {
  /** Play Games is set up in this build (Android app with achievement IDs). */
  available: boolean;
  /** The build also has leaderboard IDs. */
  leaderboards: boolean;
  /** When the studio was last saved to the cloud in this session (ms), 0 if not yet. */
  cloudSavedAt: number;
  signedIn: boolean;
}

export class PlayGames {
  private plugin?: PlayGamesNative;
  private signedIn = false;
  /** The best score sent to each leaderboard since signing in, and when scores were last sent. */
  private submitted: Record<string, number> = {};
  private lastSubmit = 0;
  /**
   * Cloud save: writes wait until the app has checked the cloud save after signing in, so a
   * save from another device is never overwritten before the player has had their say.
   */
  private cloudChecked = false;
  private uploaded = '';
  private lastUpload = 0;
  private uploading = false;
  private uploadAgain = false;
  private cloudSavedAt = 0;
  /** Called when the player signs in, to check the cloud save. */
  onSignIn: () => void = () => {};
  /** Called when the sign-in state changes. */
  onChange: () => void = () => {};

  constructor(
    private unlocked: () => string[],
    private state: () => GameState | null,
  ) {
    if (Capacitor.isNativePlatform() && (Object.keys(IDS).length || Object.keys(BOARD_IDS).length)) this.plugin = registerPlugin<PlayGamesNative>('PlayGames');
  }

  view(): PlayGamesView {
    return { available: !!this.plugin, leaderboards: !!this.plugin && Object.keys(BOARD_IDS).length > 0, signedIn: this.signedIn, cloudSavedAt: this.cloudSavedAt };
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

  /** Reads the cloud save: null when there is none, undefined when it couldn't be read. */
  async readCloud(): Promise<CloudSave | null | undefined> {
    if (!this.plugin || !this.signedIn) return undefined;
    try {
      const r = await this.plugin.loadSnapshot({ name: SNAPSHOT });
      return r.found && r.data ? { data: r.data, modified: r.modified ?? 0 } : null;
    } catch {
      return undefined;
    }
  }

  /**
   * The cloud save has been dealt with (see cloud-save.ts): from now on the studio is written to
   * it. `modified` is when the cloud save the player kept or turned down was written.
   */
  cloudReady(modified?: number): void {
    if (modified !== undefined) saveCloudSynced(modified);
    this.cloudChecked = true;
  }

  /** The cloud save holds exactly this, so there's no need to write it again. */
  cloudHas(data: string): void {
    this.uploaded = data;
  }

  /**
   * Writes the studio to the cloud save when it has changed, at most every couple of minutes
   * unless `now` is set. Resolves with whether the cloud save now holds it.
   */
  async writeCloud(s: GameState | null, now = false): Promise<boolean> {
    if (!this.plugin || !this.signedIn || !this.cloudChecked || !s) return false;
    const data = JSON.stringify(s);
    if (data === this.uploaded) return true;
    if (!now && Date.now() - this.lastUpload < UPLOAD_EVERY_MS) return false;
    if (this.uploading) {
      this.uploadAgain = true;
      return false;
    }
    this.uploading = true;
    this.lastUpload = Date.now();
    try {
      const { modified } = await this.plugin.saveSnapshot({ name: SNAPSHOT, data, description: `${s.studioName} · ${formatShortDate(s.week)}` });
      saveCloudSynced(modified);
      this.uploaded = data;
      this.cloudSavedAt = Date.now();
      this.onChange();
      return true;
    } catch {
      return false;
    } finally {
      this.uploading = false;
      if (this.uploadAgain) {
        this.uploadAgain = false;
        void this.writeCloud(this.state(), true);
      }
    }
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
    if (changed) {
      this.submitted = {};
      this.cloudChecked = false;
      this.uploaded = '';
    }
    if (signedIn) {
      this.unlock(this.unlocked());
      this.submitScores(this.state(), true);
    }
    if (changed) this.onChange();
    if (changed && signedIn) this.onSignIn();
  }
}
