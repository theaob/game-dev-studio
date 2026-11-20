import type { GenreId, MarketingId, SizeId } from './types';

// ---------------------------------------------------------------------------
// Development areas: 3 phases x 3 areas. `designShare` is the fraction of
// effort in that area that turns into design points (the rest is tech).
// ---------------------------------------------------------------------------

export interface Area {
  id: string;
  name: string;
  designShare: number;
}

export const PHASES: { name: string; areas: Area[] }[] = [
  {
    name: 'Foundation',
    areas: [
      { id: 'engine', name: 'Engine', designShare: 0.2 },
      { id: 'gameplay', name: 'Gameplay', designShare: 0.8 },
      { id: 'story', name: 'Story', designShare: 0.9 },
    ],
  },
  {
    name: 'Content',
    areas: [
      { id: 'dialogue', name: 'Dialogue', designShare: 0.85 },
      { id: 'level', name: 'Level Design', designShare: 0.6 },
      { id: 'ai', name: 'AI', designShare: 0.2 },
    ],
  },
  {
    name: 'Presentation',
    areas: [
      { id: 'world', name: 'World Design', designShare: 0.7 },
      { id: 'graphics', name: 'Graphics', designShare: 0.35 },
      { id: 'sound', name: 'Sound', designShare: 0.5 },
    ],
  },
];

export const AREAS: Area[] = PHASES.flatMap((p) => p.areas);

// ---------------------------------------------------------------------------
// Genres. `importance` has one entry per area (9): 1.5 high, 1 normal, 0.5 low.
// `designTarget` is the ideal share of design points vs. tech points.
// Genres with `research` have to be researched before they can be made.
// ---------------------------------------------------------------------------

export interface Genre {
  id: GenreId;
  name: string;
  icon: string;
  importance: number[];
  designTarget: number;
  research?: string;
}

export const GENRES: Genre[] = [
  { id: 'action', name: 'Action', icon: '💥', importance: [1.5, 1.5, 0.5, 0.5, 1.5, 1, 0.5, 1.5, 1], designTarget: 0.4 },
  { id: 'adventure', name: 'Adventure', icon: '🗺️', importance: [0.5, 1, 1.5, 1.5, 1, 0.5, 1.5, 1, 1], designTarget: 0.7 },
  { id: 'rpg', name: 'RPG', icon: '🧙', importance: [0.5, 1, 1.5, 1.5, 0.5, 1, 1.5, 1, 1], designTarget: 0.65 },
  { id: 'simulation', name: 'Simulation', icon: '⚙️', importance: [1.5, 1.5, 0.5, 0.5, 1, 1.5, 1, 1, 0.5], designTarget: 0.4 },
  { id: 'strategy', name: 'Strategy', icon: '♟️', importance: [1, 1.5, 0.5, 0.5, 1, 1.5, 1.5, 0.5, 0.5], designTarget: 0.55 },
  { id: 'puzzle', name: 'Puzzle', icon: '🧩', importance: [0.5, 1.5, 0.5, 0.5, 1.5, 1, 0.5, 1, 1.5], designTarget: 0.6 },
  { id: 'casual', name: 'Casual', icon: '🎈', importance: [0.5, 1.5, 0.5, 0.5, 1.5, 0.5, 0.5, 1.5, 1.5], designTarget: 0.6 },
  { id: 'platformer', name: 'Platformer', icon: '🏃', importance: [1, 1.5, 0.5, 0.5, 1.5, 0.5, 1, 1.5, 1], designTarget: 0.55, research: 'genre_platformer' },
  { id: 'shooter', name: 'Shooter', icon: '🎯', importance: [1.5, 1.5, 0.5, 0.5, 1, 1.5, 0.5, 1.5, 1], designTarget: 0.35, research: 'genre_shooter' },
  { id: 'rhythm', name: 'Rhythm', icon: '🥁', importance: [0.5, 1.5, 0.5, 0.5, 1, 0.5, 1, 1, 1.5], designTarget: 0.6, research: 'genre_rhythm' },
];

export const GENRE_IDS = GENRES.map((g) => g.id);

export function genreById(id: string): Genre {
  const g = GENRES.find((x) => x.id === id);
  if (!g) throw new Error(`Unknown genre ${id}`);
  return g;
}

// ---------------------------------------------------------------------------
// Topics. `fit` is per genre (GENRES order): 4 perfect, 3 great, 2 good, 1 okay,
// 0 bad. Perfect combos are rare (one or two per genre) and look like any other
// until the studio releases a game with one.
// ---------------------------------------------------------------------------

export interface Topic {
  id: string;
  name: string;
  icon: string;
  fit: number[];
  /** Research cost in RP; 0 = available from the start. */
  cost: number;
}

export const TOPICS: Topic[] = [
  { id: 'fantasy', name: 'Fantasy', icon: '🐉', fit: [2, 3, 4, 1, 2, 1, 1, 2, 1, 1], cost: 0 },
  { id: 'scifi', name: 'Sci-Fi', icon: '👽', fit: [3, 2, 3, 2, 3, 1, 1, 2, 4, 1], cost: 0 },
  { id: 'racing', name: 'Racing', icon: '🏎️', fit: [3, 0, 0, 4, 0, 1, 2, 1, 1, 1], cost: 0 },
  { id: 'sports', name: 'Sports', icon: '⚽', fit: [2, 0, 1, 3, 2, 0, 2, 1, 0, 2], cost: 0 },
  { id: 'medieval', name: 'Medieval', icon: '🏰', fit: [2, 2, 3, 2, 4, 0, 1, 1, 1, 0], cost: 0 },
  { id: 'pirates', name: 'Pirates', icon: '🏴‍☠️', fit: [3, 4, 2, 1, 2, 1, 1, 2, 2, 1], cost: 0 },
  { id: 'detective', name: 'Detective', icon: '🕵️', fit: [1, 3, 2, 0, 1, 4, 1, 0, 1, 0], cost: 0 },
  { id: 'space', name: 'Space', icon: '🚀', fit: [3, 2, 2, 3, 4, 2, 1, 2, 3, 1], cost: 0 },
  { id: 'horror', name: 'Horror', icon: '👻', fit: [3, 3, 2, 0, 1, 2, 0, 1, 3, 0], cost: 8 },
  { id: 'zombies', name: 'Zombies', icon: '🧟', fit: [3, 2, 1, 1, 2, 1, 2, 2, 4, 1], cost: 8 },
  { id: 'farming', name: 'Farming', icon: '🌾', fit: [0, 1, 1, 4, 2, 1, 3, 1, 0, 1], cost: 8 },
  { id: 'military', name: 'Military', icon: '🎖️', fit: [3, 1, 1, 2, 3, 0, 0, 1, 3, 0], cost: 10 },
  { id: 'dungeon', name: 'Dungeon', icon: '🗝️', fit: [3, 2, 4, 0, 2, 2, 1, 2, 2, 0], cost: 10 },
  { id: 'music', name: 'Music', icon: '🎵', fit: [1, 1, 0, 2, 0, 2, 3, 2, 0, 4], cost: 10 },
  { id: 'mystery', name: 'Mystery', icon: '🔍', fit: [0, 4, 1, 0, 1, 3, 1, 1, 0, 0], cost: 10 },
  { id: 'school', name: 'School', icon: '🏫', fit: [0, 2, 2, 3, 0, 2, 3, 1, 0, 2], cost: 12 },
  { id: 'ninja', name: 'Ninja', icon: '🥷', fit: [3, 2, 2, 0, 1, 1, 1, 4, 2, 1], cost: 12 },
  { id: 'dinosaurs', name: 'Dinosaurs', icon: '🦖', fit: [3, 3, 1, 2, 2, 1, 2, 3, 2, 1], cost: 12 },
  { id: 'city', name: 'City Building', icon: '🏙️', fit: [0, 0, 1, 3, 3, 2, 2, 0, 1, 0], cost: 15 },
  { id: 'cooking', name: 'Cooking', icon: '🍳', fit: [0, 0, 0, 3, 1, 3, 4, 1, 0, 2], cost: 15 },
  { id: 'superheroes', name: 'Superheroes', icon: '🦸', fit: [4, 2, 2, 0, 1, 1, 1, 3, 2, 1], cost: 18 },
  { id: 'cyberpunk', name: 'Cyberpunk', icon: '🤖', fit: [3, 3, 3, 1, 2, 1, 0, 2, 3, 2], cost: 20 },
  { id: 'romance', name: 'Romance', icon: '💘', fit: [0, 3, 2, 2, 0, 1, 3, 0, 0, 2], cost: 20 },
  { id: 'apocalypse', name: 'Post-Apocalyptic', icon: '☢️', fit: [3, 3, 3, 2, 3, 0, 0, 1, 3, 0], cost: 25 },
];

