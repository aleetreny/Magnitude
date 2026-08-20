/**
 * Pulls Eurostat's harmonised time use table and keeps the response as it came.
 *
 * `tus_00age` is the only Europe-wide table that says how a day is actually
 * spent: diaries kept by people in each country, coded into the same activity
 * list, averaged over every day of the week and over the whole population aged
 * 20 to 74. The whole file is stored verbatim so every figure on the page can
 * be traced back to it, and so the build never touches the network.
 *
 *   node scripts/fetch-time-use.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../data/source/eurostat-tus_00age.json');

const URL_ =
  'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/tus_00age?format=JSON&lang=EN';

const res = await fetch(URL_, { signal: AbortSignal.timeout(120_000) });
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const body = await res.json();

if (body.extension?.id !== 'TUS_00AGE') {
  throw new Error(`expected dataset TUS_00AGE, found ${body.extension?.id}`);
}

mkdirSync(dirname(OUT), { recursive: true });
const text = JSON.stringify(body);
writeFileSync(OUT, text);

console.log(
  `${body.label}\n` +
    `updated ${body.updated} · ${Object.keys(body.value).length.toLocaleString('en-GB')} cells · ` +
    `${(Buffer.byteLength(text) / 1024).toFixed(0)} KB`,
);
