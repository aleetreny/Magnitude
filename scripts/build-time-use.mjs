/**
 * Compacts Eurostat's time use table into the two figures the post draws, and
 * projects the map the second one stands on.
 *
 * The published table gives one figure per activity per country: the average
 * time a person aged 20 to 74 spends on it across a full week, written as
 * hours and minutes. Six of those activities cover the whole day, so a country
 * becomes a stack of six numbers that add to 24 hours.
 *
 * Five of the six are read straight off the table. The sixth, "the rest", is
 * the residual: 24 hours minus the other five. It holds washing and dressing,
 * every journey that is not the journey to work, and the minutes the diary
 * left unclassified. Taking it as a residual is what makes every row exactly a
 * day long, so the rows can be compared by eye without a scale to check.
 *
 *   node scripts/build-time-use.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { geoArea, geoCentroid } from 'd3-geo';
import { feature } from 'topojson-client';

const here = dirname(fileURLToPath(import.meta.url));
const IN = resolve(here, '../data/source/eurostat-tus_00age.json');
/** Outlines, read only to place a country north or south of another. */
const WORLD = resolve(here, '../node_modules/world-atlas/countries-50m.json');
const OUT = resolve(here, '../src/data/time-use.json');

const SOURCE_URL =
  'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/tus_00age?format=JSON&lang=EN';

/**
 * The 2010 round is the last one Eurostat has published in full. Diaries were
 * kept between 2008 and 2015 depending on the country, which is why the table
 * calls the whole round 2010 rather than naming a year.
 */
const WAVE = '2010';
/** The age band the survey reports as its standard population. */
const AGE = 'Y20-74';
const SEX = 'T';
const UNIT = 'TIME_SP';

const DAY = 24 * 60;

/**
 * The six blocks a day is drawn in. `codes` are Eurostat activity codes; the
 * residual has none, it is what the other five leave.
 */
const BANDS = [
  { key: 'sleep', label: 'asleep', codes: ['AC01'] },
  { key: 'meals', label: 'meals', codes: ['AC02'] },
  { key: 'work', label: 'work', codes: ['AC1_TR', 'AC2'] },
  { key: 'home', label: 'home', codes: ['AC3'] },
  { key: 'free', label: 'free', codes: ['AC4-8'] },
  { key: 'rest', label: 'rest', codes: null },
];

const RENAME = { EL: 'Greece', UK: 'United Kingdom', DE: 'Germany' };

const src = JSON.parse(readFileSync(IN, 'utf8'));
if (src.extension?.id !== 'TUS_00AGE') {
  throw new Error(`expected dataset TUS_00AGE, found ${src.extension?.id}`);
}

const dimOrder = src.id;
const shape = src.size;
const at = (d) => src.dimension[d].category.index;
const labelOf = (d, k) => src.dimension[d].category.label[k];

/** JSON-stat keys `value` by the linear index of the dimension tuple. */
function cell(sel) {
  const coords = dimOrder.map((d) => at(d)[sel[d]]);
  if (coords.some((c) => c === undefined)) return null;
  let n = 0;
  for (let i = 0; i < coords.length; i++) n = n * shape[i] + coords[i];
  const raw = src.value[n];
  if (raw == null) return null;
  const [h, m] = String(raw).split(':').map(Number);
  return h * 60 + m;
}

const minutes = (geo, code) =>
  cell({ freq: 'A', unit: UNIT, sex: SEX, age: AGE, acl00: code, geo, time: WAVE });

function dayOf(geo) {
  const named = BANDS.filter((b) => b.codes);
  const parts = named.map((b) => {
    const each = b.codes.map((c) => minutes(geo, c));
    return each.some((v) => v == null) ? null : each.reduce((a, v) => a + v, 0);
  });
  if (parts.some((p) => p == null)) return null;
  const rest = DAY - parts.reduce((a, p) => a + p, 0);
  return [...parts, rest];
}

const geos = Object.keys(at('geo'));
const countries = [];
for (const geo of geos) {
  const parts = dayOf(geo);
  if (!parts) continue;
  countries.push({ code: geo, label: RENAME[geo] ?? labelOf('geo', geo), parts });
}

/**
 * A residual can go negative if a country's published parts already overrun the
 * day, and a day that does not add up cannot be drawn as a day.
 */
for (const c of countries) {
  const sum = c.parts.reduce((a, p) => a + p, 0);
  if (sum !== DAY) throw new Error(`${c.code}: parts sum to ${sum} minutes, not ${DAY}`);
  for (const [i, p] of c.parts.entries()) {
    if (p <= 0) throw new Error(`${c.code}: ${BANDS[i].key} is ${p} minutes`);
  }
}

