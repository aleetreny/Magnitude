import raw from '../data/power-prices.json';

/** One month of the record, reduced to the hour it was cheapest. */
export interface Month {
  year: number;
  month: number;
  /** Clock hour, 0–23, whose average price was the lowest that month. */
  cheapest: number;
  dearest: number;
  /** That hour against the month's own average. Below 1 by construction. */
  depth: number;
  mean: number;
  n: number;
}

export interface Year {
  year: number;
  mean: number;
  /** Each hour against the year's own average: the shape of the day. */
  shape: number[];
  hours: number[];
  cheapest: { hour: number; price: number };
  dearest: { hour: number; price: number };
  ratio: number;
  n: number;
}

export interface PowerPrices {
  meta: {
    source: string;
    series: string;
    endpoint: string;
    geo: string;
    unit: string;
    tariffFrom: string;
    from: string;
    to: string;
    fullYears: number[];
    night: number[];
    afternoon: number[];
    observations: number;
  };
  summary: {
    first: Month;
    last: Month;
    monthsCovered: number;
    observations: number;
    afternoonFirstFull: number;
    afternoonLast: number;
    monthsInLastYear: number;
    ratioFirst: number;
    ratioLast: number;
    nightVsAfternoon: {
      year: number;
      night: number;
      afternoon: number;
      nightPremium: number;
      partial?: boolean;
    }[];
  };
  months: Month[];
  years: Year[];
}

export const POWER = raw as PowerPrices;

/**
 * Where an hour sits on a 24-hour dial: midnight at the top, noon at the
 * bottom, running clockwise, which is how a clock with a 24-hour face is read.
 */
export function handOf(hour: number, centre: number, radius: number): [number, number] {
  const angle = (hour / 24) * Math.PI * 2;
  return [centre + radius * Math.sin(angle), centre - radius * Math.cos(angle)];
}
