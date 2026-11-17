/**
 * New hardware launches with a keynote: a full-screen reveal the game stops
 * for. A keynote is plain data, so anything that launches hardware (a
 * platform from the data table, or one the studio builds itself) can put one
 * on stage with a `keynote` event.
 */
import { genreById, platformUsers, type Platform } from './data';

export interface Keynote {
  year: number;
  /** Who's on stage. */
  maker: string;
  name: string;
  icon: string;
  /** Console, Handheld, Mobile… */
  kind: string;
  tagline: string;
  /** Millions of players on day one. */
  launchUsers: number;
  /** Millions of players at its best, and the year it gets there. */
  peakUsers: number;
  peakYear: number;
  /** Dev kit price: what it costs a studio to make games for it. */
  license: number;
  /** Genre names it's great for, and ones that struggle on it. */
  strengths: string[];
  weaknesses: string[];
  /** The platform's id, when studios can make games for it straight away. */
  platform?: string;
  /** The studio's own hardware: the crowd is cheering for the player. */
  own?: boolean;
}

/** Genre fits at or past these count as a platform's strengths or weaknesses. */
const STRONG_FIT = 1.15;
const WEAK_FIT = 0.85;

/** The keynote for a platform from the data table, launching in `year`. */
export function platformKeynote(p: Platform, year: number = p.start): Keynote {
  const [peakYear, peakUsers] = p.users.reduce((a, pt) => (pt[1] > a[1] ? pt : a));
  const fits = Object.entries(p.genreFit) as [string, number][];
  const names = (list: [string, number][]) => list.map(([g]) => genreById(g).name);
  return {
    year,
    maker: p.maker ?? p.name,
    name: p.name,
    icon: p.icon,
    kind: p.kind,
    tagline: p.tagline ?? `The ${p.name} is here.`,
    launchUsers: platformUsers(p, year),
    peakUsers,
    peakYear,
    license: p.license,
    strengths: names(fits.filter(([, f]) => f >= STRONG_FIT).sort((a, b) => b[1] - a[1]).slice(0, 3)),
    weaknesses: names(fits.filter(([, f]) => f <= WEAK_FIT).sort((a, b) => a[1] - b[1]).slice(0, 2)),
    platform: p.id,
  };
}
