// Wspólna budowa listy wskaźników z dwóch źródeł (badam.poznan.pl + GUS BDL).
//
// Używana w dwóch miejscach, które MUSZĄ się zgadzać co do kluczy:
//  - strona /statystyki/ renderuje z niej karty w HTML-u,
//  - endpoint /wskazniki.json wystawia same przebiegi do wykresów.
// Gdyby klucze się rozjechały, karty zostałyby bez wykresów.

/**
 * @returns {Array<{klucz, dzial, dzialEtykieta, nazwa, sekcja, wartosci, zrodlo, link,
 *                  lata, pierwszyRok, ostatniRok, pierwsza, ostatnia, zmiana}>}
 */
export function zbudujWskazniki(badam, bdl) {
  const lista = [];

  for (const t of badam.tematy) {
    for (const poz of t.pozycje) {
      lista.push({
        klucz: `b|${t.temat}|${poz.etykieta}`,
        dzial: t.temat,
        dzialEtykieta: t.temat,
        nazwa: poz.etykieta,
        sekcja: poz.sekcja,
        wartosci: poz.wartosci,
        zrodlo: 'badam.poznan.pl',
        link: poz.zrodla[0],
      });
    }
  }

  for (const w of Object.values(bdl.miasta.poznan.wskazniki)) {
    lista.push({
      klucz: `g|${w.klucz}`,
      dzial: '__gus',
      dzialEtykieta: `GUS · ${w.grupa}`,
      nazwa: w.nazwa,
      sekcja: w.jednostka,
      wartosci: w.wartosci,
      zrodlo: 'GUS BDL',
      link: 'https://bdl.stat.gov.pl/',
    });
  }

  for (const w of lista) {
    const lata = Object.keys(w.wartosci).sort();
    w.lata = lata;
    w.pierwszyRok = lata[0];
    w.ostatniRok = lata[lata.length - 1];
    w.pierwsza = w.wartosci[w.pierwszyRok];
    w.ostatnia = w.wartosci[w.ostatniRok];
    w.zmiana = w.pierwsza ? ((w.ostatnia - w.pierwsza) / Math.abs(w.pierwsza)) * 100 : null;
  }

  lista.sort((a, b) => a.nazwa.localeCompare(b.nazwa, 'pl'));
  return lista;
}
