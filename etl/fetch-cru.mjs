// Centralny Rejestr Umów JSFP (Ministerstwo Finansów) — umowy Poznania od 1.07.2026.
//
// Od tej daty umowy miasta przestały trafiać do BIP-u i idą tutaj. Bez tego źródła
// serwis pokazuje coraz mniejszy wycinek rzeczywistości.
//
// Portal korzysta z otwartego API, bez klucza i bez logowania:
//   POST /api-dp/v1/agreements/search?offset=&limit=   body: {"menuGlowne":{...}}
//   GET  /api-dp/v1/agreement/{idUmowy}                 (uwaga: liczba pojedyncza!)
// Strona publiczna umowy: https://rejestrumow.gov.pl/umowa/{idUmowy}
//
// PUŁAPKA, na którą trzeba uważać: filtr `nazwa` dopasowuje fragmentem i przeszukuje
// całą Polskę. „ZARZĄD DRÓG MIEJSKICH" zwraca m.in. REGON 390278090 — to Legnica,
// nie Poznań. Dlatego każdy kandydat jest weryfikowany adresem z detalu umowy.
//
// Użycie: node etl/fetch-cru.mjs

import { fetchRetry, pool, saveJSON, loadJSON, log, sleep } from './lib.mjs';

const API = 'https://rejestrumow.gov.pl/api-dp/v1';
const STRONA_UMOWY = 'https://rejestrumow.gov.pl/umowa/';
const REGON_URZEDU = '000514199';        // Urząd Miasta Poznania — punkt wyjścia
// API twardo tnie stronę do 50 rekordów, choćby poprosić o więcej. Pętla, która
// uznawała krótszą stronę za koniec, pobierała 50 z 251 umów Urzędu Miasta.
const NA_STRONE = 50;
const ROWNOLEGLE = 2;        // API odpowiada 429 przy większej równoległości
const PRZERWA = 320;         // ms między zapytaniami w wątku

/** Bez ogonków i interpunkcji — inaczej „Poznań" nie zrówna się z „poznan". */
const norm = (s) => (s ?? '')
  .toLowerCase()
  .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e').replace(/ł/g, 'l')
  .replace(/ń/g, 'n').replace(/ó/g, 'o').replace(/ś/g, 's').replace(/[żź]/g, 'z')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

async function szukaj(filtry, offset = 0, limit = NA_STRONE) {
  const res = await fetchRetry(`${API}/agreements/search?offset=${offset}&limit=${limit}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ menuGlowne: filtry }),
  });
  return res.json();
}

async function detal(idUmowy) {
  const res = await fetchRetry(`${API}/agreement/${idUmowy}`, { headers: { Accept: 'application/json' } });
  return res.json();
}

/** Czy podmiot o tym REGON-ie siedzi w Poznaniu? Sprawdzamy w detalu jego umowy. */
async function czyPoznanski(regon) {
  const wynik = await szukaj({ regon }, 0, 1);
  const pierwsza = wynik.content?.[0];
  if (!pierwsza) return false;
  const d = await detal(pierwsza.idUmowy);
  const strona = (d.stronyUmowy ?? []).find((s) => s.regon === regon);
  return norm(strona?.daneAdresowe?.miejscowosc) === 'poznan';
}

/**
 * Szuka REGON-ów jednostek miejskich po nazwach, które znamy już z BIP-u.
 *
 * Przebiega przyrostowo: wyszukiwanie po nazwach idzie za każdym razem (jednostka
 * mogła dopiero zacząć publikować w CRU), ale adres weryfikujemy tylko dla REGON-ów
 * nierozstrzygniętych wcześniej. Dzięki temu comiesięczne odświeżanie wyłapuje nowe
 * podmioty, nie odpytując ponownie o te same kilkadziesiąt.
 */
async function znajdzRegony(nazwyJednostek, znane, odrzucone) {
  const kandydaci = new Map();   // regon -> nazwa z CRU

  await pool(nazwyJednostek, ROWNOLEGLE, async (nazwa) => {
    try {
      const d = await szukaj({ nazwa }, 0, 50);
      const cel = norm(nazwa);
      for (const u of d.content ?? []) {
        // filtr nazwy dopasowuje fragmentem i szuka po całej Polsce, więc bierzemy
        // tylko trafienia dokładne — reszta i tak odpadnie na weryfikacji adresu
        if (norm(u.nazwa) === cel) kandydaci.set(u.regon, u.nazwa);
      }
    } catch (e) {
      log(`  ! wyszukiwanie „${nazwa.slice(0, 40)}": ${e.message}`);
    }
    await sleep(120);
  });

  const doSprawdzenia = [...kandydaci.keys()]
    .filter((r) => !znane.has(r) && !odrzucone.has(r));
  log(`Kandydatów po nazwie: ${kandydaci.size}, w tym nierozstrzygniętych: ${doSprawdzenia.length}`);

  const potwierdzone = new Map();
  await pool(doSprawdzenia, ROWNOLEGLE, async (regon) => {
    try {
      if (await czyPoznanski(regon)) {
        potwierdzone.set(regon, kandydaci.get(regon));
        log(`  + NOWY podmiot poznański: ${regon} ${kandydaci.get(regon)?.slice(0, 45)}`);
      } else {
        odrzucone.add(regon);
        log(`  odrzucony (nie Poznań): ${regon} ${kandydaci.get(regon)?.slice(0, 40)}`);
      }
    } catch (e) {
      // bez wpisu na listę odrzuconych — przy następnym odświeżeniu spróbujemy znowu
      log(`  ! weryfikacja ${regon}: ${e.message}`);
    }
    await sleep(PRZERWA);
  });

  return potwierdzone;
}

