/**
 * Builds the constellation bundle: five questions, their positions in the sky,
 * and the marks each one unfolds into.
 *
 * Positions come from a feature vector written by hand, not from a language
 * model. Four axes describe what a question is about; the pairwise distances
 * between those vectors are laid out in two dimensions by stress majorization.
 * That is an honest embedding of stated features, and it is labelled as such.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const R = (f) => JSON.parse(readFileSync(resolve(new URL('../../src/data/', import.meta.url).pathname, f), 'utf8'));
const day = R('time-use.json');
const bars = R('bars.json');
const power = R('power-prices.json');
const leaving = R('leaving-home.json');
const wages = R('wages.json');

/** clock/duration · Europe/Spain · household/market · stock/flow */
const FEATURES = {
  day:      [1.0, 1.0, 0.1, 0.2],
  leaving:  [0.5, 1.0, 0.2, 0.8],
  power:    [0.9, 0.0, 1.0, 0.9],
  bars:     [0.0, 0.0, 0.8, 0.9],
  wages:    [0.0, 0.0, 0.5, 0.1],
};

const KEYS = Object.keys(FEATURES);
const dist = (a, b) =>
  Math.sqrt(FEATURES[a].reduce((s, v, i) => s + (v - FEATURES[b][i]) ** 2, 0));

/** Classical stress majorization, deterministic from a fixed seed layout. */
function layout(keys, iterations = 600) {
  const n = keys.length;
  const pos = keys.map((_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [Math.cos(a), Math.sin(a)];
  });
  const D = keys.map((a) => keys.map((b) => dist(a, b)));
  for (let it = 0; it < iterations; it++) {
    const next = pos.map(() => [0, 0]);
    for (let i = 0; i < n; i++) {
      let wsum = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const d = D[i][j] || 1e-6;
        const w = 1 / (d * d);
        const dx = pos[i][0] - pos[j][0];
        const dy = pos[i][1] - pos[j][1];
        const cur = Math.hypot(dx, dy) || 1e-6;
        next[i][0] += w * (pos[j][0] + (d * dx) / cur);
        next[i][1] += w * (pos[j][1] + (d * dy) / cur);
        wsum += w;
      }
      next[i][0] /= wsum;
      next[i][1] /= wsum;
    }
    for (let i = 0; i < n; i++) pos[i] = next[i];
  }
  return pos;
}

const raw = layout(KEYS);
/** Normalise into a wide sky, then nudge so nothing sits dead centre. */
const xs = raw.map((p) => p[0]);
const ys = raw.map((p) => p[1]);
const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1;
const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
const SKY = 2200;
/**
 * Depth is the third axis of the feature vector, so a constellation that looks
 * like a shape from here is a shape in three dimensions when you fly into it.
 * Flat stars would give the game away the moment the camera moves.
 */
const at = Object.fromEntries(
  KEYS.map((k, i) => [
    k,
    [
      +(((raw[i][0] - cx) / span) * SKY * 1.6).toFixed(1),
      +(((raw[i][1] - cy) / span) * SKY * 0.95).toFixed(1),
      +((FEATURES[k][2] - 0.5) * 5200).toFixed(1),
    ],
  ]),
);

/** Every pair, ranked, so the constellation can join each star to its two nearest. */
const edges = [];
for (const a of KEYS) {
  const near = KEYS.filter((b) => b !== a)
    .map((b) => ({ b, d: dist(a, b) }))
    .sort((x, y) => x.d - y.d)
    .slice(0, 2);
  for (const { b, d } of near) {
    const key = [a, b].sort().join('|');
    if (!edges.some((e) => e.key === key)) edges.push({ key, a, b, d: +d.toFixed(3) });
  }
}

// ------------------------------------------------------------------ marks

const BAND = ['#5b70d8', '#d96a58', '#e0a72e', '#22b199', '#a96bb8'];

