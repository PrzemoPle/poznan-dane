// Przebiegi wskaźników do wykresów na /statystyki/.
// Wydzielone z HTML-a: nazwy i liczby są renderowane na serwerze (dla czytelnika
// i dla wyszukiwarek), a te dane pobiera dopiero skrypt rysujący wykresy.

import badam from '../../public/dane/badam.json';
import bdl from '../../public/dane/bdl.json';
import { zbudujWskazniki } from '../lib/wskazniki.js';

export function GET() {
  const dane = Object.fromEntries(
    zbudujWskazniki(badam, bdl).map((w) => [w.klucz, { n: w.nazwa, w: w.wartosci, j: w.sekcja }]),
  );
  return new Response(JSON.stringify(dane), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
