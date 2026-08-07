// Wskaźniki statystyczne z Banku Danych Lokalnych GUS (api: bdl.stat.gov.pl/api/v1).
// To ta sama baza, na której opiera się badam.poznan.pl — daje jednak długie szeregi
// (od 1995 r.) i porównywalność z innymi miastami, czego portal miejski nie udostępnia.
//
// Poznań pobieramy na dwóch poziomach: gmina (poziom 6) i powiat grodzki (poziom 5),
// bo część wskaźników GUS publikuje wyłącznie dla powiatu.

import { fetchRetry, saveJSON, log, sleep } from './lib.mjs';

const BDL = 'https://bdl.stat.gov.pl/api/v1';

export const MIASTA = [
  { klucz: 'poznan', nazwa: 'Poznań', gmina: '023016264011', powiat: '023016264000', glowne: true },
  { klucz: 'warszawa', nazwa: 'Warszawa', gmina: '071412865011', powiat: '071412865000' },
  { klucz: 'krakow', nazwa: 'Kraków', gmina: '011212161011', powiat: '011212161000' },
  { klucz: 'wroclaw', nazwa: 'Wrocław', gmina: '030210564011', powiat: '030210564000' },
  { klucz: 'lodz', nazwa: 'Łódź', gmina: '051011661011', powiat: '051011661000' },
  { klucz: 'gdansk', nazwa: 'Gdańsk', gmina: '042214361011', powiat: '042214361000' },
];

// --- wskaźniki na poziomie gminy -------------------------------------------------
const GMINA = [
  { id: 72305, klucz: 'ludnosc', nazwa: 'Ludność ogółem', jednostka: 'osoba', grupa: 'Demografia' },
  { id: 60559, klucz: 'gestosc', nazwa: 'Ludność na 1 km²', jednostka: 'osoba/km²', grupa: 'Demografia' },
  { id: 450551, klucz: 'przyrostNaturalny', nazwa: 'Przyrost naturalny na 1000 ludności', jednostka: '‰', grupa: 'Demografia' },
  { id: 1365234, klucz: 'saldoMigracji', nazwa: 'Saldo migracji ogółem', jednostka: 'osoba', grupa: 'Demografia' },
  { id: 60530, klucz: 'regon', nazwa: 'Podmioty REGON na 10 tys. ludności', jednostka: '—', grupa: 'Gospodarka' },
  { id: 747060, klucz: 'mieszkaniaOddane', nazwa: 'Mieszkania oddane do użytkowania na 1000 ludności', jednostka: '—', grupa: 'Mieszkalnictwo' },
  { id: 60811, klucz: 'zasobyMieszkaniowe', nazwa: 'Zasoby mieszkaniowe — mieszkania', jednostka: '—', grupa: 'Mieszkalnictwo' },

  { id: 76037, klucz: 'dochodyOgolem', nazwa: 'Dochody budżetu ogółem', jednostka: 'zł', grupa: 'Budżet' },
  { id: 76973, klucz: 'dochodyNaMieszkanca', nazwa: 'Dochody na 1 mieszkańca', jednostka: 'zł', grupa: 'Budżet' },
  { id: 76070, klucz: 'dochodyWlasne', nazwa: 'Dochody własne', jednostka: 'zł', grupa: 'Budżet' },
  { id: 77005, klucz: 'subwencja', nazwa: 'Subwencja ogólna', jednostka: 'zł', grupa: 'Budżet' },
  { id: 149576, klucz: 'dotacje', nazwa: 'Dotacje ogółem', jednostka: 'zł', grupa: 'Budżet' },
  { id: 76477, klucz: 'wydatkiOgolem', nazwa: 'Wydatki budżetu ogółem', jednostka: 'zł', grupa: 'Budżet' },
  { id: 76964, klucz: 'wydatkiNaMieszkanca', nazwa: 'Wydatki na 1 mieszkańca', jednostka: 'zł', grupa: 'Budżet' },
  { id: 101376, klucz: 'wydatkiBiezace', nazwa: 'Wydatki bieżące ogółem', jednostka: 'zł', grupa: 'Budżet' },
  { id: 76453, klucz: 'wydatkiMajatkowe', nazwa: 'Wydatki majątkowe ogółem', jednostka: 'zł', grupa: 'Budżet' },
  { id: 76450, klucz: 'wydatkiInwestycyjne', nazwa: 'Wydatki majątkowe inwestycyjne', jednostka: 'zł', grupa: 'Budżet' },
];