const idx = Object.fromEntries(BANDS.map((b, i) => [b.key, i]));
const get = (c, key) => c.parts[idx[key]];

// Sorted by time at the table: the one block whose order is a map of Europe.
countries.sort((a, b) => get(b, 'meals') - get(a, 'meals'));

/** How far apart the eighteen countries are on each block of the day. */
const spread = BANDS.map((b, i) => {
  const values = countries.map((c) => c.parts[i]);
  const low = countries.reduce((a, c) => (c.parts[i] < a.parts[i] ? c : a));
  const high = countries.reduce((a, c) => (c.parts[i] > a.parts[i] ? c : a));
  return {
    key: b.key,
    label: b.label,
    min: Math.min(...values),
    max: Math.max(...values),
    range: Math.max(...values) - Math.min(...values),
    lowest: { code: low.code, label: low.label, value: low.parts[i] },
    highest: { code: high.code, label: high.label, value: high.parts[i] },
  };
});

/**
 * The residual against the rest of the field, and what fills it. The method
 * note names both, because the United Kingdom's residual is visibly the widest
 * on the chart and a reader deserves to know why without guessing.
 */
const restOthers = countries
  .filter((c) => c.code !== 'UK')
  .map((c) => get(c, 'rest'))
  .sort((a, b) => a - b);
const restMedianOthers = Math.round(
  (restOthers[Math.floor((restOthers.length - 1) / 2)] +
    restOthers[Math.ceil((restOthers.length - 1) / 2)]) /
    2,
);
const unclassified = (geo) => minutes(geo, 'AC99NSP');

const named = spread.filter((s) => s.key !== 'rest');
const widest = named.reduce((a, s) => (s.range > a.range ? s : a));
const narrowest = named.reduce((a, s) => (s.range < a.range ? s : a));
const meals = spread[idx.meals];
const sleep = spread[idx.sleep];

/** The median day, used to hang the band names above their own column. */
const median = BANDS.map((_, i) => {
  const v = countries.map((c) => c.parts[i]).sort((a, b) => a - b);
  return Math.round((v[Math.floor((v.length - 1) / 2)] + v[Math.ceil((v.length - 1) / 2)]) / 2);
});

// ------------------------------------------------------------- geography

/**
 * One number per country: the latitude of the middle of its mainland.
 *
 * The post says the six countries furthest south all pass an hour and
 * three quarters at the table and that only one of the six furthest north
 * does, so "furthest south" has to be a measurement rather than an
 * impression. It is taken on the largest polygon a country owns, not on
 * everything it governs: France's centre of gravity including its overseas
 * departments sits in the Atlantic.
 *
 * The outlines are a build-time dependency only. Nothing about them is
 * written to the page.
 */
const ISO = {
  BE: '056', DE: '276', EE: '233', EL: '300', ES: '724', FR: '250',
  IT: '380', LU: '442', HU: '348', NL: '528', AT: '040', PL: '616',
  RO: '642', FI: '246', NO: '578', UK: '826', RS: '688', TR: '792',
};

const world = JSON.parse(readFileSync(WORLD, 'utf8'));
const land = feature(world, world.objects.countries);
const byId = new Map(land.features.map((f) => [String(f.id), f]));

function mainlandLatitude(geo) {
  const f = byId.get(ISO[geo]);
  if (!f) throw new Error(`${geo}: no country ${ISO[geo]} in the world atlas`);
  const polygons =
    f.geometry.type === 'MultiPolygon'
      ? f.geometry.coordinates.map((c) => ({ type: 'Polygon', coordinates: c }))
      : [f.geometry];
  const biggest = polygons.reduce((a, p) => (geoArea(p) > geoArea(a) ? p : a));
  const lat = geoCentroid(biggest)[1];
  if (!Number.isFinite(lat)) throw new Error(`${geo}: centroid did not resolve`);
  return +lat.toFixed(2);
}

for (const c of countries) c.lat = mainlandLatitude(c.code);

/** The tails of the map, by how far south the middle of the country lies. */
const bySouth = [...countries].sort((a, b) => a.lat - b.lat);
const THIRD = 6;
const OVER = 105;
const southern = bySouth.slice(0, THIRD);
const northern = bySouth.slice(-THIRD);

/**
 * How far each seam between two blocks wanders across the eighteen. This is
 * what the threads on the chart draw, and the sentence under it quotes the
 * widest of them.
 */
const seams = BANDS.slice(0, -1).map((_, k) => {
  const at = countries.map((c) => c.parts.slice(0, k + 1).reduce((a, p) => a + p, 0));
  return {
    after: BANDS.slice(0, k + 1).map((b) => b.key).join('+'),
    min: Math.min(...at),
    max: Math.max(...at),
    range: Math.max(...at) - Math.min(...at),
  };
});
const widestSeam = seams.reduce((a, s) => (s.range > a.range ? s : a));

