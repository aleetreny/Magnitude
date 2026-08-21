/* ==================================================================== paint */
const CHART_R = 1100;
let FOCAL = 1000;
let CHROME_TOP = 108, CHROME_BOTTOM = 72;

function band() {
  const top = Math.min(CHROME_TOP, H * 0.17);
  const bottom = Math.min(CHROME_BOTTOM, H * 0.12);
  return { top, bottom, h: Math.max(140, H - top - bottom) };
}

/** The two skies the background crossfades between. */
const SKY_TOP = [10, 15, 26], SKY_LOW = [4, 6, 12];
const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgb = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const lerp3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

let last = 0;
function frame(now) {
  requestAnimationFrame(frame);
  // Hold the last painted frame. Only ever set while looking at the thing.
  if (typeof window !== 'undefined' && window.__hold) { last = now; return; }
  // Speed is measured per millisecond, not per frame. A frame that took a
  // quarter of a second, because the tab was busy, is not the camera moving
  // fast, and treating it as such smears the whole screen for no reason.
  const dt = last ? Math.max(4, now - last) : 16.7;
  last = now;
  if (trip) runTrip(now);
  else if (!inStar) {
    idle += 1;
    if (idle > 220) { cam.yaw += 0.00007; cam.pitch += Math.sin(now / 9000) * 0.000018; }
  }
  const dm = Math.hypot(cam.x - prev.x, cam.y - prev.y, cam.z - prev.z) * (16.7 / dt);
  speed = speed * 0.8 + dm * 0.2;
  prev = { x: cam.x, y: cam.y, z: cam.z };
  draw(now);
}

function draw(now) {
  const jitter = shake ? (rnd() - 0.5) * shake : 0;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  glow.setTransform(DPR / 3, 0, 0, DPR / 3, 0, 0);
  glow.clearRect(0, 0, W, H);

  const tint = inStar ? hexRGB(inStar.tint) : SKY_TOP;
  const top = lerp3(SKY_TOP, [tint[0] * 0.11, tint[1] * 0.11, tint[2] * 0.14], world);
  const low = lerp3(SKY_LOW, [tint[0] * 0.05, tint[1] * 0.05, tint[2] * 0.07], world);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, rgb(top));
  g.addColorStop(1, rgb(low));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.globalCompositeOperation = 'lighter';
  drawClouds();
  drawWorldLight();
  drawDeep(now);
  drawMotes(now);
  drawDrift();
  ctx.globalCompositeOperation = 'source-over';
  drawEdges();
  for (const s of stars) drawStar(s, now, jitter);
  if (world > 0.02 && inStar) drawChart(inStar);

  // One blurred pass of everything bright, laid back over the scene.
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  const rush = clamp01(speed / 95);
  const calm = world > 0.9 && !trip ? 0.34 : 1;
  ctx.filter = `blur(${(9 + rush * 18).toFixed(1)}px)`;
  ctx.globalAlpha = Math.min(1, (0.42 + rush * 0.5 + flash * 0.5) * calm + 0.1);
  ctx.drawImage(glowCv, 0, 0, cv.width, cv.height);
  // At speed the lens gives up on holding the colours together.
  if (rush > 0.06) {
    ctx.globalAlpha = rush * 0.5;
    ctx.drawImage(glowCv, -rush * 22 * DPR, 0, cv.width, cv.height);
    ctx.drawImage(glowCv, rush * 22 * DPR, 0, cv.width, cv.height);
  }
  ctx.filter = 'none';
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  if (flash > 0.002) drawFlash();
  drawVignette(rush);
  if (grainImg) {
    ctx.globalAlpha = 0.014;
    ctx.globalCompositeOperation = 'overlay';
    const p = ctx.createPattern(grainImg, 'repeat');
    ctx.fillStyle = p;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
  drawMap();
}

