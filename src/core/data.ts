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
// ---------------------------------------------------------------------------

export interface Genre {
  id: GenreId;
  name: string;
  icon: string;
  importance: number[];
  designTarget: number;
}

export const GENRES: Genre[] = [
  { id: 'action', name: 'Action', icon: '💥', importance: [1.5, 1.5, 0.5, 0.5, 1.5, 1, 0.5, 1.5, 1], designTarget: 0.4 },
  { id: 'adventure', name: 'Adventure', icon: '🗺️', importance: [0.5, 1, 1.5, 1.5, 1, 0.5, 1.5, 1, 1], designTarget: 0.7 },
  { id: 'rpg', name: 'RPG', icon: '🧙', importance: [0.5, 1, 1.5, 1.5, 0.5, 1, 1.5, 1, 1], designTarget: 0.65 },
  { id: 'simulation', name: 'Simulation', icon: '⚙️', importance: [1.5, 1.5, 0.5, 0.5, 1, 1.5, 1, 1, 0.5], designTarget: 0.4 },
  { id: 'strategy', name: 'Strategy', icon: '♟️', importance: [1, 1.5, 0.5, 0.5, 1, 1.5, 1.5, 0.5, 0.5], designTarget: 0.55 },
  { id: 'puzzle', name: 'Puzzle', icon: '🧩', importance: [0.5, 1.5, 0.5, 0.5, 1.5, 1, 0.5, 1, 1.5], designTarget: 0.6 },
  { id: 'casual', name: 'Casual', icon: '🎈', importance: [0.5, 1.5, 0.5, 0.5, 1.5, 0.5, 0.5, 1.5, 1.5], designTarget: 0.6 },
];

export const GENRE_IDS = GENRES.map((g) => g.id);

export function genreById(id: string): Genre {
  const g = GENRES.find((x) => x.id === id);
  if (!g) throw new Error(`Unknown genre ${id}`);
  return g;
}

// ---------------------------------------------------------------------------
// Topics. `fit` is per genre (GENRES order): 3 great, 2 good, 1 okay, 0 bad.
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
  { id: 'fantasy', name: 'Fantasy', icon: '🐉', fit: [2, 3, 3, 1, 2, 1, 1], cost: 0 },
  { id: 'scifi', name: 'Sci-Fi', icon: '👽', fit: [3, 2, 3, 2, 3, 1, 1], cost: 0 },
  { id: 'racing', name: 'Racing', icon: '🏎️', fit: [3, 0, 0, 3, 0, 1, 2], cost: 0 },
  { id: 'sports', name: 'Sports', icon: '⚽', fit: [2, 0, 1, 3, 2, 0, 2], cost: 0 },
  { id: 'medieval', name: 'Medieval', icon: '🏰', fit: [2, 2, 3, 2, 3, 0, 1], cost: 0 },
  { id: 'pirates', name: 'Pirates', icon: '🏴‍☠️', fit: [3, 3, 2, 1, 2, 1, 1], cost: 0 },
  { id: 'detective', name: 'Detective', icon: '🕵️', fit: [1, 3, 2, 0, 1, 3, 1], cost: 0 },
  { id: 'space', name: 'Space', icon: '🚀', fit: [3, 2, 2, 3, 3, 2, 1], cost: 0 },
  { id: 'horror', name: 'Horror', icon: '👻', fit: [3, 3, 2, 0, 1, 2, 0], cost: 8 },
  { id: 'zombies', name: 'Zombies', icon: '🧟', fit: [3, 2, 1, 1, 2, 1, 2], cost: 8 },
  { id: 'farming', name: 'Farming', icon: '🌾', fit: [0, 1, 1, 3, 2, 1, 3], cost: 8 },
  { id: 'military', name: 'Military', icon: '🎖️', fit: [3, 1, 1, 2, 3, 0, 0], cost: 10 },
  { id: 'dungeon', name: 'Dungeon', icon: '🗝️', fit: [3, 2, 3, 0, 2, 2, 1], cost: 10 },
  { id: 'music', name: 'Music', icon: '🎵', fit: [1, 1, 0, 2, 0, 2, 3], cost: 10 },
  { id: 'mystery', name: 'Mystery', icon: '🔍', fit: [0, 3, 1, 0, 1, 3, 1], cost: 10 },
  { id: 'school', name: 'School', icon: '🏫', fit: [0, 2, 2, 3, 0, 2, 3], cost: 12 },
  { id: 'ninja', name: 'Ninja', icon: '🥷', fit: [3, 2, 2, 0, 1, 1, 1], cost: 12 },
  { id: 'dinosaurs', name: 'Dinosaurs', icon: '🦖', fit: [3, 3, 1, 2, 2, 1, 2], cost: 12 },
  { id: 'city', name: 'City Building', icon: '🏙️', fit: [0, 0, 1, 3, 3, 2, 2], cost: 15 },
  { id: 'cooking', name: 'Cooking', icon: '🍳', fit: [0, 0, 0, 3, 1, 3, 3], cost: 15 },
  { id: 'superheroes', name: 'Superheroes', icon: '🦸', fit: [3, 2, 2, 0, 1, 1, 1], cost: 18 },
  { id: 'cyberpunk', name: 'Cyberpunk', icon: '🤖', fit: [3, 3, 3, 1, 2, 1, 0], cost: 20 },
  { id: 'romance', name: 'Romance', icon: '💘', fit: [0, 3, 2, 2, 0, 1, 3], cost: 20 },
  { id: 'apocalypse', name: 'Post-Apocalyptic', icon: '☢️', fit: [3, 3, 3, 2, 3, 0, 0], cost: 25 },
];

