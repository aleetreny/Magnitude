/* ================================================================== control
 * Drag looks around, the wheel moves you forward. Not pan and zoom: those are
 * the verbs of a map, and this is not a map.
 */
let hover = null;
let readNow = null;
let drag = null;
const touches = new Map();
let pinch = null;

function showRead(text) {
  if (readNow === text) return;
  readNow = text;
  readEl.textContent = text || '';
  readEl.classList.toggle('on', !!text);
}

function starAt(px, py) {
  if (world > 0.3 || trip) return null;
  let best = null, bd = 1e9;
  for (const s of stars) {
    const p = project(s.at[0], s.at[1], s.at[2]);
    if (!p) continue;
    const d = Math.hypot(p.x - px, p.y - py);
    if (d < 64 && d < bd) { bd = d; best = s; }
  }
  return best;
}

function markAt(px, py) {
  if (!inStar || assembly < 0.9) return null;
  let best = null, bd = 1e9;
  for (const m of inStar.marks) {
    if (!m.t) continue;
    const p = project(inStar.at[0] + m.x * CHART_R, inStar.at[1] + m.y * CHART_R, inStar.at[2]);
    if (!p) continue;
    const hw = (m.k === 'r' ? m.w / 2 : m.r) * CHART_R * p.k;
    const hh = (m.k === 'r' ? m.h / 2 : m.r) * CHART_R * p.k;
    const d = Math.hypot(Math.max(0, Math.abs(px - p.x) - hw), Math.max(0, Math.abs(py - p.y) - hh));
    if (d < 12 && d < bd) { bd = d; best = m; }
  }
  return best;
}

function setHover(s) {
  if (hover === s) return;
  hover = s;
  stage.classList.toggle('over', !!s);
  if (!s) { tip.classList.remove('on'); return; }
  const p = project(s.at[0], s.at[1], s.at[2]);
  if (!p) { tip.classList.remove('on'); return; }
  tip.style.left = p.x + 'px';
  tip.style.top = (p.y - 26) + 'px';
  tip.innerHTML = '';
  tip.append(document.createTextNode(s.q));
  const sm = document.createElement('small');
  sm.textContent = s.cat;
  tip.append(sm);
  tip.classList.add('on');
}

stage.addEventListener('pointerdown', (e) => {
  stage.setPointerCapture(e.pointerId);
  touches.set(e.pointerId, e);
  drag = { x: e.clientX, y: e.clientY, yaw: cam.yaw, pitch: cam.pitch, moved: 0, id: e.pointerId };
  idle = 0;
});
stage.addEventListener('pointermove', (e) => {
  if (touches.has(e.pointerId)) touches.set(e.pointerId, e);
  if (touches.size === 2) {
    const [a, b] = [...touches.values()];
    const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    if (!pinch) pinch = { d, z: cam.z };
    else dolly((pinch.d - d) * 14);
    drag = null;
    return;
  }
  if (drag && e.pointerId === drag.id && !trip) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
    if (drag.moved > 3) {
      const lock = inStar ? 0.16 : 1;          // inside a chart, only a lean
      cam.yaw = drag.yaw - dx * 0.0016 * lock;
      cam.pitch = drag.pitch + dy * 0.0013 * lock;
      cam.pitch = Math.max(-1.2, Math.min(1.2, cam.pitch));
      setHover(null);
      idle = 0;
    }
    return;
  }
  const m = markAt(e.clientX, e.clientY);
  if (m) { showRead(m.t); stage.classList.add('over'); setHover(null); return; }
  showRead(null);
  setHover(starAt(e.clientX, e.clientY));
});

function endDrag(e) {
  touches.delete(e.pointerId);
  if (touches.size < 2) pinch = null;
  if (!drag) return;
  const quiet = drag.moved < 5;
  drag = null;
  if (!quiet || trip) return;
  if (markAt(e.clientX, e.clientY)) return;
  const s = starAt(e.clientX, e.clientY);
  if (s) { setHover(null); travel(s); }
  else if (inStar) travel(null);
}
stage.addEventListener('pointerup', endDrag);
stage.addEventListener('pointercancel', endDrag);
stage.addEventListener('pointerleave', (e) => { touches.delete(e.pointerId); setHover(null); showRead(null); });

