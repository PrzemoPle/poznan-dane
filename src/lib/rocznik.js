// Odczyt kolumnowych roczników rejestru umów (public/dane/umowy/RRRR.json).
//
// Plik jest kolumnowy, żeby nie powtarzać nazw pól przy kilku tysiącach rekordów.
// Tutaj rozpakowujemy go z powrotem do obiektów, z którymi wygodnie pracuje UI.
// Link do BIP-u odtwarzamy z identyfikatora — w pliku go nie ma, bo jest wyliczalny.

const BIP = 'https://bip.poznan.pl/bip/rejestr_umow.html?co=print&local_id=';

/** Umowa obowiązująca dłużej niż rok — patrz sekcja o kontraktach wieloletnich. */
export const DNI_WIELOLETNIA = 400;

/**
 * @param {{jednostki: string[], rodzaje: string[], umowy: any[][]}} plik
 * @returns {Array<object>} rekordy z polami: i, d, k, p, w, wr, j, r, n, od, dni, l
 */
export function rozpakuj(plik) {
  // starszy format (lista obiektów) — na wypadek nieodświeżonych danych
  if (Array.isArray(plik)) return plik;

  const { jednostki = [], rodzaje = [], umowy = [] } = plik;
  return umowy.map(([id, data, kontrahent, przedmiot, wartosc, jIdx, rIdx, nr, od, dni, tekst]) => ({
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
    l: `${BIP}${id}`,
  }));
}

/** Wczytuje i rozpakowuje rocznik. */
export async function pobierzRocznik(rok) {
  const odp = await fetch(`/dane/umowy/${rok}.json`);
  return rozpakuj(await odp.json());
}
