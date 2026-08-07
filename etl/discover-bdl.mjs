// Pomocnik jednorazowy: przegląda drzewo GUS BDL, żeby znaleźć identyfikatory zmiennych.
// Uruchom: node etl/discover-bdl.mjs "fraza tematu"
import { fetchRetry, sleep } from './lib.mjs';

const BDL = 'https://bdl.stat.gov.pl/api/v1';
const TEMATY = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      'Dochody budżetów gmin',
      'Wydatki budżetów gmin',
      'Bezrobocie rejestrowane',
      'Przeciętne miesięczne wynagrodzenia',
      'Ludność wg grup wieku',
      'Migracje wewnętrzne i zagraniczne',
      'Zasoby mieszkaniowe',
      'Podmioty gospodarki narodowej',
      'Tereny zieleni',
      'Przestępstwa',
      'Zobowiązania',
    ];

for (const temat of TEMATY) {
  const res = await fetchRetry(
    `${BDL}/subjects/search?name=${encodeURIComponent(temat)}&format=json&page-size=6`,
    { headers: { Accept: 'application/json' } },
  );
  const subj = await res.json();
  console.log(`\n=========== TEMAT: ${temat} (${subj.totalRecords})`);
  for (const s of (subj.results ?? []).slice(0, 4)) {
    console.log(`  [${s.id}] ${s.name}`);
    await sleep(200);
    try {
      const vres = await fetchRetry(
        `${BDL}/variables/search?subject-id=${s.id}&format=json&page-size=25&level=6`,
        { headers: { Accept: 'application/json' } },
      );
      const v = await vres.json();
      for (const r of (v.results ?? []).slice(0, 25)) {
        console.log(`      ${r.id}\t${[r.n1, r.n2, r.n3].filter(Boolean).join(' / ')}  [${r.measureUnitName}]`);
      }
    } catch (e) {
      console.log('      (brak zmiennych)', e.message);
    }
  }
  await sleep(250);
}
