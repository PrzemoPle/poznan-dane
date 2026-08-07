// Kontrola kompletności pobranych roczników rejestru umów.
// Sygnalizuje roczniki z lukami miesięcznymi — typowy objaw urwanego stronicowania.
import { readdir } from 'node:fs/promises';
import { loadJSON } from './lib.mjs';

const pliki = (await readdir('data/raw')).filter((f) => /^umowy-\d{4}\.json$/.test(f)).sort();
const dzis = new Date().toISOString().slice(0, 10);
let podejrzane = 0;

console.log('rok   umów   mies.  luki                          suma [mln zł]');
for (const f of pliki) {
  const rok = f.match(/\d{4}/)[0];
  const dane = await loadJSON(`data/raw/${f}`, []);
  const miesiace = new Set(dane.map((u) => u.data.slice(5, 7)));
  const oczekiwane = rok === dzis.slice(0, 4) ? Number(dzis.slice(5, 7)) : 12;
  const luki = Array.from({ length: oczekiwane }, (_, i) => String(i + 1).padStart(2, '0'))
    .filter((m) => !miesiace.has(m));
  const suma = dane.reduce((s, u) => s + (u.wartosc || 0), 0) / 1e6;
  // W latach rozruchu rejestru (2014–2015) puste miesiące są normą, nie objawem błędu.
  const istotny = dane.length >= 1000;
  const flaga = luki.length ? (istotny ? ' ⚠' : ' (rozruch rejestru)') : '';
  if (luki.length && istotny) podejrzane++;
  console.log(
    `${rok}  ${String(dane.length).padStart(5)}  ${String(miesiace.size).padStart(4)}   ` +
    `${(luki.join(',') || '—').padEnd(28)}  ${suma.toLocaleString('pl-PL', { maximumFractionDigits: 1 }).padStart(10)}${flaga}`,
  );
}
console.log(podejrzane ? `\n${podejrzane} rocznik(ów) z lukami — rozważ FORCE=1 npm run etl:umowy` : '\nBez luk miesięcznych.');
