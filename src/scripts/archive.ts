/**
 * The archive's category switcher — the bands behave exactly as they do on the
 * wall: colour sweep, scroll to top, list replays its stagger.
 */

interface Row {
  question: string;
  href?: string;
  meta: string;
  published: boolean;
}

interface ArchiveCategory {
  id: string;
  name: string;
  bg: string;
  ink: string;
  index: number;
  href: string;
  archiveHref: string;
  rows: Row[];
}

const LOCK = 900;

function restart(el: Element, cls = 'run') {
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}

/** Built as nodes, never as an HTML string: the text is content, not markup. */
function buildRow(row: Row, n: number): HTMLLIElement {
  const li = document.createElement('li');
  const a = document.createElement('a');
  a.className = 'row run';
  a.style.setProperty('--n', String(n));
  if (row.href) a.href = row.href;

  const num = document.createElement('span');
  num.className = 'num mono';
  num.textContent = String(n + 1).padStart(2, '0');

  const q = document.createElement('span');
  q.className = 'q';
  q.textContent = row.question;

  const src = document.createElement('span');
  src.className = 'src mono';
  src.textContent = row.meta;

  a.append(num, q, src);
  li.append(a);
  return li;
}

export function initArchive() {
  const el = document.querySelector('[data-archive-data]');
  if (!el?.textContent) return;
  const cats = JSON.parse(el.textContent) as ArchiveCategory[];

  const shell = document.querySelector<HTMLElement>('[data-shell]');
  const nav = document.querySelector<HTMLElement>('[data-bands]');
  const list = document.querySelector<HTMLElement>('[data-list]');
  const title = document.querySelector<HTMLElement>('[data-title]');
  const count = document.querySelector<HTMLElement>('[data-count]');
  const wallLink = document.querySelector<HTMLAnchorElement>('[data-wall-link]');
  const sweep = document.querySelector<HTMLElement>('[data-sweep]');
  const ring = document.querySelector<HTMLElement>('[data-sweep-ring]');
  if (!shell || !nav || !list) return;

  const bands = Array.from(nav.querySelectorAll<HTMLAnchorElement>('[data-band]'));
  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');

  let current = Number(nav.dataset.active ?? 0);
  let busy = false;

  function paint(i: number, push: boolean) {
    const cat = cats[i];
    if (!cat) return;
    current = i;

    const rect = bands[i]?.getBoundingClientRect();
    if (sweep && ring && rect) {
      const x = `${rect.left + rect.width / 2}px`;
      const y = `${rect.top + rect.height / 2}px`;
      for (const node of [sweep, ring]) {
        node.style.left = x;
        node.style.top = y;
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

    if (title) {
      title.textContent = cat.name;
      restart(title);
    }
    count?.replaceChildren(
      `${cat.rows.length} questions`,
      document.createElement('br'),
      'full archive',
    );
    if (wallLink) wallLink.href = cat.href;

    list!.replaceChildren(...cat.rows.map(buildRow));

    document.title = `${cat.name} — all questions — MAGNITUDE`;
    if (push && cat.archiveHref !== location.pathname) {
      history.pushState({ category: cat.id }, '', cat.archiveHref);
    }
    window.scrollTo({ top: 0 });
  }

  nav.addEventListener('click', (e) => {
    const band = (e.target as Element | null)?.closest<HTMLElement>('[data-band]');
    if (!band) return;
    const mouse = e as MouseEvent;
    if (mouse.metaKey || mouse.ctrlKey || mouse.shiftKey || mouse.button !== 0) return;
    e.preventDefault();
    const i = Number(band.dataset.band);
    if (busy || i === current) return;
    busy = true;
    window.setTimeout(() => (busy = false), LOCK);
    paint(i, true);
  });

  window.addEventListener('popstate', () => {
    const id = location.pathname.replace(/\/all\/?$/, '').split('/').pop();
    const i = cats.findIndex((c) => c.id === id);
    if (i !== -1) paint(i, false);
  });
}
