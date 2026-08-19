/**
 * Forty-nine silhouettes.
 *
 * Each one is a trade's pay distribution with the money divided out: the x axis
 * counts multiples of that trade's own median, the height is a share of its own
 * peak. What survives both divisions is only the form — and the forms fall into
 * two families that have nothing to do with what the work pays.
 *
 * The paths are rebuilt for each layout rather than scaled by a transform, so
 * the engraved hatch keeps one constant weight whatever size a shape is drawn
 * at. Every shape carries the same number of samples, which is what lets one
 * silhouette morph into another position as a plain `d` interpolation.
 */
import { mean } from 'd3-array';
import { easeCubicInOut, easeCubicOut } from 'd3-ease';
import { scaleLinear } from 'd3-scale';
import { select } from 'd3-selection';
import { area, curveLinear } from 'd3-shape';
import 'd3-transition';

import { XMAX, allShapes, formatEuro, type Shape } from '../lib/wages';

type Layout = 'wave' | 'grid';
type Order = 'lean' | 'pay' | 'family';

const FAMILY_ORDER = [
  'direccion',
  'profesional',
  'tecnico',
  'administrativo',
  'servicios',
  'oficios',
  'elemental',
];

/** Every shape is sampled onto this many points so any two can interpolate. */
const SAMPLES = 96;

/** Headroom above the first ridge, which stands taller than its own row. */
const WAVE_HEAD = 74;
/** Space under the last grid row for its name. */
const GRID_LABEL = 18;
/** Room under the wave for its x axis. */
const AXIS_FOOT = 26;

/**
 * IBM Plex Mono advances 0.6em per glyph and the label adds 0.06em of
 * letter-spacing, so a name's width is exactly its length × 0.66em. Measured,
 * not estimated — trimming to a cell has to be right the first time.
 */
const MONO_ADVANCE = 0.66;
function fitLabel(text: string, boxW: number, fontPx: number): string {
  const budget = Math.floor(boxW / (fontPx * MONO_ADVANCE));
  return text.length <= budget ? text : `${text.slice(0, Math.max(1, budget - 1))}…`;
}

/** Resample a silhouette onto a fixed grid of x positions. */
function resample(points: [number, number][]): number[] {
  const ys = new Array<number>(SAMPLES).fill(0);
  if (!points.length) return ys;
  let cursor = 0;
  for (let s = 0; s < SAMPLES; s++) {
    const x = (s / (SAMPLES - 1)) * XMAX;
    while (cursor < points.length - 2 && points[cursor + 1]![0] < x) cursor++;
    const a = points[cursor]!;
    const b = points[Math.min(cursor + 1, points.length - 1)]!;
    if (x < a[0] || b[0] === a[0]) {
      ys[s] = x < a[0] ? 0 : a[1];
    } else if (x > b[0]) {
      ys[s] = 0;
    } else {
      const t = (x - a[0]) / (b[0] - a[0]);
      ys[s] = a[1] + (b[1] - a[1]) * t;
    }
  }
  return ys;
}

interface Placed extends Shape {
  ys: number[];
  /** Where this shape sits in the current layout, in figure pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export function initWageShapes(root: HTMLElement) {
  const stage = root.querySelector<HTMLElement>('[data-shapes-stage]');
  const readout = root.querySelector<HTMLElement>('[data-shapes-readout]');
  if (!stage) return;

  const shapes = allShapes().map((s) => ({ ...s, ys: resample(s.points) }));
  /** The shape of the median trade — the ghost every silhouette is read against. */
  const typical = Array.from({ length: SAMPLES }, (_, i) => mean(shapes, (s) => s.ys[i]!) ?? 0);

  let layout: Layout = 'wave';
  let order: Order = 'lean';
  let active: string | null = null;
  let first = true;

  stage.querySelector('[data-shapes-fallback]')?.remove();
  const svg = select(stage).append('svg').attr('class', 'ws-svg');
  const gGhost = svg.append('g').attr('class', 'ws-ghost');
  const gShapes = svg.append('g').attr('class', 'ws-shapes');
  // Above the silhouettes: every ridge is opaque, so a rule behind them would
  // only ever show in the gaps.
  const gRule = svg.append('g').attr('class', 'ws-rule');
  const gLabels = svg.append('g').attr('class', 'ws-labels');
  const gAxis = svg.append('g').attr('class', 'ws-axis');

  let W = 0;
  let H = 0;
  let wide = true;

