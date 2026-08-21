/* ------------------------------------------------------------------ camera
 * Van Wijk and Nuij's smooth zoom-and-pan. Given two views of the world it
 * returns the path between them that a viewer perceives as moving at a
 * constant speed: it pulls back far enough to cover the ground, then drops in.
 * That is the whole grammar of this site, so it is worth having exactly right
 * rather than approximated with an ease curve on x, y and scale separately,
 * which is what makes most zooming interfaces feel like they lurch.
 */
const RHO = Math.SQRT2, RHO2 = 2, RHO4 = 4;
function flight(p0, p1) {
  const [ux0, uy0, w0] = p0, [ux1, uy1, w1] = p1;
  const dx = ux1 - ux0, dy = uy1 - uy0, d2 = dx * dx + dy * dy;
  let S, at;
  if (d2 < 1e-12) {
    S = Math.log(w1 / w0) / RHO;
    at = (t) => [ux0 + t * dx, uy0 + t * dy, w0 * Math.exp(RHO * t * S)];
  } else {
    const d1 = Math.sqrt(d2);
    const b0 = (w1 * w1 - w0 * w0 + RHO4 * d2) / (2 * w0 * RHO2 * d1);
    const b1 = (w1 * w1 - w0 * w0 - RHO4 * d2) / (2 * w1 * RHO2 * d1);
    const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0);
    const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
    S = (r1 - r0) / RHO;
    at = (t) => {
      const s = t * S, ch0 = Math.cosh(r0);
      const u = (w0 / (RHO2 * d1)) * (ch0 * Math.tanh(RHO * s + r0) - Math.sinh(r0));
      return [ux0 + u * dx, uy0 + u * dy, (w0 * ch0) / Math.cosh(RHO * s + r0)];
    };
  }
  at.S = Math.abs(S);
  return at;
}

/* --------------------------------------------------------------- constants */
const CHART_R = 300;          // world units from a chart's centre to its edge
const FILL = 0.92;            // share of the free band a chart fills when open
/** Room kept for the question above and the source below, in CSS pixels. */
let CHROME_TOP = 108;
let CHROME_BOTTOM = 72;
const WAKE = 0.33;            // it starts to unfold at three times that camera width
const SKY_PAD = 1.34;
const DUST = 760;

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const stage = document.getElementById('stage');
const cv = document.getElementById('sky');
const cx2 = cv.getContext('2d');
const tip = document.getElementById('tip');
const head = document.getElementById('head');
const headline = head.querySelector('h1');
const foot = document.getElementById('foot');
const mapBox = document.getElementById('map');
const mapCv = mapBox.querySelector('canvas');
const mapCtx = mapCv.getContext('2d');
const hint = document.getElementById('hint');

let W = 0, H = 0, DPR = 1;
const stars = DATA.stars;
const byId = Object.fromEntries(stars.map((s) => [s.id, s]));

/* Marks carry their own distance from the centre so the chart can bloom
 * outwards rather than appearing all at once. */
for (const s of stars) {
  let far = 0;
  for (const m of s.marks) far = Math.max(far, Math.hypot(m.x, m.y));
  for (const m of s.marks) {
    m.d = far ? Math.hypot(m.x, m.y) / far : 0;
    m.lag = 0.3 * m.d;
  }
  s.tint = s.tint || '#dfe8f4';
}

/* Dust sits at a depth: the further back, the less it moves and the less it
 * grows. Real stars do not zoom, so the deepest layer barely does. */
const dust = [];
{
  let seed = 20260820;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < DUST; i++) {
    dust.push({
      x: (rnd() - 0.5) * DATA.sky * 5.2,
      y: (rnd() - 0.5) * DATA.sky * 3.4,
      z: 0.14 + rnd() * 0.34,
      r: 0.45 + rnd() * 1.15,
      a: 0.2 + rnd() * 0.6,
      p: rnd() * Math.PI * 2,
      s: 0.5 + rnd() * 1.6,
    });
  }
}

/* ----------------------------------------------------------------- viewing */
let cam = { x: 0, y: 0, w: 3000 };
let anim = null;
let focus = null;          // the star we are inside, if any
let hover = null;
let pointer = { x: -1e6, y: -1e6, inside: false };

