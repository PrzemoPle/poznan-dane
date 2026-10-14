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

import { fetchJSON, pool, saveJSON, loadJSON, log, sleep } from './lib.mjs';
import { wczytajPamiecCRU, PLIK_UMOWY } from './cru-pamiec.mjs';

const API = 'https://rejestrumow.gov.pl/api-dp/v1';
const STRONA_UMOWY = 'https://rejestrumow.gov.pl/umowa/';
const REGON_URZEDU = '000514199';        // Urząd Miasta Poznania — punkt wyjścia
// API twardo tnie stronę do 50 rekordów, choćby poprosić o więcej. Pętla, która
// uznawała krótszą stronę za koniec, pobierała 50 z 251 umów Urzędu Miasta.
const NA_STRONE = 50;
// Tempo dobrane pod zabezpieczenie antybotowe portalu: przy 2 wątkach i 320 ms serwis
// po kilkuset zapytaniach zaczyna oddawać stronę HTML zamiast danych — i to niezależnie
// od tego, czy pytamy z serwerowni, czy ze zwykłego łącza. Dzięki pamięci pobranych
// umów cotygodniowy przebieg to i tak kilkadziesiąt zapytań, więc wolniej nie boli.
const ROWNOLEGLE = 1;
const PRZERWA = 700;         // ms między zapytaniami
const PAUZA_PO_BLOKADZIE = 60_000;

/**
 * Wspólna bramka: gdy portal odpowie stroną zamiast danych, wszystkie wątki
 * odczekują, zamiast dalej dobijać się i przedłużać blokadę.
 */
let blokadaDo = 0;
const zablokowany = (e) => /nie jest JSON-em/.test(e?.message ?? '');
async function przepustka() {
  const czekaj = blokadaDo - Date.now();
  if (czekaj > 0) await sleep(czekaj);
}
function odnotujBlokade() {
  if (Date.now() < blokadaDo) return;          // już odliczamy
  blokadaDo = Date.now() + PAUZA_PO_BLOKADZIE;
  log(`  … portal zwraca stronę zamiast danych — przerwa ${PAUZA_PO_BLOKADZIE / 1000} s`);
}

/** Bez ogonków i interpunkcji — inaczej „Poznań" nie zrówna się z „poznan". */
const norm = (s) => (s ?? '')
  .toLowerCase()
  .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e').replace(/ł/g, 'l')
  .replace(/ń/g, 'n').replace(/ó/g, 'o').replace(/ś/g, 's').replace(/[żź]/g, 'z')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

