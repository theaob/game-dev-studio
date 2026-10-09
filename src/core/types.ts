export type GenreId = 'action' | 'adventure' | 'rpg' | 'simulation' | 'strategy' | 'puzzle' | 'casual';
export type SizeId = 'small' | 'medium' | 'large';
export type MarketingId = 'none' | 'ads' | 'campaign' | 'global';

export interface Staff {
  id: number;
  name: string;
  design: number; // 1..10
  tech: number; // 1..10
  speed: number; // 0.7..1.4 multiplier
  salary: number; // per month
  founder?: boolean;
  hiredWeek: number;
  /** Weeks left "in the zone" (boosted output). Absent or 0 = normal. */
  zone?: number;
}

export interface GameSpec {
  name: string;
  topic: string;
  genre: GenreId;
  platform: string;
  size: SizeId;
  marketing: MarketingId;
  /** Id of the released game this is a sequel to. */
  sequelOf?: number;
}

export type PolishMode = 'bugs' | 'design' | 'tech';

export interface GameProject extends GameSpec {
  kind: 'game';
  startedWeek: number;
  /** Development weeks per phase (3 phases). */
  phaseWeeks: number;
  /** 0..2 = development phases, 3 = polishing (finished, awaiting release). */
  phase: number;
  weekInPhase: number;
  /** focus[phase][area] — raw slider values 0..100. */
  focus: number[][];
  awaitingFocus: boolean;
  polishWeeks: number;
  /** What the team works on while polishing (default: fixing bugs). */
  polishMode?: PolishMode;
  /** Weeks spent polishing design or tech; each one yields less than the last. */
  pointPolishWeeks?: number;
  /** Hype built by marketing during development (0..100), and the promos already run. */
  hype?: number;
  promos?: string[];
  /** Money spent on the game so far, by kind. */
  spend?: Spend;
  design: number;
  tech: number;
  bugs: number;
  /** Design/tech points produced per area (9 areas). */
  areaPoints: number[];
  /** Points contributed by each staff id, used for XP. */
  contrib: Record<number, { design: number; tech: number }>;
  /** Upfront money spent (license, size, marketing). */
  cost: number;
}

export interface ContractOffer {
  id: number;
  title: string;
  weeks: number;
  pay: number;
  rp: number;
}

export interface ContractJob {
  kind: 'contract';
  offer: ContractOffer;
  weeksDone: number;
}

export type Activity = GameProject | ContractJob;

export interface ReleasedGame extends GameSpec {
  id: number;
  releaseWeek: number;
  devWeeks: number;
  design: number;
  tech: number;
  bugs: number;
  ppw: number;
  score: number;
  reviews: number[];
  targetUnits: number;
  unitsSold: number;
  revenue: number;
  weeksOnMarket: number;
  fansGained: number;
  unitPrice: number;
  cost: number;
  /** Part number in its series: 1 for an original, 2 for its sequel, and so on. */
  series?: number;
  /** Hype at launch, and the post-launch pushes used on it. */
  hype?: number;
  pushes?: string[];
  /** Everything spent on the game (saves from before this was tracked only have `cost`). */
  spend?: Spend;
  /** Copies sold and money made in each week on the market. */
  weekly?: { units: number[]; revenue: number[] };
}

export interface Spend {
  /** Production budget and dev kit license. */
  budget: number;
  /** Ad campaign, promos, GameExpo booth and post-launch pushes. */
  marketing: number;
  /** Salaries and rent while the team worked on it. */
  team: number;
}

export interface Knowledge {
  /** "topic|genre" -> fit level 0..3 */
  combos: Record<string, number>;
  /** genre -> which of the 9 area importances are revealed */
  areas: Record<string, boolean[]>;
  /** genre -> design/tech balance revealed */
  balance: Record<string, boolean>;
}

export type NoticeKind = 'info' | 'good' | 'bad';

export interface Notice {
  week: number;
  text: string;
  kind: NoticeKind;
}

export interface GameState {
  version: number;
  rng: number;
  week: number;
  studioName: string;
  cash: number;
  fans: number;
  rp: number;
  officeLevel: number;
  staff: Staff[];
  candidates: Staff[];
  nextId: number;
  researched: string[];
  topics: string[];
  licenses: string[];
  activity: Activity | null;
  contractOffers: ContractOffer[];
  released: ReleasedGame[];
  knowledge: Knowledge;
  notices: Notice[];
  bestPPW: number;
  totalRevenue: number;
  debtStrikes: number;
  over: null | 'bankrupt' | 'retired';
  /** Active store boosts and the game-development weeks they have left. */
  boosts?: Partial<Record<string, number>>;
  /** Permanent store upgrades bought. */
  upgrades?: string[];
  /** The studio cat: whose lap it's on (boosting them), and how long until it wants another lap. */
  cat?: CatState;
  /** This year's GameExpo booth booking. */
  expo?: { year: number; booth: string };
  /** Industry news: this year's trend, rival releases and headlines. */
  industry?: IndustryState;
  /** Week each ad reward was last claimed (Android app only). */
  adRewards?: Partial<Record<string, number>>;
  /** The studio's look: paint ids (absent = the office's own colours) and decorations. */
  decor?: DecorState;
}

export interface DecorState {
  wall?: string;
  floor?: string;
  /** Decorations bought, and the ones on show. */
  owned?: string[];
  placed?: string[];
}

export interface Headline {
  week: number;
  icon: string;
  text: string;
  kind: NoticeKind;
}

export interface RivalGame {
  week: number;
  studio: string;
  name: string;
  genre: GenreId;
  topic: string;
  score: number;
}

export interface IndustryState {
  /** This year's hot genre and topic. */
  trend?: { year: number; genre: GenreId; topic: string };
  headlines: Headline[];
  rivalGames: RivalGame[];
}

export interface CatState {
  lap?: { staffId: number; weeks: number };
  /** Weeks of alone time left before the cat will sit on a lap again. */
  cooldown?: number;
}

/** Insight lines shown after a release. */
export interface ReleaseReport {
  game: ReleasedGame;
  insights: { text: string; kind: NoticeKind }[];
  rpEarned: number;
}

export type SimEvent =
  | { type: 'points'; design: number; tech: number; bugs: number }
  | { type: 'needFocus'; phase: number }
  | { type: 'zone'; staffId: number; name: string }
  | { type: 'devComplete' }
  | { type: 'contractDone'; offer: ContractOffer }
  | { type: 'notice'; notice: Notice }
  | { type: 'gameOver'; reason: 'bankrupt' | 'retired' }
  | { type: 'catLap'; staffId: number; name: string }
  | { type: 'catLeft'; staffId: number };
