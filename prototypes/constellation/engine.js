/* =====================================================================
 * A constellation you fly through.
 *
 * Everything here is three-dimensional and projected by hand. That is the
 * whole point: a flat map zoomed in and out can only ever slide, and sliding
 * is what tells you it is a web page. Stars at real depths stream past at
 * different rates, the near ones tearing by while the far ones hold still,
 * and that difference is what the eye reads as travel.
 *
 * The sky is in two halves. A deep field of two thousand stars sits so far
 * out that nothing you do moves it: that is the sky, and it is why the
 * constellation is still the same shape after a journey. A nearer drift field
 * is recycled as you pass it, so the travel never runs out of space.
 * ===================================================================== */

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const stage = document.getElementById('stage');
const cv = document.getElementById('sky');
const ctx = cv.getContext('2d', { alpha: false });
const tip = document.getElementById('tip');
const head = document.getElementById('head');
const headline = head.querySelector('h1');
const readEl = document.getElementById('read');
const foot = document.getElementById('foot');
const mapBox = document.getElementById('map');
const mapCv = mapBox.querySelector('canvas');
const mapCtx = mapCv.getContext('2d');
const hint = document.getElementById('hint');

let W = 0, H = 0, DPR = 1;
/** A third-size buffer that everything bright is drawn into, blurred once and
 *  laid back over the scene. One pass, and it is what turns points of light
 *  into light. */
const glowCv = document.createElement('canvas');
const glow = glowCv.getContext('2d');

const stars = DATA.stars;
const byId = Object.fromEntries(stars.map((s) => [s.id, s]));

let seed = 20260821;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const rr = (a, b) => a + rnd() * (b - a);

/* ------------------------------------------------------------------ camera */
const cam = { x: 0, y: 0, z: -9000, yaw: 0, pitch: 0, roll: 0, focal: 1000 };
let prev = { x: 0, y: 0, z: -9000 };
let speed = 0;          // world units per frame, smoothed
let shake = 0;

function project(px, py, pz) {
  const dx = px - cam.x, dy = py - cam.y, dz = pz - cam.z;
  const cy = Math.cos(-cam.yaw), sy = Math.sin(-cam.yaw);
  const x1 = dx * cy - dz * sy;
  const z1 = dx * sy + dz * cy;
  const cp = Math.cos(-cam.pitch), sp = Math.sin(-cam.pitch);
  const y1 = dy * cp - z1 * sp;
  const z2 = dy * sp + z1 * cp;
  if (z2 <= 40) return null;
  const k = cam.focal / z2;
  const ax = x1 * k, ay = y1 * k;
  const cr = Math.cos(cam.roll), sr = Math.sin(cam.roll);
  return { x: W / 2 + ax * cr - ay * sr, y: H / 2 + ax * sr + ay * cr, z: z2, k };
}

/* ------------------------------------------------------------------- field */
const deep = [];      // the sky itself: too far to move
const drift = [];     // the near field: recycled as it goes past

/** Real star colours run blue-white through yellow to red, and a sky of one
 *  hue looks printed rather than photographed. */
const TEMPERATURE = ['#cfe0ff', '#e6efff', '#ffffff', '#fff4e0', '#ffe2b8', '#ffcda0', '#ffb99a'];

function buildField() {
  deep.length = 0; drift.length = 0;
  for (let i = 0; i < 3200; i++) {
    // On a shell around everything, so the sky is behind you as well as ahead.
    // Half of it is always off screen, which is what a sky is.
    const band = rnd() < 0.46;                    // the galaxy has to be somewhere
    const u = rr(-1, 1);
    const th = rr(0, 6.283185);
    const r = rr(50000, 135000);
    const flat = band ? 0.13 : 1;
    const sx = Math.sqrt(1 - u * u) * Math.cos(th);
    const sy = u * flat + (band ? rr(-0.07, 0.07) : 0);
    const sz = Math.sqrt(1 - u * u) * Math.sin(th);
    deep.push({
      x: sx * r, y: sy * r, z: sz * r,
      m: Math.pow(rnd(), band ? 2.9 : 2.1),
      c: TEMPERATURE[(rnd() * TEMPERATURE.length) | 0],
      p: rr(0, 6.283), w: rr(0.4, 1.9),
    });
  }
  for (let i = 0; i < 1000; i++) drift.push(seedDrift(true));
}