/** Eighteen days, six blocks each: the wall, folded into a point. */
function dayMarks() {
  const rows = day.countries;
  const n = rows.length;
  const out = [];
  rows.forEach((c, i) => {
    const y = (i / (n - 1)) * 1.72 - 0.86;
    let acc = 0;
    c.parts.forEach((m, j) => {
      const x0 = (acc / 1440) * 1.94 - 0.97;
      acc += m;
      const x1 = (acc / 1440) * 1.94 - 0.97;
      const hm = (v) => `${Math.floor(v / 60)}h${String(v % 60).padStart(2, '0')}`;
      out.push({
        k: 'r', x: (x0 + x1) / 2, y, w: x1 - x0 - 0.006, h: 0.058,
        c: BAND[j] ?? null,
        t: `${c.label} · ${day.bands[j].label} ${hm(m)}`,
      });
    });
  });
  const ax = [{ k: 'line', a: [-0.97, 0.94], b: [0.97, 0.94] }];
  for (const h of [0, 6, 12, 18, 24]) {
    const x = (h / 24) * 1.94 - 0.97;
    ax.push({ k: 'line', a: [x, 0.94], b: [x, 0.975] });
    ax.push({ k: 'text', at: [x, 1.04], s: String(h), al: 'center' });
  }
  let walked = 0;
  day.bands.forEach((b, j) => {
    const mid = (walked + day.median[j] / 2) / 1440;
    walked += day.median[j];
    ax.push({ k: 'text', at: [mid * 1.94 - 0.97, -1.0], s: b.label, al: 'center', lit: 1 });
  });
  return { marks: out, axes: ax, axis: 'day' };
}

/** Twenty-eight countries, each a point on the age it leaves home. */
function leavingMarks() {
  const cs = leaving.countries;
  const lo = 20, hi = 32;
  return {
    marks: cs.map((c, i) => ({
      k: 'd', x: ((c.post.last - lo) / (hi - lo)) * 1.9 - 0.95,
      y: (i / (cs.length - 1)) * 1.72 - 0.86, r: 0.026, c: '#7fb2ee',
      t: `${c.label} · ${c.post.last.toFixed(1)} years old`,
    })),
    axes: [
      { k: 'line', a: [-0.95, 0.94], b: [0.95, 0.94] },
      ...[20, 24, 28, 32].map((v) => {
        const x = ((v - lo) / (hi - lo)) * 1.9 - 0.95;
        return { k: 'text', at: [x, 1.02], s: String(v), al: 'center' };
      }),
      { k: 'text', at: [0, -0.98], s: 'age at which half have left', al: 'center', lit: 1 },
    ],
    axis: 'leaving',
  };
}

/** Fifty-five months on a twenty-four hour dial: the star that is a ring. */
function powerMarks() {
  return {
    marks: power.months.map((m, i) => {
      const a = (m.cheapest / 24) * Math.PI * 2 - Math.PI / 2;
      const r = 0.42 + (i / power.months.length) * 0.5;
      const hour = m.cheapest;
      const clock = hour === 0 ? 'midnight' : hour === 12 ? 'noon' : hour < 12 ? `${hour}am` : `${hour - 12}pm`;
      const month = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m.month - 1];
      return { k: 'd', x: Math.cos(a) * r, y: Math.sin(a) * r, r: 0.017, c: '#f0b429',
               t: `${month} ${m.year} · cheapest at ${clock}` };
    }),
    axes: (() => {
      const ax = [{ k: 'circle', r: 1.0 }];
      for (let h = 0; h < 24; h++) {
        const a = (h / 24) * Math.PI * 2 - Math.PI / 2;
        const inner = h % 6 === 0 ? 0.93 : 0.965;
        ax.push({ k: 'line', a: [Math.cos(a) * inner, Math.sin(a) * inner], b: [Math.cos(a), Math.sin(a)] });
      }
      const name = { 0: 'midnight', 6: '6am', 12: 'noon', 18: '6pm' };
      for (const h of [0, 6, 12, 18]) {
        const a = (h / 24) * Math.PI * 2 - Math.PI / 2;
        ax.push({
          k: 'text', at: [Math.cos(a) * 1.12, Math.sin(a) * 1.12], s: name[h],
          al: h === 6 ? 'left' : h === 18 ? 'right' : 'center', lit: h % 12 === 0 ? 1 : 0,
        });
      }
      return ax;
    })(),
    axis: 'ring',
  };
}

/** Sixteen years, each a bar of how many people share one bar. */
function barsMarks() {
  const ys2 = bars.years;
  const hi = Math.max(...ys2.map((y) => y.perBar));
  return {
    marks: ys2.map((y, i) => ({
      k: 'r', x: -0.95 + (y.perBar / hi) * 0.95, y: (i / (ys2.length - 1)) * 1.6 - 0.8,
      w: (y.perBar / hi) * 1.9, h: 0.062, c: '#e87ba4',
      t: `${y.year} · one bar for every ${Math.round(y.perBar)} people`,
    })),
    axes: [
      { k: 'line', a: [-0.95, -0.88], b: [-0.95, 0.88] },
      { k: 'text', at: [-0.99, (0 / (ys2.length - 1)) * 1.6 - 0.8], s: String(ys2[0].year), al: 'right' },
      { k: 'text', at: [-0.99, 0.8], s: String(ys2[ys2.length - 1].year), al: 'right' },
      { k: 'text', at: [0, -0.99], s: 'people who share one bar', al: 'center', lit: 1 },
    ],
    axis: 'bars',
  };
}

