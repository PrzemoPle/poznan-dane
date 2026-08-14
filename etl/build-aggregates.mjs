// Przelicza surowe pobrania (data/raw) na pliki serwowane przez stronę (public/dane).
// Zasada: przeglądarka nigdy nie ładuje pełnego rejestru — agregaty są liczone tutaj,
// a szczegóły umów doczytywane rocznik po roczniku.

import { readdir } from 'node:fs/promises';
import { saveJSON, loadJSON, log } from './lib.mjs';

const WY = 'public/dane';

const suma = (xs) => xs.reduce((a, b) => a + b, 0);
const zaokr = (n, m = 2) => Math.round(n * 10 ** m) / 10 ** m;

/** Umowa obowiązująca dłużej niż rok — inaczej trzeba czytać jej wartość. */
const DNI_WIELOLETNIA = 400;

/** Czas obowiązywania umowy w dniach; null, gdy rejestr nie podaje obu dat. */
function dniTrwania(u) {
  if (!u.terminOd || !u.terminDo) return null;
  const od = Date.parse(u.terminOd);
  const doK = Date.parse(u.terminDo);
  if (!Number.isFinite(od) || !Number.isFinite(doK) || doK < od) return null;
  return Math.round((doK - od) / 86_400_000);
}
/** Zapis liczby po polsku — przecinek dziesiętny, spacje w tysiącach. */
const pl = (n, m = 0) => n.toLocaleString('pl-PL', { maximumFractionDigits: m, minimumFractionDigits: m });