export function topicById(id: string): Topic {
  const t = TOPICS.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown topic ${id}`);
  return t;
}

export function topicFit(topicId: string, genreId: GenreId): number {
  return topicById(topicId).fit[GENRE_IDS.indexOf(genreId)];
}

export const FIT_LABELS = ['Bad', 'Okay', 'Good', 'Great', 'Perfect'];
export const PERFECT_FIT = 4;

// ---------------------------------------------------------------------------
// Platforms. `users` is a curve of [year, millions of users]; linear between
// points. Platforms are available from `start` until (not including) `end`.
// ---------------------------------------------------------------------------

export interface Platform {
  id: string;
  name: string;
  icon: string;
  kind: string;
  start: number;
  end?: number;
  users: [number, number][];
  license: number;
  /** Revenue per unit multiplier (mobile games are cheap). */
  priceMult: number;
  genreFit: Partial<Record<GenreId, number>>;
  /** Who makes it: they present it at its launch keynote. */
  maker?: string;
  /** The line the keynote ends its reveal on. */
  tagline?: string;
  /**
   * The year the maker announces it at the summer show, when that's earlier than
   * the usual rumour the January before launch.
   */
  announced?: number;
  /** What it's called until the maker reveals the real name, the January before launch. */
  codename?: string;
}

export const PLATFORMS: Platform[] = [
  { id: 'pc', name: 'PC', icon: '🖥️', kind: 'Computer', start: 1985, users: [[1985, 3], [1995, 40], [2005, 150], [2015, 220], [2026, 260]], license: 0, priceMult: 1, genreFit: { strategy: 1.25, simulation: 1.2, casual: 0.85, shooter: 1.15, rhythm: 0.85 } },
  { id: 'nova8', name: 'Nova 8', icon: '🕹️', kind: 'Console', start: 1985, end: 1994, users: [[1985, 2], [1989, 28], [1994, 6]], license: 20000, priceMult: 1, genreFit: { action: 1.2, adventure: 1.1, simulation: 0.8, strategy: 0.7, platformer: 1.25 }, maker: 'Novaworks', tagline: 'Arcade fun, right in your living room.' },
  { id: 'zephyr', name: 'Zephyr Drive', icon: '🎮', kind: 'Console', start: 1989, end: 1998, users: [[1989, 2], [1993, 22], [1998, 4]], license: 35000, priceMult: 1, genreFit: { action: 1.25, puzzle: 0.9, strategy: 0.8, platformer: 1.3 }, maker: 'Zephyr Corp', tagline: '16 bits. Twice the speed. Zero patience.', announced: 1988 },
  { id: 'pocketpal', name: 'Pocket Pal', icon: '📟', kind: 'Handheld', start: 1990, end: 2003, users: [[1990, 3], [1996, 45], [2003, 10]], license: 25000, priceMult: 0.8, genreFit: { puzzle: 1.3, casual: 1.2, rpg: 1.1, strategy: 0.8, simulation: 0.8, platformer: 1.2, rhythm: 1.1 }, maker: 'Novaworks', tagline: 'The whole arcade, in your pocket.' },
  { id: 'supernova', name: 'Super Nova', icon: '🎮', kind: 'Console', start: 1991, end: 2000, users: [[1991, 3], [1995, 40], [2000, 6]], license: 40000, priceMult: 1, genreFit: { rpg: 1.25, platformer: 1.25, action: 1.1, adventure: 1.1, simulation: 0.85, shooter: 0.9 }, maker: 'Novaworks', tagline: 'Sixteen bits. Every colour of the rainbow.', announced: 1990 },
  { id: 'cheetah', name: 'Arcadium Cheetah', icon: '🐆', kind: 'Console', start: 1993, end: 1996, users: [[1993, 0.3], [1994, 1], [1996, 0.2]], license: 30000, priceMult: 1, genreFit: { shooter: 1.15, action: 1.1, rpg: 0.8, platformer: 0.9 }, maker: 'Arcadium', tagline: 'Do the math: the first 64-bit console.', announced: 1992 },
  { id: 'spectra', name: 'Spectra', icon: '💿', kind: 'Console', start: 1995, end: 2006, users: [[1995, 3], [1999, 60], [2006, 12]], license: 80000, priceMult: 1, genreFit: { rpg: 1.2, action: 1.1, strategy: 0.85, rhythm: 1.25, platformer: 1.1 }, maker: 'Spectra Entertainment', tagline: 'Games on disc. Worlds in 3D.', announced: 1994 },
  { id: 'zephyrorbit', name: 'Zephyr Orbit', icon: '🪐', kind: 'Console', start: 1995, end: 1999, users: [[1995, 2], [1997, 9], [1999, 2]], license: 70000, priceMult: 1, genreFit: { action: 1.15, rpg: 1.1, shooter: 1.05, platformer: 0.9, casual: 0.85 }, maker: 'Zephyr Corp', tagline: 'Two processors. The arcade, at home.', announced: 1994 },
  { id: 'hyperion', name: 'Hyperion 64', icon: '🎮', kind: 'Console', start: 1996, end: 2003, users: [[1996, 3], [1999, 26], [2003, 5]], license: 70000, priceMult: 1, genreFit: { action: 1.2, adventure: 1.15, casual: 1.1, rpg: 0.9, platformer: 1.3, shooter: 1.1 }, maker: 'Novaworks', tagline: 'Sixty-four bits of pure play.', announced: 1994, codename: 'Project Horizon' },
  { id: 'zephyrstar', name: 'Zephyr Starcast', icon: '🌀', kind: 'Console', start: 1999, end: 2001, users: [[1999, 3], [2000, 9], [2001, 4]], license: 90000, priceMult: 1, genreFit: { action: 1.2, shooter: 1.15, rhythm: 1.2, adventure: 1.05, strategy: 0.85 }, maker: 'Zephyr Corp', tagline: 'The first console that plays online, out of the box.', announced: 1998 },
  { id: 'spectra2', name: 'Spectra 2', icon: '💿', kind: 'Console', start: 2000, end: 2013, users: [[2000, 5], [2005, 120], [2013, 25]], license: 150000, priceMult: 1, genreFit: { rpg: 1.15, action: 1.15, strategy: 0.85, rhythm: 1.2, shooter: 1.05 }, maker: 'Spectra Entertainment', tagline: 'It plays games. It plays movies. It plays everything.', announced: 1998 },
  { id: 'pocketadvance', name: 'Pocket Pal Advance', icon: '🔋', kind: 'Handheld', start: 2001, end: 2009, users: [[2001, 5], [2005, 80], [2009, 8]], license: 50000, priceMult: 0.8, genreFit: { platformer: 1.25, rpg: 1.2, puzzle: 1.15, action: 1.05, casual: 1.1, shooter: 0.85 }, maker: 'Novaworks', tagline: 'Sixteen-bit classics, wherever you go.', announced: 2000 },
  { id: 'novacube', name: 'Nova Cube', icon: '🧊', kind: 'Console', start: 2001, end: 2007, users: [[2001, 3], [2004, 20], [2007, 4]], license: 120000, priceMult: 1, genreFit: { platformer: 1.25, adventure: 1.15, action: 1.1, casual: 1.05, strategy: 0.8, shooter: 0.9 }, maker: 'Novaworks', tagline: 'Small box. Big worlds.', announced: 1999, codename: 'Project Porpoise' },
  { id: 'monolith', name: 'Monolith X', icon: '⬛', kind: 'Console', start: 2002, end: 2010, users: [[2002, 3], [2006, 25], [2010, 8]], license: 150000, priceMult: 1, genreFit: { action: 1.25, strategy: 0.9, casual: 0.85, shooter: 1.35 }, maker: 'Vantage Systems', tagline: 'Built like a server. Plays like a dream.', announced: 2000, codename: 'Project Blackbox' },
  { id: 'njoy', name: 'N-Joy', icon: '☎️', kind: 'Phone', start: 2003, end: 2006, users: [[2003, 0.5], [2004, 2], [2006, 1]], license: 30000, priceMult: 0.8, genreFit: { casual: 1.15, puzzle: 1.1, action: 0.9, platformer: 0.85, rpg: 0.9 }, maker: 'Nordia', tagline: 'Your phone is now a console. Hold it sideways to talk.', announced: 2002 },
  { id: 'pocketduo', name: 'Pocket Duo', icon: '📱', kind: 'Handheld', start: 2004, end: 2015, users: [[2004, 5], [2009, 120], [2015, 30]], license: 120000, priceMult: 0.8, genreFit: { puzzle: 1.25, casual: 1.3, rpg: 1.1, action: 0.9, platformer: 1.2, rhythm: 1.2, shooter: 0.8 }, maker: 'Novaworks', tagline: 'Two screens. One touch. Endless play.' },
  { id: 'monolith2', name: 'Monolith 360', icon: '⬛', kind: 'Console', start: 2005, end: 2016, users: [[2005, 5], [2010, 85], [2016, 20]], license: 250000, priceMult: 1, genreFit: { action: 1.25, simulation: 1.05, casual: 0.85, shooter: 1.35 }, maker: 'Vantage Systems', tagline: 'Online. HD. Always on.', announced: 2004 },
  { id: 'spectraportable', name: 'Spectra Portable', icon: '🎴', kind: 'Handheld', start: 2005, end: 2015, users: [[2005, 4], [2009, 70], [2015, 6]], license: 120000, priceMult: 0.8, genreFit: { action: 1.15, rpg: 1.15, rhythm: 1.15, shooter: 1.05, puzzle: 0.9, casual: 0.85 }, maker: 'Spectra Entertainment', tagline: 'Console power. In your hands.', announced: 2003 },
  { id: 'wave', name: 'Wave', icon: '🌊', kind: 'Console', start: 2006, end: 2014, users: [[2006, 8], [2009, 95], [2014, 20]], license: 180000, priceMult: 1, genreFit: { casual: 1.4, puzzle: 1.1, action: 0.9, strategy: 0.7, rpg: 0.8, rhythm: 1.35, platformer: 1.2, shooter: 0.75 }, maker: 'Novaworks', tagline: 'Get off the couch. Play with your whole body.', announced: 2004, codename: 'Project Ripple' },
  { id: 'spectra3', name: 'Spectra 3', icon: '💿', kind: 'Console', start: 2006, end: 2016, users: [[2006, 4], [2010, 80], [2016, 20]], license: 250000, priceMult: 1, genreFit: { rpg: 1.15, action: 1.15, casual: 0.85, shooter: 1.1 }, maker: 'Spectra Entertainment', tagline: 'Cell-powered. Blu-ray ready. Unbelievable.', announced: 2005 },
  { id: 'apex', name: 'Apex Phone', icon: '📱', kind: 'Mobile', start: 2008, users: [[2008, 10], [2012, 400], [2020, 900], [2026, 1100]], license: 2000, priceMult: 0.25, genreFit: { casual: 1.4, puzzle: 1.3, simulation: 1.05, rpg: 0.9, strategy: 0.9, action: 0.8, adventure: 0.8, rhythm: 1.2, platformer: 0.9, shooter: 0.75 }, maker: 'Apex', tagline: 'A phone, a music player and a games console. One device.', announced: 2007 },
  { id: 'pocketduo3d', name: 'Pocket Duo 3D', icon: '🕶️', kind: 'Handheld', start: 2011, end: 2021, users: [[2011, 4], [2015, 65], [2021, 15]], license: 150000, priceMult: 0.8, genreFit: { platformer: 1.25, rpg: 1.2, casual: 1.15, puzzle: 1.15, adventure: 1.1, shooter: 0.8 }, maker: 'Novaworks', tagline: '3D you can see. No glasses needed.', announced: 2010 },
  { id: 'spectravista', name: 'Spectra Vista', icon: '🎴', kind: 'Handheld', start: 2012, end: 2019, users: [[2012, 3], [2014, 12], [2019, 2]], license: 150000, priceMult: 0.8, genreFit: { action: 1.15, rpg: 1.2, shooter: 1.1, rhythm: 1.1, casual: 0.85, platformer: 0.9 }, maker: 'Spectra Entertainment', tagline: 'Two sticks. Two touch panels. No compromises.', announced: 2011 },
  { id: 'wavepad', name: 'Wave Pad', icon: '📲', kind: 'Console', start: 2012, end: 2017, users: [[2012, 3], [2014, 12], [2017, 3]], license: 200000, priceMult: 1, genreFit: { platformer: 1.25, casual: 1.15, puzzle: 1.1, adventure: 1.05, shooter: 0.75, strategy: 0.8 }, maker: 'Novaworks', tagline: 'A second screen, right in your hands.', announced: 2011 },
  { id: 'spectra4', name: 'Spectra 4', icon: '💿', kind: 'Console', start: 2013, end: 2023, users: [[2013, 8], [2018, 115], [2023, 40]], license: 300000, priceMult: 1, genreFit: { action: 1.15, rpg: 1.15, adventure: 1.1, casual: 0.8, shooter: 1.15 }, maker: 'Spectra Entertainment', tagline: 'Made for players. Made to share.', announced: 2012 },
  { id: 'monolithone', name: 'Monolith One', icon: '⬛', kind: 'Console', start: 2013, end: 2023, users: [[2013, 6], [2018, 50], [2023, 20]], license: 300000, priceMult: 1, genreFit: { action: 1.2, simulation: 1.05, casual: 0.8, shooter: 1.3 }, maker: 'Vantage Systems', tagline: 'All in one. One for all.', announced: 2012 },
  { id: 'spectravr', name: 'Spectra VR', icon: '🥽', kind: 'VR', start: 2016, end: 2023, users: [[2016, 1], [2019, 5], [2023, 2]], license: 80000, priceMult: 0.8, genreFit: { rhythm: 1.35, simulation: 1.25, shooter: 1.2, action: 1.15, strategy: 0.75, rpg: 0.85, platformer: 0.85 }, maker: 'Spectra Entertainment', tagline: "Don't watch the game. Stand inside it.", announced: 2014, codename: 'Project Mirage' },
  { id: 'switchback', name: 'Switchback', icon: '🔀', kind: 'Hybrid', start: 2017, users: [[2017, 10], [2022, 130], [2026, 150]], license: 250000, priceMult: 1, genreFit: { casual: 1.2, adventure: 1.15, puzzle: 1.1, action: 0.95, platformer: 1.3, rhythm: 1.15, shooter: 0.85 }, maker: 'Novaworks', tagline: 'Play at home. Snap it out. Play anywhere.', announced: 2015, codename: 'Project Hinge' },
  { id: 'omnivisor', name: 'Omni Visor', icon: '🥽', kind: 'VR', start: 2019, users: [[2019, 1], [2022, 18], [2025, 24]], license: 60000, priceMult: 0.7, genreFit: { rhythm: 1.4, simulation: 1.25, shooter: 1.2, action: 1.15, casual: 1.05, strategy: 0.75, rpg: 0.85, platformer: 0.8 }, maker: 'Omniverse', tagline: 'No PC. No wires. Just put it on.', announced: 2018 },
  { id: 'stratus', name: 'Stratus', icon: '☁️', kind: 'Cloud', start: 2019, end: 2023, users: [[2019, 0.5], [2021, 3], [2023, 1]], license: 50000, priceMult: 1, genreFit: { action: 1.1, shooter: 1.1, adventure: 1.05, rhythm: 0.75, platformer: 0.9 }, maker: 'Omnisearch', tagline: 'No console. No downloads. Just press play.', announced: 2018 },
  { id: 'spectra5', name: 'Spectra 5', icon: '💿', kind: 'Console', start: 2020, users: [[2020, 8], [2025, 65]], license: 350000, priceMult: 1, genreFit: { action: 1.15, rpg: 1.15, adventure: 1.1, casual: 0.8, shooter: 1.15 }, maker: 'Spectra Entertainment', tagline: 'No loading screens. Just play.', announced: 2019 },
  { id: 'monolithseries', name: 'Monolith Series', icon: '⬛', kind: 'Console', start: 2020, users: [[2020, 6], [2025, 32]], license: 350000, priceMult: 1, genreFit: { action: 1.2, strategy: 1.05, casual: 0.8, shooter: 1.3 }, maker: 'Vantage Systems', tagline: 'The fastest, most powerful Monolith ever.', announced: 2019 },
  { id: 'vapordeck', name: 'Vapor Deck', icon: '🎛️', kind: 'Handheld PC', start: 2022, users: [[2022, 1], [2025, 6]], license: 0, priceMult: 1, genreFit: { rpg: 1.15, strategy: 1.1, simulation: 1.1, platformer: 1.1, action: 1.05, casual: 0.9 }, maker: 'Vapor', tagline: 'Your whole PC library. On the couch, on the train, anywhere.', announced: 2021 },
  { id: 'switchback2', name: 'Switchback 2', icon: '🔀', kind: 'Hybrid', start: 2025, users: [[2025, 6], [2027, 40]], license: 300000, priceMult: 1, genreFit: { casual: 1.2, adventure: 1.15, platformer: 1.3, puzzle: 1.1, rhythm: 1.15, action: 1, shooter: 0.9 }, maker: 'Novaworks', tagline: 'Bigger, sharper, faster. Still plays anywhere.', announced: 2024 },
];

/**
 * Hardware news with no new platform of its own: mid-life upgrades, makers
 * leaving the business. Each is a headline in the January of its year.
 */
export const HARDWARE_NEWS: { year: number; icon: string; text: string; kind?: 'good' | 'bad' | 'info' }[] = [
  { year: 1992, icon: '💽', text: 'Zephyr Corp straps a CD drive to the Zephyr Drive. Full-motion video is the future, apparently.' },
  { year: 1997, icon: '🕹️', text: "Spectra Entertainment's new controller has two thumbsticks and shakes in your hands." },
  { year: 1998, icon: '🌈', text: 'Novaworks colours in the Pocket Pal: a new model plays every old game, in colour.' },
  { year: 2001, icon: '🏳️', text: 'Zephyr Corp is leaving the console business. Its studios will make games for everyone else\'s hardware.', kind: 'bad' },
  { year: 2007, icon: '🛒', text: 'All three console makers now run online stores: small downloadable games are finding a big audience.' },
  { year: 2009, icon: '📉', text: 'A slimmer, cheaper Spectra 3 is out, and sales are finally picking up.' },
  { year: 2010, icon: '📷', text: 'Motion control everywhere: Spectra and Monolith both launch camera and wand add-ons to answer the Wave.' },
  { year: 2014, icon: '📦', text: 'Vantage Systems drops the camera from the Monolith One and cuts its price.' },
  { year: 2016, icon: '✨', text: 'Spectra Entertainment shows the Spectra 4 Pro: the same games, now in 4K.' },
  { year: 2017, icon: '✨', text: 'Vantage Systems answers with the Monolith One X, "the most powerful console ever made".' },
  { year: 2020, icon: '🏠', text: 'Stuck at home, the world is playing more games than ever. Every platform is busy.', kind: 'good' },
  { year: 2021, icon: '🔌', text: 'A chip shortage means new Spectra 5 and Monolith Series consoles sell out in minutes.', kind: 'bad' },
  { year: 2024, icon: '✨', text: 'The Spectra 5 Pro is out: faster, sharper and very expensive.' },
];

export function platformById(id: string): Platform {
  const p = PLATFORMS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown platform ${id}`);
  return p;
}