/**
 * Two trades, drawn as the shape of what they pay: the one that leans hardest
 * upwards against the one that leans hardest downwards, which is the finding.
 */
function wageMarks() {
  const ok = wages.occupations.filter((o) => o.d?.length && !o.lowSample && o.spread);
  const lean = (o) => o.spread.p90p50 / o.spread.p50p10;
  const up = ok.reduce((a, b) => (lean(b) > lean(a) ? b : a));
  const down = ok.reduce((a, b) => (lean(b) < lean(a) ? b : a));

  const POINTS = 46;
  const curve = (o, colour, base) => {
    const d = o.d;
    const peak = Math.max(...d);
    const out = [];
    for (let i = 0; i < POINTS; i++) {
      const at = (i / (POINTS - 1)) * (d.length - 1);
      const v = d[Math.round(at)];
      out.push({
        k: 'd',
        x: (i / (POINTS - 1)) * 1.86 - 0.93,
        y: base - (v / peak) * 0.72,
        r: 0.026,
        c: colour,
        t: o.label,
      });
    }
    return out;
  };
  return {
    marks: [...curve(up, '#eb6834', 0.02), ...curve(down, '#1baf7a', 0.88)],
    axes: [
      { k: 'line', a: [-0.93, 0.02], b: [0.93, 0.02] },
      { k: 'line', a: [-0.93, 0.88], b: [0.93, 0.88] },
      { k: 'text', at: [-0.93, -0.76], s: up.label, al: 'left', lit: 1 },
      { k: 'text', at: [-0.93, 0.1], s: down.label, al: 'left', lit: 1 },
      { k: 'text', at: [0.93, 1.0], s: 'more pay', al: 'right' },
    ],
    axis: 'wages',
    pair: [up.label, down.label],
  };
}

const CHARTS = { day: dayMarks(), leaving: leavingMarks(), power: powerMarks(), bars: barsMarks(), wages: wageMarks() };

const STARS = [
  { id: 'day', q: 'Where does a day go?', cat: 'health', tint: '#8ad0b4',
    src: '18 European countries · Eurostat time use survey, 2010 round' },
  { id: 'leaving', q: 'Has the age of leaving home shifted across Europe?', cat: 'housing', tint: '#efa88f',
    src: '28 European countries · Eurostat, EU labour force survey' },
  { id: 'power', q: 'When is electricity cheapest?', cat: 'energy', tint: '#e8cd7a',
    src: 'Spain · Red Eléctrica, hourly PVPC price' },
  { id: 'bars', q: 'How many bars are there per inhabitant?', cat: 'food', tint: '#eab77e',
    src: 'Spain · Instituto Nacional de Estadística, business register' },
  { id: 'wages', q: 'What shape is a salary?', cat: 'work', tint: '#9db6d8',
    src: 'Spain · INE, Encuesta de Estructura Salarial' },
].map((s) => ({ ...s, at: at[s.id], ...CHARTS[s.id] }));

for (const s of STARS) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const m of s.marks) {
    const hw = m.k === 'r' ? m.w / 2 : m.r;
    const hh = m.k === 'r' ? m.h / 2 : m.r;
    x0 = Math.min(x0, m.x - hw); x1 = Math.max(x1, m.x + hw);
    y0 = Math.min(y0, m.y - hh); y1 = Math.max(y1, m.y + hh);
  }
  for (const a of s.axes ?? []) {
    const pts = a.k === 'circle'
      ? [[-a.r, -a.r], [a.r, a.r]]
      : a.k === 'text' ? [a.at] : [a.a, a.b];
    for (const [px, py] of pts) {
      x0 = Math.min(x0, px); x1 = Math.max(x1, px);
      y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    }
  }
  s.box = [+(x1 - x0).toFixed(3), +(y1 - y0).toFixed(3)];
  s.mid = [+((x0 + x1) / 2).toFixed(3), +((y0 + y1) / 2).toFixed(3)];
}

const out = { sky: SKY, stars: STARS, edges: edges.map(({ a, b, d }) => ({ a, b, d })) };
writeFileSync(resolve(new URL('.', import.meta.url).pathname, 'constellation.json'), JSON.stringify(out));
console.log(
  STARS.map((s) => `${s.id.padEnd(8)} at ${String(s.at)} · ${s.marks.length} marks`).join('\n') +
    `\nedges: ${edges.map((e) => e.a + '–' + e.b).join(', ')}` +
    `\nbundle ${(Buffer.byteLength(JSON.stringify(out)) / 1024).toFixed(1)} KB`,
);
