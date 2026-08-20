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
import { geoConicConformal, geoPath, geoArea, geoCentroid } from 'd3-geo';
import { feature } from 'topojson-client';

const here = dirname(fileURLToPath(import.meta.url));
const IN = resolve(here, '../data/source/eurostat-tus_00age.json');
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

// ---------------------------------------------------------------- the map

/** ISO 3166-1 numeric, the id world-atlas keys its countries by. */
const ISO = {
  BE: '056', DE: '276', EE: '233', EL: '300', ES: '724', FR: '250',
  IT: '380', LU: '442', HU: '348', NL: '528', AT: '040', PL: '616',
  RO: '642', FI: '246', NO: '578', UK: '826', RS: '688', TR: '792',
};

const W = 760;
const H = 620;

/**
 * The window on Europe, walked degree by degree.
 *
 * It is a LineString rather than a rectangle on purpose. A conic projection
 * bends a box of longitudes and latitudes into a curved trapezium, so the fit
 * has to be measured along the whole edge, not at four corners, and a ring
 * wound the wrong way round would ask the projection to fit everything except
 * Europe.
 */
function window(west, east, south, north, step = 1) {
  const edge = [];
  for (let x = west; x <= east; x += step) edge.push([x, south]);
  for (let y = south; y <= north; y += step) edge.push([east, y]);
  for (let x = east; x >= west; x -= step) edge.push([x, north]);
  for (let y = north; y >= south; y -= step) edge.push([west, y]);
  return { type: 'LineString', coordinates: edge };
}

const FRAME = window(-11, 41, 35, 70.5);

const world = JSON.parse(readFileSync(WORLD, 'utf8'));
const land = feature(world, world.objects.countries);

const projection = geoConicConformal()
  .parallels([40, 62])
  .rotate([-16, 0])
  .fitSize([W, H], FRAME);
const inFrame = geoPath(projection);
projection.clipExtent([
  [0, 0],
  [W, H],
]);

/**
 * A path context that writes coordinates to a tenth of a pixel and throws away
 * anything too small to see. At 50m resolution the raw outlines of Europe come
 * to more than a megabyte of decimals nobody can perceive; rounded, and with
 * the specks dropped, the same coastline is a fortieth of that and looks
 * identical on screen.
 */
const PLACES = 0;
const SPECK = 2;

function shrinkingContext() {
  let out = [];
  let ring = [];
  let box = null;
  const r = (n) => +n.toFixed(PLACES);

  function flush() {
    if (ring.length > 2 && box && box[2] - box[0] >= SPECK && box[3] - box[1] >= SPECK) {
      out.push(ring.join('') + 'Z');
    }
    ring = [];
    box = null;
  }
  function note(x, y) {
    box = box
      ? [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)]
      : [x, y, x, y];
  }
  return {
    moveTo(x, y) {
      flush();
      note(r(x), r(y));
      ring.push(`M${r(x)} ${r(y)}`);
    },
    lineTo(x, y) {
      const [px, py] = [r(x), r(y)];
      const last = ring[ring.length - 1];
      const step = `L${px} ${py}`;
      // Rounding turns long runs of near-identical points into one point.
      if (last !== step) {
        note(px, py);
        ring.push(step);
      }
    },
    closePath() {
      flush();
    },
    arc() {},
    result() {
      flush();
      const d = out.join('');
      out = [];
      return d;
    },
  };
}

const context = shrinkingContext();
const path = geoPath(projection, context);

/** Only the countries with something inside the window get a path written. */
const shown = land.features.filter((f) => {
  const [[x0, y0], [x1, y1]] = inFrame.bounds(f);
  return x1 > -40 && x0 < W + 40 && y1 > -40 && y0 < H + 40;
});

const shapes = shown
  .map((f) => {
    path(f);
    return { id: f.id, d: context.result() };
  })
  .filter((s) => s.d);

/**
 * A spike stands on the middle of the country's mainland, not on the middle of
 * everything it governs: France's centroid including Guiana sits in the
 * Atlantic, and a spike in the Atlantic says nothing about France.
 */
function mainlandAnchor(f) {
  const polygons =
    f.geometry.type === 'MultiPolygon'
      ? f.geometry.coordinates.map((c) => ({ type: 'Polygon', coordinates: c }))
      : [f.geometry];
  const biggest = polygons.reduce((a, p) => (geoArea(p) > geoArea(a) ? p : a));
  return { screen: inFrame.centroid(biggest), sphere: geoCentroid(biggest) };
}

const byId = new Map(land.features.map((f) => [String(f.id), f]));
const spikes = countries.map((c) => {
  const id = ISO[c.code];
  const f = byId.get(id);
  if (!f) throw new Error(`${c.code}: no country ${id} in the world atlas`);
  const { screen, sphere } = mainlandAnchor(f);
  const [x, y] = screen;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error(`${c.code}: anchor did not project`);
  }
  return {
    code: c.code,
    label: c.label,
    minutes: get(c, 'meals'),
    x: +x.toFixed(1),
    y: +y.toFixed(1),
    /** Latitude of the same point, so "furthest south" is a fact, not a look. */
    lat: +sphere[1].toFixed(2),
  };
});

/** The tails of the map, by how far south the middle of the country lies. */
const bySouth = [...spikes].sort((a, b) => a.lat - b.lat);
const THIRD = 6;
const OVER = 105;
const southern = bySouth.slice(0, THIRD);
const northern = bySouth.slice(-THIRD);

const surveyed = new Set(Object.values(ISO));
const map = {
  width: W,
  height: H,
  shapes: shapes.map((s) => ({ ...s, on: surveyed.has(String(s.id)) || undefined })),
  spikes,
  /** The two ends of the north-south reading the map is there to show. */
  southern: southern.map((s) => s.code),
  northern: northern.map((s) => s.code),
  over: OVER,
};

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
  ['six southernmost above 1h45 at the table', southern.filter((s) => s.minutes > OVER).length, 6],
  ['six northernmost above 1h45 at the table', northern.filter((s) => s.minutes > OVER).length, 1],
  ['the northern one is the Netherlands', northern.find((s) => s.minutes > OVER)?.code === 'NL' ? 1 : 0, 1],
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
  map,
};

writeFileSync(OUT, JSON.stringify(out));
const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} KB`;
console.log(
  `${countries.length} countries · sleep ${hm(sleep.min)}–${hm(sleep.max)} · ` +
    `table ${hm(meals.min)}–${hm(meals.max)} · widest block ${widest.label} ${hm(widest.range)} apart\n` +
    `map ${map.shapes.length} shapes, ${spikes.length} spikes · ` +
    `${kb(readFileSync(IN, 'utf8'))} → ${kb(JSON.stringify(out))}`,
);
