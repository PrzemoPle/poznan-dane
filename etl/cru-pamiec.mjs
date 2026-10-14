// Pamięć pobranych umów z Centralnego Rejestru Umów.
//
// Główne miejsce to data/cru/umowy.json (w repozytorium). Dobieramy do niej umowy
// z CRU, które już kiedyś opublikowaliśmy w rocznikach public/dane/umowy — bo pamięć
// nie może być uboższa niż strona. Bez tego w październiku 2026 straciliśmy prawie
// 1 800 umów: wrześniowe przebiegi w CI pobrały je i opublikowały, ale pamięć leżała
// wtedy w ignorowanym data/raw/, więc kolejny przebieg o nich nie wiedział.

import { readdir } from 'node:fs/promises';
import { loadJSON } from './lib.mjs';

export const PLIK_UMOWY = 'data/cru/umowy.json';
const STRONA_UMOWY = 'https://rejestrumow.gov.pl/umowa/';

/** Umowy z CRU zapisane w opublikowanych rocznikach, w kształcie rekordu pamięci. */
async function zOpublikowanych() {
  const katalog = 'public/dane/umowy';
  const pliki = (await readdir(katalog).catch(() => [])).filter((f) => /^\d{4}\.json$/.test(f));
  const wynik = [];
  for (const f of pliki) {
    const d = await loadJSON(`${katalog}/${f}`);
    if (!d?.kolumny) continue;
    const k = Object.fromEntries(d.kolumny.map((n, i) => [n, i]));
    if (k.zrodlo == null) continue;
    for (const w of d.umowy) {
      if (w[k.zrodlo] !== 'cru') continue;
      const [r, m, dz] = String(w[k.data]).split('-');
      wynik.push({
        id: w[k.id],
        nr: w[k.nr] || null,
        data: `${dz}.${m}.${r}`,                 // pamięć trzyma format CRU: dd.mm.rrrr
        kontrahent: w[k.kontrahent],
        przedmiot: w[k.przedmiot],
        wartosc: w[k.wartosc],
        opisWartosci: w[k.wartoscTekst] ?? null,
        jednostka: d.jednostki[w[k.jednostka]],
        dni: w[k.dni] ?? null,
        link: STRONA_UMOWY + w[k.id],
        // status i znacznik kwoty nieznane: przy porównaniu z nagłówkiem traktowane
        // jako „bez zmian", żeby nie pobierać ponownie tysiąca detali naraz
      });
    }
  }
  return wynik;
}

/** Pamięć CRU uzupełniona o umowy znane już ze strony. */
export async function wczytajPamiecCRU() {
  const zPliku = (await loadJSON(PLIK_UMOWY))?.umowy
    ?? (await loadJSON('data/raw/cru-umowy.json'))?.umowy
    ?? [];
  const znane = new Set(zPliku.map((u) => u.id));
  const odzyskane = (await zOpublikowanych()).filter((u) => !znane.has(u.id));
  return { umowy: [...zPliku, ...odzyskane], odzyskane: odzyskane.length };
}
