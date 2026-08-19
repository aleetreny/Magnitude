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

// ---- The six cheapest hours of every day, gathered into weeks ---------------

/**
 * A quarter of the day. Six hours is what somebody with a washing machine and a
 * dishwasher is actually choosing between, and holding the count fixed means
 * every column carries exactly the same amount of ink: the eye reads where the
 * cheap hours are and nothing else.
 */
const CHEAPEST_N = 6;

const byDay = new Map();
for (const m of raw.months) {
  for (const series of m.body.included) {
    if (!/pvpc/i.test(series.attributes.title)) continue;
    for (const v of series.attributes.values) {
      const day = v.datetime.slice(0, 10);
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push({ hour: +v.datetime.slice(11, 13), value: v.value });
    }
  }
}

const days = [...byDay.keys()].sort();
for (let i = 1; i < days.length; i++) {
  const step = (Date.parse(days[i]) - Date.parse(days[i - 1])) / 86_400_000;
  if (step !== 1) throw new Error(`the record jumps from ${days[i - 1]} to ${days[i]}`);
}

const weeks = [];
for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

/**
 * The six cheapest hours of the average day of each week. Ranking the week's
 * mean day rather than counting how often an hour made a daily list gives every
 * column exactly six marks, so a column can only say where — never how much.
 */
const cheapestOf = weeks.map((w) => {
  const hours = profile(w.flatMap((d) => byDay.get(d).map((r) => ({ hour: r.hour, value: r.value }))));
  return new Set(
    hours
      .map((v, hour) => ({ hour, v }))
      .filter((p) => p.v != null)
      .sort((a, b) => a.v - b.v)
      .slice(0, CHEAPEST_N)
      .map((p) => p.hour),
  );
});

/**
 * Runs of consecutive weeks, one list per hour. Drawing a rectangle per run
 * rather than per cell takes 1,440 marks down to a few hundred shapes.
 */
const band = Array.from({ length: 24 }, (_, hour) => {
  const on = cheapestOf.map((six) => six.has(hour));
  const runs = [];
  let start = -1;
  on.forEach((v, i) => {
    if (v && start < 0) start = i;
    if (!v && start >= 0) {
      runs.push([start, i - 1]);
      start = -1;
    }
  });
  if (start >= 0) runs.push([start, on.length - 1]);
  return runs;
});

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
  ['days of record', days.length, 1675],
  ['weeks drawn', weeks.length, 240],
  ['marks on the field', band.flat().length && CHEAPEST_N * weeks.length, 1440],
  // 7pm to 10pm never makes the list — the one flat statement the field makes.
  ['weeks with a cheap hour from 7 to 10pm', [19, 20, 21, 22].reduce((n, h) => n + band[h].length, 0), 0],
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
  cheapHours: {
    cheapestN: CHEAPEST_N,
    days: days.length,
    /** First day of each week, so the axis can find where a year turns. */
    weekStarts: weeks.map((w) => w[0]),
    band,
  },
};

writeFileSync(OUT, JSON.stringify(out));
const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} KB`;
console.log(
  `${months.length} months · ${readings.length.toLocaleString('en-GB')} hourly readings · ` +
    `afternoon cheapest in ${summary.afternoonLast}/${summary.monthsInLastYear} months of ${FULL_YEARS.at(-1)} · ` +
    `${kb(readFileSync(IN, 'utf8'))} → ${kb(JSON.stringify(out))}`,
);
