// Katalog zbiorów danych: Poznań Otwarte Dane (GraphQL) + krajowy dane.gov.pl (REST).
// Uwaga: domena "dane.org.pl" nie istnieje (brak DNS) — działające portale to
// https://www.poznan.pl/opendata (GraphQL) oraz https://dane.gov.pl (API 1.4).

import { fetchRetry, saveJSON, log, sleep } from './lib.mjs';

const GQL = 'https://www.poznan.pl/opendata/graphql';
const DANE_GOV = 'https://api.dane.gov.pl/1.4';
const INSTYTUCJA_UMP = 47; // Urząd Miasta Poznania na dane.gov.pl

async function gql(query, variables = {}) {
  const res = await fetchRetry(GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors.map((e) => e.message).join('; '));
  return json.data;
}

async function poznanOpendata() {
  const { statistics, categories } = await gql(`{
    statistics { datasetsCount apiCount }
    categories(input:{pageable:{pageNumber:1,pageSize:100}}) {
      categories { id name description datasetsCount hexColorCode }
    }
  }`);

  const zbiory = [];
  for (let strona = 1; strona <= 20; strona++) {
    const d = await gql(`query($p:Int!){
      searchDatasets(input:{pageable:{pageNumber:$p,pageSize:50}}) {
        datasets {
          id name description modifiedOn createdOn source license supportArea
          organization { id name }
          categories { id name }
          fileFormats { name }
          refreshRate { name }
          tags { name }
        }
      }
    }`, { p: strona });
    const partia = d.searchDatasets?.datasets ?? [];
    zbiory.push(...partia);
    if (partia.length < 50) break;
    await sleep(150);
  }

  return {
    statystyki: statistics,
    kategorie: categories?.categories ?? [],
    zbiory: zbiory.map((z) => ({
      id: z.id,
      nazwa: z.name,
      opis: (z.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
      zmieniono: z.modifiedOn,
      utworzono: z.createdOn,
      zrodlo: z.source,
      licencja: z.license,
      obszar: z.supportArea,
      organizacja: z.organization?.name ?? null,
      kategorie: (z.categories ?? []).map((c) => c.name),
      formaty: (z.fileFormats ?? []).map((f) => f.name),
      aktualizacja: z.refreshRate?.name ?? null,
      tagi: (z.tags ?? []).map((t) => t.name),
      url: `https://www.poznan.pl/opendata/dataset/${z.id}`,
    })),
  };
}

async function daneGovPl() {
  const zbiory = [];
  for (let strona = 1; strona <= 10; strona++) {
    const res = await fetchRetry(
      `${DANE_GOV}/institutions/${INSTYTUCJA_UMP}/datasets?per_page=100&page=${strona}`,
      { headers: { Accept: 'application/json' } },
    );
    const json = await res.json();
    const partia = json.data ?? [];
    zbiory.push(
      ...partia.map((d) => ({
        id: d.id,
        nazwa: d.attributes.title,
        opis: (d.attributes.notes || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400),
        kategoria: d.attributes.category?.title ?? null,
        zmieniono: d.attributes.modified,
        zasoby: d.relationships?.resources?.meta?.count ?? 0,
        url: `https://dane.gov.pl/pl/dataset/${d.id}`,
      })),
    );
    if (partia.length < 100) break;
    await sleep(150);
  }
  return zbiory;
}

async function main() {
  const poznan = await poznanOpendata();
  log(`Poznań Otwarte Dane: ${poznan.zbiory.length} zbiorów, ${poznan.kategorie.length} kategorii`);

  let krajowe = [];
  try {
    krajowe = await daneGovPl();
    log(`dane.gov.pl (UM Poznania): ${krajowe.length} zbiorów`);
  } catch (e) {
    log('! dane.gov.pl niedostępne:', e.message);
  }

  await saveJSON('data/raw/katalog.json', {
    pobrano: new Date().toISOString(),
    poznanOpendata: poznan,
    daneGovPl: krajowe,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
