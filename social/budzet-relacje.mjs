// Relacje na Instagram (1080×1920) zachęcające do sprawdzenia projektu budżetu na 2027 r.
// Cztery plansze, każda jako wideo MP4 (H.264, 30 kl./s) i grafika PNG (ostatnia klatka).
//
// Liczby pochodzą z tych samych plików co strona /budzet-2027/, więc grafika nie może mówić
// czego innego niż serwis. Animacja jest liczona z czasu (social/budzet-relacje.strona.js),
// a klatki zdejmujemy z Chrome'a przez protokół DevTools — bez Puppeteera i Playwrighta.
//
// Uruchom z katalogu projektu:  node social/budzet-relacje.mjs [--jasny] [A B C D]
// Wymaga: Google Chrome, ffmpeg.

import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const KL_S = 30;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const argumenty = process.argv.slice(2);
const motyw = argumenty.includes('--jasny') ? 'jasny' : 'ciemny';
const plansze = argumenty.filter((a) => !a.startsWith('--'));
const wybrane = plansze.length ? plansze : ['A', 'B', 'C', 'D'];
// Kolory z arkusza serwisu (src/styles/global.css): motyw ciemny i jasny. Na jasnym tle akcentem jest
// czerwień herbu bez rozjaśnienia, a błękit i szarości są ciemniejsze — tak jak na stronie.
const MOTYWY = {
  ciemny: { tlo: '#14161a', tekst: '#f4f4f1', tekst2: '#b3bac4', tekst3: '#7d8590', pas: '#b01327', akcent: '#e0404f',
    linia: '#2a2e35', liniaMocna: '#3a4250', pole: '#1b1f26', karta: '#191c22', blekit: '#4f8fc4', plan: '#6b7380' },
  jasny: { tlo: '#f4f4f1', tekst: '#14161a', tekst2: '#5b616c', tekst3: '#7a808b', pas: '#b01327', akcent: '#b01327',
    linia: '#dcdbd5', liniaMocna: '#c9c8c1', pole: '#fcfcfa', karta: '#fcfcfa', blekit: '#1f5d8c', plan: '#8d939e' },
};
const K = MOTYWY[motyw];
const SUFIKS = motyw === 'jasny' ? '-jasna' : '';

// ---------- dane ----------
const b = JSON.parse(readFileSync('data/budzet2027/zbiorcze.json', 'utf8'));
const bdl = JSON.parse(readFileSync('public/dane/bdl.json', 'utf8')).miasta.poznan.wskazniki;
const zadania = JSON.parse(readFileSync('public/dane/budzet2027/zadania.json', 'utf8')).zadania;
const P = b.projekt2027, R = b.plan2026;
const pl = (n, m = 0) => n.toLocaleString('pl-PL', { minimumFractionDigits: m, maximumFractionDigits: m });
const mld = (n) => pl(n / 1e9, 2);
const procent = (a, z) => pl(Math.abs((a / z - 1) * 100), 1);
const doCen2027 = (rok) => { let m = 1; for (let r = rok + 1; r <= 2027; r++) m *= 1 + b.inflacja[r].w / 100; return m; };

const inwestycje = [];
for (let rok = 2008; rok <= 2025; rok++) {
  const v = bdl.wydatkiMajatkowe.wartosci[rok];
  inwestycje.push({ rok, nom: v, real: v * doCen2027(rok), rodzaj: 'wykonanie' });
}
inwestycje.push({ rok: 2026, nom: R.wydatkiMajatkowe, real: R.wydatkiMajatkowe * doCen2027(2026), rodzaj: 'plan' });
inwestycje.push({ rok: 2027, nom: P.wydatkiMajatkowe, real: P.wydatkiMajatkowe, rodzaj: 'projekt' });
const realnieWiecej = inwestycje.filter((x) => x.rok < 2027 && x.real > P.wydatkiMajatkowe).sort((x, y) => x.rok - y.rok);
const szczyt = [...realnieWiecej].sort((x, y) => y.real - x.real)[0];
// plansza C opowiada konkretną historię — jeśli dane przestaną ją potwierdzać, nie generujemy jej po cichu
if (!inwestycje.slice(0, -1).every((x) => x.nom < P.wydatkiMajatkowe) || !szczyt) {
  throw new Error('Plansza C zakłada: nominalnie rekord, realnie nie. Dane tego nie potwierdzają — trzeba ją przepisać.');
}
const lataWiecej = realnieWiecej.map((x) => x.rok);
const listaLat = lataWiecej.length > 1 ? `${lataWiecej.slice(0, -1).join(', ')} i ${lataWiecej.at(-1)}` : String(lataWiecej[0]);

