/**
 * Achievements: milestones across a whole career. Each one is a check on the
 * game state, so they unlock the moment the studio gets there, whatever caused
 * it. Unlocks belong to the device, not the save (see src/save.ts):
 * starting over keeps them, so they are a record of everything you've done.
 */
import { OFFICES, PERFECT_FIT, RESEARCH, STORE } from './data';
import { DECOR } from './decor';
import { acclaimOf } from './acclaim';
import { onSale, verdict } from './results';
import type { GameState } from './types';

export interface Achievement {
  id: string;
  name: string;
  icon: string;
  desc: string;
  done: (s: GameState) => boolean;
}

const upgrades = STORE.filter((i) => i.kind === 'upgrade').map((i) => i.id);

export const ACHIEVEMENTS: Achievement[] = [
  // Games
  { id: 'first_game', name: 'Hello, World', icon: '🎮', desc: 'Release your first game.', done: (s) => s.released.length >= 1 },
  { id: 'ten_games', name: 'Prolific', icon: '📦', desc: 'Release 10 games.', done: (s) => s.released.length >= 10 },
  { id: 'great_review', name: 'Rave Reviews', icon: '⭐', desc: 'Release a game that reviews 8 or better.', done: (s) => s.released.some((g) => g.score >= 8) },
  { id: 'perfect_ten', name: 'Perfect Ten', icon: '💯', desc: 'Release a game with a perfect 10.', done: (s) => s.released.some((g) => g.score >= 10) },
  { id: 'choice', name: "Critics' Choice", icon: '🏅', desc: "Win a Critics' Choice award (9.0 or better).", done: (s) => s.released.some((g) => acclaimOf(g)) },
  { id: 'masterpiece', name: 'Masterpiece', icon: '👑', desc: 'Make a Masterpiece (9.5 or better).', done: (s) => s.released.some((g) => acclaimOf(g)?.id === 'masterpiece') },
  { id: 'goty', name: 'Game of the Year', icon: '🏆', desc: 'Win Game of the Year.', done: (s) => s.released.some((g) => g.goty !== undefined) },
  { id: 'sequel', name: 'Part Two', icon: '2️⃣', desc: 'Release a sequel.', done: (s) => s.released.some((g) => (g.series ?? 1) >= 2) },
  { id: 'trilogy', name: 'Trilogy', icon: '3️⃣', desc: 'Release the third game in a series.', done: (s) => s.released.some((g) => (g.series ?? 1) >= 3) },
  { id: 'perfect_combo', name: 'Perfect Match', icon: '💞', desc: 'Discover a perfect topic and genre combination.', done: (s) => Object.values(s.knowledge.combos).includes(PERFECT_FIT) },
  { id: 'blockbuster', name: 'Blockbuster', icon: '🎬', desc: 'Finish selling a game that made 5 times what it cost.', done: (s) => s.released.some((g) => !onSale(g) && verdict(g).id === 'blockbuster') },

  // Money and fans
  { id: 'millionaire', name: 'Millionaire', icon: '💰', desc: 'Have $1,000,000 in the bank.', done: (s) => s.cash >= 1_000_000 },
  { id: 'mogul', name: 'Mogul', icon: '🤑', desc: 'Have $100,000,000 in the bank.', done: (s) => s.cash >= 100_000_000 },
  { id: 'fans', name: 'Fan Club', icon: '🙌', desc: 'Win 100,000 fans.', done: (s) => s.fans >= 100_000 },
  { id: 'megafans', name: 'Household Name', icon: '🌍', desc: 'Win 1,000,000 fans.', done: (s) => s.fans >= 1_000_000 },

  // Studio
  { id: 'first_hire', name: 'Not Alone', icon: '🤝', desc: 'Hire your first employee.', done: (s) => s.staff.some((p) => !p.founder) },
  { id: 'rockstar', name: 'Rockstar', icon: '🎸', desc: 'Hire a rockstar developer found by a headhunter.', done: (s) => s.staff.some((p) => p.rockstar) },
  { id: 'moved', name: 'Out of the Garage', icon: '🏢', desc: 'Move into a real office.', done: (s) => s.officeLevel >= 1 },
  { id: 'campus', name: 'Campus Life', icon: '🏫', desc: `Move to the ${OFFICES[OFFICES.length - 1].name}.`, done: (s) => s.officeLevel >= OFFICES.length - 1 },
  { id: 'kitted_out', name: 'Fully Kitted', icon: '🛠️', desc: 'Buy every studio upgrade in the Store.', done: (s) => upgrades.every((id) => s.upgrades?.includes(id)) },
  { id: 'decorator', name: 'Interior Designer', icon: '🎨', desc: 'Buy every decoration for the studio.', done: (s) => DECOR.every((d) => s.decor?.owned?.includes(d.id)) },
  { id: 'researcher', name: 'Know-It-All', icon: '🔬', desc: 'Research everything.', done: (s) => RESEARCH.every((r) => s.researched.includes(r.id)) },
  { id: 'expo', name: 'Center Stage', icon: '🎪', desc: 'Exhibit on the big stage at GameExpo.', done: (s) => s.expo?.booth === 'big' && !!s.expo.report },
  { id: 'cat', name: 'Lap Cat', icon: '🐈', desc: "Have the studio cat curl up on someone's lap.", done: (s) => !!s.cat?.lap },

  // Survival
  { id: 'bailout', name: 'Second Chance', icon: '🏦', desc: 'Survive bankruptcy with the bailout.', done: (s) => !!s.bailoutUsed && !s.over },
  { id: 'legacy', name: 'Legacy', icon: '🎂', desc: 'Keep the studio going until 2025.', done: (s) => s.over === 'retired' },
];

export function achievementById(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

/** Achievements the state has earned that aren't in `unlocked` yet, in list order. */
export function newAchievements(s: GameState, unlocked: ReadonlySet<string>): Achievement[] {
  return ACHIEVEMENTS.filter((a) => !unlocked.has(a.id) && a.done(s));
}