export function platformUsers(p: Platform, year: number): number {
  if (year < p.start || (p.end !== undefined && year >= p.end)) return 0;
  const pts = p.users;
  if (year <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [y1, u1] = pts[i];
    if (year <= y1) {
      const [y0, u0] = pts[i - 1];
      return u0 + ((u1 - u0) * (year - y0)) / (y1 - y0);
    }
  }
  return pts[pts.length - 1][1];
}

/** How long after a platform is discontinued its last owners keep buying games, in years. */
export const PLATFORM_TAIL_YEARS = 1;

/**
 * The players a game released now can sell to. While the platform is on sale that is its
 * users; once it's discontinued, the owners it had at the end drift away over
 * PLATFORM_TAIL_YEARS instead of vanishing overnight.
 */
export function platformBuyers(p: Platform, year: number): number {
  if (p.end === undefined || year < p.end) return platformUsers(p, year);
  const last = p.users[p.users.length - 1][1];
  return last * Math.max(0, 1 - (year - p.end) / PLATFORM_TAIL_YEARS);
}

export function isPlatformAvailable(p: Platform, year: number): boolean {
  return year >= p.start && (p.end === undefined || year < p.end);
}

export function platformGenreFit(p: Platform, genre: GenreId): number {
  return p.genreFit[genre] ?? 1;
}

