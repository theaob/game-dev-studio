/**
 * Cloud saves through Google Play Games (Android app only): one save slot that follows the
 * player's Play Games account. This decides what to do when the app finds the cloud save;
 * the reading and writing is in play-games.ts and PlayGamesPlugin.java.
 */

export interface CloudSave {
  /** The save, as the game stores it (JSON). */
  data: string;
  /** When it was written, in ms. */
  modified: number;
}

/**
 * - `upload`: the cloud save is missing or is one this device wrote or already dealt with, so
 *   this device's studio replaces it.
 * - `same`: it holds exactly this device's studio.
 * - `ask`: another device has written it since: let the player choose which studio to keep.
 */
export type CloudChoice = 'upload' | 'same' | 'ask';

/**
 * @param local this device's save (JSON), or null before a studio is founded.
 * @param synced when the cloud save this device last wrote, loaded or turned down was written.
 */
export function cloudChoice(cloud: CloudSave | null, local: string | null, synced: number): CloudChoice {
  if (!cloud) return 'upload';
  if (cloud.data === local) return 'same';
  if (cloud.modified <= synced) return 'upload';
  return 'ask';
}
