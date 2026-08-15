/**
 * The wage explorer.
 *
 * One state — which occupations are selected, and which percentile you are
 * standing on — drives two linked views:
 *
 *   the quantile curves, where the slope IS the inequality inside a trade, and
 *   the bells, where the filled part of each distribution is everyone earning
 *   less than the percentile you are on.
 *
 * Drag across the plot and the right-hand labels re-sort as trades overtake
 * each other. That reordering is the finding: which job pays more depends
 * entirely on where in it you stand.
 */
import { scaleLinear, scaleLog } from 'd3-scale';
import { SERIES } from '../lib/chart';
import {
  DEFAULT_SELECTION,
  MAX_SELECTED,
  MEASURED_FROM,
  MEASURED_TO,
  WAGES,
  formatCompact,
  formatEuro,
  gridValue,
  type Occupation,
} from '../lib/wages';

const NS = 'http://www.w3.org/2000/svg';
const WIDE = '(min-width: 900px)';

type ScaleMode = 'euros' | 'log';
type RangeMode = 'full' | 'measured';

interface Geometry {
  width: number;
  height: number;
  ml: number;
  mr: number;
  mt: number;
  mb: number;
  plotW: number;
  plotH: number;
}

const el = <K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] => {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
};

/** The site's motion curve, cubic-bezier(.16, 1, .3, 1), solved for y at x. */
function ease(t: number): number {
  const cx = 3 * 0.16;
  const bx = 3 * (0.3 - 0.16) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * 1;
  const by = 3 * (1 - 1) - cy;
  const ay = 1 - cy - by;
  let x = t;
  for (let i = 0; i < 5; i++) {
    const err = ((ax * x + bx) * x + cx) * x - t;
    const slope = (3 * ax * x + 2 * bx) * x + cx;
    if (Math.abs(slope) < 1e-6) break;
    x -= err / slope;
  }
  return ((ay * x + by) * x + cy) * x;
}

function tween(duration: number, onFrame: (t: number) => void, onDone?: () => void) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || duration <= 0) {
    onFrame(1);
    onDone?.();
    return;
  }
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    onFrame(ease(t));
    if (t < 1) requestAnimationFrame(step);
    else onDone?.();
  };
  requestAnimationFrame(step);
}

/**
 * Push labels apart so none overlaps its neighbour, keeping them as close to
 * their true y as the gaps allow. Stacked labels detached from their marks
 * would be noise; this keeps the order and only spends the space it must.
 */
function declutter(targets: number[], gap: number, min: number, max: number): number[] {
  const order = targets.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  const out = new Array<number>(targets.length);
  let cursor = min;
  for (const { y, i } of order) {
    const placed = Math.max(y, cursor);
    out[i] = placed;
    cursor = placed + gap;
  }
  // If the stack ran past the bottom, slide the whole thing back up.
  const overflow = cursor - gap - max;
  if (overflow > 0) {
    const shift = Math.min(overflow, out.reduce((m, y) => Math.min(m, y), Infinity) - min);
    if (shift > 0) for (let i = 0; i < out.length; i++) out[i] = out[i]! - shift;
  }
  return out;
}

