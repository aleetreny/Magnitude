/**
 * Compacts the raw Eurostat response into what the chart actually loads.
 *
 * `data/source/eurostat-yth_demo_030.json` is the JSON-stat the dissemination
 * API returned, kept exactly as it came so every figure on the page can be
 * traced back to it. This pulls out the total-sex series, splits each country
 * at the 2021 break in series, and writes the summary the chart draws.
 *
 * The 2021 split is the whole reason this script exists. Eurostat flags a break
 * for 34 of the 36 territories in that year — the EU-LFS was redefined — so a
 * figure from 2020 and one from 2021 are not the same measurement and must
 * never be differenced. Everything downstream works within one era or the
 * other, never across.
 *
 *   node scripts/build-leaving-home.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const IN = resolve(here, '../data/source/eurostat-yth_demo_030.json');
const OUT = resolve(here, '../src/data/leaving-home.json');

const SOURCE_URL =
  'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/yth_demo_030?format=JSON&lang=EN';

/** The year Eurostat's break flag falls, and the first year of the new survey. */
const BREAK_YEAR = 2021;
/** A country needs this many years on each side to say anything about either. */
const MIN_PRE = 10;
const MIN_POST = 3;
/**
 * Every row is read across one axis and headed by one figure, so a country
 * that stopped reporting before the last year cannot have a row: its number
 * would be a different year's from its neighbours'. This drops Türkiye, whose
 * series ends in 2024, and the United Kingdom, whose series ends in 2019.
 */
const NEEDS_LAST_YEAR = true;
/** The EU aggregate drawn as a reference; the other one is dropped. */
const EU = 'EU27_2020';
const DROP = ['EA21'];

/** Eurostat's own labels, shortened only where they would not fit a row. */
const RENAME = {
  EU27_2020: 'European Union',
  DE: 'Germany',
  MK: 'North Macedonia',
};

const src = JSON.parse(readFileSync(IN, 'utf8'));

if (src.extension?.id !== 'YTH_DEMO_030') {
  throw new Error(`expected dataset YTH_DEMO_030, found ${src.extension?.id}`);
}

// JSON-stat: `value` is a flat object keyed by the linear index of the
// dimension tuple, in the order `id` gives, with `size` as the shape.
const dimOrder = src.id;
const shape = src.size;
const idxOf = Object.fromEntries(dimOrder.map((d, i) => [d, i]));

function linear(coords) {
  let n = 0;
  for (let i = 0; i < coords.length; i++) n = n * shape[i] + coords[i];
  return n;
}

const geoIndex = src.dimension.geo.category.index;
const geoLabel = src.dimension.geo.category.label;
const timeIndex = src.dimension.time.category.index;
const sexIndex = src.dimension.sex.category.index;
const years = Object.keys(timeIndex).sort();

function cell(geo, year) {
  const coords = dimOrder.map(() => 0);
  coords[idxOf.sex] = sexIndex.T;
  coords[idxOf.geo] = geoIndex[geo];
  coords[idxOf.time] = timeIndex[year];
  const at = linear(coords);
  return { value: src.value[at] ?? null, flag: src.status?.[at] ?? null };
}

/** Everything Eurostat published for one territory, in year order. */
function seriesOf(geo) {
  return years
    .map((y) => ({ year: +y, ...cell(geo, y) }))
    .filter((p) => p.value != null)
    .map((p) => ({ year: p.year, value: p.value, brk: p.flag === 'b' || undefined }));
}

function eraOf(points) {
  if (!points.length) return null;
  const values = points.map((p) => p.value);
  return {
    from: points[0].year,
    to: points[points.length - 1].year,
    n: points.length,
    min: Math.min(...values),
    max: Math.max(...values),
    first: points[0].value,
    last: points[points.length - 1].value,
    /** Everything twenty-one years of one survey did to this country. */
    span: +(Math.max(...values) - Math.min(...values)).toFixed(1),
  };
}

function territory(geo) {
  const series = seriesOf(geo);
  const pre = series.filter((p) => p.year < BREAK_YEAR);
  const post = series.filter((p) => p.year >= BREAK_YEAR);
  return {
    code: geo,
    label: RENAME[geo] ?? geoLabel[geo],
    series,
    pre: eraOf(pre),
    post: eraOf(post),
  };
}

const breakYearFlags = Object.keys(geoIndex).filter(
  (g) => cell(g, String(BREAK_YEAR)).flag === 'b',
);
if (breakYearFlags.length < 25) {
  throw new Error(
    `only ${breakYearFlags.length} territories are flagged as breaking in ${BREAK_YEAR}. ` +
      `The post is built on that break being general — re-read the data before publishing.`,
  );
}

const eu = territory(EU);

const all = Object.keys(geoIndex)
  .filter((g) => g !== EU && !DROP.includes(g))
  .map(territory);

const lastYear = Math.max(...all.flatMap((t) => t.series.map((p) => p.year)));

const countries = all
  // A territory earns a row only if both eras can speak for themselves.
  .filter((t) => (t.pre?.n ?? 0) >= MIN_PRE && (t.post?.n ?? 0) >= MIN_POST)
  .filter((t) => !NEEDS_LAST_YEAR || t.post.to === lastYear)
  .sort((a, b) => b.post.last - a.post.last);

for (const t of [eu, ...countries]) {
  for (const p of t.series) {
    if (p.value < 15 || p.value > 40) {
      throw new Error(`${t.code} ${p.year}: ${p.value} is outside any plausible age`);
    }
  }
}