function skyView() {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const s of stars) {
    x0 = Math.min(x0, s.at[0]); x1 = Math.max(x1, s.at[0]);
    y0 = Math.min(y0, s.at[1]); y1 = Math.max(y1, s.at[1]);
  }
  const bw = (x1 - x0) * SKY_PAD + CHART_R;
  const bh = (y1 - y0) * SKY_PAD + CHART_R;
  // Pull back at least far enough that every chart is folded shut. A sky with
  // one star already coming apart is not a sky.
  let shut = 0;
  for (const s of stars) shut = Math.max(shut, fitW(s) / WAKE);
  return [(x0 + x1) / 2, (y0 + y1) / 2, Math.max(bw, bh * (W / H), shut * 1.02)];
}
/**
 * The camera width at which a chart exactly fills the viewport. Charts are not
 * all the same shape, so this is measured from each one's own bounding box and
 * binds on whichever side runs out first: a tall chart framed by its width
 * would run off the top and bottom of the screen, which is what happens if you
 * frame every star with one number.
 */
function band() {
  const top = Math.min(CHROME_TOP, H * 0.16);
  const bottom = Math.min(CHROME_BOTTOM, H * 0.11);
  return { top, bottom, h: Math.max(120, H - top - bottom) };
}
function fitW(s) {
  const ww = s.box[0] * CHART_R;
  const wh = s.box[1] * CHART_R;
  return Math.max(ww / FILL, (wh / FILL) * (W / band().h));
}
/**
 * The camera that frames one star. It centres the chart on the free band
 * rather than on the window, so the question above it and the source below it
 * sit in space the chart was never given, instead of on top of the data.
 */
function starView(s) {
  const w = fitW(s);
  const k = W / w;
  const b = band();
  const mid = b.top + b.h / 2;
  return [s.at[0] + s.mid[0] * CHART_R, s.at[1] + s.mid[1] * CHART_R - (mid - H / 2) / k, w];
}

const scaleOf = () => W / cam.w;
const toScreen = (wx, wy) => {
  const k = scaleOf();
  return [(wx - cam.x) * k + W / 2, (wy - cam.y) * k + H / 2];
};

/**
 * How far one star's chart has unfolded, from the camera alone: pure telescope.
 * Nothing here knows about clicks or state. Zoom in by hand, by wheel, by pinch
 * or by flight and the chart comes apart at exactly the same point.
 */
const resolveOf = (s) => {
  const share = fitW(s) / cam.w;
  return Math.max(0, Math.min(1, (share - WAKE) / (1 - WAKE)));
};
/** The most open chart on screen, which is what the chrome follows. */
function resolve() {
  let t = 0;
  for (const s of stars) t = Math.max(t, resolveOf(s));
  return t;
}
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const smooth = (t) => t * t * (3 - 2 * t);

function flyTo(view, why) {
  const from = [cam.x, cam.y, cam.w];
  if (reduced) { cam = { x: view[0], y: view[1], w: view[2] }; settle(why); return; }
  const path = flight(from, view);
  const ms = Math.max(620, Math.min(2000, path.S * 780));
  anim = { path, ms, t0: performance.now(), why };
}

function settle(why) {
  focus = why && why.id ? why : null;
  paintChrome();
}

/* ------------------------------------------------------------------ chrome */
function paintChrome() {
  const t = resolve();
  const open = focus && t > 0.55;
  head.classList.toggle('on', !!open);
  foot.classList.toggle('on', !!open);
  mapBox.classList.toggle('on', t > 0.12);
  hint.style.opacity = t > 0.1 ? 0 : 0.9;
  if (open) {
    headline.textContent = focus.q;
    foot.textContent = focus.src;
  } else {
    showRead(null);
  }
}

/* ------------------------------------------------------------------- paint */
function frame(now) {
  if (anim) {
    const p = Math.min(1, (now - anim.t0) / anim.ms);
    const v = anim.path(p);
    cam = { x: v[0], y: v[1], w: v[2] };
    if (p >= 1) { const why = anim.why; anim = null; settle(why); }
    paintChrome();
  }
  draw(now);
  requestAnimationFrame(frame);
}

