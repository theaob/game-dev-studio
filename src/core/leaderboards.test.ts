import { describe, expect, it } from 'vitest';
import { LEADERBOARDS, leaderboardIds } from './leaderboards';
import { createGame } from './sim';
import type { GameState, ReleasedGame } from './types';

const scores = (s: GameState) => Object.fromEntries(LEADERBOARDS.map((b) => [b.id, b.score(s)]));

describe('leaderboards', () => {
  it('have unique ids and names', () => {
    expect(new Set(LEADERBOARDS.map((b) => b.id)).size).toBe(LEADERBOARDS.length);
    expect(new Set(LEADERBOARDS.map((b) => b.name)).size).toBe(LEADERBOARDS.length);
  });

  it('score a career in the units Play Games expects', () => {
    const s = createGame('Test');
    s.cash = 1_234_567.89;
    s.fans = 4321.5;
    s.released.push({ score: 8.46, revenue: 250_000.5 } as ReleasedGame, { score: 9.04, revenue: 90_000 } as ReleasedGame);
    expect(scores(s)).toEqual({ best_review: 90, biggest_hit: 250_000_000_000, richest_studio: 1_234_567_000_000, most_fans: 4321 });
    // A late-game fortune still fits exactly in a JavaScript number and a Java long.
    s.cash = 2e9;
    expect(Number.isSafeInteger(LEADERBOARDS.find((b) => b.id === 'richest_studio')!.score(s))).toBe(true);
  });

  it('have nothing to submit for a new studio in debt', () => {
    const s = createGame('Test');
    s.cash = -5000;
    s.fans = 0;
    expect(scores(s)).toEqual({ best_review: 0, biggest_hit: 0, richest_studio: 0, most_fans: 0 });
  });

  it('find their IDs in the resources XML by name, alongside the achievements', () => {
    const xml = `<resources>
  <string name="app_id" translatable="false">123456789012</string>
  <string name="achievement_hello_world" translatable="false">CgkIA1</string>
  <string name="leaderboard_best_review" translatable="false">CgkIL1</string>
  <string name="leaderboard_richest_studio" translatable="false">CgkIL2</string>
  <string name="leaderboard_something_else" translatable="false">CgkIL3</string>
</resources>`;
    expect(leaderboardIds(xml)).toEqual({ best_review: 'CgkIL1', richest_studio: 'CgkIL2' });
    expect(leaderboardIds('{"most_fans":"CgkIL4","first_game":"x"}')).toEqual({ most_fans: 'CgkIL4' });
  });

  // CI runs this with the repository's PLAY_GAMES_RESOURCES variable, once it is set.
  it.runIf(!!process.env.PLAY_GAMES_RESOURCES)('the configured Play Games resources cover every leaderboard', () => {
    const ids = leaderboardIds(process.env.PLAY_GAMES_RESOURCES);
    expect(LEADERBOARDS.filter((b) => !ids[b.id]).map((b) => b.name)).toEqual([]);
  });
});