function seedDrift(anywhere) {
  const ahead = anywhere ? rr(600, 26000) : rr(20000, 27000);
  return {
    x: cam.x + rr(-16000, 16000),
    y: cam.y + rr(-12000, 12000),
    z: cam.z + ahead,
    m: Math.pow(rnd(), 1.8),
    c: TEMPERATURE[(rnd() * TEMPERATURE.length) | 0],
    p: rr(0, 6.283),
  };
}

/* ------------------------------------------------------------------ nebulae
 * Painted once into offscreen tiles, then hung in space at different depths.
 * Generating cloud on the fly every frame is the expensive way to do a thing
 * that never changes. */
const clouds = [];
function paintCloud(hue, size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 190; i++) {
    const x = rr(0, size), y = rr(0, size);
    const r = rr(size * 0.04, size * 0.3);
    const d = Math.hypot(x - size / 2, y - size / 2) / (size / 2);
    const a = Math.max(0, 0.15 * (1 - d * 0.8)) * rr(0.35, 1);
    const rad = g.createRadialGradient(x, y, 0, x, y, r);
    rad.addColorStop(0, `hsla(${hue + rr(-16, 16)}, ${rr(45, 85)}%, ${rr(46, 68)}%, ${a})`);
    rad.addColorStop(1, 'hsla(0,0%,0%,0)');
    g.fillStyle = rad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // A few dark lanes, because a cloud with no shadow reads as a smudge.
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 26; i++) {
    const x = rr(0, size), y = rr(0, size), r = rr(size * 0.05, size * 0.24);
    const rad = g.createRadialGradient(x, y, 0, x, y, r);
    rad.addColorStop(0, `rgba(0,0,0,${rr(0.25, 0.75)})`);
    rad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Feather the tile away to nothing at its edges. Without this the cloud is a
  // square, and the moment you see the square the sky stops being a sky.
  g.globalCompositeOperation = 'destination-in';
  const mask = g.createRadialGradient(size / 2, size / 2, size * 0.06, size / 2, size / 2, size * 0.5);
  mask.addColorStop(0, 'rgba(0,0,0,1)');
  mask.addColorStop(0.62, 'rgba(0,0,0,0.72)');
  mask.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = mask;
  g.fillRect(0, 0, size, size);
  // One soft pass. A tile blown up to forty thousand units across shows every
  // blob it was built from otherwise, and blobs at that scale read as pattern.
  const out = document.createElement('canvas');
  out.width = out.height = size;
  const o = out.getContext('2d');
  o.filter = `blur(${(size / 26).toFixed(1)}px)`;
  o.drawImage(c, 0, 0);
  return out;
}

function buildClouds() {
  clouds.length = 0;
  const set = [[228, 1.15], [268, 0.8], [204, 1.35], [318, 0.6], [186, 0.9],
               [246, 1.05], [292, 0.7], [212, 0.85]];
  set.forEach(([hue, scale]) => {
    clouds.push({
      img: paintCloud(hue, 640),
      x: rr(-52000, 52000), y: rr(-26000, 26000), z: rr(-30000, 92000),
      size: 44000 * scale, a: rr(0.45, 1),
    });
  });
  clouds.sort((a, b) => b.z - a.z);
}

/* ------------------------------------------------------------------- grain */
let grainImg = null;
function paintGrain() {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const d = g.createImageData(s, s);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = 122 + (rnd() * 52 - 26);
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
    d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  grainImg = c;
}