function draw(now) {
  const k = scaleOf();
  const t = resolve();
  cx2.setTransform(DPR, 0, 0, DPR, 0, 0);

  const g = cx2.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0a0f18');
  g.addColorStop(1, '#05070c');
  cx2.fillStyle = g;
  cx2.fillRect(0, 0, W, H);

  // Dust, by depth.
  for (const d of dust) {
    const kz = k * d.z;
    const sx = (d.x - cam.x) * kz + W / 2;
    const sy = (d.y - cam.y) * kz + H / 2;
    if (sx < -6 || sx > W + 6 || sy < -6 || sy > H + 6) continue;
    const tw = 0.72 + 0.28 * Math.sin(now / 1000 * d.s + d.p);
    cx2.globalAlpha = d.a * tw * 0.62;
    cx2.fillStyle = '#cfdcf0';
    cx2.beginPath();
    cx2.arc(sx, sy, Math.max(0.4, d.r * (0.7 + d.z)), 0, 6.283185);
    cx2.fill();
  }
  cx2.globalAlpha = 1;

  // The lines of the constellation, fading out as a star takes over.
  cx2.lineWidth = 1;
  for (const e of DATA.edges) {
    const a = byId[e.a], b = byId[e.b];
    const [ax, ay] = toScreen(a.at[0], a.at[1]);
    const [bx, by] = toScreen(b.at[0], b.at[1]);
    const lit = hover && (hover.id === e.a || hover.id === e.b);
    cx2.globalAlpha = (lit ? 0.42 : 0.15) * (1 - t);
    cx2.strokeStyle = '#8fa6c6';
    cx2.beginPath();
    cx2.moveTo(ax, ay);
    cx2.lineTo(bx, by);
    cx2.stroke();
  }
  cx2.globalAlpha = 1;

  for (const s of stars) drawStar(s, k, resolveOf(s), now);
  drawMap(t);
}

function drawStar(s, k, t, now) {
  const [sx, sy] = toScreen(s.at[0], s.at[1]);
  const reach = CHART_R * k;
  if (sx + reach < -40 || sx - reach > W + 40 || sy + reach < -40 || sy - reach > H + 40) return;

  // The point of light. It is the whole star at rest, and it dims as the
  // chart it contains comes apart.
  const glow = 1 - smooth(Math.min(1, t * 1.25));
  if (glow > 0.002) {
    const lit = hover === s ? 1.25 : 1;
    const tw = 1 + 0.06 * Math.sin(now / 760 + s.at[0]);
    const core = 2.6 * lit * tw;
    const halo = 26 * lit * tw;
    const rg = cx2.createRadialGradient(sx, sy, 0, sx, sy, halo);
    rg.addColorStop(0, s.tint);
    rg.addColorStop(0.16, s.tint + 'cc');
    rg.addColorStop(1, s.tint + '00');
    cx2.globalAlpha = 0.5 * glow;
    cx2.fillStyle = rg;
    cx2.beginPath(); cx2.arc(sx, sy, halo, 0, 6.283185); cx2.fill();
    cx2.globalAlpha = glow;
    cx2.fillStyle = '#ffffff';
    cx2.beginPath(); cx2.arc(sx, sy, core, 0, 6.283185); cx2.fill();
    cx2.globalAlpha = 1;
  }

  if (t <= 0.001) return;
  drawAxes(s, sx, sy, k, t);

  // The chart, flying out of the point it was folded into. Every mark keeps
  // its own lag so the thing blooms from the middle instead of snapping open.
  for (const m of s.marks) {
    const mt = ease(Math.max(0, Math.min(1, (t - m.lag) / (1 - m.lag))));
    if (mt <= 0) continue;
    const px = sx + m.x * CHART_R * k * mt;
    const py = sy + m.y * CHART_R * k * mt;
    cx2.globalAlpha = Math.min(1, mt * 1.6);
    cx2.fillStyle = m.c || s.tint;
    if (m.k === 'r') {
      const w = Math.max(1, m.w * CHART_R * k * mt);
      const h = Math.max(1, m.h * CHART_R * k * mt);
      cx2.fillRect(px - w / 2, py - h / 2, w, h);
    } else {
      const r = Math.max(0.8, m.r * CHART_R * k * mt);
      cx2.beginPath(); cx2.arc(px, py, r, 0, 6.283185); cx2.fill();
    }
  }
  cx2.globalAlpha = 1;
}

/**
 * The furniture: the rules, ticks and words that make a set of marks a chart.
 * It is generated with the data, never written by hand, and it arrives after
 * the marks so a half-open star stays a picture rather than a diagram.
 */
