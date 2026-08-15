/**
 * The seven categories, in wall order.
 *
 * `bg`   — full-screen page background on the wall and the archive
 * `ink`  — text colour on that background; also the article `--accent`
 * `band` — saturated version of `bg`, used for the fixed edge bands and the
 *          4px rule at the top of an article
 */
export interface Category {
  readonly id: string;
  readonly name: string;
  readonly bg: string;
  readonly ink: string;
  readonly band: string;
}

export const CATEGORIES = [
  { id: 'housing', name: 'Housing', bg: '#f3d9d2', ink: '#5c2418', band: '#e9a894' },
  { id: 'work', name: 'Work', bg: '#d9e3f2', ink: '#1d3a5f', band: '#9db6d8' },
  { id: 'energy', name: 'Energy', bg: '#f5eac2', ink: '#5c4a10', band: '#e6cf7f' },
  { id: 'health', name: 'Health', bg: '#d6e8de', ink: '#17453a', band: '#96c4ae' },
  { id: 'food', name: 'Food', bg: '#f8e2ca', ink: '#64411b', band: '#eab77e' },
  { id: 'mobility', name: 'Mobility', bg: '#e4dff1', ink: '#3a2f5e', band: '#b8abd9' },
  { id: 'culture', name: 'Culture', bg: '#f0dbe8', ink: '#55284a', band: '#d9a6c6' },
] as const satisfies readonly Category[];

export type CategoryId = (typeof CATEGORIES)[number]['id'];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as CategoryId[];

export function getCategory(id: string): Category {
  const found = CATEGORIES.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown category "${id}". Known: ${CATEGORY_IDS.join(', ')}`);
  return found;
}

export function categoryIndex(id: string): number {
  return CATEGORIES.findIndex((c) => c.id === id);
}
