/**
 * Pulls the hourly electricity price from Red Eléctrica's public API and keeps
 * every response exactly as it came.
 *
 * The endpoint refuses ranges longer than about a month at hourly resolution,
 * so the record is fetched a month at a time and the responses are stored in
 * one array, each untouched, in the order they were asked for. Nothing is
 * averaged or reshaped here — that is `build-power-prices.mjs`, which reads
 * this file and never the network.
 *
 *   node scripts/fetch-power-prices.mjs 2021 2025
 */
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../data/source/ree-pvpc-hourly.json');

const ENDPOINT = 'https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real';
/** The peninsular system: the Canaries and the Balearics price separately. */
const GEO = 'geo_trunc=electric_system&geo_limit=peninsular&geo_ids=8741';

/**
 * The series begins on 1 June 2021, the day Spain's time-of-use PVPC tariff
 * came into force. Ask for May and the endpoint answers 502: there is no such
 * price to give. Nothing before that date is the same tariff, so nothing
 * before that date is asked for.
 */
const START = { year: 2021, month: 6 };

const from = Number(process.argv[2] ?? START.year);
const to = Number(process.argv[3] ?? 2025);

const pad = (n) => String(n).padStart(2, '0');
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

async function month(year, m) {
  const url =
    `${ENDPOINT}?start_date=${year}-${pad(m)}-01T00:00` +
    `&end_date=${year}-${pad(m)}-${lastDay(year, m)}T23:59&time_trunc=hour&${GEO}`;

  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (!body.included?.length) throw new Error('no series in response');
      return { year, month: m, url, fetched: new Date().toISOString(), body };
    } catch (err) {
      if (attempt === 5) throw new Error(`${year}-${pad(m)}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000 * 2 ** (attempt - 1)));
    }
  }
}

// Months already on disk are not asked for again: the API is somebody else's.
const have = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { months: [] };
const known = new Set(have.months.map((r) => `${r.year}-${r.month}`));
const months = have.months.slice();

for (let y = from; y <= to; y++) {
  for (let m = 1; m <= 12; m++) {
    if (y === START.year && m < START.month) continue;
    if (known.has(`${y}-${m}`)) continue;
    const got = await month(y, m);
    months.push(got);
    const series = got.body.included.map(
      (s) => `${s.attributes.title} ${s.attributes.values.length}`,
    );
    console.log(`${y}-${pad(m)}  ${series.join(' · ')}`);
    // The whole file is rewritten each month so a stall costs one request.
    months.sort((a, b) => a.year - b.year || a.month - b.month);
    writeFileSync(
      OUT,
      JSON.stringify({
        source: 'Red Eléctrica de España, apidatos.ree.es',
        endpoint: ENDPOINT,
        geo: 'peninsular electric system',
        months,
      }),
    );
    await new Promise((r) => setTimeout(r, 350));
  }
}

const obs = months.reduce(
  (n, r) => n + r.body.included.reduce((k, s) => k + s.attributes.values.length, 0),
  0,
);
console.log(`${months.length} months · ${obs.toLocaleString('en-GB')} hourly observations`);