/** Move along the way the camera is facing. */
function dolly(amount) {
  if (trip) return;
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  cam.x += sy * cp * amount;
  cam.y += -sp * amount;
  cam.z += cy * cp * amount;
  idle = 0;
}
stage.addEventListener('wheel', (e) => {
  e.preventDefault();
  dolly(-e.deltaY * 3.2);
}, { passive: false });

addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && inStar && !trip) travel(null);
  else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !trip) {
    const i = inStar ? stars.indexOf(inStar) : -1;
    const n = stars.length;
    travel(stars[e.key === 'ArrowRight' ? (i + 1 + n) % n : (i - 1 + n) % n]);
  }
});

mapCv.addEventListener('click', (e) => {
  if (trip) return;
  const r = mapCv.getBoundingClientRect();
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const s of stars) {
    x0 = Math.min(x0, s.at[0]); x1 = Math.max(x1, s.at[0]);
    y0 = Math.min(y0, s.at[1]); y1 = Math.max(y1, s.at[1]);
  }
  const pad = 14;
  const sc = Math.min((r.width - pad * 2) / (x1 - x0), (r.height - pad * 2) / (y1 - y0));
  let best = null, bd = 1e9;
  for (const s of stars) {
    const d = Math.hypot((s.at[0] - (x0 + x1) / 2) * sc + r.width / 2 - (e.clientX - r.left),
                         (s.at[1] - (y0 + y1) / 2) * sc + r.height / 2 - (e.clientY - r.top));
    if (d < bd) { bd = d; best = s; }
  }
  if (best && bd < 26 && best !== inStar) travel(best);
  else travel(null);
});

/* ================================================================== startup */
function wordmark() {
  const el = document.getElementById('wordmark');
  const small = innerWidth <= 700;
  const sizes = small ? [9, 10.5, 12, 13.5, 15, 17, 19, 22, 25] : [11, 13, 15, 17, 19, 22, 25, 28, 32];
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
    b.addEventListener('click', () => travel(s));
    nav.append(b);
  }
}
function size() {
  DPR = Math.min(2, devicePixelRatio || 1);
  W = innerWidth; H = innerHeight;
  cv.width = W * DPR; cv.height = H * DPR;
  glowCv.width = Math.max(1, (W * DPR) / 3 | 0);
  glowCv.height = Math.max(1, (H * DPR) / 3 | 0);
  const narrow = W <= 700;
  CHROME_TOP = narrow ? 172 : 108;
  CHROME_BOTTOM = narrow ? 96 : 72;
  FOCAL = Math.min(W, H) * 1.15;
  cam.focal = FOCAL;
  const r = mapBox.getBoundingClientRect();
  mapCv.width = r.width * DPR; mapCv.height = r.height * DPR;
  mapCv.style.width = r.width + 'px'; mapCv.style.height = r.height + 'px';
  if (inStar && !trip) Object.assign(cam, readCam(inStar));
}

for (const s of stars) {
  let far = 0;
  for (const m of s.marks) far = Math.max(far, Math.hypot(m.x, m.y));
  s.marks.forEach((m, i) => {
    m.d = far ? Math.hypot(m.x, m.y) / far : 0;
    m.lag = 0.34 * m.d + 0.12 * ((i * 2654435761) % 1000) / 1000;
    m.zo = (((i * 40503) % 1000) / 1000 - 0.5) * 2400;
  });
  s.cloud = null;
}

wordmark();
keyboardList();
size();
paintGrain();
buildField();
buildClouds();
buildMotes();
for (const s of stars) s.cloud = paintCloud(hueOf(s.tint), 640);
addEventListener('resize', size);

function hueOf(hex) {
  const [r, g, b] = hexRGB(hex).map((v) => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return 210;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

// The first thing you see is the approach, not the destination.
{
  const home = skyCam();
  Object.assign(cam, home, { z: home.z - 46000, yaw: 0.5, pitch: -0.16 });
  prev = { x: cam.x, y: cam.y, z: cam.z };
  if (reduced) { Object.assign(cam, home); }
  else setTimeout(() => travel(null), 240);
}
requestAnimationFrame(frame);