const zadanie = (kod) => { const z = zadania.find((x) => x.k === kod); if (!z) throw new Error(`brak zadania ${kod}`); return z; };
const przyklady = [
  { fraza: 'Teatr Muzyczny', kod: 'KL/P/037', nazwa: 'Teatr Muzyczny — nowa siedziba', jedn: 'Wydział Kultury' },
  { fraza: 'Palmiarnia', kod: 'PALM/P/010', nazwa: 'Przebudowa Palmiarni Poznańskiej', jedn: 'Palmiarnia Poznańska' },
  { fraza: 'Ożarowska', kod: 'ZDM/P/139', nazwa: 'Budowa ulicy Ożarowskiej', jedn: 'Zarząd Dróg Miejskich' },
].map((x) => ({ ...x, kwota: zadanie(x.kod).b }));
const wydatkiLata = [];
for (let rok = 2008; rok <= 2025; rok++) wydatkiLata.push(bdl.wydatkiOgolem.wartosci[rok]);
wydatkiLata.push(R.wydatki, P.wydatki);

const WYKRES_WYS = 380, WYKRES_MAX = 1.75e9;
const D = { wydatki: P.wydatki, inwestycje, szczytRok: szczyt.rok, przyklady, wykresWys: WYKRES_WYS, wykresMax: WYKRES_MAX, kolory: K };
const LICZBY = [
  { v: P.wydatki, co: 'wydatków', opis: `o ${procent(P.wydatki, R.wydatki)}% więcej niż w planie 2026` },
  { v: P.dochody, co: 'dochodów', opis: 'praktycznie tyle samo co w 2026 r.' },
  { v: P.wydatkiMajatkowe, co: 'na inwestycje', opis: `o ${procent(P.wydatkiMajatkowe, R.wydatkiMajatkowe)}% więcej niż w planie 2026` },
  { v: -P.wynik, co: 'deficytu', opis: `w planie 2026: ${mld(-R.wynik)} mld zł`, akcent: true },
  { v: P.dlug, co: 'długu na koniec roku', opis: `o ${mld(P.dlug - R.dlug)} mld zł więcej niż rok wcześniej`, akcent: true },
];
const stan = b.meta.stanNa.split('-').reverse().join('.');