async function szukaj(filtry, offset = 0, limit = NA_STRONE) {
  await przepustka();
  return fetchJSON(`${API}/agreements/search?offset=${offset}&limit=${limit}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ menuGlowne: filtry }),
  });
}

async function detal(idUmowy) {
  await przepustka();
  return fetchJSON(`${API}/agreement/${idUmowy}`, { headers: { Accept: 'application/json' } });
}

/** Stan CRU trzymamy w repozytorium, nie w ignorowanym data/raw — patrz komentarz w main(). */
const PLIK_REGONY = 'data/cru/regony.json';

/** Czy nagłówek z wyszukiwarki różni się od tego, co mamy zapamiętane. */
function zmieniona(naglowek, zapis) {
  if (zapis == null) return true;
  // Status nieznany (rekord odzyskany z opublikowanego rocznika) — nie porównujemy.
  if (zapis.status !== undefined
    && (naglowek.statusUmowy ?? null) !== (zapis.status ?? null)) return true;
  // Rekordy sprzed wprowadzenia pamięci nie mają znacznika kwoty. Detal już mamy,
  // więc nie ma po co pobierać go ponownie — znacznik uzupełnimy z nagłówka.
  if (zapis.wartoscNaglowka === undefined) return false;
  return (naglowek.wartoscPrzedmiotuUmowy ?? null) !== zapis.wartoscNaglowka;
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

/**
 * Umowy jednego podmiotu. Nagłówki bierzemy zawsze (tanie, 50 na stronę), ale detal
 * pobieramy wyłącznie dla umów nieznanych albo takich, którym w nagłówku zmieniła się
 * kwota lub status. Bez tego każde cotygodniowe odświeżenie odpytywało o szczegóły
 * wszystkich umów od nowa — przy rosnącym rejestrze to tysiące zapytań, czyli prosta
 * droga do zablokowania przez zabezpieczenie antybotowe.
 */
async function umowyPodmiotu(regon, nazwaJednostki, pamiec) {
  const naglowki = [];
  let ogolem = Infinity;
  let urwane = false;
  for (let offset = 0; offset < ogolem; offset += NA_STRONE) {
    let d;
    try {
      d = await szukaj({ regon }, offset, NA_STRONE);
    } catch (e) {
      // Wcześniej ten rzut leciał aż na samą górę i kładł cały ETL razem z danymi
      // pobranymi wcześniej z BIP-u. Teraz tracimy co najwyżej jedną jednostkę.
      if (zablokowany(e)) odnotujBlokade();
      log(`  ! ${nazwaJednostki}: wyszukiwanie od ${offset} — ${e.message}`);
      urwane = true;
      break;
    }
    ogolem = d.totalMatchingElements ?? 0;
    const partia = d.content ?? [];
    if (!partia.length) break;                 // pusta strona = koniec, cokolwiek mówi licznik
    naglowki.push(...partia);
    await sleep(PRZERWA);
  }
  if (!urwane && naglowki.length < ogolem) {
    log(`  ! ${nazwaJednostki}: pobrano ${naglowki.length} z ${ogolem} zapowiadanych`);
  }

  const doPobrania = naglowki.filter((u) => zmieniona(u, pamiec.get(u.idUmowy)));
  let bledy = 0;

  const swieze = await pool(doPobrania, ROWNOLEGLE, async (u) => {
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
        // zapamiętane po to, by przy następnym przebiegu rozpoznać zmianę w nagłówku
        wartoscNaglowka: u.wartoscPrzedmiotuUmowy ?? null,
      };
    } catch (e) {
      bledy++;
      if (zablokowany(e)) odnotujBlokade();
      log(`  ! detal ${u.idUmowy}: ${e.message}`);
      return null;
    }
  });

  // Nagłówki, których detalu nie ruszaliśmy, bierzemy wprost z pamięci.
  const zPamieci = naglowki
    .filter((u) => !zmieniona(u, pamiec.get(u.idUmowy)))
    .map((u) => ({ ...pamiec.get(u.idUmowy), wartoscNaglowka: u.wartoscPrzedmiotuUmowy ?? null }));

  return {
    umowy: [...zPamieci, ...swieze.filter(Boolean)],
    nowych: swieze.filter(Boolean).length,
    bledy,
    urwane,
  };
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

  // Pamięć poprzednich przebiegów. Leży w `data/cru/`, a nie w ignorowanym `data/raw/`,
  // bo w CI katalogu roboczego nie ma: lista startowała pusta, więc co tydzień wszystkie
  // jednostki raportowano jako „nowe" i prawdziwy przyrost nie dało się zauważyć.
  // SKROT=1 pomija odkrywanie i bierze pamięć w ciemno.
  const zapisane = process.env.FORCE ? null
    : (await loadJSON(PLIK_REGONY)) ?? (await loadJSON('data/raw/cru-regony.json'));
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
    await saveJSON(PLIK_REGONY, {
      pobrano: new Date().toISOString(),
      regony: Object.fromEntries(regony),
      odrzucone: [...odrzucone],   // żeby nie weryfikować Legnicy co miesiąc od nowa
    });
  }
  log(`Potwierdzonych podmiotów poznańskich: ${regony.size}`);

  // Umowy pobrane wcześniej — źródło szczegółów, których nie musimy ściągać ponownie.
  const { umowy: poprzednie, odzyskane } = await wczytajPamiecCRU();
  const pamiec = new Map(poprzednie.map((u) => [u.id, u]));
  log(`W pamięci ${pamiec.size} umów z poprzednich przebiegów`
    + (odzyskane ? ` (w tym ${odzyskane} odzyskanych z opublikowanych roczników)` : ''));

  const wszystkie = new Map();
  let nowychRazem = 0;
  let bledneJednostki = 0;

  for (const [regon, nazwaCRU] of regony) {
    const { umowy, nowych, bledy, urwane } = await umowyPodmiotu(regon, nazwaCRU, pamiec);
    for (const u of umowy) wszystkie.set(u.id, u);
    nowychRazem += nowych;
    if (urwane || bledy) bledneJednostki++;
    const znacznik = urwane ? ' (niepełne)' : bledy ? ` (${bledy} bez detalu)` : '';
    log(`  ${nazwaCRU.slice(0, 45).padEnd(47)} ${String(umowy.length).padStart(4)} umów${
      nowych ? `, w tym ${nowych} pobranych teraz` : ''}${znacznik}`);
    await sleep(200);
  }

  // Nic nie usuwamy na podstawie jednego nieudanego przebiegu: umowa, której dziś nie
  // zobaczyliśmy, mogła zniknąć z wyników przez blokadę, a nie z rejestru.
  let zachowane = 0;
  for (const u of poprzednie) {
    if (!wszystkie.has(u.id)) { wszystkie.set(u.id, u); zachowane++; }
  }
  if (zachowane) log(`Zachowano ${zachowane} umów z pamięci, których ten przebieg nie potwierdził`);

  const lista = [...wszystkie.values()];
  const zKwota = lista.filter((u) => u.wartosc != null);
  const suma = zKwota.reduce((s, u) => s + u.wartosc, 0);

  if (lista.length < poprzednie.length * 0.9) {
    // Świadomie przerywamy: lepiej zostawić wczorajsze dane niż nadpisać je ułomkiem.
    throw new Error(`pobrano ${lista.length} umów wobec ${poprzednie.length} w pamięci `
      + '— to wygląda na awarię źródła, nie na ubytek w rejestrze');
  }

  await saveJSON(PLIK_UMOWY, {
    pobrano: new Date().toISOString(),
    zrodlo: 'Centralny Rejestr Umów JSFP (rejestrumow.gov.pl)',
    podmioty: Object.fromEntries(regony),
    umowy: lista,
  });

  log(`Razem ${lista.length} umów (${nowychRazem} pobranych w tym przebiegu), `
    + `${zKwota.length} z kwotą, suma ${Math.round(suma / 1e6)} mln zł`);
  if (bledneJednostki) log(`Jednostek z niepełnym pobraniem: ${bledneJednostki}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
