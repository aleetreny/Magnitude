import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';
import { CATEGORY_IDS, type CategoryId } from './data/categories';

const questions = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/questions' }),
  schema: z.object({
    /** The question itself, verbatim, with its question mark. This is the title. */
    question: z.string().min(1),
    /** One or two sentences that actually answer it. Runs as the standfirst. */
    answer: z.string().min(1),
    category: z.enum(CATEGORY_IDS as [CategoryId, ...CategoryId[]]),
    sources: z.array(z.string().min(1)).min(1),
    charts: z.number().int().min(0).default(1),
    readingMinutes: z.number().int().min(1).default(4),
    date: z.coerce.date(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { questions };
