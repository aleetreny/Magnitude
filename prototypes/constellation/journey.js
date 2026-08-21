/* ===================================================================== trip
 * A journey is not a tween between two camera positions. It is four moves:
 * you turn to face the thing, you go, the light of arriving blinds you for a
 * moment, and then you are somewhere else. Each leg has its own job and its
 * own curve, and the flash is what lets the sky become a different sky
 * without the eye catching the join.
 */
const ease = {
  out: (t) => 1 - Math.pow(1 - t, 3),
  inOut: (t) => (t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2),
  back: (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2),
  soft: (t) => t * t * (3 - 2 * t),
};
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a + (b - a) * t;

let trip = null;
let inStar = null;         // the star we have arrived at
let world = 0;             // 0 the open sky, 1 inside a star's own world
let flash = 0;
let assembly = 0;          // how far the chart has come together
let idle = 0;

/** How far back the camera has to sit for the whole constellation to fit. */
function skyCam() {
  let r = 0;
  for (const s of stars) r = Math.max(r, Math.hypot(s.at[0], s.at[1]) );
  const back = (r * 1.55 * cam.focal) / (Math.min(W, H) * 0.42);
  let zc = 0;
  for (const s of stars) zc += s.at[2];
  zc /= stars.length;
  return { x: 0, y: 0, z: zc - back, yaw: 0, pitch: 0, roll: 0 };
}

/** Where the camera stands to read one star's chart, straight on. */
function readCam(s) {
  const b = band();
  const half = Math.max((s.box[0] / 2) * CHART_R / (W * 0.46),
                        (s.box[1] / 2) * CHART_R / (b.h * 0.46));
  const d = cam.focal * half;
  const lift = ((b.top + b.h / 2) - H / 2) / cam.focal * d;
  return { x: s.at[0] + s.mid[0] * CHART_R, y: s.at[1] + s.mid[1] * CHART_R - lift,
           z: s.at[2] - d, yaw: 0, pitch: 0, roll: 0 };
}

function aimAt(from, to) {
  const ax = to.x - from.x, ay = to.y - from.y, az = to.z - from.z;
  return { yaw: Math.atan2(ax, az), pitch: -Math.atan2(ay, Math.hypot(ax, az)) };
}

