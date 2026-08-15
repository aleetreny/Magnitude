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