// --- wydatki wg działów klasyfikacji budżetowej (poziom gminy) --------------------
const DZIALY = [
  { id: 1548644, klucz: 'd_ogolem', nazwa: 'Ogółem' },
  { id: 202232, klucz: 'd600', nazwa: '600 — Transport i łączność' },
  { id: 202239, klucz: 'd630', nazwa: '630 — Turystyka' },
  { id: 202242, klucz: 'd700', nazwa: '700 — Gospodarka mieszkaniowa' },
  { id: 202245, klucz: 'd710', nazwa: '710 — Działalność usługowa' },
  { id: 202248, klucz: 'd720', nazwa: '720 — Informatyka' },
  { id: 202236, klucz: 'd750', nazwa: '750 — Administracja publiczna' },
  { id: 202262, klucz: 'd754', nazwa: '754 — Bezpieczeństwo publiczne' },
  { id: 202271, klucz: 'd757', nazwa: '757 — Obsługa długu publicznego' },
  { id: 202277, klucz: 'd801', nazwa: '801 — Oświata i wychowanie' },
  { id: 202283, klucz: 'd851', nazwa: '851 — Ochrona zdrowia' },
  { id: 202286, klucz: 'd852', nazwa: '852 — Pomoc społeczna' },
  { id: 202289, klucz: 'd853', nazwa: '853 — Pozostałe zadania polityki społecznej' },
  { id: 202292, klucz: 'd854', nazwa: '854 — Edukacyjna opieka wychowawcza' },
  { id: 633070, klucz: 'd855', nazwa: '855 — Rodzina' },
  { id: 202295, klucz: 'd900', nazwa: '900 — Gospodarka komunalna i ochrona środowiska' },
  { id: 202298, klucz: 'd921', nazwa: '921 — Kultura i ochrona dziedzictwa' },
  { id: 202301, klucz: 'd925', nazwa: '925 — Ogrody botaniczne i zoologiczne' },
  { id: 202304, klucz: 'd926', nazwa: '926 — Kultura fizyczna i sport' },
  { id: 273898, klucz: 'd926b', nazwa: '926 — Kultura fizyczna' },
];

// --- wskaźniki dostępne wyłącznie dla powiatu grodzkiego --------------------------
const POWIAT = [
  { id: 60270, klucz: 'stopaBezrobocia', nazwa: 'Stopa bezrobocia rejestrowanego', jednostka: '%', grupa: 'Rynek pracy' },
  { id: 64428, klucz: 'wynagrodzenie', nazwa: 'Przeciętne miesięczne wynagrodzenie brutto', jednostka: 'zł', grupa: 'Rynek pracy' },
  { id: 64429, klucz: 'wynagrodzenieRelacja', nazwa: 'Wynagrodzenie w relacji do średniej krajowej', jednostka: '% (Polska=100)', grupa: 'Rynek pracy' },
];

async function seria(unitId, zmienne) {
  const params = new URLSearchParams({ format: 'json', 'page-size': '100' });
  for (const z of zmienne) params.append('var-id', String(z.id));
  const res = await fetchRetry(`${BDL}/data/by-unit/${unitId}?${params}`, {
    headers: { Accept: 'application/json' },
  });
  const json = await res.json();
  const wg = new Map((json.results ?? []).map((r) => [r.id, r]));
  const out = {};
  for (const z of zmienne) {
    const r = wg.get(z.id);
    if (!r) continue;
    const wartosci = {};
    for (const v of r.values ?? []) {
      if (v.val != null) wartosci[v.year] = v.val;
    }
    if (Object.keys(wartosci).length) {
      out[z.klucz] = { ...z, aktualizacja: r.lastUpdate, wartosci };
    }
  }
  return out;
}

async function main() {
  const dane = {};
  for (const m of MIASTA) {
    log(`BDL: ${m.nazwa}`);
    const g = await seria(m.gmina, GMINA);
    await sleep(400);
    const d = await seria(m.gmina, DZIALY);
    await sleep(400);
    let p = {};
    try {
      p = await seria(m.powiat, POWIAT);
    } catch (e) {
      log(`  ! poziom powiatu niedostępny: ${e.message}`);
    }
    await sleep(400);
    dane[m.klucz] = { ...m, wskazniki: { ...g, ...p }, dzialy: d };
    log(`  ${Object.keys(g).length + Object.keys(p).length} wskaźników, ${Object.keys(d).length} działów`);
  }

  await saveJSON('data/raw/bdl.json', {
    pobrano: new Date().toISOString(),
    zrodlo: 'GUS Bank Danych Lokalnych (bdl.stat.gov.pl)',
    miasta: dane,
  });
  log('Zapisano data/raw/bdl.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