const medianOf = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/** Everything the median country did inside each survey, one era at a time. */
const median = medianOf(countries.map((c) => c.pre.span));
const medianNow = medianOf(countries.map((c) => c.post.span));

const latest = countries.map((c) => c.post.last);
const gap = +(Math.max(...latest) - Math.min(...latest)).toFixed(1);

const summary = {
  /** Median country's entire range across the 2000–2020 survey. */
  medianSpan: median,
  /** The same, inside the survey running now — the one the chart draws. */
  medianSpanNow: medianNow,
  /**
   * How much further apart the countries are than the median one has moved.
   * Both figures come from the current survey, so this compares like with like.
   */
  timesWider: Math.round(gap / medianNow),
  /** Countries whose five years of readings fit inside the median's range. */
  asStill: countries.filter((c) => c.post.span <= medianNow).length,
  widestSpan: countries.reduce((a, b) => (b.pre.span > a.pre.span ? b : a)),
  /** Distance between the earliest and the latest country in the last year. */
  gap,
  earliest: countries[countries.length - 1],
  latest: countries[0],
  /** The largest single-year move in the record, break year included. */
  breakJump: countries
    .map((c) => {
      const before = c.series.find((p) => p.year === BREAK_YEAR - 1);
      const after = c.series.find((p) => p.year === BREAK_YEAR);
      if (!before || !after) return null;
      return { code: c.code, label: c.label, jump: +(after.value - before.value).toFixed(1) };
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(b.jump) - Math.abs(a.jump))[0],
};

/**
 * The figures the article states in prose. If Eurostat revises the dataset and
 * one of them moves, the build fails here rather than leaving a sentence on the
 * site quietly saying something the data no longer does.
 */
const of = (code) => countries.find((c) => c.code === code);

const QUOTED = [
  ['median country span, 2000–2020', summary.medianSpan, 1.6],
  ['median country span, current survey', summary.medianSpanNow, 0.5],
  ['how many times wider the gap is', summary.timesWider, 20],
  ['countries as still as the median', summary.asStill, 15],
  ['countries drawn', countries.length, 28],
  ['gap between earliest and latest country', summary.gap, 10.2],
  ['earliest country', summary.earliest.post.last, 21.3],
  ['latest country', summary.latest.post.last, 31.5],
  ['Spain, last year', of('ES').post.last, 30.2],
  ['Spain, lowest reading to 2020', of('ES').pre.min, 28.3],
  ['Spain, highest reading to 2020', of('ES').pre.max, 29.8],
  ['Germany, span 2000–2020', of('DE').pre.span, 0.4],
  ['Germany, lowest reading to 2020', of('DE').pre.min, 23.7],
  ['Germany, highest reading to 2020', of('DE').pre.max, 24.1],
  ['Sweden, lowest reading before the break', of('SE').pre.min, 17.5],
  ['Sweden, highest reading before the break', of('SE').pre.max, 21.0],
  // Never a difference across the break: each of these is one survey's own range.
  ['European average, 2002–2020 low', eu.pre.min, 26.1],
  ['European average, 2002–2020 high', eu.pre.max, 26.8],
  ['European average, span 2002–2020', eu.pre.span, 0.7],
  ['European average, span 2021–2025', eu.post.span, 0.4],
  ['largest single-year move in the record', summary.breakJump.jump, 4.5],
  // The two wobbles the method note names.
  ['Portugal, first reading of the new survey', of('PT').post.first, 33.3],
  ['Portugal, second reading of the new survey', of('PT').series.find((p) => p.year === 2022).value, 30.1],
  ['shortest run of the old survey', Math.min(...countries.map((c) => c.pre.n)), 11],
  ['longest run of the old survey', Math.max(...countries.map((c) => c.pre.n)), 21],
];

for (const [what, found, stated] of QUOTED) {
  if (Math.abs(found - stated) > 0.05) {
    throw new Error(`${what}: the article says ${stated}, the data now says ${found}`);
  }
}

const out = {
  meta: {
    source: 'Eurostat',
    dataset: 'yth_demo_030',
    sourceUrl: SOURCE_URL,
    indicator: src.label,
    definition:
      'The age at which 50% of the population no longer live in a household with their parents',
    survey: 'EU Labour Force Survey',
    updated: src.updated,
    unit: Object.values(src.dimension.unit.category.label)[0],
    sex: 'Total',
    breakYear: BREAK_YEAR,
    breakCount: breakYearFlags.length,
    lastYear,
  },
  summary: {
    medianSpan: summary.medianSpan,
    medianSpanNow: summary.medianSpanNow,
    timesWider: summary.timesWider,
    asStill: summary.asStill,
    countries: countries.length,
    widest: { code: summary.widestSpan.code, label: summary.widestSpan.label, span: summary.widestSpan.pre.span },
    gap: summary.gap,
    earliest: { code: summary.earliest.code, label: summary.earliest.label, value: summary.earliest.post.last },
    latest: { code: summary.latest.code, label: summary.latest.label, value: summary.latest.post.last },
    breakJump: summary.breakJump,
  },
  eu,
  countries,
};

writeFileSync(OUT, JSON.stringify(out));
const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} KB`;
console.log(
  `${countries.length} countries · median span ${summary.medianSpan} yrs · gap ${gap} yrs · ` +
    `${kb(readFileSync(IN, 'utf8'))} → ${kb(JSON.stringify(out))}`,
);
