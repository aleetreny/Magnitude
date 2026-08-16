/**
 * The wall's category switcher.
 *
 * Every category is server-rendered at its own URL, so the site works with
 * JavaScript off and deep links are real pages. This upgrades the seven bands
 * into an in-place switch: a page load would throw away the colour sweep, which
 * is the whole navigation.
 */

interface QuestionRow {
  question: string;
  href?: string;
  meta: string;
  published: boolean;
}

interface WallCategory {
  id: string;
  name: string;
  bg: string;
  ink: string;
  band: string;
  index: number;
  total: number;
  href: string;
  archiveHref: string;
  questions: QuestionRow[];
}

/** Input lock, matching the 900ms background transition. */
const LOCK = 900;
const WHEEL_THRESHOLD = 12;
const DRAG_THRESHOLD = 55;
/** A phone swipe has to travel further than a stray thumb on a scroll. */
const SWIPE_THRESHOLD = 60;

const narrow = () => window.matchMedia('(max-width: 720px)').matches;

/** Restart a CSS animation: drop the class, force reflow, put it back. */
function restart(el: Element, cls = 'run') {
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}

function readJSON<T>(selector: string): T | null {
  const el = document.querySelector(selector);
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent) as T;
  } catch {
    return null;
  }
}

export function initWall() {
  const cats = readJSON<WallCategory[]>('[data-wall-data]');
  const shell = document.querySelector<HTMLElement>('[data-shell]');
  const nav = document.querySelector<HTMLElement>('[data-bands]');
  const stage = document.querySelector<HTMLElement>('[data-stage]');
  const wall = document.querySelector<HTMLElement>('[data-wall]');
  const hud = document.querySelector<HTMLElement>('[data-hud]');
  const catName = document.querySelector<HTMLElement>('[data-cat-name]');
  const archive = document.querySelector<HTMLAnchorElement>('[data-archive]');
  const sweep = document.querySelector<HTMLElement>('[data-sweep]');
  const ring = document.querySelector<HTMLElement>('[data-sweep-ring]');
  if (!cats || !shell || !nav || !stage || !wall) return;

  const bands = Array.from(nav.querySelectorAll<HTMLAnchorElement>('[data-band]'));
  const slots = Array.from(wall.querySelectorAll<HTMLLIElement>('[data-slot]'));
  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');

  let current = Number(nav.dataset.active ?? 0);
  let busy = false;

  /** Scale the wall down until it fits the stage — it must never scroll. */
  function fit() {
    if (!stage || !wall) return;
    if (narrow()) {
      wall.style.transform = '';
      return;
    }
    wall.style.transform = 'none';
    const avail = stage.clientHeight - 2;
    const need = wall.scrollHeight;
    wall.style.transform = need > avail ? `scale(${Math.max(0.62, avail / need)})` : 'scale(1)';
  }

  function paint(i: number, push: boolean) {
    const cat = cats![i];
    current = i;

    const rect = bands[i]?.getBoundingClientRect();
    if (sweep && ring && rect) {
      const x = `${rect.left + rect.width / 2}px`;
      const y = `${rect.top + rect.height / 2}px`;
      for (const el of [sweep, ring]) {
        el.style.left = x;
        el.style.top = y;
      }
      sweep.style.background = cat.bg;
      ring.style.borderColor = cat.ink;
      restart(sweep);
      restart(ring);
    }

    shell!.style.backgroundColor = cat.bg;
    shell!.style.color = cat.ink;
    themeColor?.setAttribute('content', cat.bg);

    nav!.dataset.active = String(i);
    bands.forEach((band, n) => {
      if (n === i) band.setAttribute('aria-current', 'page');
      else band.removeAttribute('aria-current');
    });

    slots.forEach((slot, n) => {
      const q = cat.questions[n];
      slot.hidden = !q;
      const link = slot.querySelector('a');
      if (!link) return;
      link.textContent = q ? q.question : '';
      if (q?.href) link.setAttribute('href', q.href);
      else link.removeAttribute('href');
    });
    for (const slot of slots) restart(slot);

    if (hud) {
      hud.textContent = `${String(cat.index + 1).padStart(2, '0')} / ${String(cats!.length).padStart(2, '0')} · ${cat.name} · ${cat.total} questions`;
      restart(hud);
    }
    if (catName) catName.textContent = cat.name;
    if (archive) archive.href = cat.archiveHref;

    document.title = `${cat.name} — MAGNITUDE`;
    if (push && cat.href !== location.pathname) {
      history.pushState({ category: cat.id }, '', cat.href);
    }

    fit();
  }

  function go(next: number) {
    const i = ((next % cats!.length) + cats!.length) % cats!.length;
    if (busy || i === current) return;
    busy = true;
    window.setTimeout(() => (busy = false), LOCK);
    paint(i, true);
  }

  // Bands: intercept the navigation, keep the link for new tabs and no-JS.
  nav.addEventListener('click', (e) => {
    const band = (e.target as Element | null)?.closest<HTMLElement>('[data-band]');
    if (!band) return;
    const mouse = e as MouseEvent;
    if (mouse.metaKey || mouse.ctrlKey || mouse.shiftKey || mouse.button !== 0) return;
    e.preventDefault();
    go(Number(band.dataset.band));
  });

  // Wheel, drag and arrows only where the wall is a fixed, non-scrolling stage.
  document.addEventListener(
    'wheel',
    (e) => {
      if (narrow()) return;
      e.preventDefault();
      if (busy || Math.abs(e.deltaY) + Math.abs(e.deltaX) < WHEEL_THRESHOLD) return;
      go(current + (e.deltaY + e.deltaX > 0 ? 1 : -1));
    },
    { passive: false },
  );

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') go(current + 1);
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') go(current - 1);
  });

  let fromX: number | null = null;
  let fromY: number | null = null;
  let dragged = false;
  document.addEventListener('pointerdown', (e) => {
    // The bands handle their own taps; links keep working as links.
    if ((e.target as Element | null)?.closest('a')) return;
    fromX = e.clientX;
    fromY = e.clientY;
    dragged = false;
  });
  document.addEventListener('pointermove', (e) => {
    if (fromX === null || fromY === null || dragged) return;
    const dx = fromX - e.clientX;
    const dy = fromY - e.clientY;
    if (narrow()) {
      // Only a decisively sideways move counts, or scrolling the wall would
      // change category every time a thumb wandered.
      if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.5) {
        dragged = true;
        go(current + (dx > 0 ? 1 : -1));
      }
      return;
    }
    if (Math.abs(dy) > DRAG_THRESHOLD) {
      dragged = true;
      go(current + (dy > 0 ? 1 : -1));
    }
  });
  const endDrag = () => {
    fromX = null;
    fromY = null;
  };
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);

  window.addEventListener('popstate', () => {
    const id = location.pathname.replace(/\/+$/, '').split('/').pop();
    const i = cats.findIndex((c) => c.id === id);
    paint(i === -1 ? 0 : i, false);
  });

  window.addEventListener('resize', fit);
  // Mono metrics land late; the tallest categories need the second measurement.
  document.fonts?.ready.then(fit);
  fit();
}