function drawAxes(s, sx, sy, k, t) {
  const axes = s.axes;
  if (!axes || t < 0.42) return;
  const a = Math.min(1, (t - 0.42) / 0.34);
  const R = CHART_R * k;
  const px = (p) => sx + p[0] * R;
  const py = (p) => sy + p[1] * R;

  cx2.globalAlpha = a * 0.55;
  cx2.strokeStyle = '#7f92aa';
  cx2.lineWidth = 1;
  for (const ax of axes) {
    if (ax.k === 'line') {
      cx2.beginPath();
      cx2.moveTo(px(ax.a), py(ax.a));
      cx2.lineTo(px(ax.b), py(ax.b));
      cx2.stroke();
    } else if (ax.k === 'circle') {
      cx2.beginPath();
      cx2.arc(sx, sy, ax.r * R, 0, 6.283185);
      cx2.stroke();
    }
  }

  const size = Math.max(9, Math.min(14, R * 0.032));
  cx2.font = `${size}px 'Helvetica Neue', Helvetica, Arial, sans-serif`;
  cx2.textBaseline = 'middle';
  for (const ax of axes) {
    if (ax.k !== 'text') continue;
    cx2.globalAlpha = a * (ax.lit ? 0.92 : 0.6);
    cx2.fillStyle = ax.lit ? '#dfe8f4' : '#8ea1b8';
    cx2.textAlign = ax.al || 'center';
    cx2.fillText(ax.s, px(ax.at), py(ax.at));
  }
  cx2.globalAlpha = 1;
  cx2.textAlign = 'left';
}

/* --------------------------------------------------------------- the minimap
 * The brief asked to be able to see the whole constellation at the same time
 * as being inside one star, so the sky never actually leaves: it shrinks into
 * the corner, keeps its lines, and marks where the camera is. */
function drawMap(t) {
  const w = mapCv.width / DPR, h = mapCv.height / DPR;
  mapCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
  mapCtx.clearRect(0, 0, w, h);
  if (t <= 0.12) return;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const s of stars) {
    x0 = Math.min(x0, s.at[0]); x1 = Math.max(x1, s.at[0]);
    y0 = Math.min(y0, s.at[1]); y1 = Math.max(y1, s.at[1]);
  }
  const pad = 12;
  const sc = Math.min((w - pad * 2) / (x1 - x0), (h - pad * 2) / (y1 - y0));
  const mx = (x) => (x - (x0 + x1) / 2) * sc + w / 2;
  const my = (y) => (y - (y0 + y1) / 2) * sc + h / 2;

  mapCtx.fillStyle = 'rgba(8,12,20,0.62)';
  mapCtx.fillRect(0, 0, w, h);
  mapCtx.strokeStyle = 'rgba(143,166,198,0.22)';
  mapCtx.lineWidth = 1;
  mapCtx.strokeRect(0.5, 0.5, w - 1, h - 1);

  for (const e of DATA.edges) {
    const a = byId[e.a], b = byId[e.b];
    mapCtx.globalAlpha = 0.3;
    mapCtx.beginPath();
    mapCtx.moveTo(mx(a.at[0]), my(a.at[1]));
    mapCtx.lineTo(mx(b.at[0]), my(b.at[1]));
    mapCtx.stroke();
  }
  for (const s of stars) {
    const here = focus === s;
    mapCtx.globalAlpha = here ? 1 : 0.65;
    mapCtx.fillStyle = here ? '#ffffff' : s.tint;
    mapCtx.beginPath();
    mapCtx.arc(mx(s.at[0]), my(s.at[1]), here ? 3.6 : 2.2, 0, 6.283185);
    mapCtx.fill();
    if (here) {
      mapCtx.globalAlpha = 0.5;
      mapCtx.strokeStyle = '#ffffff';
      mapCtx.beginPath();
      mapCtx.arc(mx(s.at[0]), my(s.at[1]), 7.5, 0, 6.283185);
      mapCtx.stroke();
      mapCtx.strokeStyle = 'rgba(143,166,198,0.22)';
    }
  }
  mapCtx.globalAlpha = 1;
}

/* -------------------------------------------------------------- hit testing */
/** A star is a target while it is still a point; once it has come apart it is
 *  a chart, and what you are pointing at is one of its marks. */