function travel(target) {
  const to = target ? readCam(target) : skyCam();
  const from = { x: cam.x, y: cam.y, z: cam.z, yaw: cam.yaw, pitch: cam.pitch, roll: cam.roll };
  const aim = aimAt(from, to);

  // The path is a cubic, not a straight line and not a single arc. The first
  // control point sits BEHIND where you are standing, so the camera retreats
  // before it commits; the second sits behind the target, so it comes in along
  // the star's own axis rather than sideswiping it. Between them the camera
  // covers three or four times the distance between the two points, and that
  // extra distance is the whole reason the journey reads as travel: five
  // hundred units of drift is a pan, six thousand is a flight.
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const dist = Math.hypot(dx, dy, dz);
  const len = dist || 1;
  const ux = dx / len, uy = dy / len, uz = dz / len;
  let px = -uz, py = 0.44, pz = ux;                  // a perpendicular, tilted up
  const pl = Math.hypot(px, py, pz) || 1;
  px /= pl; py /= pl; pz /= pl;

  // Where the camera is looking now, so the retreat goes backwards from here.
  const fy = Math.cos(from.yaw) * Math.cos(from.pitch);
  const fx = Math.sin(from.yaw) * Math.cos(from.pitch);
  const fv = -Math.sin(from.pitch);
  const back = Math.max(3600, dist * 1.05);
  const bow = Math.max(2600, dist * 0.55) * (target ? 1 : 0.7);

  const c1 = { x: from.x - fx * back + px * bow * 0.5,
               y: from.y - fv * back + py * bow * 0.5,
               z: from.z - fy * back + pz * bow * 0.5 };
  const c2 = { x: to.x + px * bow - ux * back * 0.35,
               y: to.y + py * bow - uy * back * 0.35,
               z: to.z + pz * bow - uz * back * 0.35 };

  // Rough arc length, so a long haul is given longer to happen.
  let arc = 0, ax = from.x, ay = from.y, az = from.z;
  for (let i = 1; i <= 16; i++) {
    const t = i / 16, it = 1 - t;
    const bx = it * it * it * from.x + 3 * it * it * t * c1.x + 3 * it * t * t * c2.x + t * t * t * to.x;
    const by = it * it * it * from.y + 3 * it * it * t * c1.y + 3 * it * t * t * c2.y + t * t * t * to.y;
    const bz = it * it * it * from.z + 3 * it * it * t * c1.z + 3 * it * t * t * c2.z + t * t * t * to.z;
    arc += Math.hypot(bx - ax, by - ay, bz - az);
    ax = bx; ay = by; az = bz;
  }

  // A hook for looking at the thing frame by frame while building it.
  const slow = (typeof window !== 'undefined' && window.__slow) || 1;
  const legs = {
    turn: reduced ? 0 : 460 * slow,
    warp: reduced ? 0 : Math.max(1500, Math.min(3200, 900 + arc * 0.055)) * slow,
    flash: reduced ? 0 : 300 * slow,
    settle: reduced ? 0 : (target ? 1150 : 700) * slow,
  };
  trip = {
    t0: performance.now(), from, to, c1, c2, arc, aim, target, legs, worldFrom: world,
    total: legs.turn + legs.warp + legs.flash + legs.settle,
    // Banking: the harder the turn, the more the horizon tips.
    roll: Math.max(-0.42, Math.min(0.42, wrap(aim.yaw - from.yaw) * 0.55)),
  };
  if (target) { inStar = target; } else { inStar = null; }
  if (reduced) { Object.assign(cam, to); world = target ? 1 : 0; assembly = target ? 1 : 0; trip = null; chrome(); }
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const angle = (a, b, t) => a + wrap(b - a) * t;

function runTrip(now) {
  const e = now - trip.t0;
  const { legs, from, to, aim } = trip;
  const going = !!trip.target;

  // 1 · turn to face it
  if (e < legs.turn) {
    const t = ease.soft(e / legs.turn);
    cam.yaw = angle(from.yaw, aim.yaw, t);
    cam.pitch = angle(from.pitch, aim.pitch, t);
    cam.roll = mix(from.roll, trip.roll, t);
    flash = 0;
    return;
  }
  // 2 · go
  const e2 = e - legs.turn;
  if (e2 < legs.warp) {
    const raw = e2 / legs.warp;
    const t = ease.inOut(raw);
    const it = 1 - t;
    const { c1, c2 } = trip;
    cam.x = it*it*it*from.x + 3*it*it*t*c1.x + 3*it*t*t*c2.x + t*t*t*to.x;
    cam.y = it*it*it*from.y + 3*it*it*t*c1.y + 3*it*t*t*c2.y + t*t*t*to.y;
    cam.z = it*it*it*from.z + 3*it*it*t*c1.z + 3*it*t*t*c2.z + t*t*t*to.z;
    // Straighten up on the way in, and punch the field of view at full speed.
    const s = ease.soft(clamp01((raw - 0.35) / 0.65));
    cam.yaw = angle(aim.yaw, to.yaw, s);
    cam.pitch = angle(aim.pitch, to.pitch, s);
    cam.roll = mix(trip.roll, 0, s);
    const punch = Math.sin(raw * Math.PI);
    cam.focal = FOCAL * (1 - 0.34 * punch);
    shake = punch * 1.6;
    if (going) world = Math.max(trip.worldFrom * (1 - raw), clamp01((raw - 0.7) / 0.3) * 0.35);
    else { world = mix(trip.worldFrom, 0, ease.soft(clamp01(raw / 0.5))); assembly = 0; }
    return;
  }
  // 3 · the light of arriving
  const e3 = e2 - legs.warp;
  cam.x = to.x; cam.y = to.y; cam.z = to.z;
  cam.yaw = to.yaw; cam.pitch = to.pitch; cam.roll = to.roll;
  cam.focal = FOCAL;
  if (e3 < legs.flash) {
    const t = e3 / legs.flash;
    flash = going ? Math.sin(Math.min(1, t * 1.6) * Math.PI) : Math.sin(t * Math.PI) * 0.5;
    if (going) world = mix(0.35, 1, ease.out(t));
    assembly = 0;
    shake = (1 - t) * 2.2;
    return;
  }
  // 4 · and then you are somewhere else
  const e4 = e3 - legs.flash;
  flash = Math.max(0, 1 - e4 / 260) * (going ? 0.5 : 0.2);
  shake = 0;
  if (going) { world = 1; assembly = clamp01(e4 / legs.settle); }
  else { world = 0; assembly = 0; }
  if (e4 >= legs.settle) { trip = null; assembly = going ? 1 : 0; flash = 0; }
  chrome();
}

function chrome() {
  const open = !!inStar && world > 0.7 && assembly > 0.25;
  head.classList.toggle('on', open);
  foot.classList.toggle('on', open);
  mapBox.classList.toggle('on', world > 0.35);
  hint.style.opacity = world > 0.2 || trip ? 0 : 0.9;
  if (open) { headline.textContent = inStar.q; foot.textContent = inStar.src; }
  else { readEl.classList.remove('on'); readNow = null; }
}