/** Wszystkie umowy jednego podmiotu, z detalami (numer, okres, kontrahent). */
async function umowyPodmiotu(regon, nazwaJednostki) {
  const naglowki = [];
  let ogolem = Infinity;
  for (let offset = 0; offset < ogolem; offset += NA_STRONE) {
    const d = await szukaj({ regon }, offset, NA_STRONE);
    ogolem = d.totalMatchingElements ?? 0;
    const partia = d.content ?? [];
    if (!partia.length) break;                 // pusta strona = koniec, cokolwiek mówi licznik
    naglowki.push(...partia);
    await sleep(PRZERWA);
  }
  if (naglowki.length < ogolem) {
    log(`  ! ${nazwaJednostki}: pobrano ${naglowki.length} z ${ogolem} zapowiadanych`);
  }

  const pelne = await pool(naglowki, ROWNOLEGLE, async (u) => {
    try {
      const d = await detal(u.idUmowy);
      const strony = d.stronyUmowy ?? [];
      // druga strona umowy to kontrahent; jednostka to ta z naszym REGON-em
      const kontrahent = strony.find((s) => s.regon !== regon && s.rodzaj !== 'JSFP')
        ?? strony.find((s) => s.regon !== regon);
      const dni = /(\d+)\s*dni/.exec(d.okresObowiazywania?.okres ?? '')?.[1];
      await sleep(PRZERWA);
      return {
        id: u.idUmowy,
        nr: d.podstawoweDane?.numerUmowy ?? null,
        data: u.dataZawarciaUmowy,                    // dd.mm.rrrr
        kontrahent: kontrahent?.nazwa
          ?? [kontrahent?.imie, kontrahent?.nazwisko].filter(Boolean).join(' ')
          ?? 'osoba fizyczna',
        przedmiot: d.szczegolyUmowy?.przedmiotUmowy ?? u.przedmiotUmowy ?? '',
        wartosc: d.szczegolyUmowy?.wartoscPrzedmiotu ?? u.wartoscPrzedmiotuUmowy ?? null,
        opisWartosci: d.szczegolyUmowy?.opisWartosciPrzedmiotu ?? null,
        jednostka: nazwaJednostki,
        status: d.podstawoweDane?.statusUmowy ?? u.statusUmowy ?? null,
        dni: dni ? Number(dni) : null,
        link: STRONA_UMOWY + u.idUmowy,
      };
    } catch (e) {
      log(`  ! detal ${u.idUmowy}: ${e.message}`);
      return null;
    }
  });

  return pelne.filter(Boolean);
}

async function main() {
  // nazwy jednostek bierzemy z tego, co już wiemy z BIP-u — CRU nie ma listy
  // podmiotów, a szukanie „Poznań" łapie uniwersytet, szpitale kliniczne i urząd wojewódzki
  const profile = await loadJSON('public/dane/profile.json', { jednostki: {} });
  const nazwy = [...new Set([
    'URZĄD MIASTA POZNANIA',
    ...Object.keys(profile.jednostki ?? {}),
  ])];
  log(`Szukam w CRU REGON-ów dla ${nazwy.length} nazw jednostek`);

  // Pamięć poprzednich przebiegów; SKROT=1 pomija odkrywanie i bierze ją w ciemno.
  const zapisane = process.env.FORCE ? null : await loadJSON('data/raw/cru-regony.json');
  const regony = new Map(Object.entries(zapisane?.regony ?? {}));
  const odrzucone = new Set(zapisane?.odrzucone ?? []);

  if (zapisane && process.env.SKROT) {
    log(`Pomijam odkrywanie (SKROT=1): ${regony.size} REGON-ów z pamięci`);
  } else {
    const bylo = regony.size;
    for (const [r, n] of await znajdzRegony(nazwy, regony, odrzucone)) regony.set(r, n);
    regony.set(REGON_URZEDU, 'URZĄD MIASTA POZNANIA');
    const nowe = regony.size - bylo;
    log(nowe ? `Doszło ${nowe} nowych jednostek poznańskich` : 'Nowych jednostek nie znaleziono');
    await saveJSON('data/raw/cru-regony.json', {
      pobrano: new Date().toISOString(),
      regony: Object.fromEntries(regony),
      odrzucone: [...odrzucone],   // żeby nie weryfikować Legnicy co miesiąc od nowa
    });
  }
  log(`Potwierdzonych podmiotów poznańskich: ${regony.size}`);

  const wszystkie = [];
  for (const [regon, nazwaCRU] of regony) {
    const umowy = await umowyPodmiotu(regon, nazwaCRU);
    wszystkie.push(...umowy);
    log(`  ${nazwaCRU.slice(0, 45).padEnd(47)} ${String(umowy.length).padStart(4)} umów`);
    await sleep(200);
  }

  const zKwota = wszystkie.filter((u) => u.wartosc != null);
  const suma = zKwota.reduce((s, u) => s + u.wartosc, 0);
  await saveJSON('data/raw/cru-umowy.json', {
    pobrano: new Date().toISOString(),
    zrodlo: 'Centralny Rejestr Umów JSFP (rejestrumow.gov.pl)',
    podmioty: Object.fromEntries(regony),
    umowy: wszystkie,
  });

  log(`Razem ${wszystkie.length} umów, ${zKwota.length} z kwotą, suma ${Math.round(suma / 1e6)} mln zł`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
