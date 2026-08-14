// Pobiera archiwalny Rejestr Umów Miasta Poznania z API BIP.
// Źródło: https://bip.poznan.pl/api-json/bip/rejestr-umow/  (POST, co=search, p=<strona>, filtry)
// Rejestr obejmuje umowy od 2014 r. do 30.06.2026; od 1.07.2026 obowiązuje CRU JSFP (rejestrumow.gov.pl).
//
// Partycjonujemy zapytania po (rok) oraz po (rok, rodzaj umowy). Druga oś nie kosztuje
// praktycznie nic (ta sama liczba stron), a daje wymiar "rodzaj umowy", którego API nie
// zwraca w rekordzie.
//
// Użycie: node etl/fetch-umowy.mjs [rok_od] [rok_do]

import { existsSync } from 'node:fs';
import { fetchRetry, pool, saveJSON, loadJSON, log, sleep } from './lib.mjs';

const API = 'https://bip.poznan.pl/api-json/bip/rejestr-umow/';
const FORM = 'https://bip.poznan.pl/bip/rejestr-umow/';
const ROK_OD = Number(process.argv[2] || 2019);
const ROK_DO = Number(process.argv[3] || new Date().getFullYear());
const CONCURRENCY = 5;
const MAX_STRON = 400; // bezpiecznik: 40 000 umów na partycję

