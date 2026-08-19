/**
 * Turns the two raw INE series into the handful of numbers the charts draw.
 *
 * Both series are read on 1 January, and only the readings where both exist are
 * used. Dividing a stock of premises by a population measured six months apart
 * would be a different number every time somebody chose a different month.
 *
 *   node scripts/build-bars.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const IN = resolve(here, '../data/source/ine-bars.json');
const OUT = resolve(here, '../src/data/bars.json');

/** The population series is quarterly; this is its 1 January reading. */
const JANUARY = 19;
/** One mark on the closures field stands for this many premises. */
const PER_MARK = 1000;
/** One dot in the queue stands for this many people. */
const PER_DOT = 10;

const raw = JSON.parse(readFileSync(IN, 'utf8'));

const barsByYear = new Map(
  raw.bars.national.body.Data.map((p) => [p.Anyo, p.Valor]),
);

const popByYear = new Map(
  raw.populationSeries.body.Data.filter((p) => p.FK_Periodo === JANUARY).map((p) => [
    p.Anyo,
    p.Valor,
  ]),
);

const years = [...barsByYear.keys()]
  .filter((y) => popByYear.has(y))
  .sort((a, b) => a - b)
  .map((year) => {
    const bars = barsByYear.get(year);
    const population = Math.round(popByYear.get(year));
    return {
      year,
      bars,
      population,
      /** How many people there are for each drinking place. */
      perBar: +(population / bars).toFixed(1),
    };
  });

if (years.length < 15) throw new Error(`only ${years.length} years have both series`);
for (const y of years) {
  if (y.bars < 50_000 || y.bars > 400_000) throw new Error(`${y.year}: ${y.bars} premises`);
  if (y.population < 30e6 || y.population > 60e6) {
    throw new Error(`${y.year}: ${y.population} people`);
  }
}

const first = years[0];
const last = years[years.length - 1];

/** Years in which the count of people per bar went up on the year before. */
const worse = years.filter((y, i) => i > 0 && y.perBar > years[i - 1].perBar).length;

const spanDays = (Date.parse(`${last.year}-01-01`) - Date.parse(`${first.year}-01-01`)) / 86_400_000;

const regions = Object.entries(raw.bars.regions)
  .map(([name, s]) => {
    const by = new Map(s.body.Data.map((p) => [p.Anyo, p.Valor]));
    const from = by.get(first.year);
    const to = by.get(last.year);
    return { name, from, to, change: +(((to - from) / from) * 100).toFixed(1) };
  })
  .sort((a, b) => a.change - b.change);

const summary = {
  lost: first.bars - last.bars,
  lostShare: +(((first.bars - last.bars) / first.bars) * 100).toFixed(1),
  /** Net closures a day across the whole span. */
  perDay: +((first.bars - last.bars) / spanDays).toFixed(1),
  perBarFirst: Math.round(first.perBar),
  perBarLast: Math.round(last.perBar),
  worse,
  transitions: years.length - 1,
  /** Marks on the closures field: one per thousand premises in the first year. */
  marks: Math.round(first.bars / PER_MARK),
  marksClosed: Math.round(first.bars / PER_MARK) - Math.round(last.bars / PER_MARK),
  worstRegion: regions[0],
  bestRegion: regions[regions.length - 1],
};

/**
 * The figures the post states in prose. If the INE revises either series and
 * one of them moves, the build fails here rather than leaving a sentence on the
 * site quietly saying something the data no longer does.
 */
const QUOTED = [
  ['bars in the first year', first.bars, 202720],
  ['bars in the last year', last.bars, 163459],
  ['bars lost', summary.lost, 39261],
  ['share lost', summary.lostShare, 19.4],
  ['closures a day', summary.perDay, 7.2],
  ['people per bar, first year', summary.perBarFirst, 229],
  ['people per bar, last year', summary.perBarLast, 301],
  ['years it got worse', summary.worse, 14],
  ['years compared', summary.transitions, 15],
  ['population, last year', last.population, 49128297],
];

for (const [what, found, stated] of QUOTED) {
  if (Math.abs(found - stated) > 0.051) {
    throw new Error(`${what}: the post says ${stated}, the data now says ${found}`);
  }
}

const out = {
  meta: {
    source: 'Instituto Nacional de Estadística',
    registry: raw.registry,
    population: raw.population,
    /** What is being counted, in the register's own words. */
    activity: 'CNAE 563 — establecimientos de bebidas',
    from: first.year,
    to: last.year,
    perMark: PER_MARK,
    perDot: PER_DOT,
  },
  summary,
  years,
  regions,
};

writeFileSync(OUT, JSON.stringify(out));
console.log(
  `${years.length} years · ${first.bars.toLocaleString('en-GB')} → ${last.bars.toLocaleString('en-GB')} bars · ` +
    `${summary.perBarFirst} → ${summary.perBarLast} people each · ${summary.perDay} closed a day · ` +
    `${(Buffer.byteLength(JSON.stringify(out)) / 1024).toFixed(0)} KB`,
);