  /**
   * What the buttons just did, said in words. A reader who has not been told
   * what "by lean" means cannot tell whether the order changed or the data did.
   */
  const ORDER_TEXT: Record<Order, string> = {
    lean: 'Sorted by shape: the jobs with the longest low-pay tail first, the ones with the longest high-pay tail last.',
    pay: 'Sorted by pay: the worst paid job first, the best paid last — which scatters the colours, because the two have almost nothing to do with each other.',
    family: 'Grouped by kind of work, in the official order: managers first, then professionals, technicians, clerical, services, trades, and labouring last.',
  };
  const LAYOUT_TEXT: Record<Layout, string> = {
    wave: '',
    grid: ' Each one is drawn in its own box, at its own size.',
  };
  const explain = root.querySelector<HTMLElement>('[data-ws-explain]');
  function updateExplain() {
    if (explain) explain.textContent = ORDER_TEXT[order] + LAYOUT_TEXT[layout];
  }

  const sorted = () => {
    const list = [...shapes];
    if (order === 'lean') list.sort((a, b) => a.lean - b.lean);
    if (order === 'pay') list.sort((a, b) => a.median - b.median);
    if (order === 'family') {
      list.sort(
        (a, b) =>
          FAMILY_ORDER.indexOf(a.family) - FAMILY_ORDER.indexOf(b.family) || a.lean - b.lean,
      );
    }
    return list;
  };

  /** Work out where every silhouette goes, and how big, for the current layout. */
  function place(): Placed[] {
    const list = sorted();
    if (layout === 'wave') {
      const rows = list.length;
      const left = wide ? 168 : 6;
      const right = wide ? 24 : 6;
      const bottom = 8;
      const rh = (H - WAVE_HEAD - bottom) / rows;
      // Ridges stand three rows tall so they overlap, the way a range does.
      const sh = rh * 3.2;
      return list.map((s, i) => ({
        ...s,
        x: left,
        // WAVE_HEAD is the headroom the tallest first ridge needs above row 0.
        y: WAVE_HEAD + i * rh - sh + rh,
        w: W - left - right,
        h: sh,
      }));
    }
    const cols = wide ? 7 : 3;
    const rows = Math.ceil(list.length / cols);
    const gapX = wide ? 16 : 8;
    const gapY = wide ? 34 : 26;
    const padX = 3;
    const padTop = 4;
    const cw = (W - padX * 2 - gapX * (cols - 1)) / cols;
    const ch = (H - padTop - GRID_LABEL - gapY * (rows - 1)) / rows;
    return list.map((s, i) => ({
      ...s,
      x: padX + (i % cols) * (cw + gapX),
      y: padTop + Math.floor(i / cols) * (ch + gapY),
      w: cw,
      h: ch,
    }));
  }

  const pathFor = (p: Placed) => {
    const x = scaleLinear().domain([0, XMAX]).range([p.x, p.x + p.w]);
    const y = scaleLinear().domain([0, 1]).range([p.y + p.h, p.y]);
    return (
      area<number>()
        .x((_, i) => x((i / (SAMPLES - 1)) * XMAX))
        .y0(p.y + p.h)
        .y1((v) => y(v))
        .curve(curveLinear)(p.ys) ?? ''
    );
  };

  function measure() {
    wide = window.matchMedia('(min-width: 820px)').matches;
    W = Math.max(280, stage!.getBoundingClientRect().width);
    if (layout === 'wave') {
      H = (wide ? 700 : 560) + WAVE_HEAD;
    } else {
      const cols = wide ? 7 : 3;
      const rows = Math.ceil(shapes.length / cols);
      H = rows * (wide ? 96 : 74) + (rows - 1) * (wide ? 34 : 26) + GRID_LABEL + 4;
    }
    const total = H + (layout === 'wave' ? AXIS_FOOT : 0);
    svg.attr('viewBox', `0 0 ${W} ${total}`).attr('width', W).attr('height', total);
  }

