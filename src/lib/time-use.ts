import raw from '../data/time-use.json';

/** One block of the day. `codes` is null for the residual band. */
export interface Band {
  key: string;
  label: string;
  codes: string[] | null;
}

export interface Country {
  code: string;
  label: string;
  /** Minutes in each band, in `bands` order, adding to 1,440. */
  parts: number[];
}

export interface Spread {
  key: string;
  label: string;
  min: number;
  max: number;
  range: number;
  lowest: { code: string; label: string; value: number };
  highest: { code: string; label: string; value: number };
}

export interface TimeUse {
  meta: {
    source: string;
    dataset: string;
    sourceUrl: string;
    survey: string;
    indicator: string;
    wave: string;
    ages: string;
    sex: string;
    unit: string;
    updated: string;
    countries: number;
    day: number;
  };
  bands: Band[];
  /** The median country's day, which the band names are hung on. */
  median: number[];
  countries: Country[];
  summary: {
    spread: Spread[];
    /** Median residual once the United Kingdom, an outlier, is set aside. */
    restMedianOthers: number;
    widest: { key: string; label: string; range: number };
    narrowest: { key: string; label: string; range: number };
    meals: Spread;
    sleep: Spread;
  };
  map: {
    width: number;
    height: number;
    shapes: { id: string; d: string; on?: boolean }[];
    spikes: { code: string; label: string; minutes: number; x: number; y: number }[];
  };
}

export const TIME_USE = raw as TimeUse;

/** Minutes as a reader says them: 8h28, 1h21. */
export function clock(minutes: number): string {
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`;
}

/** Minutes as words, for the sentence a screen reader is given. */
export function spoken(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hours = h === 1 ? '1 hour' : `${h} hours`;
  if (!m) return hours;
  return `${hours} ${m} ${m === 1 ? 'minute' : 'minutes'}`;
}
