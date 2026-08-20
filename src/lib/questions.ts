import { getCollection, type CollectionEntry } from 'astro:content';
import { CATEGORIES, type Category } from '../data/categories';
import { PIPELINE } from '../data/pipeline';
import { url } from './url';

/** How many questions the home wall shows. The grid is designed around ten. */
export const WALL_SIZE = 10;

export interface QuestionRow {
  question: string;
  /** Set only once the question has been answered, pipeline rows are not links. */
  href?: string;
  /** Archive right-hand column: the source, or SOON while it is unanswered. */
  meta: string;
  published: boolean;
}

/** Loose match so a post reclaims its pipeline slot despite stray punctuation. */
const normalise = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export type Post = CollectionEntry<'questions'>;

export async function publishedPosts(category?: string): Promise<Post[]> {
  const posts = await getCollection('questions', ({ data }) => {
    if (data.draft && !import.meta.env.DEV) return false;
    return category ? data.category === category : true;
  });
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

/**
 * Every question in a category: answered posts first (newest first), then the
 * unanswered pipeline. A pipeline entry is dropped once a post answers it.
 */
export async function questionsFor(category: string): Promise<QuestionRow[]> {
  const posts = await publishedPosts(category);
  const answered = new Set(posts.map((p) => normalise(p.data.question)));

  const rows: QuestionRow[] = posts.map((p) => ({
    question: p.data.question,
    href: url(`${p.data.category}/${p.id}`),
    meta: p.data.sources[0] ?? '',
    published: true,
  }));

  for (const question of PIPELINE[category] ?? []) {
    if (answered.has(normalise(question))) continue;
    rows.push({ question, meta: 'Soon', published: false });
  }
  return rows;
}

export async function wallFor(category: string): Promise<QuestionRow[]> {
  return (await questionsFor(category)).slice(0, WALL_SIZE);
}

export interface ArchiveCategory extends Category {
  index: number;
  href: string;
  archiveHref: string;
  rows: QuestionRow[];
}

/** Same idea as `wallData`, with every question rather than the first ten. */
export async function archiveData(): Promise<ArchiveCategory[]> {
  return Promise.all(
    CATEGORIES.map(async (c, index) => ({
      ...c,
      index,
      href: url(c.id),
      archiveHref: url(`${c.id}/all`),
      rows: await questionsFor(c.id),
    })),
  );
}

export interface WallCategory extends Category {
  index: number;
  total: number;
  href: string;
  archiveHref: string;
  questions: QuestionRow[];
}

/**
 * The whole wall, all seven categories, as plain data. Rendered into the page
 * as JSON so the client-side switcher can swap categories without a navigation
 *, the colour sweep would be lost across a page load.
 */
export async function wallData(): Promise<WallCategory[]> {
  return Promise.all(
    CATEGORIES.map(async (c, index) => ({
      ...c,
      index,
      total: (await questionsFor(c.id)).length,
      href: url(c.id),
      archiveHref: url(`${c.id}/all`),
      questions: await wallFor(c.id),
    })),
  );
}
