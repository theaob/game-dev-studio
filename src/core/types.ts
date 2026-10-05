export type GenreId = 'action' | 'adventure' | 'rpg' | 'simulation' | 'strategy' | 'puzzle' | 'casual';
export type SizeId = 'small' | 'medium' | 'large';
export type MarketingId = 'none' | 'ads' | 'campaign';

export interface Staff {
  id: number;
  name: string;
  design: number; // 1..10
  tech: number; // 1..10
  speed: number; // 0.7..1.4 multiplier
  salary: number; // per month
  founder?: boolean;
  hiredWeek: number;
}

export interface GameSpec {
  name: string;
  topic: string;
  genre: GenreId;
  platform: string;
  size: SizeId;
  marketing: MarketingId;
}

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
  | { type: 'devComplete' }
  | { type: 'contractDone'; offer: ContractOffer }
  | { type: 'notice'; notice: Notice }
  | { type: 'gameOver'; reason: 'bankrupt' | 'retired' };
