/**
 * Google Play Games leaderboards: a career's best, compared with other players. Each board reads
 * its score straight from the game state, and Play Games keeps each player's best, so the
 * Android app simply submits the current value whenever it improves (see src/ui/play-games.ts).
 * The boards are set up in the Play Console to match (store/play-games/leaderboards.csv): the
 * names must match exactly, since the game finds each board's ID by name.
 */
import { playResourceIds } from './play-resources';
import type { GameState } from './types';

export interface Leaderboard {
  id: string;
  name: string;
  icon: string;
  desc: string;
  /**
   * How the Play Console shows the score, which decides how it's submitted: `decimal` is a number
   * with one decimal place (submitted ×10), `currency` is US dollars (submitted in millionths of a
   * dollar, as Play Games expects), `integer` is a whole number.
   */
  format: 'decimal' | 'currency' | 'integer';
  /** The score to submit, 0 when there's nothing to submit yet. */
  score: (s: GameState) => number;
}

const MICROS = 1_000_000;

export const LEADERBOARDS: Leaderboard[] = [
  {
    id: 'best_review',
    name: 'Best Review',
    icon: '🌟',
    desc: 'The best review score of any game you released.',
    format: 'decimal',
    score: (s) => Math.round(Math.max(0, ...s.released.map((g) => g.score)) * 10),
  },
  {
    id: 'biggest_hit',
    name: 'Biggest Hit',
    icon: '💿',
    desc: 'The most money a single game made.',
    format: 'currency',
    score: (s) => Math.floor(Math.max(0, ...s.released.map((g) => g.revenue))) * MICROS,
  },
  {
    id: 'richest_studio',
    name: 'Richest Studio',
    icon: '💎',
    desc: 'The most money in the bank.',
    format: 'currency',
    score: (s) => Math.floor(Math.max(0, s.cash)) * MICROS,
  },
  {
    id: 'most_fans',
    name: 'Most Fans',
    icon: '📣',
    desc: 'The most fans a studio won.',
    format: 'integer',
    score: (s) => Math.floor(Math.max(0, s.fans)),
  },
];

/** Play Games leaderboard IDs by in-game id, from the build's PLAY_GAMES_RESOURCES (see play-resources.ts). */
export function leaderboardIds(config: string | undefined): Record<string, string> {
  return playResourceIds(config, 'leaderboard', LEADERBOARDS);
}