const RODZAJE = [
  'poręczenia', 'porozumienia', 'porozumienie', 'pożyczki', 'umowa dotacyjna',
  'umowy darowizny', 'umowy dotyczące zadłużenia miasta', 'umowy stanowiące wydatek miasta',
  'umowy wydatkowe jednostki w zakresie wydzielonego rachunku dochodów',
  'umowy z zakresu rehabilitacji zawodowej', 'zamówienia', 'zamówienie',
];

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function czysty(html) {
  if (html == null) return '';
  return String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, e) => ENTITIES[e.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

/** "1 234 567,89" -> 1234567.89 ; wartości nieliczbowe -> null */
function kwota(v) {
  if (v == null) return null;
  const s = String(v).replace(/ /g, ' ').replace(/\s/g, '').replace(/,/g, '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Rejestr prowadzi dwie serie identyfikatorów: starszą `local_id` (wpisy ręczne)
 * i `umw_id` — rekordy zaciągane automatycznie z systemu zarządzania dokumentacją
 * urzędu. Rekord z nowej serii ma `local_id` puste, a `umw_id` dodatnie; w starej
 * jest odwrotnie (`umw_id: -1`).
 *
 * Wcześniej kluczowaliśmy wyłącznie po `local_id`, więc cała nowa seria zlewała się
 * w jeden wpis pod kluczem `undefined` i przepadała — na 31.12.2019 mieliśmy 88 umów
 * zamiast 193. Identyfikator nowej serii zapisujemy z przedrostkiem „u", bo odnośnik
 * do niej buduje się innym parametrem (`umw_id=` zamiast `local_id=`).
 */
const zNowejSerii = (u) => Number(u?.umw_id ?? -1) > 0;
const kluczRek = (u) => (zNowejSerii(u) ? `u${u.umw_id}` : `l${u.local_id}`);
const idUmowy = (u) => (zNowejSerii(u) ? `u${u.umw_id}` : u.local_id);

async function strona({ rok, rodzaj, p }) {
  const body = new URLSearchParams({
    co: 'search',
    p: String(p),
    ru_data_zawarcia_od_in: `${rok}-01-01`,
    ru_data_zawarcia_do_in: `${rok}-12-31`,
  });
  if (rodzaj) body.set('ru_rodzaj_umowy_in', rodzaj);
  const res = await fetchRetry(API, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const json = await res.json();
  const items = json?.['bip.poznan.pl']?.data?.[0]?.rejestr_umow?.items ?? [];
  return items.flatMap((it) => it.umowa ?? []);
}

/** Strona po stronie aż do pustki albo powtórzenia (API nie zwraca wiarygodnego total_size). */
async function partycja({ rok, rodzaj }) {
  const zebrane = new Map();
  let jalowe = 0; // kolejne strony, które nie wniosły nic nowego
  for (let p = 0; p < MAX_STRON; p++) {
    let wiersze;
    try {
      wiersze = await strona({ rok, rodzaj, p });
    } catch (e) {
      log(`  ! ${rok}${rodzaj ? '/' + rodzaj : ''} strona ${p}: ${e.message}`);
      break;
    }
    const przed = zebrane.size;
    for (const u of wiersze) zebrane.set(kluczRek(u), u);
    // Uwaga: krótsza strona NIE oznacza końca — API potrafi zwrócić niepełną partię
    // w środku stronicowania. Kończymy dopiero po dwóch jałowych stronach z rzędu.
    jalowe = zebrane.size === przed ? jalowe + 1 : 0;
    if (jalowe >= 2) break;
    await sleep(120);
  }
  return zebrane;
}

async function mapaJednostek() {
  const res = await fetchRetry(FORM);
  const html = await res.text();
  const sel = html.match(/<select[^>]*name="ru_jednostka_in"[^>]*>([\s\S]*?)<\/select>/);
  const mapa = {};
  if (sel) {
    for (const m of sel[1].matchAll(/<option[^>]*value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/g)) {
      const id = m[1].trim();
      const nazwa = czysty(m[2]);
      if (id && nazwa && nazwa !== '(wybierz)') mapa[id] = nazwa;
    }
  }
  return mapa;
}

async function main() {
  log(`Rejestr umów: lata ${ROK_OD}–${ROK_DO}`);
  const jednostki = await mapaJednostek();
  await saveJSON('data/raw/jednostki.json', jednostki);
  log(`Słownik jednostek: ${Object.keys(jednostki).length} pozycji`);

  for (let rok = ROK_DO; rok >= ROK_OD; rok--) {
    const plik = `data/raw/umowy-${rok}.json`;
    if (existsSync(plik) && !process.env.FORCE) {
      log(`${rok}: pomijam (już pobrany)`);
      continue;
    }
    const t0 = Date.now();

    // 1) pełny zbiór roku
    const pelny = await partycja({ rok });
    // 2) osie rodzajów — równolegle, wyłącznie po to, by przypisać rodzaj umowy
    const wgRodzaju = await pool(RODZAJE, CONCURRENCY, async (rodzaj) => ({
      rodzaj,
      ids: await partycja({ rok, rodzaj }),
    }));

    const rodzajDla = new Map();
    for (const { rodzaj, ids } of wgRodzaju) {
      for (const [id, u] of ids) {
        rodzajDla.set(id, rodzaj);
        if (!pelny.has(id)) pelny.set(id, u); // domknięcie, gdyby oś rodzaju złapała więcej
      }
    }

    const umowy = [...pelny.values()]
      .map((u) => ({
        id: idUmowy(u),
        nr: String(u.numer ?? '').trim(),
        data: u.data_zawarcia || null,
        kontrahent: czysty(u.kontrahent),
        przedmiot: czysty(u.przedmiot),
        wartosc: kwota(u.wartosc),
        wartoscRaw: String(u.wartosc ?? '').trim(),
        rodzaj: rodzajDla.get(kluczRek(u)) ?? null,
        jednostkaId: String(u.or_id ?? ''),
        jednostka: jednostki[String(u.or_id ?? '')] ?? null,
        terminOd: u.termin_od || null,
        terminDo: u.termin_do || null,
        typTerminu: u.typ_terminu || null,
        link: u.link || null,
      }))
      .filter((u) => u.data && u.data.startsWith(String(rok)))
      .sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));

    await saveJSON(plik, umowy);
    const sekundy = ((Date.now() - t0) / 1000).toFixed(0);
    const zRodzajem = umowy.filter((u) => u.rodzaj).length;
    log(`${rok}: ${umowy.length} umów (${zRodzajem} z rodzajem) — ${sekundy}s`);
  }

  // manifest
  const lata = [];
  for (let rok = ROK_OD; rok <= ROK_DO; rok++) {
    const u = await loadJSON(`data/raw/umowy-${rok}.json`);
    if (u) lata.push({ rok, liczba: u.length });
  }
  await saveJSON('data/raw/umowy-manifest.json', { pobrano: new Date().toISOString(), lata });
  log('Gotowe:', lata.map((l) => `${l.rok}:${l.liczba}`).join(' '));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
