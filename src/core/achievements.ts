/**
 * Achievements: milestones across a whole career. Each one is a check on the
 * game state, so they unlock the moment the studio gets there, whatever caused
 * it. Unlocks belong to the device, not the save (see src/save.ts):
 * starting over keeps them, so they are a record of everything you've done.
 */
import { OFFICES, RESEARCH, STORE } from './data';
import { DECOR } from './decor';
import { acclaimOf } from './acclaim';
import { onSale, verdict } from './results';
import type { GameState } from './types';

export interface Achievement {
  id: string;
  name: string;
  icon: string;
  desc: string;
  /** Google Play Games points (multiples of 5, at most 1,000 in all). */
  points: number;
  done: (s: GameState) => boolean;
}

const upgrades = STORE.filter((i) => i.kind === 'upgrade').map((i) => i.id);

export const ACHIEVEMENTS: Achievement[] = [
  // Games
  { id: 'first_game', name: 'Hello, World', icon: '🎮', points: 10, desc: 'Release your first game.', done: (s) => s.released.length >= 1 },
  { id: 'ten_games', name: 'Prolific', icon: '📦', points: 25, desc: 'Release 10 games.', done: (s) => s.released.length >= 10 },
  { id: 'great_review', name: 'Rave Reviews', icon: '⭐', points: 15, desc: 'Release a game that reviews 8 or better.', done: (s) => s.released.some((g) => g.score >= 8) },
  { id: 'perfect_ten', name: 'Perfect Ten', icon: '💯', points: 100, desc: 'Release a game with a perfect 10.', done: (s) => s.released.some((g) => g.score >= 10) },
  { id: 'choice', name: "Critics' Choice", icon: '🏅', points: 40, desc: "Win a Critics' Choice award (9.0 or better).", done: (s) => s.released.some((g) => acclaimOf(g)) },
  { id: 'masterpiece', name: 'Masterpiece', icon: '👑', points: 60, desc: 'Make a Masterpiece (9.5 or better).', done: (s) => s.released.some((g) => acclaimOf(g)?.id === 'masterpiece') },
  { id: 'goty', name: 'Game of the Year', icon: '🏆', points: 50, desc: 'Win Game of the Year.', done: (s) => s.released.some((g) => g.goty !== undefined) },
  { id: 'sequel', name: 'Part Two', icon: '2️⃣', points: 15, desc: 'Release a sequel.', done: (s) => s.released.some((g) => (g.series ?? 1) >= 2) },
  { id: 'trilogy', name: 'Trilogy', icon: '3️⃣', points: 25, desc: 'Release the third game in a series.', done: (s) => s.released.some((g) => (g.series ?? 1) >= 3) },
  { id: 'blockbuster', name: 'Blockbuster', icon: '🎬', points: 50, desc: 'Finish selling a game that made 5 times what it cost.', done: (s) => s.released.some((g) => !onSale(g) && verdict(g).id === 'blockbuster') },

  // Money and fans
  { id: 'millionaire', name: 'Millionaire', icon: '💰', points: 30, desc: 'Have $1,000,000 in the bank.', done: (s) => s.cash >= 1_000_000 },
  { id: 'mogul', name: 'Mogul', icon: '🤑', points: 75, desc: 'Have $100,000,000 in the bank.', done: (s) => s.cash >= 100_000_000 },
  { id: 'fans', name: 'Fan Club', icon: '🙌', points: 30, desc: 'Win 100,000 fans.', done: (s) => s.fans >= 100_000 },
  { id: 'megafans', name: 'Household Name', icon: '🌍', points: 80, desc: 'Win 1,000,000 fans.', done: (s) => s.fans >= 1_000_000 },

  // Studio
  { id: 'first_hire', name: 'Not Alone', icon: '🤝', points: 10, desc: 'Hire your first employee.', done: (s) => s.staff.some((p) => !p.founder) },
  { id: 'rockstar', name: 'Rockstar', icon: '🎸', points: 30, desc: 'Hire a rockstar developer found by a headhunter.', done: (s) => s.staff.some((p) => p.rockstar) },
  { id: 'moved', name: 'Out of the Garage', icon: '🏢', points: 15, desc: 'Move into a real office.', done: (s) => s.officeLevel >= 1 },
  { id: 'campus', name: 'Campus Life', icon: '🏫', points: 50, desc: `Move to the ${OFFICES[OFFICES.length - 1].name}.`, done: (s) => s.officeLevel >= OFFICES.length - 1 },
  { id: 'kitted_out', name: 'Fully Kitted', icon: '🛠️', points: 40, desc: 'Buy every studio upgrade in the Store.', done: (s) => upgrades.every((id) => s.upgrades?.includes(id)) },
  { id: 'decorator', name: 'Interior Designer', icon: '🎨', points: 30, desc: 'Buy every decoration for the studio.', done: (s) => DECOR.every((d) => s.decor?.owned?.includes(d.id)) },
  { id: 'researcher', name: 'Know-It-All', icon: '🔬', points: 60, desc: 'Research everything.', done: (s) => RESEARCH.every((r) => s.researched.includes(r.id)) },
  { id: 'expo', name: 'Center Stage', icon: '🎪', points: 30, desc: 'Exhibit on the big stage at GameExpo.', done: (s) => s.expo?.booth === 'big' && !!s.expo.report },
  { id: 'cat', name: 'Lap Cat', icon: '🐈', points: 10, desc: "Have the studio cat curl up on someone's lap.", done: (s) => !!s.cat?.lap },

  // Survival
  { id: 'bailout', name: 'Second Chance', icon: '🏦', points: 20, desc: 'Survive bankruptcy with the bailout.', done: (s) => !!s.bailoutUsed && !s.over },
  { id: 'legacy', name: 'Legacy', icon: '🎂', points: 100, desc: 'Keep the studio going until 2025.', done: (s) => s.over === 'retired' },
];

export function achievementById(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

/** Achievements the state has earned that aren't in `unlocked` yet, in list order. */
export function newAchievements(s: GameState, unlocked: ReadonlySet<string>): Achievement[] {
  return ACHIEVEMENTS.filter((a) => !unlocked.has(a.id) && a.done(s));
}

/**
 * Play Games achievement IDs by in-game id, from the build's PLAY_GAMES_RESOURCES: either the
 * Android resources XML the Play Console exports (Achievements → Get resources), whose string
 * names come from the achievement names, or a JSON object of in-game id → Play Games ID.
 */
export function playGamesIds(config: string | undefined): Record<string, string> {
  const text = config?.trim() ?? '';
  if (!text) return {};
  const known = new Set(ACHIEVEMENTS.map((a) => a.id));
  if (text.startsWith('{')) {
    try {
      const data = JSON.parse(text) as Record<string, unknown>;
      return Object.fromEntries(Object.entries(data).filter((e): e is [string, string] => known.has(e[0]) && typeof e[1] === 'string' && !!e[1]));
    } catch {
      return {};
    }
  }
  // "Know-It-All" is exported as achievement_knowitall, "Hello, World" as achievement_hello_world.
  const key = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const byName = new Map(ACHIEVEMENTS.map((a) => [key(a.name), a.id]));
  const ids: Record<string, string> = {};
  for (const [, name, value] of text.matchAll(/<string\s+name="achievement_([^"]+)"[^>]*>\s*([^<\s]+)\s*<\/string>/g)) {
    const id = byName.get(key(name));
    if (id) ids[id] = value;
  }
  return ids;
}
