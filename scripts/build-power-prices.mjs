/**
 * Compacts 40,000 hourly prices into what the charts actually load.
 *
 * `data/source/ree-pvpc-hourly.json` holds every response the API gave, one per
 * month, untouched. This reduces them to an hour-of-day profile per year and
 * the cheapest hour of each month — a few hundred numbers instead of three
 * megabytes — and refuses to write if anything the post says has moved.
 *
 * Hours are local clock hours, taken from the offset the API itself stamps on
 * each reading. That is the hour people live by: on the two clock-change days a
 * year one hour is missing and one is doubled, and both are kept as they came.
 *
 *   node scripts/build-power-prices.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const IN = resolve(here, '../data/source/ree-pvpc-hourly.json');
const OUT = resolve(here, '../src/data/power-prices.json');

/** The tariff began on this date; a complete year of it starts in 2022. */
const TARIFF_FROM = '2021-06-01';
const FULL_YEARS = [2022, 2023, 2024, 2025];

/** Night as the old tariff drew it, against the hours the sun now owns. */
const NIGHT = [3, 4, 5];
const AFTERNOON = [14, 15, 16];

const raw = JSON.parse(readFileSync(IN, 'utf8'));

const readings = [];
for (const m of raw.months) {
  for (const series of m.body.included) {
    if (!/pvpc/i.test(series.attributes.title)) continue;
    for (const v of series.attributes.values) {
      readings.push({
        year: +v.datetime.slice(0, 4),
        month: +v.datetime.slice(5, 7),
        hour: +v.datetime.slice(11, 13),
        value: v.value,
      });
    }
  }
}

