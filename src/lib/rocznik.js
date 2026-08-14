// Odczyt kolumnowych roczników rejestru umów (public/dane/umowy/RRRR.json).
//
// Plik jest kolumnowy, żeby nie powtarzać nazw pól przy kilku tysiącach rekordów.
// Tutaj rozpakowujemy go z powrotem do obiektów, z którymi wygodnie pracuje UI.
//
// Od lipca 2026 umowy Poznania płyną dwoma korytami: starsze są w BIP-ie miasta,
// nowe w Centralnym Rejestrze Umów. Rekord niesie znacznik źródła, a link do
// wpisu odtwarzamy z identyfikatora — inny dla każdego rejestru.

const BIP = 'https://bip.poznan.pl/bip/rejestr_umow.html?co=print&';
const CRU = 'https://rejestrumow.gov.pl/umowa/';

/** Umowa obowiązująca dłużej niż rok — patrz sekcja o kontraktach wieloletnich. */
export const DNI_WIELOLETNIA = 400;

export const ZRODLA = {
  bip: { nazwa: 'BIP Poznań', pelna: 'Rejestr umów Miasta Poznania (BIP)' },
  cru: { nazwa: 'CRU', pelna: 'Centralny Rejestr Umów JSFP' },
};

/** Adres wpisu w rejestrze, z którego umowa pochodzi. */
export function linkUmowy(id, zrodlo) {
  if (zrodlo === 'cru') return `${CRU}${id}`;
  // BIP prowadzi dwie serie identyfikatorów i każda ma własny parametr; wpisy
  // zaciągane automatycznie z systemu urzędu zapisujemy z przedrostkiem „u".
  const s = String(id);
  return s.startsWith('u') ? `${BIP}umw_id=${s.slice(1)}` : `${BIP}local_id=${s}`;
}

/**
 * @param {{jednostki: string[], rodzaje: string[], umowy: any[][]}} plik
 * @returns {Array<object>} rekordy: i, d, k, p, w, wr, j, r, n, od, dni, z (źródło), l (link)
 */
export function rozpakuj(plik) {
  // starszy format (lista obiektów) — na wypadek nieodświeżonych danych
  if (Array.isArray(plik)) return plik;

  const { jednostki = [], rodzaje = [], umowy = [] } = plik;
  return umowy.map(([id, data, kontrahent, przedmiot, wartosc, jIdx, rIdx, nr, od, dni, tekst, zrodlo]) => {
    const z = zrodlo || 'bip';   // starsze roczniki nie mają kolumny źródła
    return {
      i: id,
      d: data,
      k: kontrahent,
      p: przedmiot,
      w: wartosc,
      wr: tekst ?? undefined,
      j: jednostki[jIdx] ?? '—',
      r: rIdx >= 0 ? rodzaje[rIdx] : null,
      n: nr,
      od: od ?? undefined,
      dni: dni ?? undefined,
      z,
      l: linkUmowy(id, z),
    };
  });
}

/** Wczytuje i rozpakowuje rocznik. */
export async function pobierzRocznik(rok) {
  const odp = await fetch(`/dane/umowy/${rok}.json`);
  return rozpakuj(await odp.json());
}
