import raw from '../data/leaving-home.json';

export interface Reading {
  year: number;
  value: number;
  /** Eurostat's own break-in-series flag on that year. */
  brk?: boolean;
}

/**
 * One survey's whole life for one country. `span` is the distance from its
 * lowest reading to its highest — everything that happened to the country
 * while one definition held.
 */
export interface Era {
  from: number;
  to: number;
  n: number;
  min: number;
  max: number;
  first: number;
  last: number;
  span: number;
}

export interface Territory {
  code: string;
  label: string;
  series: Reading[];
  pre: Era;
  post: Era;
}

export interface LeavingHomeData {
  meta: {
    source: string;
    dataset: string;
    sourceUrl: string;
    indicator: string;
    definition: string;
    survey: string;
    updated: string;
    unit: string;
    sex: string;
    /** The year the EU-LFS was redefined. Nothing is differenced across it. */
    breakYear: number;
    breakCount: number;
    lastYear: number;
  };
  summary: {
    medianSpan: number;
    widest: { code: string; label: string; span: number };
    gap: number;
    earliest: { code: string; label: string; value: number };
    latest: { code: string; label: string; value: number };
    breakJump: { code: string; label: string; jump: number };
  };
  eu: Territory;
  countries: Territory[];
}

export const LEAVING_HOME = raw as LeavingHomeData;

/**
 * The band the European average has never left, in either survey — the union
 * of the two eras' ranges. It is a statement about each series' own spread,
 * not a difference across the break, which would not be a measurement.
 */
export function europeanBand(): { min: number; max: number } {
  const { pre, post } = LEAVING_HOME.eu;
  return { min: Math.min(pre.min, post.min), max: Math.max(pre.max, post.max) };
}
