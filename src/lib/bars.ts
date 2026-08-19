import raw from '../data/bars.json';

/** One year of the register, and the population it served. */
export interface BarYear {
  year: number;
  bars: number;
  population: number;
  /** How many people there are for each drinking place. */
  perBar: number;
}

export interface Region {
  name: string;
  from: number;
  to: number;
  /** Percentage change in premises between the first year and the last. */
  change: number;
}

export interface BarsData {
  meta: {
    source: string;
    registry: string;
    population: string;
    activity: string;
    from: number;
    to: number;
    /** Premises per mark on the closures field. */
    perMark: number;
    /** People per dot in the queue. */
    perDot: number;
  };
  summary: {
    lost: number;
    lostShare: number;
    perDay: number;
    perBarFirst: number;
    perBarLast: number;
    worse: number;
    transitions: number;
    marks: number;
    marksClosed: number;
    worstRegion: Region;
    bestRegion: Region;
  };
  years: BarYear[];
  regions: Region[];
}

export const BARS = raw as BarsData;