// ---------------------------------------------------------------------------
// Game sizes & marketing
// ---------------------------------------------------------------------------

export interface SizeDef {
  id: SizeId;
  name: string;
  phaseWeeks: number;
  cost: number;
  unitMult: number;
  price: number;
  /** Staff count below which quality suffers. */
  minStaff: number;
  research?: string;
}

export const SIZES: SizeDef[] = [
  { id: 'small', name: 'Small', phaseWeeks: 3, cost: 5000, unitMult: 1, price: 9, minStaff: 1 },
  { id: 'medium', name: 'Medium', phaseWeeks: 6, cost: 40000, unitMult: 1.9, price: 15, minStaff: 2, research: 'size_medium' },
  { id: 'large', name: 'Large', phaseWeeks: 10, cost: 160000, unitMult: 3.4, price: 24, minStaff: 5, research: 'size_large' },
];

export function sizeById(id: SizeId): SizeDef {
  return SIZES.find((s) => s.id === id)!;
}

export interface MarketingDef {
  id: MarketingId;
  name: string;
  cost: number;
  salesMult: number;
  research?: string;
  /** First year it's on offer (TV and web advertising arrive later). */
  fromYear?: number;
}

export const MARKETING: MarketingDef[] = [
  { id: 'none', name: 'No marketing', cost: 0, salesMult: 1 },
  { id: 'ads', name: 'Magazine ads', cost: 20000, salesMult: 1.3 },
  { id: 'campaign', name: 'Big campaign', cost: 150000, salesMult: 1.75, research: 'marketing' },
  { id: 'global', name: 'Global TV & web campaign', cost: 600000, salesMult: 2.4, research: 'marketing', fromYear: 1998 },
];

