/**
 * One-line quotes for review cards: what each outlet said about a game, so a
 * score reads like a review and not just a number. The quote depends on the
 * outlet's own score and what stood out (bugs, a sequel, the genre), and is
 * always the same for the same game, so reopening a game shows the same reviews.
 */
import { genreById, topicById } from './data';
import type { ReleasedGame } from './types';

/** Quotes by score band, low to high. `{topic}` and `{genre}` are filled in. */
const BANDS: { min: number; quotes: string[] }[] = [
  { min: 0, quotes: ['Avoid at all costs.', 'We want our weekend back.', 'A new low for {genre} games.', 'Not even the box art works.'] },
  { min: 3, quotes: ['A chore from start to finish.', 'Some ideas, none of them finished.', 'Only for die-hard {genre} fans.', 'Wait for the bargain bin.'] },
  { min: 5, quotes: ['Perfectly fine, perfectly forgettable.', 'Fun in short bursts.', 'Solid, if a little safe.', 'A decent {topic} romp.'] },
  { min: 7, quotes: ['Hard to put down.', 'A really good {genre} game.', 'Charming and clever.', 'We lost a whole weekend to it.'] },
  { min: 9, quotes: ['An instant classic.', 'The best {genre} game in years.', 'Buy it. Buy it now.', 'Sets a new bar for {topic} games.'] },
  { min: 10, quotes: ['Flawless.', 'A perfect game. Truly.', 'Games will be measured against this.', 'This is why we play games.'] },
];

const BUGGY = ['Crashed on us three times.', 'Fun, when it works.', 'Needs a patch, badly.', 'More bugs than a rainforest.'];
const SEQUEL_GOOD = ['Even better than the first.', 'A sequel done right.', 'More of what fans love.'];
const SEQUEL_BAD = ['The original was better.', 'Running out of ideas?', 'A sequel nobody needed.'];

/** Small deterministic hash so each outlet picks its own line for each game. */
function hash(a: number, b: number): number {
  let h = (a * 2654435761) ^ (b * 40503);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Bug share above which reviewers start to complain about them. */
const BUGGY_SHARE = 0.06;

/** What outlet `i` said about the game. */
export function reviewQuote(g: ReleasedGame, i: number): string {
  const score = g.reviews[i] ?? g.score;
  const h = hash(g.id + 1, i + 1);
  const buggy = g.bugs / Math.max(1, g.design + g.tech) > BUGGY_SHARE;
  const sequel = (g.series ?? 1) > 1;
  let pool: string[];
  // Some outlets talk about what stood out instead of the score alone.
  if (buggy && score < 9 && h % 3 === 0) pool = BUGGY;
  else if (sequel && h % 4 === 1) pool = score >= 7 ? SEQUEL_GOOD : SEQUEL_BAD;
  else pool = [...BANDS].reverse().find((b) => score >= b.min)!.quotes;
  // Outlets step through the pool from a per-game start, so two outlets with the same score say different things.
  const line = pool[(hash(g.id + 1, 0) + i) % pool.length];
  return line.replace('{genre}', genreById(g.genre).name).replace('{topic}', topicById(g.topic).name);
}
