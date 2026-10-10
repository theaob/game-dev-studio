/**
 * Know-how: every hit a studio makes in a genre or on a topic teaches the team
 * more about it. Both level up from 1 to 5, and each level lets the team turn
 * out more design and tech points on the next game in that genre or on that
 * topic. Only games that reviewed well count, so careless studios learn little.
 * Derived from the released games, so it needs no saving.
 */
import type { GameSpec } from './types';

/** Hits needed for each level (index 0 = level 1). */
export const EXPERTISE_GAMES = [0, 1, 3, 6, 10];
export const MAX_EXPERTISE = EXPERTISE_GAMES.length;
/** A game has to review at least this well to teach the team anything. */
export const EXPERTISE_MIN_SCORE = 7.5;
/** Extra design and tech points per level above 1. */
export const GENRE_LEVEL_BONUS = 0.03;
export const TOPIC_LEVEL_BONUS = 0.01;

type Made = Pick<GameSpec, 'genre' | 'topic'> & { score: number };

export function expertiseLevel(hits: number): number {
  return EXPERTISE_GAMES.filter((n) => hits >= n).length;
}

export function genreHits(released: Made[], genre: string): number {
  return released.filter((g) => g.genre === genre && g.score >= EXPERTISE_MIN_SCORE).length;
}

export function topicHits(released: Made[], topic: string): number {
  return released.filter((g) => g.topic === topic && g.score >= EXPERTISE_MIN_SCORE).length;
}

export function genreLevel(released: Made[], genre: string): number {
  return expertiseLevel(genreHits(released, genre));
}

export function topicLevel(released: Made[], topic: string): number {
  return expertiseLevel(topicHits(released, topic));
}

/** How much more design and tech the team produces thanks to its know-how in this genre and topic. */
export function expertiseMult(released: Made[], genre: string, topic: string): number {
  return 1 + GENRE_LEVEL_BONUS * (genreLevel(released, genre) - 1) + TOPIC_LEVEL_BONUS * (topicLevel(released, topic) - 1);
}

/** Hits still needed for the next level, or null at the top level. */
export function hitsToNextLevel(hits: number): number | null {
  const level = expertiseLevel(hits);
  return level >= MAX_EXPERTISE ? null : EXPERTISE_GAMES[level] - hits;
}