export function topicById(id: string): Topic {
  const t = TOPICS.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown topic ${id}`);
  return t;
}

export function topicFit(topicId: string, genreId: GenreId): number {
  return topicById(topicId).fit[GENRE_IDS.indexOf(genreId)];
}

export const FIT_LABELS = ['Bad', 'Okay', 'Good', 'Great'];

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
}

export const PLATFORMS: Platform[] = [
  { id: 'pc', name: 'PC', icon: '🖥️', kind: 'Computer', start: 1985, users: [[1985, 3], [1995, 40], [2005, 150], [2015, 220], [2026, 260]], license: 0, priceMult: 1, genreFit: { strategy: 1.25, simulation: 1.2, casual: 0.85 } },
  { id: 'nova8', name: 'Nova 8', icon: '🕹️', kind: 'Console', start: 1985, end: 1994, users: [[1985, 2], [1989, 28], [1994, 6]], license: 20000, priceMult: 1, genreFit: { action: 1.2, adventure: 1.1, simulation: 0.8, strategy: 0.7 } },
  { id: 'zephyr', name: 'Zephyr Drive', icon: '🎮', kind: 'Console', start: 1989, end: 1998, users: [[1989, 2], [1993, 22], [1998, 4]], license: 35000, priceMult: 1, genreFit: { action: 1.25, puzzle: 0.9, strategy: 0.8 } },
  { id: 'pocketpal', name: 'Pocket Pal', icon: '📟', kind: 'Handheld', start: 1990, end: 2003, users: [[1990, 3], [1996, 45], [2003, 10]], license: 25000, priceMult: 0.8, genreFit: { puzzle: 1.3, casual: 1.2, rpg: 1.1, strategy: 0.8, simulation: 0.8 } },
  { id: 'spectra', name: 'Spectra', icon: '💿', kind: 'Console', start: 1995, end: 2006, users: [[1995, 3], [1999, 60], [2006, 12]], license: 80000, priceMult: 1, genreFit: { rpg: 1.2, action: 1.1, strategy: 0.85 } },
  { id: 'hyperion', name: 'Hyperion 64', icon: '🎮', kind: 'Console', start: 1996, end: 2003, users: [[1996, 3], [1999, 26], [2003, 5]], license: 70000, priceMult: 1, genreFit: { action: 1.2, adventure: 1.15, casual: 1.1, rpg: 0.9 } },
  { id: 'spectra2', name: 'Spectra 2', icon: '💿', kind: 'Console', start: 2000, end: 2013, users: [[2000, 5], [2005, 120], [2013, 25]], license: 150000, priceMult: 1, genreFit: { rpg: 1.15, action: 1.15, strategy: 0.85 } },
  { id: 'monolith', name: 'Monolith X', icon: '⬛', kind: 'Console', start: 2002, end: 2010, users: [[2002, 3], [2006, 25], [2010, 8]], license: 150000, priceMult: 1, genreFit: { action: 1.25, strategy: 0.9, casual: 0.85 } },
  { id: 'pocketduo', name: 'Pocket Duo', icon: '📱', kind: 'Handheld', start: 2004, end: 2015, users: [[2004, 5], [2009, 120], [2015, 30]], license: 120000, priceMult: 0.8, genreFit: { puzzle: 1.25, casual: 1.3, rpg: 1.1, action: 0.9 } },
  { id: 'monolith2', name: 'Monolith 360', icon: '⬛', kind: 'Console', start: 2005, end: 2016, users: [[2005, 5], [2010, 85], [2016, 20]], license: 250000, priceMult: 1, genreFit: { action: 1.25, simulation: 1.05, casual: 0.85 } },
  { id: 'wave', name: 'Wave', icon: '🌊', kind: 'Console', start: 2006, end: 2014, users: [[2006, 8], [2009, 95], [2014, 20]], license: 180000, priceMult: 1, genreFit: { casual: 1.4, puzzle: 1.1, action: 0.9, strategy: 0.7, rpg: 0.8 } },
  { id: 'spectra3', name: 'Spectra 3', icon: '💿', kind: 'Console', start: 2006, end: 2016, users: [[2006, 4], [2010, 80], [2016, 20]], license: 250000, priceMult: 1, genreFit: { rpg: 1.15, action: 1.15, casual: 0.85 } },
  { id: 'apex', name: 'Apex Phone', icon: '📱', kind: 'Mobile', start: 2008, users: [[2008, 10], [2012, 400], [2020, 900], [2026, 1100]], license: 2000, priceMult: 0.25, genreFit: { casual: 1.4, puzzle: 1.3, simulation: 1.05, rpg: 0.9, strategy: 0.9, action: 0.8, adventure: 0.8 } },
  { id: 'spectra4', name: 'Spectra 4', icon: '💿', kind: 'Console', start: 2013, end: 2023, users: [[2013, 8], [2018, 115], [2023, 40]], license: 300000, priceMult: 1, genreFit: { action: 1.15, rpg: 1.15, adventure: 1.1, casual: 0.8 } },
  { id: 'monolithone', name: 'Monolith One', icon: '⬛', kind: 'Console', start: 2013, end: 2023, users: [[2013, 6], [2018, 50], [2023, 20]], license: 300000, priceMult: 1, genreFit: { action: 1.2, simulation: 1.05, casual: 0.8 } },
  { id: 'switchback', name: 'Switchback', icon: '🔀', kind: 'Hybrid', start: 2017, users: [[2017, 10], [2022, 130], [2026, 150]], license: 250000, priceMult: 1, genreFit: { casual: 1.2, adventure: 1.15, puzzle: 1.1, action: 0.95 } },
  { id: 'spectra5', name: 'Spectra 5', icon: '💿', kind: 'Console', start: 2020, users: [[2020, 8], [2025, 65]], license: 350000, priceMult: 1, genreFit: { action: 1.15, rpg: 1.15, adventure: 1.1, casual: 0.8 } },
  { id: 'monolithseries', name: 'Monolith Series', icon: '⬛', kind: 'Console', start: 2020, users: [[2020, 6], [2025, 32]], license: 350000, priceMult: 1, genreFit: { action: 1.2, strategy: 1.05, casual: 0.8 } },
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
  { id: 'small', name: 'Small', phaseWeeks: 3, cost: 8000, unitMult: 1, price: 9, minStaff: 1 },
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
  { id: 'ads', name: 'Magazine ads', cost: 20000, salesMult: 1.3, research: 'marketing' },
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
  category: 'Game types' | 'Technology' | 'Business';
}

export const RESEARCH: ResearchItem[] = [
  { id: 'size_medium', name: 'Medium Games', desc: 'Bigger projects that sell more copies at a higher price.', cost: 30, category: 'Game types' },
  { id: 'size_large', name: 'Large Games', desc: 'Blockbusters. Needs a real team (5+ staff) and a proper office.', cost: 150, requires: 'size_medium', minOffice: 1, category: 'Game types' },
  { id: 'engine2', name: 'Engine 2.0', desc: '+15% tech points.', cost: 40, category: 'Technology' },
  { id: 'engine3', name: '3D Engine', desc: '+15% tech points.', cost: 140, requires: 'engine2', category: 'Technology' },
  { id: 'engine4', name: 'Next-Gen Engine', desc: '+20% tech points.', cost: 400, requires: 'engine3', category: 'Technology' },
  { id: 'design1', name: 'Design Documents', desc: '+15% design points.', cost: 40, category: 'Technology' },
  { id: 'design2', name: 'Playtesting', desc: '+15% design points.', cost: 140, requires: 'design1', category: 'Technology' },
  { id: 'design3', name: 'Narrative Tools', desc: '+20% design points.', cost: 400, requires: 'design2', category: 'Technology' },
  { id: 'qa1', name: 'QA Process', desc: '30% fewer bugs during development.', cost: 60, category: 'Technology' },
  { id: 'qa2', name: 'Automated Testing', desc: 'Another 30% fewer bugs, faster polishing.', cost: 220, requires: 'qa1', category: 'Technology' },
  { id: 'marketing', name: 'Marketing Department', desc: 'Unlocks ad campaigns when starting a game.', cost: 80, category: 'Business' },
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

export const FIRST_NAMES = ['Alex', 'Sam', 'Jordan', 'Riley', 'Morgan', 'Casey', 'Taylor', 'Jamie', 'Robin', 'Avery', 'Quinn', 'Kai', 'Noa', 'Yuki', 'Mina', 'Leo', 'Ines', 'Omar', 'Priya', 'Mateo', 'Hana', 'Elif', 'Lars', 'Zoe', 'Ravi', 'Ada', 'Theo', 'Sana', 'Ivo', 'Lena'];
export const LAST_NAMES = ['Park', 'Novak', 'Silva', 'Okafor', 'Tanaka', 'Weber', 'Costa', 'Lindqvist', 'Moreau', 'Kowalski', 'Ahmed', 'Rossi', 'Kim', 'Haddad', 'Nguyen', 'Fischer', 'Yilmaz', 'Santos', 'Ivanova', 'Byrne'];

/**
 * Name ideas per genre: `{a}` and `{b}` are filled from the two word lists, so an
 * RPG suggests "Tales of Valdrath" while a puzzle game suggests "Gem Swap".
 */
export const GENRE_TITLES: Record<GenreId, { patterns: string[]; a: string[]; b: string[] }> = {
  action: {
    patterns: ['{a} {b}', '{a} {b}', '{b}: {a} Edition'],
    a: ['Blast', 'Steel', 'Thunder', 'Rapid', 'Iron', 'Venom', 'Crimson', 'Turbo', 'Overkill', 'Bullet'],
    b: ['Force', 'Assault', 'Fist', 'Rampage', 'Commando', 'Storm', 'Fury', 'Strike', 'Run', 'Brawl'],
  },
  adventure: {
    patterns: ['The {a} {b}', '{a} {b}', 'Secret of the {a} {b}'],
    a: ['Lost', 'Hidden', 'Sunken', 'Forgotten', 'Golden', 'Whispering', 'Emerald', 'Silent', 'Wandering'],
    b: ['Island', 'Temple', 'Voyage', 'Expedition', 'Map', 'Lighthouse', 'Compass', 'Caverns', 'Horizon'],
  },
  rpg: {
    patterns: ['{a} of {b}', '{b}: {a}', '{a} of {b}'],
    a: ['Tales', 'Legend', 'Chronicles', 'Saga', 'Oath', 'Crown', 'Echoes', 'Heirs', 'Shards'],
    b: ['Valdrath', 'Eldoria', 'the Ashen Realm', 'the Twelve Moons', 'the Fallen Star', 'Mythara', 'Kingsreach', 'the Ember Isles'],
  },
  simulation: {
    patterns: ['{a} {b}', '{b} {a}', '{a} {b} Deluxe'],
    a: ['Super', 'Pro', 'Ultimate', 'Real', 'Total', 'Busy', 'Grand', 'Little'],
    b: ['Tycoon', 'Manager', 'Simulator', 'Life', 'Builder', 'Inc.', 'Story', 'Planner'],
  },
  strategy: {
    patterns: ['{a} {b}', '{a}: {b}', 'Age of {a}'],
    a: ['Empires', 'Kingdoms', 'Dominion', 'Conquest', 'Command', 'Realms', 'Banners', 'Throne', 'Legions'],
    b: ['Ascendant', 'at War', 'Rising', 'Supreme', 'of Power', 'Total War', 'Eternal', 'Divided'],
  },
  puzzle: {
    patterns: ['{a} {b}', '{a}{b}', '{a} {b} Mania'],
    a: ['Block', 'Color', 'Tile', 'Gem', 'Bubble', 'Brain', 'Pixel', 'Crystal', 'Number'],
    b: ['Drop', 'Shift', 'Swap', 'Twist', 'Logic', 'Pop', 'Stack', 'Match', 'Flip'],
  },
  casual: {
    patterns: ['{a} {b}', '{a} {b}!', '{a} {b} Party'],
    a: ['Happy', 'Tiny', 'Sunny', 'Bouncy', 'Lucky', 'Fluffy', 'Sweet', 'Snack', 'Cozy'],
    b: ['Pets', 'Garden', 'Hop', 'Friends', 'Dash', 'Bakery', 'Town', 'Paws', 'Island'],
  },
};

// ---------------------------------------------------------------------------
// Store: power-ups bought with cash. Boosts last a number of game-development
// weeks (they only count down while a game is being made); upgrades are permanent.

export type StoreItemId = 'coffee' | 'pizza' | 'bugbash' | 'chairs' | 'headphones' | 'tests';

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
  { id: 'headphones', name: 'Noise-cancelling Headphones', icon: '🎧', desc: 'Fewer distractions: developers get in the zone 50% more often, forever.', kind: 'upgrade', price: 35000, cheer: ['🎧', '🎶', '😎'] },
  { id: 'tests', name: 'Test Automation', icon: '🧪', desc: 'A build server runs the tests: 15% fewer new bugs, forever.', kind: 'upgrade', price: 50000, cheer: ['🧪', '✅', '🤖'] },
];

export function storeItemById(id: string): StoreItem {
  const item = STORE.find((x) => x.id === id);
  if (!item) throw new Error(`Unknown store item ${id}`);
  return item;
}