function starAt(px, py) {
  const k = scaleOf();
  let best = null, bd = 1e9;
  for (const s of stars) {
    if (resolveOf(s) > 0.5) continue;
    const [sx, sy] = toScreen(s.at[0], s.at[1]);
    const d = Math.hypot(sx - px, sy - py);
    const reach = Math.max(34, Math.min(CHART_R * k * 0.9, 260));
    if (d < reach && d < bd) { bd = d; best = s; }
  }
  return best;
}

/** The mark under the cursor inside an open chart, and how to say what it is. */
function markAt(px, py) {
  const k = scaleOf();
  for (const s of stars) {
    const t = resolveOf(s);
    if (t < 0.6) continue;
    const [sx, sy] = toScreen(s.at[0], s.at[1]);
    let best = null, bd = 1e9;
    for (const m of s.marks) {
      if (!m.t) continue;
      const mx = sx + m.x * CHART_R * k;
      const my = sy + m.y * CHART_R * k;
      const hw = (m.k === 'r' ? m.w / 2 : m.r) * CHART_R * k;
      const hh = (m.k === 'r' ? m.h / 2 : m.r) * CHART_R * k;
      const dx = Math.max(0, Math.abs(px - mx) - hw);
      const dy = Math.max(0, Math.abs(py - my) - hh);
      const d = Math.hypot(dx, dy);
      if (d < 14 && d < bd) { bd = d; best = m; }
    }
    if (best) return { star: s, mark: best };
  }
  return null;
}

const readEl = document.getElementById('read');
let readNow = null;
function showRead(text) {
  if (readNow === text) return;
  readNow = text;
  readEl.textContent = text || '';
  readEl.classList.toggle('on', !!text);
}

function setHover(s) {
  if (hover === s) return;
  hover = s;
  stage.classList.toggle('over', !!s);
  if (!s || resolve() > 0.25) { tip.classList.remove('on'); return; }
  const [sx, sy] = toScreen(s.at[0], s.at[1]);
  tip.style.left = sx + 'px';
  tip.style.top = (sy - 18) + 'px';
  tip.innerHTML = '';
  tip.append(document.createTextNode(s.q));
  const sm = document.createElement('small');
  sm.textContent = s.cat;
  tip.append(sm);
  tip.classList.add('on');
}

/* ------------------------------------------------------------------ pointer */
let drag = null;
stage.addEventListener('pointerdown', (e) => {
  stage.setPointerCapture(e.pointerId);
  drag = { x: e.clientX, y: e.clientY, ox: cam.x, oy: cam.y, moved: 0, id: e.pointerId };
  stage.classList.add('dragging');
  anim = null;
});
stage.addEventListener('pointermove', (e) => {
  pointer = { x: e.clientX, y: e.clientY, inside: true };
  if (drag && e.pointerId === drag.id) {
    const k = scaleOf();
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
    cam.x = drag.ox - dx / k;
    cam.y = drag.oy - dy / k;
    setHover(null);
    paintChrome();
    return;
  }
  const inside = markAt(e.clientX, e.clientY);
  if (inside) { setHover(null); showRead(inside.mark.t); stage.classList.add('over'); return; }
  showRead(null);
  setHover(starAt(e.clientX, e.clientY));
});
function endDrag(e) {
  if (!drag) return;
  const quiet = drag.moved < 5;
  drag = null;
  stage.classList.remove('dragging');
  if (!quiet) return;
  if (markAt(e.clientX, e.clientY)) return;
  const s = starAt(e.clientX, e.clientY);
  if (s && s !== focus) flyTo(starView(s), s);
  else if (resolve() > 0.35) flyTo(skyView(), null);
}
stage.addEventListener('pointerup', endDrag);
stage.addEventListener('pointercancel', () => { drag = null; stage.classList.remove('dragging'); });
stage.addEventListener('pointerleave', () => { pointer.inside = false; setHover(null); });

stage.addEventListener('wheel', (e) => {
  e.preventDefault();
  anim = null;
  const k = scaleOf();
  const wx = (e.clientX - W / 2) / k + cam.x;
  const wy = (e.clientY - H / 2) / k + cam.y;
  const step = Math.exp(e.deltaY * 0.0016);
  const sky = skyView()[2];
  cam.w = Math.max(CHART_R * 0.9, Math.min(sky * 1.9, cam.w * step));
  const k2 = scaleOf();
  cam.x = wx - (e.clientX - W / 2) / k2;
  cam.y = wy - (e.clientY - H / 2) / k2;
  focus = nearestOpen();
  paintChrome();
}, { passive: false });