if (readings.length < 35_000) {
  throw new Error(`only ${readings.length} hourly readings — the record is short`);
}
for (const r of readings) {
  if (!(r.value > 0) || r.value > 1500) {
    throw new Error(`${r.year}-${r.month} ${r.hour}h: ${r.value} €/MWh is not a price`);
  }
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Mean price for each of the 24 clock hours, over whatever slice is given. */
function profile(rows) {
  const buckets = Array.from({ length: 24 }, () => []);
  for (const r of rows) buckets[r.hour].push(r.value);
  return buckets.map((b) => (b.length ? mean(b) : null));
}

const extremes = (hours) => {
  let low = 0;
  let high = 0;
  hours.forEach((v, h) => {
    if (v == null) return;
    if (hours[low] == null || v < hours[low]) low = h;
    if (hours[high] == null || v > hours[high]) high = h;
  });
  return { low, high };
};

// ---- One clock per month: the hour that month was cheapest ------------------

const months = [];
const seen = new Set(readings.map((r) => `${r.year}-${r.month}`));
for (const key of [...seen].sort()) {
  const [year, month] = key.split('-').map(Number);
  const rows = readings.filter((r) => r.year === year && r.month === month);
  const hours = profile(rows);
  const { low, high } = extremes(hours);
  const avg = mean(rows.map((r) => r.value));
  months.push({
    year,
    month,
    /** The hour of the day this month was cheapest, on average. */
    cheapest: low,
    dearest: high,
    /** That hour against the month's own average, so months compare. */
    depth: +(hours[low] / avg).toFixed(3),
    mean: +avg.toFixed(1),
    n: rows.length,
  });
}
months.sort((a, b) => a.year - b.year || a.month - b.month);

// ---- One profile per full year ---------------------------------------------

const years = FULL_YEARS.map((year) => {
  const rows = readings.filter((r) => r.year === year);
  const hours = profile(rows);
  const avg = mean(rows.map((r) => r.value));
  const { low, high } = extremes(hours);
  return {
    year,
    mean: +avg.toFixed(1),
    /** Each hour against the year's own average: the shape of the day. */
    shape: hours.map((v) => +(v / avg).toFixed(3)),
    hours: hours.map((v) => +v.toFixed(1)),
    cheapest: { hour: low, price: +hours[low].toFixed(1) },
    dearest: { hour: high, price: +hours[high].toFixed(1) },
    /** How far apart the cheapest hour and the dearest one stand. */
    ratio: +(hours[high] / hours[low]).toFixed(2),
    n: rows.length,
  };
});

for (const y of years) {
  if (y.n < 8600) throw new Error(`${y.year} has only ${y.n} hours — not a full year`);
}

// ---- Night against afternoon, year by year ---------------------------------

const nightVsAfternoon = [...new Set(readings.map((r) => r.year))].sort().map((year) => {
  const rows = readings.filter((r) => r.year === year);
  const night = mean(rows.filter((r) => NIGHT.includes(r.hour)).map((r) => r.value));
  const afternoon = mean(rows.filter((r) => AFTERNOON.includes(r.hour)).map((r) => r.value));
  return {
    year,
    night: +night.toFixed(1),
    afternoon: +afternoon.toFixed(1),
    /** Positive once the night costs more than the afternoon. */
    nightPremium: +((night / afternoon - 1) * 100).toFixed(0),
    partial: year === 2021 || undefined,
  };
});

const afternoonMonths = (year) =>
  months.filter((m) => m.year === year && m.cheapest >= 12 && m.cheapest <= 18).length;

const summary = {
  first: months[0],
  last: months[months.length - 1],
  monthsCovered: months.length,
  observations: readings.length,
  /** Months whose cheapest hour falls in the afternoon, first year and last. */
  afternoonFirstFull: afternoonMonths(FULL_YEARS[0]),
  afternoonLast: afternoonMonths(FULL_YEARS[FULL_YEARS.length - 1]),
  monthsInLastYear: months.filter((m) => m.year === FULL_YEARS[FULL_YEARS.length - 1]).length,
  ratioFirst: years[0].ratio,
  ratioLast: years[years.length - 1].ratio,
  nightVsAfternoon,
};

/**
 * The figures the post states in prose. If Red Eléctrica revises the series and
 * one of them moves, the build fails here rather than leaving a sentence on the
 * site quietly saying something the data no longer does.
 */
const y = (n) => years.find((v) => v.year === n);
const nva = (n) => nightVsAfternoon.find((v) => v.year === n);

const QUOTED = [
  ['cheapest hour in the last full year', y(2025).cheapest.hour, 14],
  ['dearest hour in the last full year', y(2025).dearest.hour, 21],
  ['cheapest hour price, last year', y(2025).cheapest.price, 81.2],
  ['dearest hour price, last year', y(2025).dearest.price, 219.9],
  ['gap between them, 2022', y(2022).ratio, 1.54],
  ['gap between them, 2025', y(2025).ratio, 2.71],
  ['night against afternoon, 2021', nva(2021).nightPremium, -10],
  ['night against afternoon, 2025', nva(2025).nightPremium, 31],
  ['afternoon months in 2022', summary.afternoonFirstFull, 7],
  ['afternoon months in 2025', summary.afternoonLast, 10],
  ['night months in 2022', 12 - summary.afternoonFirstFull, 5],
  ['night months in 2025', summary.monthsInLastYear - summary.afternoonLast, 2],
  ['months of record', summary.monthsCovered, 55],
  ['hourly readings', summary.observations, 40201],
];

for (const [what, found, stated] of QUOTED) {
  if (Math.abs(found - stated) > 0.051) {
    throw new Error(`${what}: the post says ${stated}, the data now says ${found}`);
  }
}

const out = {
  meta: {
    source: 'Red Eléctrica de España',
    series: 'PVPC — the regulated price for small consumers, tolls and charges included',
    endpoint: raw.endpoint,
    geo: raw.geo,
    unit: '€/MWh',
    tariffFrom: TARIFF_FROM,
    from: `${summary.first.year}-${String(summary.first.month).padStart(2, '0')}`,
    to: `${summary.last.year}-${String(summary.last.month).padStart(2, '0')}`,
    fullYears: FULL_YEARS,
    night: NIGHT,
    afternoon: AFTERNOON,
    observations: readings.length,
  },
  summary,
  months,
  years,
};

writeFileSync(OUT, JSON.stringify(out));
const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} KB`;
console.log(
  `${months.length} months · ${readings.length.toLocaleString('en-GB')} hourly readings · ` +
    `afternoon cheapest in ${summary.afternoonLast}/${summary.monthsInLastYear} months of ${FULL_YEARS.at(-1)} · ` +
    `${kb(readFileSync(IN, 'utf8'))} → ${kb(JSON.stringify(out))}`,
);