/** Normalizacja nazw kontrahentów: różne zapisy tej samej firmy scalamy w jeden podmiot. */
function normalizujKontrahenta(s) {
  if (!s) return '';
  let t = s
    .toLowerCase()
    .replace(/["„”'`]/g, '')
    .replace(/\bsp\.?\s*z\s*o\.?\s*o\.?/g, 'sp z oo')
    .replace(/\bspółka\s+z\s+ograniczoną\s+odpowiedzialnością/g, 'sp z oo')
    .replace(/\bs\.?\s*a\.?\b/g, 'sa')
    .replace(/\bspółka\s+akcyjna\b/g, 'sa')
    .replace(/\bsp\.?\s*[jk]\.?\b/g, '')
    .replace(/\b(ul|al|os)\.?\s.*$/g, '') // adres doklejony do nazwy
    .replace(/[.,;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return t;
}

/** Adres URL profilu: bez ogonków, bez interpunkcji, rozstrzygany sufiksem przy kolizji. */
function doSlug(nazwa, zajete) {
  const bazowy = nazwa
    .toLowerCase()
    .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e').replace(/ł/g, 'l')
    .replace(/ń/g, 'n').replace(/ó/g, 'o').replace(/ś/g, 's').replace(/[żź]/g, 'z')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'podmiot';
  if (!zajete.has(bazowy)) {
    zajete.add(bazowy);
    return bazowy;
  }
  for (let i = 2; ; i++) {
    const kandydat = `${bazowy}-${i}`;
    if (!zajete.has(kandydat)) {
      zajete.add(kandydat);
      return kandydat;
    }
  }
}

function topN(mapa, n, mapper = (v) => v) {
  return [...mapa.entries()]
    .map(([k, v]) => mapper({ klucz: k, ...v }))
    .sort((a, b) => b.suma - a.suma)
    .slice(0, n);
}

/**
 * Umowy z Centralnego Rejestru Umów sprowadzone do kształtu rekordu z BIP-u,
 * pogrupowane po roczniku. Od lipca 2026 to jedyne miejsce, gdzie miasto publikuje.
 */
async function wczytajCRU() {
  const plik = await loadJSON('data/raw/cru-umowy.json');
  if (!plik?.umowy?.length) {
    log('CRU: brak data/raw/cru-umowy.json — pomijam (uruchom npm run etl:cru)');
    return new Map();
  }
  const wgRoku = new Map();
  for (const u of plik.umowy) {
    // CRU podaje datę jako dd.mm.rrrr
    const [dz, mc, rok] = (u.data || '').split('.');
    if (!rok) continue;
    const rekord = {
      id: u.id,
      nr: u.nr || '',
      data: `${rok}-${mc}-${dz}`,
      kontrahent: u.kontrahent || 'nie podano',
      przedmiot: u.przedmiot || '',
      wartosc: typeof u.wartosc === 'number' ? u.wartosc : null,
      wartoscRaw: u.opisWartosci || '',
      rodzaj: null,
      jednostka: u.jednostka,
      terminOd: `${rok}-${mc}-${dz}`,
      terminDo: null,
      dniGotowe: u.dni ?? null,      // CRU podaje okres wprost, nie liczymy z dat
      zrodlo: 'cru',
    };
    if (!wgRoku.has(rok)) wgRoku.set(rok, []);
    wgRoku.get(rok).push(rekord);
  }
  log(`CRU: ${plik.umowy.length} umów w ${wgRoku.size} rocznikach`);
  return wgRoku;
}

/** Klucz do rozpoznania tej samej umowy w obu rejestrach. */
const kluczUmowy = (u) => `${(u.nr || '').toLowerCase().replace(/\s+/g, '')}|${u.data}`;

async function umowy() {
  const zCRU = await wczytajCRU();
  const pliki = (await readdir('data/raw')).filter((f) => /^umowy-\d{4}\.json$/.test(f));
  const lata = pliki.map((f) => Number(f.match(/\d{4}/)[0])).sort((a, b) => a - b);
  if (!lata.length) throw new Error('brak data/raw/umowy-*.json — uruchom najpierw etl:umowy');

  const perRok = [];
  const kontrahenciGlobal = new Map();
  const jednostkiGlobal = new Map();
  let wszystkich = 0;
  let wszystkichKwota = 0;
  let bezKwoty = 0;
  const najwieksze = [];

  for (const rok of lata) {
    const zBIP = (await loadJSON(`data/raw/umowy-${rok}.json`, []))
      .map((u) => ({ ...u, zrodlo: 'bip' }));
    // w okresie przejściowym ta sama umowa bywa w obu rejestrach — BIP ma pierwszeństwo,
    // bo trzymamy w nim pełniejsze pola (rodzaj umowy, terminy)
    const znane = new Set(zBIP.filter((u) => u.nr).map(kluczUmowy));
    // Umowa bez numeru nie może zderzyć się z wpisem z BIP-u (tam numer jest zawsze),
    // więc bierzemy ją bez sprawdzania. Wcześniejsza wersja odrzucała takie rekordy
    // hurtem — przepadało 171 umów, bo CRU dopuszcza „brak numeru umowy".
    const wszystkieCRU = zCRU.get(String(rok)) ?? [];
    const dodane = wszystkieCRU.filter((u) => !u.nr || !znane.has(kluczUmowy(u)));
    const dane = [...zBIP, ...dodane].sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
    if (wszystkieCRU.length) {
      log(`  ${rok}: +${dodane.length} umów z CRU (${wszystkieCRU.length - dodane.length} już było w BIP-ie)`);
    }
    const zKwota = dane.filter((u) => u.wartosc != null && u.wartosc > 0);
    const kwoty = zKwota.map((u) => u.wartosc).sort((a, b) => a - b);
    const sumaRok = suma(kwoty);

    const wgMiesiaca = {};
    const wgJednostki = new Map();
    const wgKontrahenta = new Map();
    const wgRodzaju = new Map();
    const wieloletnie = { liczba: 0, suma: 0, najdluzsza: 0 };

    for (const u of dane) {
      const m = (u.data || '').slice(0, 7);
      if (m) {
        wgMiesiaca[m] ??= { liczba: 0, suma: 0 };
        wgMiesiaca[m].liczba++;
        wgMiesiaca[m].suma += u.wartosc || 0;
      }

      const j = u.jednostka || (u.jednostkaId === '-1' ? 'Urząd Miasta Poznania' : `Jednostka #${u.jednostkaId}`);
      for (const [mapa, klucz, etykieta] of [
        [wgJednostki, j, j],
        [jednostkiGlobal, j, j],
        [wgKontrahenta, normalizujKontrahenta(u.kontrahent), u.kontrahent],
        [kontrahenciGlobal, normalizujKontrahenta(u.kontrahent), u.kontrahent],
        [wgRodzaju, u.rodzaj || 'nieokreślony', u.rodzaj || 'nieokreślony'],
      ]) {
        if (!klucz) continue;
        if (!mapa.has(klucz)) mapa.set(klucz, { etykieta, liczba: 0, suma: 0 });
        const w = mapa.get(klucz);
        w.liczba++;
        w.suma += u.wartosc || 0;
      }

      if (u.wartosc == null) bezKwoty++;
      if (u.wartosc != null && u.wartosc > 0) {
        najwieksze.push({ rok, id: u.id, data: u.data, kontrahent: u.kontrahent, przedmiot: u.przedmiot.slice(0, 180), wartosc: u.wartosc, jednostka: j, link: u.link });
      }

      const dni = u.dniGotowe ?? dniTrwania(u);
      if (dni != null && dni >= DNI_WIELOLETNIA) {
        wieloletnie.liczba++;
        wieloletnie.suma += u.wartosc || 0;
        if (dni > wieloletnie.najdluzsza) wieloletnie.najdluzsza = dni;
      }
    }

    const mediana = kwoty.length ? kwoty[Math.floor(kwoty.length / 2)] : 0;
    perRok.push({
      rok,
      liczba: dane.length,
      liczbaZKwota: zKwota.length,
      suma: zaokr(sumaRok),
      srednia: zKwota.length ? zaokr(sumaRok / zKwota.length) : 0,
      mediana: zaokr(mediana),
      max: kwoty.length ? kwoty[kwoty.length - 1] : 0,
      pelnyRok: rok !== Math.max(...lata),
      miesiace: Object.fromEntries(
        Object.entries(wgMiesiaca).sort().map(([k, v]) => [k, { liczba: v.liczba, suma: zaokr(v.suma) }]),
      ),
      topJednostki: topN(wgJednostki, 25, (x) => ({ nazwa: x.etykieta, liczba: x.liczba, suma: zaokr(x.suma) })),
      topKontrahenci: topN(wgKontrahenta, 25, (x) => ({ nazwa: x.etykieta, liczba: x.liczba, suma: zaokr(x.suma) })),
      rodzaje: topN(wgRodzaju, 20, (x) => ({ nazwa: x.etykieta, liczba: x.liczba, suma: zaokr(x.suma) })),
      wieloletnie: {
        liczba: wieloletnie.liczba,
        suma: zaokr(wieloletnie.suma),
        najdluzszaLat: zaokr(wieloletnie.najdluzsza / 365.25, 1),
      },
    });

    wszystkich += dane.length;
    wszystkichKwota += sumaRok;

    // Rocznik dla przeglądarki. Format kolumnowy zamiast listy obiektów:
    // nazwy pól powtórzone przy 7 tys. rekordów to setki kilobajtów do sparsowania.
    // Jednostki i rodzaje trzymamy w słownikach, link odtwarzamy z identyfikatora.
    const slownikJednostek = [];
    const indeksJednostek = new Map();
    const slownikRodzajow = [];
    const indeksRodzajow = new Map();
    const doSlownika = (slownik, indeks, wartosc) => {
      if (wartosc == null) return -1;
      if (!indeks.has(wartosc)) {
        indeks.set(wartosc, slownik.length);
        slownik.push(wartosc);
      }
      return indeks.get(wartosc);
    };

    const wiersze = dane.map((u) => {
      const jednostka = u.jednostka
        || (u.jednostkaId === '-1' ? 'Urząd Miasta Poznania' : `Jednostka #${u.jednostkaId}`);
      return [
        u.id,
        u.data,
        u.kontrahent,
        u.przedmiot,
        u.wartosc,                                    // null, gdy rejestr nie podaje kwoty
        doSlownika(slownikJednostek, indeksJednostek, jednostka),
        doSlownika(slownikRodzajow, indeksRodzajow, u.rodzaj || null),
        u.nr,
        u.terminOd || null,
        u.dniGotowe ?? dniTrwania(u),
        u.wartosc == null ? u.wartoscRaw : null,      // kwota zapisana słownie
        u.zrodlo || 'bip',
      ];
    });

    await saveJSON(`${WY}/umowy/${rok}.json`, {
      kolumny: ['id', 'data', 'kontrahent', 'przedmiot', 'wartosc', 'jednostka',
        'rodzaj', 'nr', 'terminOd', 'dni', 'wartoscTekst', 'zrodlo'],
      jednostki: slownikJednostek,
      rodzaje: slownikRodzajow,
      umowy: wiersze,
    });
    log(`  umowy ${rok}: ${dane.length} rekordów, ${zaokr(sumaRok / 1e6, 1)} mln zł`);
  }

  najwieksze.sort((a, b) => b.wartosc - a.wartosc);

  // Rytm roku budżetowego: sumujemy miesiące ze wszystkich pełnych roczników.
  // Bieżący rok pomijamy, bo jego brakujące miesiące zafałszowałyby obraz.
  const sezonowosc = {};
  for (const r of perRok.filter((x) => x.pelnyRok)) {
    for (const [klucz, v] of Object.entries(r.miesiace)) {
      const mies = klucz.slice(5);
      sezonowosc[mies] ??= { liczba: 0, suma: 0 };
      sezonowosc[mies].liczba += v.liczba;
      sezonowosc[mies].suma += v.suma;
    }
  }
  for (const v of Object.values(sezonowosc)) v.suma = zaokr(v.suma);

  await saveJSON(`${WY}/umowy-agregaty.json`, {
    zrodlo: 'Rejestr umów Miasta Poznania (bip.poznan.pl), archiwum 2014 – 30.06.2026',
    pobrano: (await loadJSON('data/raw/umowy-manifest.json', {}))?.pobrano ?? null,
    lata: perRok,
    podsumowanie: {
      liczba: wszystkich,
      suma: zaokr(wszystkichKwota),
      bezKwoty,
      odRoku: Math.min(...lata),
      doRoku: Math.max(...lata),
      liczbaJednostek: jednostkiGlobal.size,
      liczbaKontrahentow: kontrahenciGlobal.size,
    },
    sezonowosc,
    topKontrahenciOgolem: topN(kontrahenciGlobal, 100, (x) => ({ nazwa: x.etykieta, liczba: x.liczba, suma: zaokr(x.suma) })),
    topJednostkiOgolem: topN(jednostkiGlobal, 100, (x) => ({ nazwa: x.etykieta, liczba: x.liczba, suma: zaokr(x.suma) })),
    najwiekszeUmowy: najwieksze.slice(0, 100),
  });

  return { perRok, wszystkich, wszystkichKwota, lata, kontrahenciGlobal, jednostkiGlobal, najwieksze };
}

/** Ciekawostki liczone z danych — każda z podaniem podstawy liczbowej. */
function ciekawostki({ bdl, umowyStat }) {
  const p = bdl.miasta.poznan;
  const w = p.wskazniki;
  const out = [];

  const ostatni = (s) => {
    if (!s) return null;
    const lata = Object.keys(s.wartosci).sort();
    const rok = lata[lata.length - 1];
    return { rok, val: s.wartosci[rok] };
  };

  const doch = ostatni(w.dochodyOgolem);
  const wyd = ostatni(w.wydatkiOgolem);
  const lud = ostatni(w.ludnosc);
  if (doch && wyd && doch.rok === wyd.rok) {
    const wynik = doch.val - wyd.val;
    out.push({
      tytul: `Budżet ${doch.rok}: ${wynik >= 0 ? 'nadwyżka' : 'deficyt'} ${pl(Math.abs(wynik) / 1e6, 1)} mln zł`,
      tresc: `Dochody wyniosły ${pl(doch.val / 1e9, 2)} mld zł, wydatki ${pl(wyd.val / 1e9, 2)} mld zł.`,
      zrodlo: 'GUS BDL',
    });
  }
  if (doch && lud) {
    out.push({
      tytul: `${Math.round(doch.val / lud.val).toLocaleString('pl-PL')} zł dochodu na mieszkańca`,
      tresc: `Przy ${lud.val.toLocaleString('pl-PL')} mieszkańcach (${lud.rok}) każda złotówka budżetu przypada na realną osobę — to miara, która pozwala porównywać Poznań z innymi miastami.`,
      zrodlo: 'GUS BDL',
    });
  }

  const inw = ostatni(w.wydatkiInwestycyjne);
  if (inw && wyd) {
    out.push({
      tytul: `${pl((inw.val / wyd.val) * 100, 1)}% budżetu to inwestycje`,
      tresc: `W ${inw.rok} r. wydatki majątkowe inwestycyjne sięgnęły ${pl(inw.val / 1e6)} mln zł.`,
      zrodlo: 'GUS BDL',
    });
  }

  const bezr = ostatni(w.stopaBezrobocia);
  if (bezr) {
    const seria = w.stopaBezrobocia.wartosci;
    const posortowane = Object.entries(seria).sort((a, b) => b[1] - a[1]);
    const maks = posortowane[0];
    const min = posortowane[posortowane.length - 1];
    const rekord = min[0] === bezr.rok;
    out.push({
      tytul: `Bezrobocie ${pl(bezr.val, 1)}%${rekord ? ' — najniżej w historii pomiaru' : ''}`,
      tresc: `Szczyt to ${pl(maks[1], 1)}% w ${maks[0]} r.${rekord ? '' : ` Minimum ${pl(min[1], 1)}% odnotowano w ${min[0]} r.`} Pomiar obejmuje lata ${Object.keys(seria).sort()[0]}–${bezr.rok}.`,
      zrodlo: 'GUS BDL',
    });
  }

  const migr = w.saldoMigracji;
  if (migr) {
    const lata = Object.keys(migr.wartosci).sort();
    const ost = lata[lata.length - 1];
    const ujemne = lata.filter((r) => migr.wartosci[r] < 0).length;
    out.push({
      tytul: `Saldo migracji ${ost}: ${migr.wartosci[ost] > 0 ? '+' : ''}${migr.wartosci[ost].toLocaleString('pl-PL')} osób`,
      tresc: `Na ${lata.length} lat pomiaru ${ujemne} zamknęło się ubytkiem migracyjnym. Poznań od lat oddaje ludność gminom ościennym.`,
      zrodlo: 'GUS BDL',
    });
  }

  if (umowyStat) {
    out.push({
      tytul: `${pl(umowyStat.wszystkich)} umów w rejestrze`,
      tresc: `Za lata ${Math.min(...umowyStat.lata)}–${Math.max(...umowyStat.lata)} miasto i jego jednostki ujawniły umowy o łącznej wartości ${pl(umowyStat.wszystkichKwota / 1e9, 2)} mld zł.`,
      zrodlo: 'BIP Poznań',
    });
    const naj = umowyStat.najwieksze[0];
    if (naj) {
      const rokNaj = umowyStat.perRok.find((r) => r.rok === naj.rok);
      const udzial = rokNaj?.suma ? zaokr((naj.wartosc / rokNaj.suma) * 100, 1) : null;
      out.push({
        tytul: `Największa umowa: ${naj.wartosc >= 1e9 ? `${pl(naj.wartosc / 1e9, 2)} mld` : `${pl(naj.wartosc / 1e6, 1)} mln`} zł`,
        tresc: `${naj.kontrahent} — ${naj.przedmiot.slice(0, 110)} (${naj.data}).${udzial ? ` Sama ta jedna pozycja to ${pl(udzial, 1)}% wartości wszystkich umów z ${naj.rok} r.` : ''}`,
        zrodlo: 'BIP Poznań',
      });
    }
    // ostatni pełny rocznik — bieżący jest z definicji niekompletny
    const zMediana = umowyStat.perRok.filter((r) => r.mediana > 0 && r.pelnyRok).slice(-1)[0];
    if (zMediana) {
      out.push({
        tytul: `Typowa umowa miasta to ${pl(zMediana.mediana)} zł`,
        tresc: `Mediana wartości umów z ${zMediana.rok} r. przy średniej ${pl(zMediana.srednia)} zł. Rozjazd bierze się z pojedynczych kontraktów wieloletnich, które w rejestrze księgowane są jednorazowo w roku podpisania.`,
        zrodlo: 'BIP Poznań',
      });
    }
  }

  const dzialy = Object.entries(p.dzialy)
    .filter(([k]) => k !== 'd_ogolem' && k !== 'd926b')
    .map(([, v]) => {
      const lata = Object.keys(v.wartosci).sort();
      const rok = lata[lata.length - 1];
      return { nazwa: v.nazwa, rok, val: v.wartosci[rok] };
    })
    .filter((d) => d.val)
    .sort((a, b) => b.val - a.val);
  if (dzialy.length && wyd) {
    const [a, b] = dzialy;
    out.push({
      tytul: `Największy dział wydatków: ${a.nazwa.replace(/^\d+ — /, '')}`,
      tresc: `${pl(a.val / 1e6)} mln zł w ${a.rok} r., czyli ${pl((a.val / wyd.val) * 100, 1)}% budżetu. Drugi w kolejności — ${b.nazwa.replace(/^\d+ — /, '')} (${pl(b.val / 1e6)} mln zł).`,
      zrodlo: 'GUS BDL',
    });
  }

  return out;
}

async function main() {
  log('Agregacja rejestru umów…');
  const u = await umowy();

  const bdl = await loadJSON('data/raw/bdl.json');
  const badam = await loadJSON('data/raw/badam.json');
  const katalog = await loadJSON('data/raw/katalog.json');

  if (bdl) await saveJSON(`${WY}/bdl.json`, bdl);
  if (badam) await saveJSON(`${WY}/badam.json`, badam);
  if (katalog) await saveJSON(`${WY}/katalog.json`, katalog);

  // Kiedy dane naprawdę pobrano ze źródeł — to co innego niż moment przeliczenia
  // agregatów. Stopka pokazuje właśnie to, żeby nie chwalić się cudzą świeżością.
  const zrodlaPobrane = {
    umowy: (await loadJSON('data/raw/umowy-manifest.json', {}))?.pobrano ?? null,
    bdl: bdl?.pobrano ?? null,
    badam: badam?.pobrano ?? null,
    katalog: katalog?.pobrano ?? null,
  };
  const znaczniki = Object.values(zrodlaPobrane).filter(Boolean).sort();

  const podsumowanie = {
    zbudowano: new Date().toISOString(),
    zrodlaPobrane,
    // najstarszy znacznik: świadomie zachowawczo, żeby nie zawyżać aktualności
    danePobrane: znaczniki[0] ?? null,
    danePobraneDo: znaczniki[znaczniki.length - 1] ?? null,
    umowy: {
      liczba: u.wszystkich,
      suma: zaokr(u.wszystkichKwota),
      lata: u.lata,
      perRok: u.perRok.map((r) => ({ rok: r.rok, liczba: r.liczba, suma: r.suma })),
    },
    bdl: bdl
      ? {
          miasta: Object.values(bdl.miasta).map((m) => ({ klucz: m.klucz, nazwa: m.nazwa })),
          wskazniki: Object.values(bdl.miasta.poznan.wskazniki).map((w) => ({
            klucz: w.klucz, nazwa: w.nazwa, jednostka: w.jednostka, grupa: w.grupa,
          })),
        }
      : null,
    badam: badam
      ? { tematy: badam.tematy.map((t) => ({ temat: t.temat, pozycji: t.pozycje.length })) }
      : null,
    katalog: katalog
      ? {
          poznan: katalog.poznanOpendata.zbiory.length,
          poznanApi: katalog.poznanOpendata.statystyki.apiCount,
          krajowe: katalog.daneGovPl.length,
          kategorie: katalog.poznanOpendata.kategorie.map((k) => ({ nazwa: k.name, liczba: k.datasetsCount })),
        }
      : null,
    ciekawostki: bdl ? ciekawostki({ bdl, umowyStat: u }) : [],
  };

  await saveJSON(`${WY}/podsumowanie.json`, podsumowanie);
  log(`Gotowe. Umowy: ${u.wszystkich}, ciekawostek: ${podsumowanie.ciekawostki.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
