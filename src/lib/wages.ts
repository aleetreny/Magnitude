import raw from '../data/wages.json';

export interface Occupation {
  id: string;
  label: string;
  /** The INE's own wording for the series. Never paraphrased. */
  official: string;
  family: string;
  /** The INE flags estimates resting on 100–500 observations. These carry a †. */
  lowSample: boolean;
  mean: number;
  /** The five figures the INE publishes. Everything else is reconstructed. */
  p: Record<'10' | '25' | '50' | '75' | '90', number>;
  /** The quantile function, p01…p99, in euros. */
  q: number[];
  spread: { p90p10: number; p90p50: number; p50p10: number };
  /** Density, per-mille of its own peak, starting at grid index d0. */
  d0: number;
  d: number[];
}

export interface Marker {
  id: string;
  label: string;
  value: number;
  note: string | null;
}

export interface WageData {
  meta: {
    source: string;
    sourceUrl: string;
    classification: string;
    level: string;
    year: number;
    coverageNote: string;
    gridMin: number;
    gridStep: number;
  };
  families: Record<string, string>;
  markers: Marker[];
  occupations: Occupation[];
}

export const WAGES = raw as WageData;

/** Families in CNO-11 order, top of the classification to the bottom. */
export const FAMILY_ORDER = [
  'direccion',
  'profesional',
  'tecnico',
  'administrativo',
  'servicios',
  'oficios',
  'elemental',
];

/**
 * Six is the soft cap on a categorical palette: past it, adjacent hues stop
 * being reliably distinguishable, and no amount of ordering fixes that.
 */
export const MAX_SELECTED = 6;

/**
 * The opening four: the widest published spread and the narrowest, at opposite
 * ends of the pay range, so the point of the chart is visible before anyone
 * touches it.
 */
export const DEFAULT_SELECTION = ['direccion-produccion', 'tic', 'cultura', 'restauracion'];

/** The INE publishes p10 to p90. Outside that the curve is extrapolated. */
export const MEASURED_FROM = 10;
export const MEASURED_TO = 90;

export function occupationsByFamily(): { key: string; label: string; items: Occupation[] }[] {
  return FAMILY_ORDER.map((key) => ({
    key,
    label: WAGES.families[key] ?? key,
    items: WAGES.occupations
      .filter((o) => o.family === key)
      .sort((a, b) => a.p['50'] - b.p['50']),
  })).filter((g) => g.items.length > 0);
}

export function byId(id: string): Occupation | undefined {
  return WAGES.occupations.find((o) => o.id === id);
}

/** Salary in euros at grid index i of the density grid. */
export function gridValue(i: number): number {
  return WAGES.meta.gridMin + i * WAGES.meta.gridStep;
}

const euros = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

export const formatEuro = (v: number) => euros.format(v);

export const formatCompact = (v: number) =>
  v >= 1000 ? `€${Math.round(v / 1000)}k` : `€${Math.round(v)}`;

/** p1 → "p1", 50 → "p50". The percentile is always within the occupation. */
export const formatPercentile = (p: number) => `p${p}`;

/* ------------------------------------------------------------------ shapes */

/**
 * How far right a trade's pay stretches, measured against how far left it
 * stretches, in log space:
 *
 *     lean = log(p90 / p50) ÷ log(p50 / p10)
 *
 * 1 means the two halves reach equally far. Below 1 the bottom stretches
 * further — the tail is part-time and partial years. Above 1 the top does —
 * the tail is overtime, shifts and seniority.
 */
export function leanOf(o: Occupation): number {
  return Math.log(o.p['90'] / o.p['50']) / Math.log(o.p['50'] / o.p['10']);
}

export const LEAN_THRESHOLDS = [0.62, 0.8, 0.93, 1.07, 1.2, 1.38];

export const LEAN_NAMES = [
  'leans down, hard',
  'leans down',
  'leans down a little',
  'even',
  'leans up a little',
  'leans up',
  'leans up, hard',
];

/**
 * A diverging ink: cool where the bottom stretches, warm where the top does,
 * neutral grey in between. Every step clears 2.8:1 on the article's paper and
 * each arm darkens monotonically away from the middle. Direction is carried
 * twice — by hue and by the hatch angle — so it never rests on colour alone.
 */
export const LEAN_INK = [
  '#12467f',
  '#2a78d6',
  '#5598e7',
  '#8b8880',
  '#dd7f52',
  '#d64b3a',
  '#962f22',
];

export function leanStep(lean: number): number {
  let i = 0;
  while (i < LEAN_THRESHOLDS.length && lean >= LEAN_THRESHOLDS[i]!) i++;
  return i;
}

/**
 * Silhouettes are drawn out to 2.6× a trade's own median, which holds all but
 * a fraction of a percent of the mass for a typical one and spends no width on
 * the flat stretch beyond.
 */
export const XMAX = 2.6;

export interface Shape {
  id: string;
  label: string;
  official: string;
  family: string;
  lowSample: boolean;
  median: number;
  p10: number;
  p90: number;
  lean: number;
  step: number;
  ink: string;
  /** Density in multiples of the trade's own median, height as share of peak. */
  points: [number, number][];
}

/**
 * Every trade's density, rescaled so its own median sits at 1 and its own peak
 * at 1. Both the level and the height are divided out, which is the whole
 * point: what is left is only the form.
 */
export function shapeOf(o: Occupation, everyNth = 2): Shape {
  const median = o.p['50'];
  const points: [number, number][] = [];
  for (let i = 0; i < o.d.length; i += everyNth) {
    const x = (gridValue(o.d0 + i) / median);
    if (x > XMAX) break;
    points.push([x, o.d[i]! / 1000]);
  }
  // Close the silhouette onto the baseline at both ends.
  if (points.length && points[0]![1] > 0) points.unshift([points[0]![0], 0]);
  if (points.length && points[points.length - 1]![1] > 0) {
    points.push([points[points.length - 1]![0], 0]);
  }
  const lean = leanOf(o);
  const step = leanStep(lean);
  return {
    id: o.id,
    label: o.label,
    official: o.official,
    family: o.family,
    lowSample: o.lowSample,
    median,
    p10: o.p['10'],
    p90: o.p['90'],
    lean,
    step,
    ink: LEAN_INK[step]!,
    points,
  };
}

export function allShapes(): Shape[] {
  return WAGES.occupations.map((o) => shapeOf(o));
}
