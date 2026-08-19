/**
 * Pulls the two INE series this post rests on and keeps them exactly as they
 * came: how many drinking establishments the business register counts, and how
 * many people live here.
 *
 * Both are measured on 1 January, which is the only reason they can be divided
 * by one another. The business register (DIRCE) reports its stock on that date;
 * the population figure is the Estadística Continua de Población reading for
 * the same day.
 *
 *   node scripts/fetch-bars.mjs
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../data/source/ine-bars.json');

const API = 'https://servicios.ine.es/wstempus/js/ES/DATOS_SERIE';
/** Enough readings to cover 2010 onwards; population is quarterly. */
const YEARS = 20;

/**
 * CNAE group 563, "establecimientos de bebidas" — the drinking places. Not
 * 561 restaurants, not 562 catering: the thing everyone means by a bar.
 */
const BARS = {
  national: 'DIR307313',
  regions: {
    Andalucía: 'DIR310987',
    Aragón: 'DIR314661',
    Asturias: 'DIR318335',
    'Balearic Islands': 'DIR322009',
    'Canary Islands': 'DIR325683',
    Cantabria: 'DIR329357',
    'Castile and León': 'DIR333031',
    'Castile-La Mancha': 'DIR336705',
    Catalonia: 'DIR340379',
    Valencia: 'DIR344053',
    Extremadura: 'DIR347727',
    Galicia: 'DIR351401',
    Madrid: 'DIR355075',
    Murcia: 'DIR358749',
    Navarre: 'DIR362423',
    'Basque Country': 'DIR366097',
    'La Rioja': 'DIR369771',
  },
};

/** Resident population of Spain, all ages, both sexes. */
const POPULATION = 'ECP320';

async function series(code, periods) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const url = `${API}/${code}?nult=${periods}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (!body.Data?.length) throw new Error('no readings');
      return { code, url, fetched: new Date().toISOString(), body };
    } catch (err) {
      if (attempt === 5) throw new Error(`${code}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 1500 * 2 ** (attempt - 1)));
    }
  }
}

const out = {
  source: 'Instituto Nacional de Estadística',
  registry: 'DIRCE — Directorio Central de Empresas, local units by CNAE group',
  population: 'ECP — Estadística Continua de Población, 1 January',
  bars: { national: await series(BARS.national, YEARS), regions: {} },
  populationSeries: await series(POPULATION, YEARS * 4),
};
console.log(`national bars · ${out.bars.national.body.Data.length} readings`);

for (const [name, code] of Object.entries(BARS.regions)) {
  out.bars.regions[name] = await series(code, YEARS);
  console.log(`${name} · ${out.bars.regions[name].body.Data.length} readings`);
  await new Promise((r) => setTimeout(r, 250));
}

writeFileSync(OUT, JSON.stringify(out));
console.log(
  `population · ${out.populationSeries.body.Data.length} readings · ` +
    `${(Buffer.byteLength(JSON.stringify(out)) / 1024).toFixed(0)} KB`,
);