export function marketingById(id: MarketingId): MarketingDef {
  return MARKETING.find((m) => m.id === id)!;
}

// ---------------------------------------------------------------------------
// Research (non-topic) & offices
// ---------------------------------------------------------------------------

export interface ResearchItem {
  id: string;
  name: string;
  desc: string;
  cost: number;
  requires?: string;
  minOffice?: number;
  category: 'Game types' | 'Genres' | 'Engine features' | 'Technology' | 'Business';
  /** Can't be researched before this year. */
  fromYear?: number;
  /** Engine features: extra tech points (0.15 = +15%) in games made with an engine that has it; features multiply. */
  engineTech?: number;
  /** Shown instead of the test tube in the Research list. */
  icon?: string;
}

export const RESEARCH: ResearchItem[] = [
  { id: 'size_medium', name: 'Medium Games', desc: 'Bigger projects that sell more copies at a higher price.', cost: 30, category: 'Game types' },
  { id: 'size_large', name: 'Large Games', desc: 'Blockbusters. Needs a real team (5+ staff) and a proper office.', cost: 150, requires: 'size_medium', minOffice: 1, category: 'Game types' },
  { id: 'genre_platformer', name: 'Platformers', icon: '🏃', desc: 'A new genre: run, jump and collect. Loves heroes, ninjas and dinosaurs.', cost: 25, category: 'Genres' },
  { id: 'genre_shooter', name: 'Shooters', icon: '🎯', desc: 'A new genre: fast, technical and loud. Sci-fi, zombies and the military fit it well.', cost: 60, requires: 'engine2', category: 'Genres' },
  { id: 'genre_rhythm', name: 'Rhythm Games', icon: '🥁', desc: 'A new genre: play to the beat. Sound matters more than anything.', cost: 90, category: 'Genres' },
  // Engine features don't help on their own: build them into a custom engine (engines.ts) and make games with it.
  // engine2, engine3 and engine4 keep the ids of the old engine upgrades, so saves keep what they researched.
  { id: 'engine2', name: 'Smooth Scrolling', icon: '🖼️', desc: 'Sprites that glide across the screen.', engineTech: 0.15, cost: 40, category: 'Engine features' },
  { id: 'feat_sound', name: 'Digital Sound', icon: '🔊', desc: 'Sampled effects and music.', engineTech: 0.04, cost: 50, category: 'Engine features' },
  { id: 'engine3', name: '3D Graphics', icon: '🧊', desc: 'Polygons, cameras and textures.', engineTech: 0.15, cost: 140, requires: 'engine2', category: 'Engine features' },
  { id: 'feat_physics', name: 'Physics', icon: '🎱', desc: 'Things fall, bounce and break.', engineTech: 0.05, cost: 200, requires: 'engine3', category: 'Engine features' },
  { id: 'feat_online', name: 'Online Play', icon: '🌐', desc: 'Players meet over the internet.', engineTech: 0.05, cost: 260, requires: 'engine3', fromYear: 1997, category: 'Engine features' },
  { id: 'engine4', name: 'Next-Gen Rendering', icon: '✨', desc: 'Shaders, lighting and HD.', engineTech: 0.2, cost: 400, requires: 'engine3', category: 'Engine features' },
  { id: 'design1', name: 'Design Documents', desc: '+15% design points.', cost: 40, category: 'Technology' },
  { id: 'design2', name: 'Playtesting', desc: '+15% design points.', cost: 140, requires: 'design1', category: 'Technology' },
  { id: 'design3', name: 'Narrative Tools', desc: '+20% design points.', cost: 400, requires: 'design2', category: 'Technology' },
  { id: 'qa1', name: 'QA Process', desc: '30% fewer bugs during development.', cost: 60, category: 'Technology' },
  { id: 'qa2', name: 'Automated Testing', desc: 'Another 30% fewer bugs, faster polishing.', cost: 220, requires: 'qa1', category: 'Technology' },
  { id: 'marketing', name: 'Marketing Department', desc: 'Unlocks big ad campaigns when starting a game, plus press tours, TV commercials and TV ad blitzes in Marketing.', cost: 80, category: 'Business' },
];

