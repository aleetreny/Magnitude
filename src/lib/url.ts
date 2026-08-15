const BASE = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

/** Build a site-absolute URL that survives the GitHub Pages `base` prefix. */
export function url(path = ''): string {
  return BASE + String(path).replace(/^\/+/, '');
}

export const BASE_PATH = BASE;
