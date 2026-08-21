/* =============================================================== the chart
 * The marks are not laid on top of the scene, they are in it: points in the
 * same space as the stars, on the plane the star stands on. That is what
 * makes the arrival one move instead of two, and it is why the chart has
 * perspective while it is coming together and none once it has.
 */
function drawChart(s) {
  const a = assembly;
  if (a <= 0.001) return;
  const alpha = clamp01(a * 2.4);

  for (const m of s.marks) {
    const mt = ease.back(clamp01((a - m.lag) / (1 - m.lag)));
    if (mt <= 0.001) continue;
    const pz = s.at[2] + (1 - mt) * m.zo;
    const p = project(s.at[0] + m.x * CHART_R * mt, s.at[1] + m.y * CHART_R * mt, pz);
    if (!p) continue;
    const grow = Math.min(1, mt * 1.4);
    ctx.globalAlpha = alpha * Math.min(1, mt * 2);
    ctx.fillStyle = m.c || s.tint;
    // Only while it is still flying does a mark carry its own light.
    glow.globalAlpha = ctx.globalAlpha * 0.5 * (1 - clamp01((a - 0.55) / 0.4));
    glow.fillStyle = ctx.fillStyle;
    if (m.k === 'r') {
      const w = Math.max(1, m.w * CHART_R * p.k * grow);
      const h = Math.max(1, m.h * CHART_R * p.k * grow);
      ctx.fillRect(p.x - w / 2, p.y - h / 2, w, h);
      glow.fillRect(p.x - w / 2, p.y - h / 2, w, h);
    } else {
      const r = Math.max(0.8, m.r * CHART_R * p.k * grow);
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.283185); ctx.fill();
      glow.beginPath(); glow.arc(p.x, p.y, r, 0, 6.283185); glow.fill();
    }
  }
  ctx.globalAlpha = 1;
  glow.globalAlpha = 1;

  // The furniture arrives last, once the marks have stopped moving.
  const fa = clamp01((a - 0.62) / 0.3);
  if (fa <= 0.002 || !s.axes) return;
  const at = (q) => project(s.at[0] + q[0] * CHART_R, s.at[1] + q[1] * CHART_R, s.at[2]);
  ctx.strokeStyle = '#8ea3bd';
  ctx.lineWidth = 1;
  ctx.globalAlpha = fa * 0.5;
  for (const ax of s.axes) {
    if (ax.k === 'line') {
      const p1 = at(ax.a), p2 = at(ax.b);
      if (!p1 || !p2) continue;
      // The rules draw themselves on rather than blinking into place.
      const t = clamp01((fa - 0.1) / 0.9);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(mix(p1.x, p2.x, t), mix(p1.y, p2.y, t));
      ctx.stroke();
    } else if (ax.k === 'circle') {
      const c = project(s.at[0], s.at[1], s.at[2]);
      if (!c) continue;
      ctx.beginPath();
      ctx.arc(c.x, c.y, ax.r * CHART_R * c.k, -Math.PI / 2, -Math.PI / 2 + 6.283185 * fa);
      ctx.stroke();
    }
  }
  const c0 = project(s.at[0], s.at[1], s.at[2]);
  const size = c0 ? Math.max(9, Math.min(15, CHART_R * c0.k * 0.031)) : 11;
  ctx.font = `${size}px 'Helvetica Neue', Helvetica, Arial, sans-serif`;
  ctx.textBaseline = 'middle';
  for (const ax of s.axes) {
    if (ax.k !== 'text') continue;
    const p = at(ax.at);
    if (!p) continue;
    ctx.globalAlpha = fa * (ax.lit ? 0.95 : 0.62);
    ctx.fillStyle = ax.lit ? '#e8f0fa' : '#93a7c0';
    ctx.textAlign = ax.al || 'center';
    ctx.fillText(ax.s, p.x, p.y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

function drawFlash() {
  const s = inStar || trip?.target;
  const p = s ? project(s.at[0], s.at[1], s.at[2]) : null;
  const cxp = p ? p.x : W / 2, cyp = p ? p.y : H / 2;
  const r = Math.hypot(W, H) * (0.28 + flash * 0.95);
  const g = ctx.createRadialGradient(cxp, cyp, 0, cxp, cyp, r);
  const tint = s ? s.tint : '#ffffff';
  g.addColorStop(0, `rgba(255,255,255,${flash})`);
  g.addColorStop(0.25, `rgba(255,255,255,${flash * 0.7})`);
  g.addColorStop(0.6, hexA(tint, flash * 0.3));
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
}
const hexA = (h, a) => `rgba(${hexRGB(h).join(',')},${a})`;

function drawVignette(rush) {
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.28,
                                     W / 2, H / 2, Math.hypot(W, H) * 0.62);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${0.5 + rush * 0.32})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawMap() {
  const w = mapCv.width / DPR, h = mapCv.height / DPR;
  mapCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
  mapCtx.clearRect(0, 0, w, h);
  if (world <= 0.3) return;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const s of stars) {
    x0 = Math.min(x0, s.at[0]); x1 = Math.max(x1, s.at[0]);
    y0 = Math.min(y0, s.at[1]); y1 = Math.max(y1, s.at[1]);
  }
  const pad = 14;
  const sc = Math.min((w - pad * 2) / (x1 - x0), (h - pad * 2) / (y1 - y0));
  const mx = (x) => (x - (x0 + x1) / 2) * sc + w / 2;
  const my = (y) => (y - (y0 + y1) / 2) * sc + h / 2;
  mapCtx.globalAlpha = clamp01((world - 0.3) / 0.4);
  mapCtx.fillStyle = 'rgba(6,10,18,0.6)';
  mapCtx.fillRect(0, 0, w, h);
  mapCtx.strokeStyle = 'rgba(150,178,214,0.24)';
  mapCtx.lineWidth = 1;
  mapCtx.strokeRect(0.5, 0.5, w - 1, h - 1);
  for (const e of DATA.edges) {
    const a = byId[e.a], b = byId[e.b];
    mapCtx.beginPath();
    mapCtx.moveTo(mx(a.at[0]), my(a.at[1]));
    mapCtx.lineTo(mx(b.at[0]), my(b.at[1]));
    mapCtx.stroke();
  }
  for (const s of stars) {
    const here = inStar === s;
    mapCtx.fillStyle = here ? '#ffffff' : s.tint;
    mapCtx.beginPath();
    mapCtx.arc(mx(s.at[0]), my(s.at[1]), here ? 3.4 : 2, 0, 6.283185);
    mapCtx.fill();
    if (here) {
      mapCtx.strokeStyle = 'rgba(255,255,255,0.55)';
      mapCtx.beginPath();
      mapCtx.arc(mx(s.at[0]), my(s.at[1]), 7.5, 0, 6.283185);
      mapCtx.stroke();
      mapCtx.strokeStyle = 'rgba(150,178,214,0.24)';
    }
  }
  mapCtx.globalAlpha = 1;
}