export interface OfficeDef {
  name: string;
  capacity: number;
  rent: number;
  cost: number;
}

export const OFFICES: OfficeDef[] = [
  { name: 'Garage', capacity: 1, rent: 1000, cost: 0 },
  { name: 'Small Office', capacity: 4, rent: 8000, cost: 150000 },
  { name: 'Studio Floor', capacity: 8, rent: 25000, cost: 900000 },
  { name: 'Campus', capacity: 12, rent: 60000, cost: 4000000 },
];

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

export const FIRST_NAMES = [
  'Alex', 'Sam', 'Jordan', 'Riley', 'Morgan', 'Casey', 'Taylor', 'Jamie', 'Robin', 'Avery',
  'Quinn', 'Kai', 'Noa', 'Yuki', 'Mina', 'Leo', 'Ines', 'Omar', 'Priya', 'Mateo', 'Hana', 'Elif',
  'Lars', 'Zoe', 'Ravi', 'Ada', 'Theo', 'Sana', 'Ivo', 'Lena', 'Onur', 'Emre', 'Burak', 'Can',
  'Deniz', 'Ece', 'Zeynep', 'Selin', 'Mert', 'Kerem', 'Ayşe', 'Cem', 'Ozan', 'Barış', 'Defne',
  'Ezgi', 'Tolga', 'Arda', 'Ceren', 'Umut', 'Gizem', 'Berk', 'Duygu', 'Kaan', 'Melis', 'Serkan',
  'Pınar', 'Tuna', 'İrem', 'Volkan', 'Yasemin', 'Eren', 'Nil', 'Doruk', 'Aslı', 'Liam', 'Emma',
  'Noah', 'Olivia', 'Ethan', 'Mia', 'Lucas', 'Chloe', 'Oliver', 'Grace', 'Jack', 'Ella', 'Henry',
  'Ruby', 'Owen', 'Nora', 'Finn', 'Iris', 'Max', 'Lily', 'Sofia', 'Diego', 'Lucía', 'Pablo',
  'Camila', 'Javier', 'Valentina', 'Rafael', 'Ana', 'Bruno', 'Luana', 'Thiago', 'Beatriz', 'Marco',
  'Giulia', 'Luca', 'Chiara', 'Matteo', 'Hugo', 'Camille', 'Louis', 'Manon', 'Elsa', 'Felix',
  'Hanna', 'Jonas', 'Clara', 'Nils', 'Freja', 'Emil', 'Astrid', 'Sven', 'Ingrid', 'Mikael', 'Saga',
  'Aino', 'Eero', 'Pavel', 'Katya', 'Dmitri', 'Olga', 'Marek', 'Zofia', 'Jakub', 'Anja', 'Tomas',
  'Petra', 'Milan', 'Nadia', 'Bogdan', 'Irina', 'Amara', 'Kwame', 'Zara', 'Chidi', 'Ayo', 'Nia',
  'Tariq', 'Layla', 'Youssef', 'Amira', 'Karim', 'Salma', 'Reza', 'Shirin', 'Dara', 'Hiro', 'Aiko',
  'Kenji', 'Sora', 'Ren', 'Mei', 'Wei', 'Lin', 'Jun', 'Min', 'Seo', 'Jin', 'Ji-woo', 'Hyun', 'Bao',
  'Linh', 'Arjun', 'Ananya', 'Vikram', 'Meera', 'Rohan', 'Aditi', 'Nikhil', 'Tara', 'Maya', 'Ari',
  'Eli', 'Noam', 'Tamar', 'Lior', 'Ilan', 'Malia', 'Keanu', 'Tane', 'Aroha',
];
export const LAST_NAMES = [
  'Park', 'Novak', 'Silva', 'Okafor', 'Tanaka', 'Weber', 'Costa', 'Lindqvist', 'Moreau',
  'Kowalski', 'Ahmed', 'Rossi', 'Kim', 'Haddad', 'Nguyen', 'Fischer', 'Yilmaz', 'Santos',
  'Ivanova', 'Byrne', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Aydın', 'Öztürk', 'Arslan',
  'Doğan', 'Kılıç', 'Aslan', 'Çetin', 'Koç', 'Kurt', 'Özdemir', 'Polat', 'Korkmaz',
  'Güneş', 'Aksoy', 'Tekin', 'Ateş', 'Bulut', 'Akın', 'Karaca', 'Özkan', 'Uçar', 'Tuncer', 'Smith',
  'Walker', 'Hughes', 'Murphy', 'Kelly', 'Reid', 'Bennett', 'Foster', 'Hayes', 'Brooks', 'Turner',
  'Collins', 'Doyle', 'Gallagher', 'Fraser', 'García', 'López', 'Fernández', 'Romero', 'Herrera',
  'Vargas', 'Mendes', 'Oliveira', 'Pereira', 'Ferreira', 'Ricci', 'Bianchi', 'Conti', 'Greco',
  'Marino', 'Dubois', 'Laurent', 'Lefèvre', 'Girard', 'Bauer', 'Schmidt', 'Hoffmann', 'Becker',
  'Wagner', 'Jansen', 'Bakker', 'Visser', 'Peeters', 'Nielsen', 'Larsen', 'Berg', 'Holm',
  'Virtanen', 'Korhonen', 'Halvorsen', 'Eriksson', 'Petrov', 'Sokolov', 'Volkov', 'Horvat',
  'Dvořák', 'Nowak', 'Wiśniewski', 'Popescu', 'Nagy', 'Kovács', 'Georgiou', 'Papadakis', 'Mensah',
  'Adeyemi', 'Diallo', 'Mwangi', 'Abebe', 'Nkosi', 'Mansour', 'Farouk', 'Saleh', 'Karimi',
  'Hosseini', 'Rahimi', 'Sato', 'Suzuki', 'Watanabe', 'Ito', 'Nakamura', 'Kobayashi', 'Yamamoto',
  'Lee', 'Choi', 'Jung', 'Kang', 'Chen', 'Wang', 'Zhang', 'Liu', 'Huang', 'Tran', 'Pham', 'Le',
  'Sharma', 'Patel', 'Gupta', 'Iyer', 'Reddy', 'Kapoor', 'Singh', 'Rao', 'Das', 'Mehta', 'Cohen',
  'Levi', 'Mizrahi', 'Friedman', 'Rojas', 'Castillo', 'Morales', 'Navarro', 'Ortega', 'Ramos',
];