// ------------------------------------------------------------- assertions

const hm = (m) => `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
const of = (code) => countries.find((c) => c.code === code);

/**
 * Every figure the post states in prose. Eurostat revises; if one of these
 * moves the build stops here rather than leaving a sentence on the site that
 * the data no longer supports.
 */
const QUOTED = [
  ['countries drawn', countries.length, 18],
  ['shortest night', sleep.min, 481],
  ['longest night', sleep.max, 523],
  ['sleep, how far apart', sleep.range, 42],
  ['widest block, minutes apart', widest.range, 96],
  ['widest block is free time', widest.key === 'free' ? 1 : 0, 1],
  ['narrowest block is sleep', narrowest.key === 'sleep' ? 1 : 0, 1],
  ['longest at the table', meals.max, 133],
  ['shortest at the table', meals.min, 81],
  ['the table, how far apart', meals.range, 52],
  ['Greece, at the table', of('EL').parts[idx.meals], 133],
  ['Estonia, at the table', of('ES') && of('EE').parts[idx.meals], 81],
  ['Spain, at the table', of('ES').parts[idx.meals], 119],
  ['France, at the table', of('FR').parts[idx.meals], 132],
  ['Finland, free time', of('FI').parts[idx.free], 349],
  ['Romania, free time', of('RO').parts[idx.free], 253],
  ['Norway, asleep', of('NO').parts[idx.sleep], 481],
  ['Estonia, asleep', of('EE').parts[idx.sleep], 523],
  ['Austria, at work', of('AT').parts[idx.work], 236],
  ['Greece, at work', of('EL').parts[idx.work], 167],
  ['largest residual', spread[idx.rest].max, 186],
  ['United Kingdom holds the largest residual', spread[idx.rest].highest.code === 'UK' ? 1 : 0, 1],
  ['six southernmost above 1h45 at the table', southern.filter((c) => get(c, 'meals') > OVER).length, 6],
  ['six northernmost above 1h45 at the table', northern.filter((c) => get(c, 'meals') > OVER).length, 1],
  ['the northern one is the Netherlands', northern.find((c) => get(c, 'meals') > OVER)?.code === 'NL' ? 1 : 0, 1],
  ['seams drawn as threads', seams.length, 5],
  ['the widest seam wanders less than 1h45', widestSeam.range < 105 ? 1 : 0, 1],
  ['how far the widest seam wanders', widestSeam.range, 103],
  ['median residual outside the United Kingdom', restMedianOthers, 132],
  ['United Kingdom, unclassified minutes', unclassified('UK'), 46],
  ['Spain, unclassified minutes', unclassified('ES'), 2],
  // The three shades the map is drawn in, and how many countries wear each.
  ['countries under 1h45 at the table', countries.filter((c) => get(c, 'meals') < 105).length, 9],
  ['countries from 1h45 to 2h', countries.filter((c) => get(c, 'meals') >= 105 && get(c, 'meals') < 120).length, 6],
  ['countries at 2h or more', countries.filter((c) => get(c, 'meals') >= 120).length, 3],
];

for (const [what, found, stated] of QUOTED) {
  if (found !== stated) {
    throw new Error(`${what}: the article says ${stated}, the data now says ${found}`);
  }
}

const out = {
  meta: {
    source: 'Eurostat',
    dataset: 'tus_00age',
    sourceUrl: SOURCE_URL,
    survey: 'Harmonised European Time Use Survey',
    indicator: src.label,
    wave: WAVE,
    ages: '20 to 74',
    sex: 'Total',
    unit: 'minutes a day, averaged over every day of the week',
    updated: src.updated,
    countries: countries.length,
    day: DAY,
  },
  bands: BANDS.map((b) => ({ key: b.key, label: b.label, codes: b.codes })),
  median,
  countries,
  summary: {
    spread,
    restMedianOthers,
    widest: { key: widest.key, label: widest.label, range: widest.range },
    narrowest: { key: narrowest.key, label: narrowest.label, range: narrowest.range },
    meals,
    sleep,
  },
  seams,
};

writeFileSync(OUT, JSON.stringify(out));
const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} KB`;
console.log(
  `${countries.length} countries · sleep ${hm(sleep.min)}–${hm(sleep.max)} · ` +
    `table ${hm(meals.min)}–${hm(meals.max)} · widest block ${widest.label} ${hm(widest.range)} apart · ` +
    `widest seam ${hm(widestSeam.range)} · ` +
    `${kb(readFileSync(IN, 'utf8'))} → ${kb(JSON.stringify(out))}`,
);
