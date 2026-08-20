/**
 * Compacts the source dataset into what the chart actually loads.
 *
 * `data/source/salaries.json` is the output of the original Python pipeline
 * (kept in `data/source/` alongside the raw INE response, so every figure on
 * the page can be traced back to what the INE published). This trims it to the
 * fields the chart uses and rounds them to the precision it can draw, which is
 * the difference between shipping 188 KB and shipping ~70 KB.
 *
 *   node scripts/build-wages.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const IN = resolve(here, '../data/source/salaries.json');
const OUT = resolve(here, '../src/data/wages.json');

const src = JSON.parse(readFileSync(IN, 'utf8'));

// The density grid is linspace(min, max, n); each occupation stores the slice
// that carries visible mass, starting at index i0.
const { min, max, n } = src.meta.grid;
const step = (max - min) / (n - 1);

const occupations = src.occupations.map((o) => ({
  id: o.id,
  label: o.label,
  official: o.official,
  family: o.family,
  lowSample: Boolean(o.low_sample),
  mean: Math.round(o.mean),
  // The five figures the INE actually publishes. Everything else is reconstructed.
  p: {
    10: Math.round(o.percentiles['10']),
    25: Math.round(o.percentiles['25']),
    50: Math.round(o.percentiles['50']),
    75: Math.round(o.percentiles['75']),
    90: Math.round(o.percentiles['90']),
  },
  // The quantile function, p01…p99, in whole euros, finer is beyond what the
  // survey resolves, never mind what a screen can draw.
  q: o.q.map((v) => Math.round(v)),
  spread: {
    p90p10: o.spread.p90_p10,
    p90p50: o.spread.p90_p50,
    p50p10: o.spread.p50_p10,
  },
  // Density as per-mille of its own peak: integers cost a third fewer bytes
  // than "0.123" and a thousandth of the peak is a quarter-pixel on the bell.
  d0: o.i0,
  d: o.d.map((v) => Math.round(v * 1000)),
}));

// The reconstruction is only trustworthy if the curve still passes through the
// figures the INE published. Index 9 of q is p10, 24 is p25, and so on.
for (const o of occupations) {
  for (const [p, i] of [
    [10, 9],
    [25, 24],
    [50, 49],
    [75, 74],
    [90, 89],
  ]) {
    const drift = Math.abs(o.q[i] - o.p[p]) / o.p[p];
    if (drift > 0.005) {
      throw new Error(
        `${o.id}: reconstructed p${p} is ${o.q[i]} but the INE publishes ${o.p[p]}`,
      );
    }
  }
}

const out = {
  meta: {
    source: src.meta.source,
    sourceUrl: src.meta.source_url,
    classification: src.meta.classification,
    level: src.meta.level,
    year: src.meta.year,
    coverageNote: src.meta.coverage_note,
    gridMin: min,
    gridStep: step,
  },
  families: src.families,
  markers: src.markers.map((m) => ({
    id: m.id,
    label: m.label,
    value: Math.round(m.value),
    note: m.note ?? null,
  })),
  occupations,
};

writeFileSync(OUT, JSON.stringify(out));
const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} KB`;
console.log(
  `${occupations.length} occupations · ${kb(readFileSync(IN, 'utf8'))} → ${kb(JSON.stringify(out))}`,
);