/**
 * Name ideas per genre: `{a}` and `{b}` are filled from the two word lists, so an
 * RPG suggests "Tales of Valdrath" while a puzzle game suggests "Gem Swap".
 * `topicPatterns` also use `{t}`, a word for the game's topic (TOPIC_TITLE_WORDS):
 * "Dragon Chronicles", "Zombie Rampage", "Barnyard Tycoon", "Dino Match".
 */
export const GENRE_TITLES: Record<GenreId, { patterns: string[]; topicPatterns: string[]; a: string[]; b: string[] }> = {
  action: {
    patterns: ['{a} {b}', '{a} {b}', '{b}: {a} Edition'],
    topicPatterns: ['{t} {b}', '{t} {b}', '{t} {b}: {a} Edition'],
    a: ['Blast', 'Steel', 'Thunder', 'Rapid', 'Iron', 'Venom', 'Crimson', 'Turbo', 'Overkill', 'Bullet'],
    b: ['Force', 'Assault', 'Fist', 'Rampage', 'Commando', 'Storm', 'Fury', 'Strike', 'Run', 'Brawl'],
  },
  adventure: {
    patterns: ['The {a} {b}', '{a} {b}', 'Secret of the {a} {b}'],
    topicPatterns: ['The {t} {b}', '{t} {b}', 'Secret of the {t} {b}'],
    a: ['Lost', 'Hidden', 'Sunken', 'Forgotten', 'Golden', 'Whispering', 'Emerald', 'Silent', 'Wandering'],
    b: ['Island', 'Temple', 'Voyage', 'Expedition', 'Map', 'Lighthouse', 'Compass', 'Caverns', 'Horizon'],
  },
  rpg: {
    patterns: ['{a} of {b}', '{b}: {a}', '{a} of {b}'],
    topicPatterns: ['{t} {a}', '{t} {a}', '{t} {a}: {b}'],
    a: ['Tales', 'Legend', 'Chronicles', 'Saga', 'Oath', 'Crown', 'Echoes', 'Heirs', 'Shards'],
    b: ['Valdrath', 'Eldoria', 'the Ashen Realm', 'the Twelve Moons', 'the Fallen Star', 'Mythara', 'Kingsreach', 'the Ember Isles'],
  },
  simulation: {
    patterns: ['{a} {b}', '{b} {a}', '{a} {b} Deluxe'],
    topicPatterns: ['{t} {b}', '{t} {b}', '{a} {t} {b}'],
    a: ['Super', 'Pro', 'Ultimate', 'Real', 'Total', 'Busy', 'Grand', 'Little'],
    b: ['Tycoon', 'Manager', 'Simulator', 'Life', 'Builder', 'Inc.', 'Story', 'Planner'],
  },
  strategy: {
    patterns: ['{a} {b}', '{a}: {b}', 'Age of {a}'],
    topicPatterns: ['{t} {a}', '{t} {a}: {b}', '{t} {a}'],
    a: ['Empires', 'Kingdoms', 'Dominion', 'Conquest', 'Command', 'Realms', 'Banners', 'Throne', 'Legions'],
    b: ['Ascendant', 'at War', 'Rising', 'Supreme', 'of Power', 'Total War', 'Eternal', 'Divided'],
  },
  puzzle: {
    patterns: ['{a} {b}', '{a}{b}', '{a} {b} Mania'],
    topicPatterns: ['{t} {b}', '{t} {b}', '{t} {b} Mania'],
    a: ['Block', 'Color', 'Tile', 'Gem', 'Bubble', 'Brain', 'Pixel', 'Crystal', 'Number'],
    b: ['Drop', 'Shift', 'Swap', 'Twist', 'Logic', 'Pop', 'Stack', 'Match', 'Flip'],
  },
  casual: {
    patterns: ['{a} {b}', '{a} {b}!', '{a} {b} Party'],
    topicPatterns: ['{a} {t} {b}', '{t} {b}', '{t} {b}!'],
    a: ['Happy', 'Tiny', 'Sunny', 'Bouncy', 'Lucky', 'Fluffy', 'Sweet', 'Snack', 'Cozy'],
    b: ['Pets', 'Garden', 'Hop', 'Friends', 'Dash', 'Bakery', 'Town', 'Paws', 'Island'],
  },
  platformer: {
    patterns: ['{a} {b}', 'Super {a} {b}', '{a} {b} Land'],
    topicPatterns: ['{t} {b}', 'Super {t} {b}', '{t} {b} Land'],
    a: ['Jumpy', 'Rocket', 'Sonic', 'Pogo', 'Turbo', 'Spring', 'Captain', 'Mega', 'Hyper'],
    b: ['Jump', 'Leap', 'Bounce', 'Run', 'Quest', 'Climb', 'Kid', 'Hop', 'Dash'],
  },
  shooter: {
    patterns: ['{a} {b}', '{b} {a}', '{a} {b}: Reloaded'],
    topicPatterns: ['{t} {b}', '{t} {b}', '{t} {b}: Reloaded'],
    a: ['Dead', 'Black', 'Zero', 'Red', 'Iron', 'Ghost', 'Lone', 'Final', 'Hard'],
    b: ['Sight', 'Trigger', 'Recoil', 'Barrage', 'Siege', 'Ops', 'Sniper', 'Squad', 'Frontier'],
  },
  rhythm: {
    patterns: ['{a} {b}', '{b} {a}', '{a} {b} Revolution'],
    topicPatterns: ['{t} {b}', '{t} {b}', '{t} {b} Revolution'],
    a: ['Funky', 'Neon', 'Electric', 'Midnight', 'Groovy', 'Pocket', 'Sonic', 'Golden'],
    b: ['Beat', 'Rhythm', 'Tempo', 'Drop', 'Jam', 'Remix', 'Step', 'Pulse', 'Encore'],
  },
};

