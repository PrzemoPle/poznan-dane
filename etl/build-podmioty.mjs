// Buduje profile podmiotów: kontrahentów i jednostek miejskich.
//
// Wynik trafia do data/podmioty.json — plik jest wczytywany przy budowaniu strony,
// a NIE serwowany przeglądarce (ma kilka MB). Astro renderuje z niego statyczne
// podstrony /kontrahent/<slug>/ i /jednostka/<slug>/.
//
// Lista slugów, które faktycznie mają stronę, ląduje osobno w public/dane/profile.json —
// przeglądarka używa jej, żeby linkować nazwy w tabeli tylko tam, gdzie profil istnieje.
//
// Uruchom po etl:build — czyta gotowe roczniki z public/dane/umowy/.

import { readdir } from 'node:fs/promises';
import { saveJSON, loadJSON, log } from './lib.mjs';

// Kontrahentów są 21 tysiące; strony budujemy dla tych, którzy realnie znaczą.
const ILU_KONTRAHENTOW = 300;
// Ile umów pokazujemy na profilu (reszta jest dostępna przez filtr w rejestrze).
const UMOW_NA_PROFILU = 60;

const zaokr = (n, m = 2) => Math.round(n * 10 ** m) / 10 ** m;

/** Ta sama normalizacja co w rankingach — inaczej profile i rankingi by się rozjechały. */
function normalizuj(s) {
  if (!s) return '';
  return s
    .toLowerCase()
    .replace(/["„”'`]/g, '')
    .replace(/\bsp\.?\s*z\s*o\.?\s*o\.?/g, 'sp z oo')
    .replace(/\bspółka\s+z\s+ograniczoną\s+odpowiedzialnością/g, 'sp z oo')
    .replace(/\bs\.?\s*a\.?\b/g, 'sa')
    .replace(/\bspółka\s+akcyjna\b/g, 'sa')
    .replace(/\bsp\.?\s*[jk]\.?\b/g, '')
    .replace(/\b(ul|al|os)\.?\s.*$/g, '')
    .replace(/[.,;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function doSlug(nazwa, zajete) {
  const bazowy = nazwa
    .toLowerCase()
    .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e').replace(/ł/g, 'l')
    .replace(/ń/g, 'n').replace(/ó/g, 'o').replace(/ś/g, 's').replace(/[żź]/g, 'z')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'podmiot';
  if (!zajete.has(bazowy)) { zajete.add(bazowy); return bazowy; }
  for (let i = 2; ; i++) {
    const k = `${bazowy}-${i}`;
    if (!zajete.has(k)) { zajete.add(k); return k; }
  }
}

/** Zlicza wystąpienia partnera po drugiej stronie umowy. */
function dodajPartnera(mapa, nazwa, wartosc) {
  if (!nazwa) return;
  if (!mapa.has(nazwa)) mapa.set(nazwa, { nazwa, liczba: 0, suma: 0 });
  const p = mapa.get(nazwa);
  p.liczba++;
  p.suma += wartosc || 0;
}

function pustyProfil(nazwa) {
  return {
    nazwa,
    liczba: 0,
    suma: 0,
    zKwota: 0,
    wieloletnie: 0,
    lata: {},
    partnerzy: new Map(),
    umowy: [],
  };
}

function domknij(profil, zajete) {
  const kwoty = profil.umowy.map((u) => u.w).filter((v) => v != null && v > 0).sort((a, b) => a - b);
  const lata = Object.keys(profil.lata).sort();
  return {
    slug: doSlug(profil.nazwa, zajete),
    nazwa: profil.nazwa,
    liczba: profil.liczba,
    suma: zaokr(profil.suma),
    mediana: kwoty.length ? zaokr(kwoty[Math.floor(kwoty.length / 2)] ?? 0) : 0,
    wieloletnie: profil.wieloletnie,
    pierwszyRok: lata[0] ?? null,
    ostatniRok: lata[lata.length - 1] ?? null,
    lata: Object.fromEntries(
      lata.map((r) => [r, { liczba: profil.lata[r].liczba, suma: zaokr(profil.lata[r].suma) }]),
    ),
    partnerzy: [...profil.partnerzy.values()]
      .sort((a, b) => b.suma - a.suma)
      .slice(0, 12)
      .map((p) => ({ ...p, suma: zaokr(p.suma) })),
    umowy: profil.umowy
      .sort((a, b) => (b.w ?? -1) - (a.w ?? -1))
      .slice(0, UMOW_NA_PROFILU),
  };
}

async function main() {
  const pliki = (await readdir('public/dane/umowy')).filter((f) => /^\d{4}\.json$/.test(f)).sort();
  if (!pliki.length) throw new Error('brak public/dane/umowy — uruchom najpierw npm run etl:build');

  const kontrahenci = new Map();
  const jednostki = new Map();

  for (const plik of pliki) {
    const rok = plik.slice(0, 4);
    const dane = await loadJSON(`public/dane/umowy/${plik}`, []);

    for (const u of dane) {
      const kluczK = normalizuj(u.k);
      const kluczJ = u.j;

      for (const [mapa, klucz, nazwa, partner] of [
        [kontrahenci, kluczK, u.k, u.j],
        [jednostki, kluczJ, u.j, u.k],
      ]) {
        if (!klucz) continue;
        if (!mapa.has(klucz)) mapa.set(klucz, pustyProfil(nazwa));
        const p = mapa.get(klucz);
        p.liczba++;
        p.suma += u.w || 0;
        if (u.w != null) p.zKwota++;
        if (u.dni >= 400) p.wieloletnie++;
        p.lata[rok] ??= { liczba: 0, suma: 0 };
        p.lata[rok].liczba++;
        p.lata[rok].suma += u.w || 0;
        dodajPartnera(p.partnerzy, partner, u.w);
        p.umowy.push({ d: u.d, p: u.p, w: u.w, n: u.n, l: u.l, dni: u.dni, x: partner });
      }
    }
  }

  const zajete = new Set();
  const wybraniKontrahenci = [...kontrahenci.values()]
    .sort((a, b) => b.suma - a.suma)
    .slice(0, ILU_KONTRAHENTOW)
    .map((p) => domknij(p, zajete));
  const wszystkieJednostki = [...jednostki.values()]
    .sort((a, b) => b.suma - a.suma)
    .map((p) => domknij(p, zajete));

  await saveJSON('data/podmioty.json', {
    zbudowano: new Date().toISOString(),
    kontrahenci: wybraniKontrahenci,
    jednostki: wszystkieJednostki,
  });

  // Lekki indeks dla przeglądarki: nazwa → slug, tylko dla istniejących stron.
  await saveJSON('public/dane/profile.json', {
    kontrahenci: Object.fromEntries(wybraniKontrahenci.map((p) => [p.nazwa, p.slug])),
    jednostki: Object.fromEntries(wszystkieJednostki.map((p) => [p.nazwa, p.slug])),
  });

  log(`Profile: ${wybraniKontrahenci.length} kontrahentów (z ${kontrahenci.size}), ${wszystkieJednostki.length} jednostek`);
  log(`Najwięksi: ${wybraniKontrahenci.slice(0, 3).map((p) => `${p.nazwa} (${zaokr(p.suma / 1e6, 0)} mln)`).join(', ')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