  function render() {
    updateExplain();
    measure();
    const placed = place();
    // Where each trade's own median falls. Without it "leans left" is a claim
    // rather than something you can see.
    drawMedianRule(placed);
    drawAxis(placed);

    // The ghost of the typical shape, behind whichever silhouette is active.
    const ghostData = active ? placed.filter((p) => p.id === active) : [];
    gGhost
      .selectAll<SVGPathElement, Placed>('path')
      .data(ghostData, (p) => p.id)
      .join('path')
      .attr('class', 'ws-ghost-path')
      .attr('d', (p) => pathFor({ ...p, ys: typical }));

    const join = gShapes
      .selectAll<SVGGElement, Placed>('g.ws-shape')
      .data(placed, (p) => p.id);

    const enter = join
      .enter()
      .append('g')
      .attr('class', 'ws-shape')
      .attr('data-id', (p) => p.id);
    // Paper underneath so a ridge occludes the one behind it; hatch on top.
    enter.append('path').attr('class', 'ws-paper');
    enter.append('path').attr('class', 'ws-ink');

    const all = enter.merge(join);
    all
      .attr('data-step', (p) => p.step)
      .classed('is-active', (p) => p.id === active)
      .classed('is-dimmed', (p) => active !== null && p.id !== active)
      // Later ridges sit in front, so the range reads front-to-back.
      .each(function (_, i) {
        (this as SVGGElement).style.setProperty('--i', String(i));
      });

    all
      .select<SVGPathElement>('.ws-paper')
      .transition()
      .duration(dur())
      .delay((_, i) => (first ? 0 : i * 9))
      .ease(easeCubicInOut)
      .attr('d', pathFor);

    all
      .select<SVGPathElement>('.ws-ink')
      .attr('fill', (p) => `url(#ws-hatch-${p.step})`)
      .attr('stroke', (p) => p.ink)
      .transition()
      .duration(dur())
      .delay((_, i) => (first ? 0 : i * 9))
      .ease(easeCubicInOut)
      .attr('d', pathFor);

    // Names ride the shapes in the grid; in the wave only the ends are marked.
    const labelled =
      layout === 'grid'
        ? placed
        : placed.filter((_, i) => i === 0 || i === placed.length - 1);
    const labels = gLabels
      .selectAll<SVGTextElement, Placed>('text')
      .data(labelled, (p) => p.id);
    labels.exit().remove();
    labels
      .enter()
      .append('text')
      .attr('class', 'ws-name')
      .merge(labels)
      .text((p) => {
        const name = p.label + (p.lowSample ? ' †' : '');
        return layout === 'grid' ? fitLabel(name, p.w, wide ? 9 : 7.5) : name;
      })
      .style('font-size', `${layout === 'grid' && !wide ? 7.5 : 9}px`)
      .attr('text-anchor', layout === 'grid' ? 'middle' : 'end')
      .transition()
      .duration(dur())
      .ease(easeCubicOut)
      .attr('x', (p) => (layout === 'grid' ? p.x + p.w / 2 : p.x - 12))
      .attr('y', (p) => (layout === 'grid' ? p.y + p.h + 14 : p.y + p.h - 2));

    if (first) {
      first = false;
      // One pass of the wave on arrival, so the range assembles itself.
      all
        .style('opacity', 0)
        .transition()
        .duration(760)
        .delay((_, i) => 120 + i * 22)
        .ease(easeCubicOut)
        .style('opacity', null);
    }

    updateReadout(placed);
  }

  const dur = () => (first ? 0 : 900);

  /**
   * The wave's x axis. Without it the reader can see that a shape leans, but
   * has no way to say how far — "left" and "right" are only a direction until
   * they are given a number.
   */
  const AXIS = [
    { at: 0.5, label: 'half' },
    { at: 1, label: 'middle wage' },
    { at: 1.5, label: '1\u00bd\u00d7' },
    { at: 2, label: '2\u00d7' },
    { at: 2.5, label: '2\u00bd\u00d7' },
  ];

  function drawAxis(placed: Placed[]) {
    if (layout !== 'wave' || !placed.length) {
      gAxis.selectAll('*').remove();
      return;
    }
    const p = placed[0]!;
    const ticks = AXIS.map((t) => ({ ...t, x: p.x + (t.at / XMAX) * p.w }));
    const g = gAxis
      .selectAll<SVGGElement, (typeof ticks)[number]>('g')
      .data(ticks, (t) => String(t.at));
    g.exit().remove();
    const enter = g.enter().append('g');
    enter.append('line').attr('class', 'ws-axis-tick');
    enter.append('text').attr('class', 'ws-axis-tag').attr('text-anchor', 'middle');
    const all = enter.merge(g);
    all
      .select('line')
      .attr('y1', H - 2)
      .attr('y2', H + 4)
      .transition()
      .duration(dur())
      .attr('x1', (t) => t.x)
      .attr('x2', (t) => t.x);
    all
      .select('text')
      .text((t) => t.label)
      .attr('y', H + 16)
      .transition()
      .duration(dur())
      .attr('x', (t) => t.x);
  }