export function initWageExplorer(root: HTMLElement) {
  const stage = root.querySelector<HTMLElement>('[data-wx-stage]');
  const picker = root.querySelector<HTMLElement>('[data-wx-picker]');
  const status = root.querySelector<HTMLElement>('[data-wx-status]');
  const readout = root.querySelector<HTMLElement>('[data-wx-readout]');
  const bellHost = root.querySelector<HTMLElement>('[data-wx-bells]');
  const tableHost = root.querySelector<HTMLElement>('[data-wx-table]');
  if (!stage || !picker || !status || !readout || !bellHost) return;

  // ---------------------------------------------------------------- state
  const selected: string[] = DEFAULT_SELECTION.filter((id) =>
    WAGES.occupations.some((o) => o.id === id),
  );
  /** A colour belongs to a trade for as long as it is on screen, never to a
   *  row number — deselecting one must not repaint the others. */
  const slotOf = new Map<string, number>();
  selected.forEach((id, i) => slotOf.set(id, i));

  let percentile = 50;
  let scaleMode: ScaleMode = 'euros';
  let rangeMode: RangeMode = 'full';
  /** 0 = euros, 1 = log; fractional while the axis is morphing. */
  let morph = 0;
  let wide = matchMedia(WIDE).matches;

  const occ = (id: string) => WAGES.occupations.find((o) => o.id === id)!;
  const claimSlot = () => {
    const used = new Set(selected.map((id) => slotOf.get(id)));
    for (let i = 0; i < MAX_SELECTED; i++) if (!used.has(i)) return i;
    return 0;
  };

  // ------------------------------------------------------------- domains
  // Fixed across every selection, so adding a trade never rescales the
  // others out from under the reader.
  const domainFor = (range: RangeMode) => {
    const measured = range === 'measured';
    const from = measured ? MEASURED_FROM : 1;
    const to = measured ? MEASURED_TO : 99;
    let lo = Infinity;
    let hi = -Infinity;
    for (const o of WAGES.occupations) {
      for (let p = from; p <= to; p++) {
        const v = o.q[p - 1]!;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    // Six of the 49 extrapolated tails run past €120k near p99 and would
    // otherwise squash every measured curve into the bottom third of the frame.
    // The plot is clipped there instead — those stretches are already dashed on
    // shaded ground, so nothing measured is ever the thing being cut off.
    if (!measured) hi = Math.min(hi, 120000);
    return { from, to, lo, hi };
  };

  // --------------------------------------------------------------- svg
  // The server-rendered still is what a reader without JavaScript keeps; once
  // the interactive one can take over, it goes.
  stage.querySelector('[data-wx-fallback]')?.remove();
  const svg = el('svg', { class: 'wx-svg' });
  const defs = el('defs');
  const clip = el('clipPath', { id: 'wx-plot-clip' });
  const clipRect = el('rect', { x: 0, y: 0, width: 0, height: 0 });
  clip.append(clipRect);
  defs.append(clip);
  const gContext = el('g', { class: 'wx-context', 'clip-path': 'url(#wx-plot-clip)' });
  const gShade = el('g', { class: 'wx-shade' });
  const gGrid = el('g', { class: 'wx-grid' });
  const gMarks = el('g', { class: 'wx-marks' });
  const gSeries = el('g', { class: 'wx-series', 'clip-path': 'url(#wx-plot-clip)' });
  const gAxis = el('g', { class: 'wx-axis' });
  const gScrub = el('g', { class: 'wx-scrub' });
  const gLabels = el('g', { class: 'wx-labels' });
  svg.append(defs, gShade, gGrid, gContext, gMarks, gSeries, gAxis, gScrub, gLabels);
  stage.append(svg);

  const bellSvg = el('svg', { class: 'wx-bell-svg' });
  bellHost.append(bellSvg);

  let geo: Geometry = { width: 0, height: 0, ml: 0, mr: 0, mt: 0, mb: 0, plotW: 0, plotH: 0 };
  let x = scaleLinear();
  let yLin = scaleLinear();
  let yLog = scaleLog();

  /** Blended y, so the axis can morph between euros and log in one pass. */
  const y = (v: number) => {
    const a = yLin(Math.max(v, 1));
    if (morph <= 0) return a;
    const b = yLog(Math.max(v, yLog.domain()[0]!));
    return a + (b - a) * morph;
  };

  function measure() {
    const rect = stage!.getBoundingClientRect();
    wide = matchMedia(WIDE).matches;
    const width = Math.max(280, rect.width);
    const height = wide ? 460 : 320;
    const ml = wide ? 58 : 42;
    const mr = wide ? 176 : 14;
    const mt = 18;
    const mb = wide ? 42 : 36;
    geo = { width, height, ml, mr, mt, mb, plotW: width - ml - mr, plotH: height - mt - mb };

    const { from, to, lo, hi } = domainFor(rangeMode);
    x = scaleLinear().domain([from, to]).range([geo.ml, geo.ml + geo.plotW]);
    yLin = scaleLinear()
      .domain([0, hi])
      .nice()
      .range([geo.mt + geo.plotH, geo.mt]);
    yLog = scaleLog()
      .domain([Math.max(800, lo * 0.9), hi])
      .range([geo.mt + geo.plotH, geo.mt]);

    clipRect.setAttribute('x', String(geo.ml));
    clipRect.setAttribute('y', String(geo.mt));
    clipRect.setAttribute('width', String(geo.plotW));
    clipRect.setAttribute('height', String(geo.plotH));

    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
  }

  // ------------------------------------------------------------- drawing
  const pathFor = (o: Occupation, from: number, to: number, everyNth = 1) => {
    let d = '';
    for (let p = from; p <= to; p += everyNth) {
      d += `${d ? 'L' : 'M'}${x(p).toFixed(1)},${y(o.q[p - 1]!).toFixed(1)}`;
    }
    // Always land exactly on the last percentile, whatever the sampling.
    const last = `L${x(to).toFixed(1)},${y(o.q[to - 1]!).toFixed(1)}`;
    return d.endsWith(last.slice(1)) ? d : d + last;
  };

  function drawContext() {
    gContext.replaceChildren();
    const { from, to } = domainFor(rangeMode);
    for (const o of WAGES.occupations) {
      if (slotOf.has(o.id) && selected.includes(o.id)) continue;
      gContext.append(el('path', { d: pathFor(o, from, to, 2), class: 'wx-ctx' }));
    }
  }

  function drawFrame() {
    const { from, to } = domainFor(rangeMode);
    gShade.replaceChildren();
    gGrid.replaceChildren();
    gAxis.replaceChildren();
    gMarks.replaceChildren();

    // The stretches the INE does not publish, called out rather than blended in.
    if (rangeMode === 'full') {
      for (const [a, b] of [
        [from, MEASURED_FROM],
        [MEASURED_TO, to],
      ]) {
        gShade.append(
          el('rect', {
            x: x(a),
            y: geo.mt,
            width: Math.max(0, x(b) - x(a)),
            height: geo.plotH,
            class: 'wx-modelled',
          }),
        );
      }
    }

    const ticks = (morph > 0.5 ? yLog : yLin).ticks(wide ? 6 : 4);
    for (const t of ticks) {
      if (t <= 0) continue;
      const ty = y(t);
      if (ty < geo.mt - 1 || ty > geo.mt + geo.plotH + 1) continue;
      gGrid.append(
        el('line', { x1: geo.ml, x2: geo.ml + geo.plotW, y1: ty, y2: ty, class: 'wx-gridline' }),
      );
      const label = el('text', { x: geo.ml - 10, y: ty + 3.5, class: 'wx-ytick' });
      label.textContent = formatCompact(t);
      gAxis.append(label);
    }

    const xTicks = rangeMode === 'measured' ? [10, 25, 50, 75, 90] : [1, 10, 25, 50, 75, 90, 99];
    for (const p of xTicks) {
      const label = el('text', { x: x(p), y: geo.mt + geo.plotH + 20, class: 'wx-xtick' });
      label.textContent = `p${p}`;
      gAxis.append(label);
    }
    const caption = el('text', {
      x: geo.ml,
      y: geo.mt + geo.plotH + (wide ? 36 : 33),
      class: 'wx-xcaption',
    });
    caption.textContent = wide
      ? 'percentile within the occupation → worst to best paid'
      : 'within the occupation → worst to best paid';
    gAxis.append(caption);

    // Two national reference lines: what the law floors pay at, and the middle.
    for (const m of WAGES.markers) {
      if (m.id === 'media') continue;
      const my = y(m.value);
      if (my < geo.mt || my > geo.mt + geo.plotH) continue;
      gMarks.append(
        el('line', { x1: geo.ml, x2: geo.ml + geo.plotW, y1: my, y2: my, class: 'wx-marker' }),
      );
      const t = el('text', { x: geo.ml + 6, y: my - 5, class: 'wx-marker-label' });
      t.textContent = m.id === 'smi' ? 'Minimum wage' : 'National median';
      gMarks.append(t);
    }
  }

  function drawSeries() {
    const { from, to } = domainFor(rangeMode);
    gSeries.replaceChildren();
    for (const id of selected) {
      const o = occ(id);
      const colour = SERIES[slotOf.get(id) ?? 0]!;
      const lo = Math.max(from, MEASURED_FROM);
      const hi = Math.min(to, MEASURED_TO);
      // Solid where the INE measured, dashed where the curve is extrapolated.
      if (from < lo) {
        gSeries.append(
          el('path', { d: pathFor(o, from, lo), class: 'wx-line wx-line-modelled', stroke: colour }),
        );
      }
      gSeries.append(el('path', { d: pathFor(o, lo, hi), class: 'wx-line', stroke: colour }));
      if (to > hi) {
        gSeries.append(
          el('path', { d: pathFor(o, hi, to), class: 'wx-line wx-line-modelled', stroke: colour }),
        );
      }
    }
  }

  // --------------------------------------------------------- the scrubber
  function drawScrubber() {
    gScrub.replaceChildren();
    gLabels.replaceChildren();
    const px = x(percentile);
    const modelled = percentile < MEASURED_FROM || percentile > MEASURED_TO;

    gScrub.append(
      el('line', {
        x1: px,
        x2: px,
        y1: geo.mt,
        y2: geo.mt + geo.plotH,
        class: modelled ? 'wx-hairline is-modelled' : 'wx-hairline',
      }),
    );
    if (modelled) {
      const tag = el('text', {
        x: px + (percentile > 50 ? -6 : 6),
        y: geo.mt + 11,
        class: 'wx-scrub-tag',
        'text-anchor': percentile > 50 ? 'end' : 'start',
      });
      tag.textContent = 'extrapolated — not published';
      gScrub.append(tag);
    }

    const rows = selected
      .map((id) => {
        const o = occ(id);
        return {
          id,
          o,
          colour: SERIES[slotOf.get(id) ?? 0]!,
          value: o.q[percentile - 1]!,
          cy: y(o.q[percentile - 1]!),
        };
      })
      .sort((a, b) => a.cy - b.cy);

    for (const r of rows) {
      gScrub.append(el('circle', { cx: px, cy: r.cy, r: 4.5, fill: r.colour, class: 'wx-dot' }));
    }

    if (wide) {
      const ys = declutter(
        rows.map((r) => r.cy),
        34,
        geo.mt + 8,
        geo.mt + geo.plotH,
      );
      rows.forEach((r, i) => {
        const ly = ys[i]!;
        const lx = geo.ml + geo.plotW + 14;
        // A leader only where the label had to move off its dot.
        if (Math.abs(ly - r.cy) > 2) {
          gLabels.append(
            el('path', {
              d: `M${px},${r.cy}L${lx - 8},${ly}`,
              class: 'wx-leader',
              stroke: r.colour,
            }),
          );
        }
        gLabels.append(el('circle', { cx: lx, cy: ly - 4, r: 3.5, fill: r.colour }));
        const name = el('text', { x: lx + 10, y: ly - 1, class: 'wx-label-name' });
        name.textContent = r.o.label + (r.o.lowSample ? ' †' : '');
        const val = el('text', { x: lx + 10, y: ly + 13, class: 'wx-label-value' });
        val.textContent = formatEuro(r.value);
        gLabels.append(name, val);
      });
    }

    updateReadout(rows);
    updateBellMarks();
    stage!.setAttribute('aria-valuenow', String(percentile));
    stage!.setAttribute(
      'aria-valuetext',
      `Percentile ${percentile}. ` +
        rows.map((r) => `${r.o.label}, ${formatEuro(r.value)}`).join('. '),
    );
  }

  function updateReadout(rows: { o: Occupation; colour: string; value: number }[]) {
    const head = readout!.querySelector('[data-wx-p]');
    if (head) head.textContent = `p${percentile}`;
    const flag = readout!.querySelector('[data-wx-flag]');
    if (flag) {
      flag.textContent =
        percentile < MEASURED_FROM || percentile > MEASURED_TO ? ' · extrapolated' : '';
    }
    const list = readout!.querySelector('[data-wx-list]');
    if (!list) return;
    const sorted = [...rows].sort((a, b) => b.value - a.value);
    list.replaceChildren(
      ...sorted.map((r) => {
        const li = document.createElement('li');
        const key = document.createElement('span');
        key.className = 'wx-key';
        key.style.background = r.colour;
        const name = document.createElement('span');
        name.className = 'wx-ro-name';
        name.textContent = r.o.label + (r.o.lowSample ? ' †' : '');
        const val = document.createElement('span');
        val.className = 'wx-ro-value mono';
        val.textContent = formatEuro(r.value);
        li.append(key, name, val);
        return li;
      }),
    );
  }

  // ------------------------------------------------------------- the bells
  const bellClips = new Map<string, SVGRectElement>();
  const bellMarks = new Map<string, SVGLineElement>();
  let bellX = scaleLinear();

  function drawBells() {
    bellClips.clear();
    bellMarks.clear();
    bellSvg.replaceChildren();

    const rowH = wide ? 62 : 50;
    const ml = wide ? 150 : 8;
    const mr = 14;
    const width = Math.max(260, bellHost!.getBoundingClientRect().width);
    const height = Math.max(1, selected.length * rowH + 26);
    bellSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    bellSvg.setAttribute('width', String(width));
    bellSvg.setAttribute('height', String(height));

    // One salary axis for all the bells, so their positions are comparable.
    const hi = Math.max(...selected.map((id) => gridValue(occ(id).d0 + occ(id).d.length - 1)));
    bellX = scaleLinear()
      .domain([0, Math.min(hi, 120000)])
      .range([ml, width - mr]);

    const defs = el('defs');
    bellSvg.append(defs);

    selected.forEach((id, row) => {
      const o = occ(id);
      const colour = SERIES[slotOf.get(id) ?? 0]!;
      const top = row * rowH + 6;
      const base = top + rowH - 22;
      const peak = rowH - 30;

      let d = `M${bellX(gridValue(o.d0)).toFixed(1)},${base.toFixed(1)}`;
      for (let i = 0; i < o.d.length; i++) {
        const sx = bellX(gridValue(o.d0 + i));
        if (sx > width - mr + 2) break;
        d += `L${sx.toFixed(1)},${(base - (o.d[i]! / 1000) * peak).toFixed(1)}`;
      }
      const closed = `${d}L${bellX(Math.min(gridValue(o.d0 + o.d.length - 1), 120000)).toFixed(1)},${base.toFixed(1)}Z`;

      const clipId = `wx-clip-${o.id}`;
      const clip = el('clipPath', { id: clipId });
      const rect = el('rect', { x: 0, y: top - 2, width: 0, height: rowH });
      clip.append(rect);
      defs.append(clip);
      bellClips.set(o.id, rect);

      bellSvg.append(
        el('line', { x1: ml, x2: width - mr, y1: base, y2: base, class: 'wx-bell-base' }),
      );
      // The filled part is everyone in the trade earning less than you are.
      bellSvg.append(
        el('path', { d: closed, fill: colour, 'fill-opacity': 0.16, 'clip-path': `url(#${clipId})` }),
      );
      bellSvg.append(el('path', { d, class: 'wx-bell-line', stroke: colour }));

      const mark = el('line', { x1: ml, x2: ml, y1: top, y2: base, class: 'wx-bell-mark', stroke: colour });
      bellSvg.append(mark);
      bellMarks.set(o.id, mark);

      const name = el('text', {
        x: wide ? ml - 12 : ml,
        y: wide ? base - 2 : top + 2,
        class: wide ? 'wx-bell-name wx-bell-name-right' : 'wx-bell-name',
      });
      name.textContent = o.label + (o.lowSample ? ' †' : '');
      bellSvg.append(name);
    });

    // A shared salary axis under the stack.
    const axisY = selected.length * rowH + 12;
    for (const t of bellX.ticks(wide ? 8 : 5)) {
      const tx = el('text', { x: bellX(t), y: axisY, class: 'wx-bell-tick' });
      tx.textContent = formatCompact(t);
      bellSvg.append(tx);
    }
    updateBellMarks();
  }

  function updateBellMarks() {
    for (const id of selected) {
      const o = occ(id);
      const at = bellX(o.q[percentile - 1]!);
      bellClips.get(id)?.setAttribute('width', String(Math.max(0, at)));
      const mark = bellMarks.get(id);
      if (mark) {
        mark.setAttribute('x1', String(at));
        mark.setAttribute('x2', String(at));
      }
    }
  }

  // --------------------------------------------------------------- table
  function drawTable() {
    if (!tableHost) return;
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    for (const h of ['Occupation', 'p10', 'p25', 'p50', 'p75', 'p90', 'p90 ÷ p10']) {
      const th = document.createElement('th');
      th.textContent = h;
      hr.append(th);
    }
    thead.append(hr);
    const tbody = document.createElement('tbody');
    for (const id of selected) {
      const o = occ(id);
      const tr = document.createElement('tr');
      const name = document.createElement('td');
      name.textContent = o.label + (o.lowSample ? ' †' : '');
      tr.append(name);
      for (const p of ['10', '25', '50', '75', '90'] as const) {
        const td = document.createElement('td');
        td.textContent = formatEuro(o.p[p]);
        tr.append(td);
      }
      const ratio = document.createElement('td');
      ratio.textContent = `×${o.spread.p90p10.toFixed(2)}`;
      tr.append(ratio);
      tbody.append(tr);
    }
    table.append(thead, tbody);
    tableHost.replaceChildren(table);
  }

  // ------------------------------------------------------------ full draw
  function render() {
    measure();
    drawContext();
    drawFrame();
    drawSeries();
    drawBells();
    drawScrubber();
    drawTable();
    syncPicker();
  }

  /** Everything but the context layer, for interactions that do not need it. */
  function renderLive() {
    drawFrame();
    drawSeries();
    drawScrubber();
  }

  // ------------------------------------------------------------- controls
  function syncPicker() {
    for (const btn of picker!.querySelectorAll<HTMLButtonElement>('[data-occ]')) {
      const id = btn.dataset.occ!;
      const on = selected.includes(id);
      btn.setAttribute('aria-pressed', String(on));
      btn.classList.toggle('is-on', on);
      const slot = slotOf.get(id);
      btn.style.setProperty('--chip', on && slot !== undefined ? SERIES[slot]! : 'transparent');
      btn.disabled = !on && selected.length >= MAX_SELECTED;
    }
    status!.textContent =
      `${selected.length} of ${WAGES.occupations.length} occupations · ` +
      `up to ${MAX_SELECTED} at once, past which the colours stop being tellable apart`;
  }

  function toggle(id: string) {
    const at = selected.indexOf(id);
    if (at >= 0) {
      if (selected.length === 1) return;
      selected.splice(at, 1);
      slotOf.delete(id);
    } else {
      if (selected.length >= MAX_SELECTED) return;
      slotOf.set(id, claimSlot());
      selected.push(id);
    }
    render();
  }

  picker.addEventListener('click', (e) => {
    const btn = (e.target as Element | null)?.closest<HTMLButtonElement>('[data-occ]');
    if (!btn || btn.disabled) return;
    toggle(btn.dataset.occ!);
  });

  for (const group of root.querySelectorAll<HTMLElement>('[data-wx-mode]')) {
    group.addEventListener('click', (e) => {
      const btn = (e.target as Element | null)?.closest<HTMLButtonElement>('[data-value]');
      if (!btn) return;
      const kind = group.dataset.wxMode;
      const value = btn.dataset.value!;
      for (const b of group.querySelectorAll<HTMLButtonElement>('[data-value]')) {
        b.setAttribute('aria-pressed', String(b === btn));
      }
      if (kind === 'scale' && value !== scaleMode) {
        const to = value === 'log' ? 1 : 0;
        const from = morph;
        scaleMode = value as ScaleMode;
        // The context layer sits out the morph: 49 curves per frame is the one
        // thing here that will drop frames on a phone.
        gContext.classList.add('is-hidden');
        tween(
          620,
          (t) => {
            morph = from + (to - from) * t;
            renderLive();
          },
          () => {
            morph = to;
            drawContext();
            gContext.classList.remove('is-hidden');
          },
        );
      }
      if (kind === 'range' && value !== rangeMode) {
        rangeMode = value as RangeMode;
        percentile = Math.min(
          Math.max(percentile, rangeMode === 'measured' ? MEASURED_FROM : 1),
          rangeMode === 'measured' ? MEASURED_TO : 99,
        );
        render();
      }
    });
  }

  // ------------------------------------------------------------ scrubbing
  const percentileAt = (clientX: number) => {
    const rect = stage!.getBoundingClientRect();
    const local = ((clientX - rect.left) / rect.width) * geo.width;
    const [lo, hi] = x.domain() as [number, number];
    return Math.round(Math.min(hi, Math.max(lo, x.invert(local))));
  };

  let scrubbing = false;
  const setPercentile = (p: number) => {
    if (p === percentile) return;
    percentile = p;
    drawScrubber();
  };

  stage.addEventListener('pointerdown', (e) => {
    scrubbing = true;
    stage.setPointerCapture(e.pointerId);
    setPercentile(percentileAt(e.clientX));
  });
  stage.addEventListener('pointermove', (e) => {
    // Hover tracks on a mouse; a finger has to be down, or the page cannot scroll.
    if (!scrubbing && e.pointerType !== 'mouse') return;
    setPercentile(percentileAt(e.clientX));
  });
  const endScrub = (e: PointerEvent) => {
    scrubbing = false;
    if (stage.hasPointerCapture?.(e.pointerId)) stage.releasePointerCapture(e.pointerId);
  };
  stage.addEventListener('pointerup', endScrub);
  stage.addEventListener('pointercancel', endScrub);

  stage.addEventListener('keydown', (e) => {
    const [lo, hi] = x.domain() as [number, number];
    const step = e.shiftKey ? 10 : 1;
    let next = percentile;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next += step;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next -= step;
    else if (e.key === 'Home') next = lo;
    else if (e.key === 'End') next = hi;
    else return;
    e.preventDefault();
    e.stopPropagation();
    setPercentile(Math.min(hi, Math.max(lo, next)));
  });

  // ---------------------------------------------------------------- boot
  let frame = 0;
  const onResize = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(render);
  };
  new ResizeObserver(onResize).observe(stage);
  matchMedia(WIDE).addEventListener('change', onResize);

  root.classList.add('is-live');
  render();
}
