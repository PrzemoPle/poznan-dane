// Tabele statystyczne z badam.poznan.pl — miejskiego portalu danych o Poznaniu.
// Każda podstrona to migawka jednego tematu za jeden rok w układzie:
//   Wyszczególnienie | rok N-1 | rok N | dynamika
// Sklejamy je w szeregi czasowe per wskaźnik.

import { fetchRetry, pool, saveJSON, log } from './lib.mjs';

const START = 'https://badam.poznan.pl/';
const PREFIX = 'https://badam.poznan.pl/vi_tabele-statystyczne/';

const bezTagow = (s) =>
  s.replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;| /g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/\s+/g, ' ')
    .trim();

/** "6 357,1" -> 6357.1 ; "deficyt 481" -> null (zostaje jako tekst) */
function liczba(s) {
  if (!s) return null;
  const t = s.replace(/\s| /g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

async function listaStron() {
  const res = await fetchRetry(START);
  const html = await res.text();
  const linki = new Set(
    [...html.matchAll(/href="(https:\/\/badam\.poznan\.pl\/vi_tabele-statystyczne\/[^"]+)"/g)].map((m) => m[1]),
  );
  return [...linki].filter((u) => u.startsWith(PREFIX) && u.endsWith('/'));
}

async function stronaTabeli(url) {
  const res = await fetchRetry(url);
  const html = await res.text();
  const tytul = bezTagow((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '')
    || bezTagow((html.match(/<title>(.*?)<\/title>/) || [])[1] || '').replace(/ - Badam$/, '');

  const tabela = (html.match(/<table[\s\S]*?<\/table>/) || [])[0];
  if (!tabela) return null;

  const wiersze = [...tabela.matchAll(/<tr[\s\S]*?<\/tr>/g)].map((m) =>
    [...m[0].matchAll(/<t[dh][\s\S]*?<\/t[dh]>/g)].map((c) => bezTagow(c[0])),
  );
  if (wiersze.length < 2) return null;

  const naglowek = wiersze[0];
  // kolumny, których nagłówek jest rokiem
  const kolumnyLat = naglowek
    .map((h, i) => ({ i, rok: /^(19|20)\d{2}$/.test(h) ? h : null }))
    .filter((k) => k.rok);
  if (!kolumnyLat.length) return null;

  let sekcja = null;
  const pozycje = [];
  for (const w of wiersze.slice(1)) {
    const etykieta = w[0];
    if (!etykieta || etykieta.toLowerCase() === 'wyszczególnienie') continue;
    const maWartosci = kolumnyLat.some((k) => (w[k.i] || '').trim());
    // Powtórzony nagłówek: w każdej kolumnie stoi po prostu numer roku.
    const powtorzonyNaglowek =
      maWartosci &&
      kolumnyLat.every((k) => {
        const v = liczba((w[k.i] || '').trim());
        return v === null || (v >= 1990 && v <= 2100 && Math.abs(v - Number(k.rok)) <= 2);
      });
    if (!maWartosci || powtorzonyNaglowek) {
      sekcja = etykieta; // wiersz nagłówkowy sekcji (np. "Dochody")
      continue;
    }
    const wartosci = {};
    const teksty = {};
    for (const k of kolumnyLat) {
      const surowe = (w[k.i] || '').trim();
      if (!surowe) continue;
      const n = liczba(surowe);
      if (n === null) teksty[k.rok] = surowe;
      else wartosci[k.rok] = n;
    }
    if (Object.keys(wartosci).length || Object.keys(teksty).length) {
      pozycje.push({ sekcja, etykieta, wartosci, teksty });
    }
  }

  return { url, tytul, lata: kolumnyLat.map((k) => k.rok), pozycje };
}

/** Sklejenie migawek rocznych w jeden szereg per (temat, sekcja, etykieta). */
function scal(strony) {
  const tematy = new Map();
  for (const s of strony) {
    const temat = s.tytul;
    if (!tematy.has(temat)) tematy.set(temat, new Map());
    const pozycje = tematy.get(temat);
    for (const p of s.pozycje) {
      // Klucz po samej etykiecie — ta sama pozycja bywa na różnych rocznikach
      // raz pod nagłówkiem sekcji, a raz bez niego.
      const klucz = p.etykieta.toLowerCase().replace(/[\s.,:;]+/g, ' ').trim();
      if (!pozycje.has(klucz)) {
        pozycje.set(klucz, { sekcja: p.sekcja, etykieta: p.etykieta, wartosci: {}, teksty: {}, zrodla: new Set() });
      }
      const cel = pozycje.get(klucz);
      if (!cel.sekcja && p.sekcja) cel.sekcja = p.sekcja;
      Object.assign(cel.wartosci, p.wartosci);
      Object.assign(cel.teksty, p.teksty);
      cel.zrodla.add(s.url);
    }
  }
  return [...tematy.entries()].map(([temat, pozycje]) => ({
    temat,
    pozycje: [...pozycje.values()]
      .map((p) => ({ ...p, zrodla: [...p.zrodla] }))
      .filter((p) => Object.keys(p.wartosci).length >= 2)
      .sort((a, b) => (a.sekcja || '').localeCompare(b.sekcja || '', 'pl') || a.etykieta.localeCompare(b.etykieta, 'pl')),
  })).filter((t) => t.pozycje.length);
}

async function main() {
  const strony = await listaStron();
  log(`badam.poznan.pl: ${strony.length} podstron z tabelami`);

  const wyniki = (
    await pool(strony, 4, async (url) => {
      try {
        return await stronaTabeli(url);
      } catch (e) {
        log(`  ! ${url}: ${e.message}`);
        return null;
      }
    })
  ).filter(Boolean);

  log(`Sparsowano ${wyniki.length} tabel`);
  const tematy = scal(wyniki);
  const pozycji = tematy.reduce((s, t) => s + t.pozycje.length, 0);
  log(`Tematy: ${tematy.length}, szeregi: ${pozycji}`);
  log(tematy.map((t) => `${t.temat} (${t.pozycje.length})`).join(' · '));

  await saveJSON('data/raw/badam.json', {
    pobrano: new Date().toISOString(),
    zrodlo: 'badam.poznan.pl — Miasto Poznań',
    tematy,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