/** The star, behind its own chart, lighting the room. */
function drawWorldLight() {
  if (world < 0.02 || !inStar) return;
  const p = project(inStar.at[0], inStar.at[1], inStar.at[2] + 400);
  if (!p) return;
  const r = Math.hypot(W, H) * 0.85;
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
  g.addColorStop(0, hexA(inStar.tint, 0.115 * world));
  g.addColorStop(0.45, hexA(inStar.tint, 0.04 * world));
  g.addColorStop(1, hexA(inStar.tint, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/** Motes hanging in the light. Nothing carries "you are somewhere" like dust
 *  that drifts while you stand still. */
const motes = [];
function buildMotes() {
  motes.length = 0;
  for (let i = 0; i < 220; i++) {
    motes.push({ x: rr(-1, 1), y: rr(-1, 1), z: rr(-1, 1),
                 r: rr(0.6, 2.6), a: rr(0.15, 0.85), p: rr(0, 6.283), s: rr(0.25, 1.1) });
  }
}
function drawMotes(now) {
  if (world < 0.05 || !inStar) return;
  const R = CHART_R * 1.9;
  for (const m of motes) {
    const wob = Math.sin(now / 2600 * m.s + m.p);
    const p = project(inStar.at[0] + m.x * R + wob * 30,
                      inStar.at[1] + m.y * R * 0.72 + Math.cos(now / 3100 * m.s + m.p) * 26,
                      inStar.at[2] + m.z * R * 0.8 - 300);
    if (!p) continue;
    // Dust is dust: a couple of pixels, whatever the camera is doing. Scaling
    // it with perspective turns the room into a bokeh photograph.
    ctx.globalAlpha = m.a * world * 0.16 * (0.5 + 0.5 * wob);
    ctx.fillStyle = inStar.tint;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.5, Math.min(2.6, m.r * (0.5 + p.k * 2.2))), 0, 6.283185);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawClouds() {
  for (const c of clouds) {
    const p = project(c.x, c.y, c.z);
    if (!p) continue;
    const s = c.size * p.k;
    if (s < 12 || p.x + s < -200 || p.x - s > W + 200 || p.y + s < -200 || p.y - s > H + 200) continue;
    ctx.globalAlpha = c.a * (0.9 - world * 0.6);
    ctx.drawImage(c.img, p.x - s / 2, p.y - s / 2, s, s);
  }
  if (inStar && world > 0.02) {
    const c = inStar.cloud;
    for (const [dz, scale, a] of [[11000, 52000, 0.3], [4200, 22000, 0.22], [21000, 88000, 0.2]]) {
      const p = project(inStar.at[0] + (dz % 700) - 350, inStar.at[1] + (dz % 400) - 200, inStar.at[2] + dz);
      if (!p) continue;
      const s = scale * p.k;
      ctx.globalAlpha = world * a;
      ctx.drawImage(c, p.x - s / 2, p.y - s / 2, s, s);
    }
  }
  ctx.globalAlpha = 1;
}

function drawDeep(now) {
  for (const d of deep) {
    const p = project(d.x, d.y, d.z);
    if (!p || p.x < -20 || p.x > W + 20 || p.y < -20 || p.y > H + 20) continue;
    const tw = 0.68 + 0.32 * Math.sin(now / 1200 * d.w + d.p);
    ctx.globalAlpha = (0.3 + d.m * 0.85) * tw * (1 - world * 0.5);
    ctx.fillStyle = d.c;
    const r = 0.55 + d.m * 1.9;
    ctx.fillRect(p.x - r / 2, p.y - r / 2, r, r);
  }
  ctx.globalAlpha = 1;
}

function drawDrift() {
  const streak = clamp01(speed / 26);
  for (let i = 0; i < drift.length; i++) {
    const d = drift[i];
    const p = project(d.x, d.y, d.z);
    if (!p || p.z > 30000) { if (p && p.z > 30000) continue; drift[i] = seedDrift(false); continue; }
    if (p.x < -300 || p.x > W + 300 || p.y < -300 || p.y > H + 300) {
      if (p.z < 900) drift[i] = seedDrift(false);
      continue;
    }
    const near = clamp01(1 - p.z / 26000);
    const a = (0.1 + d.m * 0.8) * near * (1 - world * 0.72);
    if (a < 0.01) continue;
    const len = streak * near * (900 / Math.max(400, p.z)) * 420;
    ctx.globalAlpha = a;
    if (len > 1.5) {
      let vx = p.x - W / 2, vy = p.y - H / 2;
      const vl = Math.hypot(vx, vy) || 1;
      vx /= vl; vy /= vl;
      const gr = ctx.createLinearGradient(p.x, p.y, p.x - vx * len, p.y - vy * len);
      gr.addColorStop(0, d.c);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = gr;
      ctx.lineWidth = Math.max(0.7, 1.5 * near);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - vx * len, p.y - vy * len);
      ctx.stroke();
    } else {
      ctx.fillStyle = d.c;
      const r = 0.5 + d.m * 1.7 * near;
      ctx.fillRect(p.x - r / 2, p.y - r / 2, r, r);
    }
  }
  ctx.globalAlpha = 1;
}

function drawEdges() {
  if (world > 0.75) return;
  ctx.lineWidth = 1;
  for (const e of DATA.edges) {
    const a = byId[e.a], b = byId[e.b];
    const pa = project(a.at[0], a.at[1], a.at[2]);
    const pb = project(b.at[0], b.at[1], b.at[2]);
    if (!pa || !pb) continue;
    const lit = hover && (hover.id === e.a || hover.id === e.b);
    const gr = ctx.createLinearGradient(pa.x, pa.y, pb.x, pb.y);
    const A = (lit ? 0.5 : 0.17) * (1 - world) * (1 - clamp01(speed / 90));
    gr.addColorStop(0, `rgba(150,178,214,${A})`);
    gr.addColorStop(0.5, `rgba(150,178,214,${A * 0.42})`);
    gr.addColorStop(1, `rgba(150,178,214,${A})`);
    ctx.strokeStyle = gr;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  }
}

/** A bright star, with the flare a lens gives one. */
function drawStar(s, now, jitter) {
  const p = project(s.at[0], s.at[1], s.at[2]);
  if (!p) return;
  const here = inStar === s;
  const shut = here ? 1 - clamp01(assembly * 1.5) : 1 - world * 0.9;
  if (shut <= 0.001) return;
  const near = clamp01(3400 / p.z);
  const tw = 0.9 + 0.1 * Math.sin(now / 900 + s.at[0]);
  const lit = (hover === s ? 1.5 : 1) * tw * shut;
  const core = (1.6 + near * 4.2) * lit;
  const spike = (26 + near * 150) * lit;

  for (const target of [ctx, glow]) {
    target.globalCompositeOperation = 'lighter';
    const rg = target.createRadialGradient(p.x + jitter, p.y, 0, p.x + jitter, p.y, spike * 0.62);
    rg.addColorStop(0, s.tint);
    rg.addColorStop(0.28, s.tint + '99');
    rg.addColorStop(1, s.tint + '00');
    target.globalAlpha = 0.62 * lit;
    target.fillStyle = rg;
    target.beginPath();
    target.arc(p.x + jitter, p.y, spike * 0.62, 0, 6.283185);
    target.fill();

    target.globalAlpha = 0.5 * lit;
    target.lineWidth = Math.max(0.6, 1.1 * lit);
    for (const [ax, ay, l] of [[1, 0, 1], [0, 1, 1], [0.707, 0.707, 0.42], [0.707, -0.707, 0.42]]) {
      const L = spike * l;
      const gr = target.createLinearGradient(p.x - ax * L, p.y - ay * L, p.x + ax * L, p.y + ay * L);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.5, s.tint);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      target.strokeStyle = gr;
      target.beginPath();
      target.moveTo(p.x - ax * L + jitter, p.y - ay * L);
      target.lineTo(p.x + ax * L + jitter, p.y + ay * L);
      target.stroke();
    }

    target.globalAlpha = lit;
    target.fillStyle = '#ffffff';
    target.beginPath();
    target.arc(p.x + jitter, p.y, core, 0, 6.283185);
    target.fill();
    target.globalAlpha = 1;
    target.globalCompositeOperation = 'source-over';
  }
}