  function drawMedianRule(placed: Placed[]) {
    const at = (p: Placed) => p.x + (1 / XMAX) * p.w;
    if (layout === 'wave') {
      const p = placed[0]!;
      const x = at(p);
      // Direct children only, and clear the other layout's nodes first. A bare
      // `selectAll('line')` reaches into the grid's groups and binds one datum
      // across ninety-eight cased lines.
      gRule.selectAll(':scope > g').remove();
      const rule = gRule.selectAll<SVGLineElement, number>(':scope > line').data([x]);
      rule
        .enter()
        .append('line')
        .attr('class', 'ws-median')
        .merge(rule)
        .transition()
        .duration(dur())
        .attr('x1', x)
        .attr('x2', x)
        .attr('y1', WAVE_HEAD - 46)
        .attr('y2', H);
      // No tag above the line: the x axis at the foot already names it, and
      // two identical labels on one dotted rule read as a mistake.
      gRule.selectAll('text').remove();
      return;
    }
    gRule.selectAll('text').remove();
    // One by one, the rule has to cross the silhouette rather than sit under
    // it. A 10px stub of a 1-on-5 dash is literally two dots, and two dots at
    // 42% over an engraved fill is nothing. Full cell height, and cased in
    // paper so it survives the hatch it runs through.
    gRule.selectAll(':scope > line').remove();
    const rules = gRule.selectAll<SVGGElement, Placed>(':scope > g').data(placed, (p) => p.id);
    rules.exit().remove();
    const enter = rules.enter().append('g');
    enter.append('line').attr('class', 'ws-median-case');
    enter.append('line').attr('class', 'ws-median');
    const all = enter.merge(rules);
    for (const cls of ['.ws-median-case', '.ws-median'] as const) {
      all
        .select<SVGLineElement>(cls)
        .transition()
        .duration(dur())
        .attr('x1', at)
        .attr('x2', at)
        .attr('y1', (p) => p.y + p.h)
        .attr('y2', (p) => p.y + 1);
    }
  }

  function updateReadout(placed: Placed[]) {
    if (!readout) return;
    const p = placed.find((s) => s.id === active);
    readout.classList.toggle('is-empty', !p);
    if (!p) {
      readout.querySelector('[data-ws-name]')!.textContent = 'Tap a shape to name it';
      readout.querySelector('[data-ws-lean]')!.textContent =
        'Each silhouette is one job. Left of the dotted line people earn less than the job\u2019s middle wage, right of it more.';
      readout.querySelector('[data-ws-nums]')!.textContent = '';
      return;
    }
    readout.querySelector('[data-ws-name]')!.textContent =
      p.label + (p.lowSample ? ' †' : '');
    // Plain words, not `lean 0.57`. The number is in the method note for anyone
    // who wants it; here it only has to say which way this job stretches.
    const dir =
      p.lean < 0.93
        ? 'Long tail of low pay: more people fall far below this job\u2019s middle wage than climb far above it.'
        : p.lean > 1.07
          ? 'Long tail of high pay: more people climb far above this job\u2019s middle wage than fall far below it.'
          : 'Even: people reach about as far below this job\u2019s middle wage as above it.';
    readout.querySelector('[data-ws-lean]')!.textContent = dir;
    readout.querySelector('[data-ws-nums]')!.textContent =
      `lowest tenth under ${formatEuro(p.p10)} · middle wage ${formatEuro(p.median)} · highest tenth over ${formatEuro(p.p90)}`;
  }

  // ------------------------------------------------------------ interaction
  const setActive = (id: string | null) => {
    if (id === active) return;
    active = id;
    render();
  };

  stage.addEventListener('pointermove', (e) => {
    const g = (e.target as Element | null)?.closest<SVGGElement>('g.ws-shape');
    setActive(g?.dataset.id ?? null);
  });
  stage.addEventListener('pointerleave', () => setActive(null));
  stage.addEventListener('click', (e) => {
    const g = (e.target as Element | null)?.closest<SVGGElement>('g.ws-shape');
    if (g) setActive(g.dataset.id ?? null);
  });

  for (const group of root.querySelectorAll<HTMLElement>('[data-ws-control]')) {
    group.addEventListener('click', (e) => {
      const btn = (e.target as Element | null)?.closest<HTMLButtonElement>('[data-value]');
      if (!btn) return;
      for (const b of group.querySelectorAll<HTMLButtonElement>('[data-value]')) {
        b.setAttribute('aria-pressed', String(b === btn));
      }
      const kind = group.dataset.wsControl;
      if (kind === 'layout') layout = btn.dataset.value as Layout;
      if (kind === 'order') order = btn.dataset.value as Order;
      render();
    });
  }

  let frame = 0;
  const onResize = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(render);
  };
  new ResizeObserver(onResize).observe(stage);

  root.classList.add('is-live');
  render();
}