// ---------- strona ----------
const nm = resolve('node_modules');
function osadz(plikCss) {
  const katalog = plikCss.slice(0, plikCss.lastIndexOf('/'));
  return readFileSync(plikCss, 'utf8').replace(/url\((['"]?)(\.\/files\/[^)'"]+)\1\)/g, (_, __, sciezka) => {
    const typ = sciezka.endsWith('.woff2') ? 'font/woff2' : 'font/woff';
    return `url(data:${typ};base64,${readFileSync(join(katalog, sciezka)).toString('base64')})`;
  });
}
const fonty = [
  `${nm}/@fontsource-variable/space-grotesk/wght.css`,
  `${nm}/@fontsource/ibm-plex-mono/400.css`,
  `${nm}/@fontsource/ibm-plex-mono/600.css`,
].map(osadz).join('\n');

const LOGO = `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6.5 8.5 L14.3 16 L6.5 23.5" fill="none" stroke="${K.tekst}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M25.5 8.5 L17.7 16 L25.5 23.5" fill="none" stroke="${K.pas}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const glowa = (nad, wiersze) => `
  <div class="tresc marka">${LOGO}Poznań w danych</div>
  <div class="tresc nad">${nad}</div>
  <h1 class="tresc">${wiersze.map((w) => `<span>${w}</span>`).join('')}</h1>`;
const stopa = (wezwanie, zrodlo) => `
  <div class="tresc wezwanie"><p>${wezwanie}</p><p class="adres">poznanwdanych.pl/budzet-2027</p></div>
  <svg class="strzalka" viewBox="0 0 40 24" aria-hidden="true"><path d="M4 4 L20 19 L36 4" fill="none" stroke="${K.akcent}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>
  <div class="miejsce">TU NAKLEJKA Z LINKIEM</div>
  <div class="tresc zrodlo">${zrodlo}</div>`;
const ZRODLO = `Projekt budżetu Miasta Poznania na 2027 r., stan na ${stan}<br>Kwoty przed głosowaniem Rady Miasta`;

const krok = 904 / inwestycje.length;
const maxWyd = Math.max(...wydatkiLata);
const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><style>
${fonty}
* { margin: 0; box-sizing: border-box; }
html, body { width: 1080px; height: 1920px; background: ${K.tlo}; overflow: hidden; }
body { position: relative; font-family: 'Space Grotesk Variable'; color: ${K.tekst}; -webkit-font-smoothing: antialiased; }
.plansza { position: absolute; inset: 0; display: none; }
.pas { position: absolute; inset: 0 0 auto 0; height: 10px; background: ${K.pas}; z-index: 5; }
.tresc { position: absolute; left: 88px; right: 88px; }
.marka { top: 262px; display: flex; align-items: center; gap: 18px; font-weight: 700; font-size: 40px; letter-spacing: -.02em; }
.marka svg { width: 46px; height: 46px; }
.nad { top: 372px; font-family: 'IBM Plex Mono'; font-weight: 600; font-size: 25px; letter-spacing: .14em; color: ${K.akcent}; }
h1 { top: 426px; font-weight: 700; font-size: 92px; line-height: 1; letter-spacing: -.035em; white-space: nowrap; }
h1 span { display: block; }
/* stopka: wezwanie 1290, strzałka 1408, miejsce na naklejkę 1460–1610 (puste w wersji do publikacji), źródło 1646 */
.wezwanie { top: 1290px; text-align: center; }
.wezwanie p { font-size: 42px; font-weight: 600; letter-spacing: -.01em; }
.wezwanie .adres { margin-top: 10px; font-family: 'IBM Plex Mono'; font-weight: 600; font-size: 33px; color: ${K.akcent}; }
.strzalka { position: absolute; left: 50%; top: 1408px; width: 40px; height: 24px; margin-left: -20px; }
.miejsce { display: none; position: absolute; left: 190px; right: 190px; top: 1460px; height: 150px;
  border: 3px dashed ${K.akcent}; border-radius: 22px; place-items: center;
  font-family: 'IBM Plex Mono'; font-size: 26px; color: ${K.akcent}; letter-spacing: .06em; }
body.podglad .miejsce { display: grid; }
.zrodlo { top: 1646px; text-align: center; font-family: 'IBM Plex Mono'; font-size: 19px; line-height: 1.5; color: ${K.tekst3}; }

/* A */
/* słupki wydatków w tle kończą się na linii bazowej dużej liczby — nie wchodzą pod opis poniżej */
#a-tlo { position: absolute; left: 88px; top: 650px; width: 904px; height: 300px; opacity: .13; }
#a-blok { top: 760px; display: flex; align-items: baseline; gap: 22px; font-family: 'IBM Plex Mono'; font-weight: 600; }
#a-liczba { font-size: 196px; line-height: 1; letter-spacing: -.075em; color: ${K.akcent}; }
#a-blok small { font-size: 66px; color: ${K.tekst}; }
#a-pod { top: 972px; font-size: 35px; line-height: 1.28; color: ${K.tekst2}; max-width: 860px; }
.a-stat { position: absolute; top: 1096px; width: 440px; border-top: 2px solid ${K.linia}; padding-top: 18px; }
.a-stat b { display: block; font-family: 'IBM Plex Mono'; font-weight: 600; font-size: 58px; letter-spacing: -.03em; line-height: 1.05; }
.a-stat b small { font-size: .5em; font-weight: 400; color: ${K.tekst2}; letter-spacing: 0; }
.a-stat span { font-size: 30px; color: ${K.tekst2}; }
#a-st1 { left: 88px; } #a-st2 { left: 552px; }

/* B */
#b-wiersze { top: 648px; }
.wiersz { display: grid; grid-template-columns: 318px 1fr; align-items: center; gap: 26px; padding: 19px 0; border-top: 2px solid ${K.linia}; }
.wiersz:last-child { border-bottom: 2px solid ${K.linia}; }
.wiersz b { font-family: 'IBM Plex Mono'; font-weight: 600; font-size: 64px; letter-spacing: -.03em; white-space: nowrap; line-height: 1; }
.wiersz b small { font-size: .47em; letter-spacing: 0; color: ${K.tekst2}; font-weight: 400; }
.wiersz.akcent b span { color: ${K.akcent}; }
.wiersz div strong { display: block; font-size: 33px; font-weight: 600; line-height: 1.2; }
.wiersz div span { display: block; font-size: 26px; line-height: 1.25; color: ${K.tekst2}; margin-top: 3px; }

/* C */
#c-przelacznik { top: 652px; left: 88px; right: auto; width: 640px; height: 66px; border: 2px solid ${K.liniaMocna}; border-radius: 999px;
  display: grid; grid-template-columns: 1fr 1fr; align-items: center; text-align: center; font-size: 28px; font-weight: 600; }
#c-przelacznik > span { color: ${K.tekst2}; }
/* Suwak to druga, jasna kopia obu napisów przycięta do swojego kształtu — dzięki temu litery
   zmieniają kolor dokładnie pod suwakiem, także w połowie przesunięcia. */
#c-przelacznik .galka { position: absolute; inset: 0; display: grid; grid-template-columns: 1fr 1fr; align-items: center;
  background: ${K.tekst}; color: ${K.tlo}; border-radius: 999px; }
#c-wykres { top: 752px; height: ${WYKRES_WYS + 44}px; }
#c-wykres svg { display: block; width: 904px; height: ${WYKRES_WYS + 44}px; overflow: visible; }
#c-wykres text { font-family: 'IBM Plex Mono'; fill: ${K.tekst3}; font-size: 21px; }
#c-wykres text.wart { fill: ${K.tekst}; font-size: 25px; font-weight: 600; }
.c-wniosek { top: 1196px; font-size: 34px; line-height: 1.25; font-weight: 600; }
#c-w2 em { font-style: normal; color: ${K.akcent}; }

/* D */
#d-pod { top: 640px; font-size: 33px; line-height: 1.28; color: ${K.tekst2}; max-width: 860px; }
#d-pole { top: 772px; height: 100px; border: 2px solid ${K.liniaMocna}; border-radius: 8px; background: ${K.pole};
  display: flex; align-items: center; gap: 20px; padding: 0 28px; font-family: 'IBM Plex Mono'; font-size: 40px; }
#d-pole svg { width: 38px; height: 38px; flex: none; }
#d-kursor { width: 3px; height: 46px; background: ${K.akcent}; margin-left: -12px; }
.d-karta { height: 100px; border: 2px solid ${K.linia}; border-radius: 8px; background: ${K.karta};
  display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 20px; padding: 0 26px; }
.d-karta strong { display: block; font-size: 30px; font-weight: 600; line-height: 1.15; }
.d-karta span { display: block; font-size: 22px; color: ${K.tekst3}; margin-top: 4px; }
.d-karta b { font-family: 'IBM Plex Mono'; font-weight: 600; font-size: 34px; color: ${K.akcent}; white-space: nowrap; }
.d-karta mark { background: ${K.akcent}33; color: inherit; border-radius: 3px; padding: 0 3px; }
</style></head><body>
<div class="pas"></div>

<section class="plansza" id="s-A">
  ${glowa('PROJEKT BUDŻETU · 2027', ['Na co Poznań', 'wyda pieniądze', 'w 2027 roku?'])}
  <svg id="a-tlo" viewBox="0 0 904 300" aria-hidden="true">${wydatkiLata.map((v, i) =>
    `<rect x="${(i * (904 / wydatkiLata.length) + 5).toFixed(1)}" width="${(904 / wydatkiLata.length - 10).toFixed(1)}" y="300" height="0" data-h="${((v / maxWyd) * 300).toFixed(1)}" fill="${i === wydatkiLata.length - 1 ? K.akcent : K.tekst}" rx="2"/>`).join('')}</svg>
  <div class="tresc" id="a-blok"><span id="a-liczba">0,00</span><small>mld zł</small></div>
  <div class="tresc" id="a-pod">Tyle wynoszą wydatki w projekcie budżetu —&nbsp;o&nbsp;${procent(P.wydatki, R.wydatki)}% więcej niż w&nbsp;planie na 2026&nbsp;r.</div>
  <div class="a-stat" id="a-st1"><b>${mld(P.dochody)}<small> mld zł</small></b><span>dochodów</span></div>
  <div class="a-stat" id="a-st2"><b>${mld(-P.wynik)}<small> mld zł</small></b><span>deficytu, głównie na kredyt</span></div>
  ${stopa('Sprawdź, na co pójdą pieniądze', ZRODLO)}
</section>

<section class="plansza" id="s-B">
  ${glowa('PROJEKT BUDŻETU · 2027', ['Budżet Poznania', 'w pięciu liczbach'])}
  <div class="tresc" id="b-wiersze">${LICZBY.map((x) => `
    <div class="wiersz${x.akcent ? ' akcent' : ''}" data-v="${x.v}"><b><span>0,00</span><small> mld zł</small></b><div><strong>${x.co}</strong><span>${x.opis}</span></div></div>`).join('')}
  </div>
  ${stopa('Porównaj z poprzednimi latami', ZRODLO)}
</section>

<section class="plansza" id="s-C">
  ${glowa('INWESTYCJE · 2027', ['Rekord?', 'Zależy, jak liczyć'])}
  <div class="tresc" id="c-przelacznik"><span>w złotych</span><span>w cenach z 2027 r.</span><div class="galka"><span>w złotych</span><span>w cenach z 2027 r.</span></div></div>
  <div class="tresc" id="c-wykres"><svg viewBox="0 0 904 ${WYKRES_WYS + 44}" aria-hidden="true">
    <line x1="0" x2="904" y1="${WYKRES_WYS}" y2="${WYKRES_WYS}" stroke="${K.liniaMocna}" stroke-width="2"/>
    <g id="c-slupki">${inwestycje.map((d, i) => `<rect x="${(i * krok + 7).toFixed(1)}" width="${(krok - 14).toFixed(1)}" y="${WYKRES_WYS}" height="0" rx="2"/>`).join('')}</g>
    ${inwestycje.map((d, i) => ([2008, 2011, 2015, 2019, 2023, 2027].includes(d.rok) ? `<text x="${(i * krok + krok / 2).toFixed(1)}" y="${WYKRES_WYS + 34}" text-anchor="middle">${d.rok}</text>` : '')).join('')}
    <text class="wart" id="c-e27" x="${((inwestycje.length - 1) * krok + krok / 2).toFixed(1)}" y="${(WYKRES_WYS - (P.wydatkiMajatkowe / WYKRES_MAX) * WYKRES_WYS - 14).toFixed(1)}" text-anchor="end">${mld(P.wydatkiMajatkowe)} mld</text>
    <text class="wart" id="c-e11" x="${(inwestycje.findIndex((d) => d.rok === szczyt.rok) * krok + krok / 2).toFixed(1)}" y="0" text-anchor="middle">${mld(szczyt.real)} mld</text>
  </svg></div>
  <div class="tresc c-wniosek" id="c-w1">W złotych to najwięcej w historii miasta.</div>
  <div class="tresc c-wniosek" id="c-w2">Po odjęciu inflacji <em>więcej wydano w ${listaLat} r.</em></div>
  ${stopa('Przełącz i sprawdź sam', `2008–2025: wykonanie budżetu wg GUS · 2026: plan · 2027: projekt<br>Wydatki majątkowe, stan projektu na ${stan}`)}
</section>

<section class="plansza" id="s-D">
  ${glowa('SZUKAJ W BUDŻECIE · 2027', ['Co zaplanowano', 'na Twojej ulicy?'])}
  <div class="tresc" id="d-pod">${zadania.length} zadań z opisami. Szukaj po nazwie ulicy, szkoły albo instytucji.</div>
  <div class="tresc" id="d-pole"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="${K.tekst3}" stroke-width="2.2"/><path d="M15.5 15.5 L21 21" stroke="${K.tekst3}" stroke-width="2.2" stroke-linecap="round"/></svg><span id="d-tekst"></span><i id="d-kursor"></i></div>
  ${przyklady.map((x, i) => `<div class="tresc d-karta" id="d-k${i}" style="top:${902 + i * 114}px"><div><strong>${x.nazwa}</strong><span>${x.jedn}</span></div><b>${x.kwota >= 1e7 ? pl(x.kwota / 1e6, 1) : pl(x.kwota / 1e6, 2)} mln zł</b></div>`).join('')}
  ${stopa('Wpisz swoją ulicę', ZRODLO)}
</section>

<script>window.D = ${JSON.stringify(D)};</script>
<script>${readFileSync('social/budzet-relacje.strona.js', 'utf8')}</script>
</body></html>`;
const plikHtml = resolve(`social/budzet-relacje${SUFIKS}.html`);
writeFileSync(plikHtml, html);

// ---------- Chrome przez protokół DevTools ----------
const profil = mkdtempSync(join(tmpdir(), 'chrome-relacje-'));
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profil}`,
  '--hide-scrollbars', '--force-device-scale-factor=1', '--no-first-run', '--no-default-browser-check', 'about:blank'],
  { stdio: ['ignore', 'ignore', 'pipe'] });
const sprzatnij = () => { try { chrome.kill('SIGKILL'); } catch {} try { rmSync(profil, { recursive: true, force: true }); } catch {} };
process.on('exit', sprzatnij);
const adres = await new Promise((ok, zle) => {
  let bufor = '';
  const limit = setTimeout(() => zle(new Error('Chrome nie podał adresu DevTools w 20 s')), 20_000);
  chrome.stderr.on('data', (d) => {
    bufor += d;
    const m = bufor.match(/DevTools listening on (ws:\/\/\S+)/);
    if (m) { clearTimeout(limit); ok(m[1]); }
  });
});
const ws = new WebSocket(adres);
await new Promise((ok, zle) => { ws.onopen = ok; ws.onerror = () => zle(new Error('brak połączenia z DevTools')); });
let nr = 0; const oczekujace = new Map(); const zdarzenia = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && oczekujace.has(m.id)) { const { ok, zle } = oczekujace.get(m.id); oczekujace.delete(m.id); m.error ? zle(new Error(m.error.message)) : ok(m.result); }
  else if (m.method && zdarzenia.has(m.method)) { zdarzenia.get(m.method)(m.params); zdarzenia.delete(m.method); }
};
const cdp = (method, params = {}, sessionId) => new Promise((ok, zle) => {
  const id = ++nr; oczekujace.set(id, { ok, zle });
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  setTimeout(() => { if (oczekujace.has(id)) { oczekujace.delete(id); zle(new Error(`${method}: brak odpowiedzi w 30 s`)); } }, 30_000);
});
const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' });
const { sessionId: S } = await cdp('Target.attachToTarget', { targetId, flatten: true });
await cdp('Emulation.setDeviceMetricsOverride', { width: 1080, height: 1920, deviceScaleFactor: 1, mobile: false }, S);
await cdp('Page.enable', {}, S);
const zaladowana = new Promise((ok) => zdarzenia.set('Page.loadEventFired', ok));
await cdp('Page.navigate', { url: `file://${plikHtml}` }, S);
await zaladowana;
const js = async (wyrazenie) => {
  const r = await cdp('Runtime.evaluate', { expression: wyrazenie, awaitPromise: true, returnByValue: true }, S);
  if (r.exceptionDetails) throw new Error(`błąd na stronie: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
  return r.result.value;
};
// Plansze są na starcie ukryte, więc przeglądarka sama nie pobrałaby krojów — wymuszamy to, podając
// tekst z polskimi znakami (podzbiór latin-ext ładuje się osobno od podstawowego).
const fontyOk = await js(`(async () => {
  const proba = 'Zażółć gęślą jaźń 0123456789 mld zł';
  await Promise.all(["700 40px 'Space Grotesk Variable'", "600 40px 'Space Grotesk Variable'", "400 40px 'Space Grotesk Variable'",
    "600 40px 'IBM Plex Mono'", "400 40px 'IBM Plex Mono'"].map((f) => document.fonts.load(f, proba)));
  await document.fonts.ready;
  return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family + ' ' + f.weight);
})()`);
if (!fontyOk.some((f) => f.includes('Space Grotesk')) || !fontyOk.some((f) => f.includes('IBM Plex Mono'))) {
  throw new Error(`fonty serwisu się nie wczytały: ${fontyOk.join(', ') || 'brak'}`);
}
const zrzut = async (plik) => {
  const { data } = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, S);
  writeFileSync(plik, Buffer.from(data, 'base64'));
};

mkdirSync('social', { recursive: true });
for (const s of wybrane) {
  const trwa = await js(`czasTrwania('${s}')`);
  const klatek = Math.round(trwa * KL_S);
  const kat = mkdtempSync(join(tmpdir(), `relacja-${s}-`));
  for (let i = 0; i < klatek; i++) {
    await js(`klatka('${s}', ${(i / KL_S).toFixed(4)})`);
    await zrzut(join(kat, `k${String(i).padStart(4, '0')}.png`));
  }
  // ostatnia klatka = pełna plansza; z niej grafika statyczna, a w wideo jeszcze 1,5 s postoju
  await js(`klatka('${s}', ${trwa})`);
  const nazwa = `social/budzet2027-${s}${SUFIKS}`;
  await zrzut(`${nazwa}.png`);
  const ostatnia = join(kat, `k${String(klatek).padStart(4, '0')}.png`);
  writeFileSync(ostatnia, readFileSync(`${nazwa}.png`));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(KL_S), '-i', join(kat, 'k%04d.png'),
    '-vf', `tpad=stop_mode=clone:stop_duration=1.5,format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '17',
    '-profile:v', 'high', '-r', String(KL_S), '-movflags', '+faststart', `${nazwa}.mp4`]);
  rmSync(kat, { recursive: true, force: true });
  console.log(`${nazwa}.mp4 (${(trwa + 1.5).toFixed(1)} s, ${klatek + 1} klatek) + ${nazwa}.png`);
}
// podgląd z zaznaczonym miejscem na naklejkę — tylko do orientacji, nie do publikacji
await js(`document.body.classList.add('podglad'), klatka('${wybrane[0]}', czasTrwania('${wybrane[0]}'))`);
await zrzut(`social/budzet2027-podglad-naklejki${SUFIKS}.png`);
console.log(`social/budzet2027-podglad-naklejki${SUFIKS}.png`);
await cdp('Browser.close').catch(() => {});
ws.close();
sprzatnij();
process.exit(0);