// ---------------------------------------------------------------------------
// Store: power-ups bought with cash. Boosts last a number of game-development
// weeks (they only count down while a game is being made); upgrades are permanent.

export type StoreItemId = 'coffee' | 'pizza' | 'bugbash' | 'chairs' | 'whiteboard' | 'headphones' | 'courses' | 'forum' | 'tests' | 'playtest';

export interface StoreItem {
  id: StoreItemId;
  name: string;
  icon: string;
  desc: string;
  kind: 'boost' | 'instant' | 'upgrade';
  /** Boosts: price per team member. Upgrades: flat price. Both rise with the years like salaries. */
  price: number;
  /** Boosts: how many game weeks one purchase lasts. */
  weeks?: number;
  /** What the team says when it arrives. */
  cheer: string[];
}

export const STORE: StoreItem[] = [
  { id: 'coffee', name: 'Espresso Bar', icon: '☕', desc: '+20% design and tech points.', kind: 'boost', price: 1500, weeks: 4, cheer: ['☕', 'Yum!', '⚡'] },
  { id: 'pizza', name: 'Pizza Night', icon: '🍕', desc: 'Developers get in the zone three times as often.', kind: 'boost', price: 1200, weeks: 4, cheer: ['🍕', 'Pizza!', '😋'] },
  { id: 'bugbash', name: 'Bug Bash', icon: '🐞', desc: 'Hire testers for a weekend: fixes 40% of the current bugs right away.', kind: 'instant', price: 900, cheer: ['🐛', 'Squash!', '🔨'] },
  { id: 'chairs', name: 'Ergonomic Chairs', icon: '🪑', desc: 'Comfier team, more output: +5% design and tech points, forever.', kind: 'upgrade', price: 25000, cheer: ['😌', 'Ahh…', '🪑'] },
  { id: 'whiteboard', name: 'Whiteboard Wall', icon: '📝', desc: 'Ideas get written down, not forgotten: +20% research points from development, forever.', kind: 'upgrade', price: 30000, cheer: ['📝', '💡', '🤓'] },
  { id: 'headphones', name: 'Noise-cancelling Headphones', icon: '🎧', desc: 'Fewer distractions: developers get in the zone 50% more often, forever.', kind: 'upgrade', price: 35000, cheer: ['🎧', '🎶', '😎'] },
  { id: 'courses', name: 'Course Library', icon: '📚', desc: 'A shelf of books and online courses: training costs 25% less cash and RP, forever.', kind: 'upgrade', price: 40000, cheer: ['📚', '🎓', '🧠'] },
  { id: 'forum', name: 'Fan Forum', icon: '💬', desc: 'Fans keep talking between announcements: hype fades half as fast, forever.', kind: 'upgrade', price: 45000, cheer: ['💬', '📣', '🙌'] },
  { id: 'tests', name: 'Test Automation', icon: '🧪', desc: 'A build server runs the tests: 15% fewer new bugs, forever.', kind: 'upgrade', price: 50000, cheer: ['🧪', '✅', '🤖'] },
  { id: 'playtest', name: 'Playtest Lab', icon: '🕹️', desc: 'Real players try every build: polishing weeks add 25% more design and tech, forever.', kind: 'upgrade', price: 60000, cheer: ['🕹️', '👍', '🔍'] },
];

export function storeItemById(id: string): StoreItem {
  const item = STORE.find((x) => x.id === id);
  if (!item) throw new Error(`Unknown store item ${id}`);
  return item;
}

/** Words that evoke each topic, for title suggestions. */
export const TOPIC_TITLE_WORDS: Record<string, string[]> = {
  fantasy: ['Dragon', 'Elven', 'Arcane', 'Mythic', 'Enchanted', 'Wizard'],
  scifi: ['Star', 'Nebula', 'Quantum', 'Galactic', 'Plasma', 'Android'],
  racing: ['Turbo', 'Nitro', 'Asphalt', 'Grand Prix', 'Drift', 'Speedway'],
  sports: ['Slam', 'Champion', 'League', 'Goal', 'Stadium', 'Final Whistle'],
  medieval: ['Castle', 'Knight', 'Crown', 'Feudal', 'Royal', 'Kingdom'],
  pirates: ['Pirate', 'Buccaneer', 'Corsair', 'Skull Island', 'Treasure', 'Seven Seas'],
  detective: ['Noir', 'Case File', 'Gumshoe', 'Clue', 'Detective', 'Midnight'],
  space: ['Orbit', 'Cosmic', 'Rocket', 'Lunar', 'Astro', 'Starship'],
  horror: ['Dread', 'Haunted', 'Blood Moon', 'Nightmare', 'Grave', 'Hollow'],
  zombies: ['Zombie', 'Undead', 'Outbreak', 'Infected', 'Dead City', 'Rotten'],
  farming: ['Harvest', 'Barnyard', 'Meadow', 'Sunny Acres', 'Orchard', 'Crop'],
  military: ['Strike Force', 'Battalion', 'Frontline', 'Iron Eagle', 'Warzone', 'Commander'],
  dungeon: ['Dungeon', 'Crypt', 'Labyrinth', 'Torchlight', 'Catacomb', 'Deep Delve'],
  music: ['Rhythm', 'Beat', 'Groove', 'Disco', 'Encore', 'Melody'],
  mystery: ['Mystery', 'Riddle', 'Enigma', 'Cipher', 'Whispering', 'Hidden Room'],
  school: ['Campus', 'Homeroom', 'Recess', 'Academy', 'Hall Pass', 'Class Act'],
  ninja: ['Ninja', 'Shinobi', 'Shuriken', 'Shadow Clan', 'Silent Blade', 'Kunai'],
  dinosaurs: ['Dino', 'Jurassic', 'Raptor', 'Rex', 'Prehistoric', 'Fossil'],
  city: ['Metro', 'Skyline', 'Urban', 'Boom Town', 'Downtown', 'Megacity'],
  cooking: ['Kitchen', 'Chef', 'Spice', 'Diner', 'Bistro', 'Sizzle'],
  superheroes: ['Hero', 'Masked', 'Mighty', 'Caped', 'Justice', 'Power Squad'],
  cyberpunk: ['Neon', 'Chrome', 'Neural', 'Synth', 'Glitch', 'Netrunner'],
  romance: ['Heart', 'Sweetheart', 'Moonlit', 'Love Letter', 'Blossom', 'Starry Night'],
  apocalypse: ['Wasteland', 'Ashen', 'Ruins', 'Last Light', 'Dust', 'Aftermath'],
};