/** Pinch, as two pointers moving apart. */
const touches = new Map();
stage.addEventListener('pointerdown', (e) => touches.set(e.pointerId, e));
stage.addEventListener('pointermove', (e) => {
  if (!touches.has(e.pointerId)) return;
  touches.set(e.pointerId, e);
  if (touches.size !== 2) return;
  drag = null;
  const [a, b] = [...touches.values()];
  const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  if (!stage._pinch) { stage._pinch = { d, w: cam.w }; return; }
  const sky = skyView()[2];
  cam.w = Math.max(CHART_R * 0.9, Math.min(sky * 1.9, stage._pinch.w * (stage._pinch.d / d)));
  focus = nearestOpen();
  paintChrome();
});
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
  stage.addEventListener(ev, (e) => { touches.delete(e.pointerId); stage._pinch = null; });
}

/** When zooming by hand, whichever star fills the screen is the one you are in. */
function nearestOpen() {
  let best = null, bt = 0;
  for (const s of stars) {
    const t = resolveOf(s);
    const near = Math.hypot(s.at[0] - cam.x, s.at[1] - cam.y) < CHART_R * 1.6;
    if (near && t > bt) { bt = t; best = s; }
  }
  return bt > 0.4 ? best : null;
}

addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { flyTo(skyView(), null); return; }
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    const i = focus ? stars.indexOf(focus) : -1;
    const n = stars.length;
    const j = e.key === 'ArrowRight' ? (i + 1 + n) % n : (i - 1 + n) % n;
    flyTo(starView(stars[j]), stars[j]);
  }
});

mapCv.addEventListener('click', (e) => {
  const r = mapCv.getBoundingClientRect();
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const s of stars) {
    x0 = Math.min(x0, s.at[0]); x1 = Math.max(x1, s.at[0]);
    y0 = Math.min(y0, s.at[1]); y1 = Math.max(y1, s.at[1]);
  }
  const pad = 12;
  const sc = Math.min((r.width - pad * 2) / (x1 - x0), (r.height - pad * 2) / (y1 - y0));
  let best = null, bd = 1e9;
  for (const s of stars) {
    const mx = (s.at[0] - (x0 + x1) / 2) * sc + r.width / 2;
    const my = (s.at[1] - (y0 + y1) / 2) * sc + r.height / 2;
    const d = Math.hypot(mx - (e.clientX - r.left), my - (e.clientY - r.top));
    if (d < bd) { bd = d; best = s; }
  }
  if (best && bd < 26) flyTo(starView(best), best);
  else flyTo(skyView(), null);
});

/* --------------------------------------------------------------- scaffolding */
function wordmark() {
  const el = document.getElementById('wordmark');
  const small = innerWidth <= 700;
  const sizes = (small ? [9, 10.5, 12, 13.5, 15, 17, 19, 22, 25] : [11, 13, 15, 17, 19, 22, 25, 28, 32]);
  [...'MAGNITUDE'].forEach((ch, i) => {
    const s = document.createElement('span');
    s.textContent = ch;
    s.style.fontSize = sizes[i] + 'px';
    el.append(s);
  });
}

function keyboardList() {
  const nav = document.getElementById('sr');
  for (const s of stars) {
    const b = document.createElement('button');
    b.textContent = s.q + ' — ' + s.cat;
    b.addEventListener('click', () => flyTo(starView(s), s));
    nav.append(b);
  }
}

function size() {
  DPR = Math.min(2, devicePixelRatio || 1);
  W = innerWidth; H = innerHeight;
  const narrow = W <= 700;
  CHROME_TOP = narrow ? 172 : 108;
  CHROME_BOTTOM = narrow ? 96 : 72;
  cv.width = W * DPR; cv.height = H * DPR;
  const r = mapBox.getBoundingClientRect();
  mapCv.width = r.width * DPR; mapCv.height = r.height * DPR;
  mapCv.style.width = r.width + 'px'; mapCv.style.height = r.height + 'px';
  if (!focus) { const v = skyView(); cam = { x: v[0], y: v[1], w: v[2] }; }
}

wordmark();
keyboardList();
size();
addEventListener('resize', size);
{ const v = skyView(); cam = { x: v[0], y: v[1], w: v[2] * 2.2 }; flyTo(v, null); }
requestAnimationFrame(frame);
