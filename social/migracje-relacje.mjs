// Relacje na Instagram (1080×1920) zachęcające do sprawdzenia podstrony /migracje/.
// Cztery plansze, każda jako wideo MP4 i grafika PNG (ostatnia klatka), w motywie ciemnym albo jasnym.
//
// Liczby pochodzą z data/migracje/dane.json — tego samego pliku, z którego rysuje się strona —
// więc grafika nie może mówić czego innego niż serwis. Animacja jest liczona z czasu
// (social/migracje-relacje.strona.js), a nagrywanie robi social/relacje-wspolne.mjs.
//
// Uruchom z katalogu projektu:  node social/migracje-relacje.mjs [--jasny] [A B C D]
// Wymaga: Google Chrome, ffmpeg.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MOTYWY, mieszaj, fontyCss, nagraj } from './relacje-wspolne.mjs';

const argumenty = process.argv.slice(2);
const motyw = argumenty.includes('--jasny') ? 'jasny' : 'ciemny';
const plansze = argumenty.filter((a) => !a.startsWith('--'));
const wybrane = plansze.length ? plansze : ['A', 'B', 'C', 'D'];
const K = MOTYWY[motyw];
const SUFIKS = motyw === 'jasny' ? '-jasna' : '';

// ---------- dane ----------
const M = JSON.parse(readFileSync('data/migracje/dane.json', 'utf8'));
const Y = M.Y, F = M.flows, T = (k) => M.tot[k];
const ZAKRES = `${Y[0]}–${Y.at(-1)}`;
const pl = (n, m = 0) => n.toLocaleString('pl-PL', { minimumFractionDigits: m, maximumFractionDigits: m }).replace('-', '−');
const zeZnakiem = (n) => `${n > 0 ? '+' : ''}${pl(n)}`;
// w kroju o stałej szerokości spacja tysięcy jest tak szeroka jak cyfra — w dużych liczbach zastępujemy ją wąskim odstępem
const waskie = (tekst) => tekst.replace(/[\u00a0\u202f ]/g, '<i class="odst"></i>');
const wymeldowania = Y.reduce((a, y) => a + T('80123')[y], 0);
const zameldowania = Y.reduce((a, y) => a + T('80121')[y], 0);

const kierunki = Object.entries(F)
  .map(([c, f]) => ({ c, n: f.n, v: f.v.reduce((a, x) => a + x[0], 0), bilans: f.v.reduce((a, x) => a + x[1] - x[0], 0), powiat: c.startsWith('3021') }))
  .sort((a, b) => b.v - a.v);
const doPowiatu = kierunki.filter((k) => k.powiat).reduce((a, k) => a + k.v, 0);
const udzialPowiatu = Math.round((doPowiatu / wymeldowania) * 100);
const top6 = kierunki.slice(0, 6);
// plansza B mówi „sześć gmin pod Poznaniem" — sprawdzamy, czy czołówka rzeczywiście jest z powiatu
if (!top6.every((k) => k.powiat)) throw new Error('Plansza B zakłada, że sześć pierwszych kierunków leży w powiecie poznańskim.');

// wiek: a[grupa] = [do Poznania, z Poznania], suma lat dla całego miasta
const wiek = M.ages.labels.map((etykieta, i) => {
  let przyj = 0, wyj = 0;
  for (const y of Y) { const a = M.ages.d[y]['Poznań'].a[i]; przyj += a[0]; wyj += a[1]; }
  return { etykieta, przyj, wyj };
});
const sumaW = wiek.reduce((a, w) => a + w.wyj, 0), sumaP = wiek.reduce((a, w) => a + w.przyj, 0);
const DZIECI = [0, 1, 2], DWUDZIESTO = [4, 5];
if (wiek[2].etykieta !== '10-14' || wiek[4].etykieta !== '20-24' || wiek[5].etykieta !== '25-29') throw new Error('Zmienił się układ grup wieku.');
const procDzieci = Math.round((DZIECI.reduce((a, i) => a + wiek[i].wyj, 0) / sumaW) * 100);
const procMlodzi = Math.round((DWUDZIESTO.reduce((a, i) => a + wiek[i].przyj, 0) / sumaP) * 100);

const salda = Y.map((y) => ({ rok: y, v: T('80121')[y] - T('80123')[y] }));
const ostatnie = salda.at(-1);
// plansza D opowiada konkretną historię — jeśli dane przestaną ją potwierdzać, nie generujemy jej po cichu
if (!salda.every((s) => s.v < 0) || !salda.every((s) => s.v <= ostatnie.v)) {
  throw new Error('Plansza D zakłada: saldo ujemne co roku, a w ostatnim roku strata najmniejsza. Dane tego nie potwierdzają.');
}
const bilansPowiat = Math.round(kierunki.filter((k) => k.powiat).reduce((a, k) => a + k.bilans, 0));
const bilansReszta = Math.round(kierunki.filter((k) => !k.powiat).reduce((a, k) => a + k.bilans, 0)
  + Object.values(M.woj).reduce((a, w) => a + w.v.reduce((b, x) => b + x[1] - x[0], 0), 0));
if (!(bilansPowiat < 0 && bilansReszta > 0)) throw new Error('Plansza D zakłada: minus z powiatem, plus z resztą kraju.');

// ---------- mapa na planszę A ----------
const MAPA_SZER = 904, MAPA_WYS = 470;
const GM = Object.fromEntries(M.map.gm.map((g) => [g.c, g]));
const lukiDane = kierunki.filter((k) => GM[k.c]).slice(0, 12);
const [px0, py0] = M.map.poz;
const punkty = lukiDane.map((k) => [GM[k.c].x, GM[k.c].y]).concat([[px0, py0]]);
let minX = Math.min(...punkty.map((p) => p[0])) - 70, maxX = Math.max(...punkty.map((p) => p[0])) + 70;
// na dole więcej miejsca: podpis gminy pod punktem ma dwa wiersze
let minY = Math.min(...punkty.map((p) => p[1])) - 46, maxY = Math.max(...punkty.map((p) => p[1])) + 74;
// dopasowanie okna do proporcji pola mapy: rozszerzamy krótszy wymiar, nigdy nie ucinamy punktów
const proporcja = MAPA_SZER / MAPA_WYS;
if ((maxX - minX) / (maxY - minY) < proporcja) { const brak = (maxY - minY) * proporcja - (maxX - minX); minX -= brak / 2; maxX += brak / 2; }
else { const brak = (maxX - minX) / proporcja - (maxY - minY); minY -= brak / 2; maxY += brak / 2; }
const skala = MAPA_SZER / (maxX - minX);          // piksele planszy na jednostkę mapy
const j = (piksele) => +(piksele / skala).toFixed(3);
const PROGI = [1, 25, 100, 300, 1000, 2000], UDZIALY = [0.14, 0.25, 0.37, 0.5, 0.64, 0.8];
const wypelnienie = (v) => { let k = -1; PROGI.forEach((x, i) => { if (v >= x) k = i; }); return k < 0 ? mieszaj(K.tekst3, K.pole, 0.1) : mieszaj(K.tekst2, K.pole, UDZIALY[k]); };
const wartoscGminy = Object.fromEntries(kierunki.map((k) => [k.c, k.v]));
const maksLuk = lukiDane[0].v;
const luki = [...lukiDane].reverse().map((k) => {
  const x2 = GM[k.c].x, y2 = GM[k.c].y, dx = x2 - px0, dy = y2 - py0;
  return { c: k.c, n: k.n, v: Math.round(k.v), x1: px0, y1: py0, x2, y2, cx: (px0 + x2) / 2 - dy * 0.22, cy: (py0 + y2) / 2 + dx * 0.22,
    w: j(3 + 15 * Math.sqrt(k.v / maksLuk)), kolejnosc: lukiDane.indexOf(k) };
});
const etykiety = lukiDane.slice(0, 5).map((k) => {
  const g = GM[k.c], dx = g.x - px0, dy = g.y - py0, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, odst = j(26), fs = j(25);
  const kotwica = ux > 0.35 ? 'start' : ux < -0.35 ? 'end' : 'middle';
  return { n: k.n.replace('Tarnowo Podgórne', 'Tarnowo Podg.'), v: pl(Math.round(k.v)), x: +(g.x + ux * odst).toFixed(1),
    y: +(g.y + uy * odst + (uy > 0.35 ? fs * 0.9 : uy < -0.35 ? -fs * 1.25 : -fs * 0.3)).toFixed(1), kotwica, kolejnosc: lukiDane.indexOf(k) };
});

// ---------- dane dla animacji ----------
const WIEK_W = 25, WIEK_WYS = wiek.length * WIEK_W, WIEK_SRODEK = 452, WIEK_OS = 84;
const DANE = {
  kolory: K, wymeldowania, luki, ileEtykiet: etykiety.length, czastkaR: j(4.2),
  top6: top6.map((k) => Math.round(k.v)),
  dzieci: DZIECI, dwudziesto: DWUDZIESTO, wiekLewa: WIEK_SRODEK - WIEK_OS / 2,
  salda: salda.map((s) => s.v), bilansPowiat, bilansReszta,
};

// ---------- strona ----------
const LOGO = `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6.5 8.5 L14.3 16 L6.5 23.5" fill="none" stroke="${K.tekst}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M25.5 8.5 L17.7 16 L25.5 23.5" fill="none" stroke="${K.akcent}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const glowa = (nad, wiersze) => `
  <div class="tresc marka">${LOGO}Poznań w danych</div>
  <div class="tresc nad">${nad}</div>
  <h1 class="tresc">${wiersze.map((w) => `<span>${w}</span>`).join('')}</h1>`;
const stopa = (wezwanie) => `
  <div class="tresc wezwanie"><p>${wezwanie}</p><p class="adres">poznanwdanych.pl/migracje</p></div>
  <svg class="strzalka" viewBox="0 0 40 24" aria-hidden="true"><path d="M4 4 L20 19 L36 4" fill="none" stroke="${K.akcent}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>
  <div class="miejsce">TU NAKLEJKA Z LINKIEM</div>
  <div class="tresc zrodlo">Dane GUS: zmiany zameldowania na pobyt stały, ${ZAKRES}<br>Nie obejmują osób mieszkających bez meldunku</div>`;

const wiekMax = Math.max(...wiek.flatMap((w) => [w.wyj, w.przyj]));
const SALDO_WYS = 262, saldoMax = Math.max(...salda.map((s) => -s.v)), kol = 904 / salda.length;

const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><style>
${fontyCss()}
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
.odst { display: inline-block; width: .2em; }
.zn { display: inline-block; width: .62em; height: .62em; margin-right: .32em; border-radius: 3px; vertical-align: .02em; }
.stat { position: absolute; top: 1104px; width: 440px; border-top: 2px solid ${K.linia}; padding-top: 16px; }
.stat b { display: block; font-family: 'IBM Plex Mono'; font-weight: 600; font-size: 60px; letter-spacing: -.03em; line-height: 1.05; white-space: nowrap; }
.stat span { display: block; margin-top: 4px; font-size: 28px; line-height: 1.2; color: ${K.tekst2}; }

/* A: mapa kierunków */
#a-mapa { top: 636px; height: ${MAPA_WYS}px; border-radius: 10px; overflow: hidden; background: ${K.pole}; }
#a-mapa svg { display: block; width: ${MAPA_SZER}px; height: ${MAPA_WYS}px; }
#a-mapa text { font-family: 'IBM Plex Mono'; paint-order: stroke; stroke: ${K.pole}; stroke-linejoin: round; }
#a-licznik { top: 1128px; display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 30px; }
#a-liczba { font-family: 'IBM Plex Mono'; font-weight: 600; font-size: 118px; line-height: 1; letter-spacing: -.06em; color: ${K.zloto}; white-space: nowrap; }
#a-licznik p { font-size: 32px; line-height: 1.22; color: ${K.tekst2}; }
#a-licznik p strong { color: ${K.tekst}; font-weight: 600; }

/* B: sześć kierunków */
#b-wiersze { top: 548px; }
.b-w { display: grid; grid-template-columns: 58px 1fr 196px; align-items: center; column-gap: 8px; height: 100px; border-top: 2px solid ${K.linia}; }
.b-w:last-child { border-bottom: 2px solid ${K.linia}; }
.b-w .nr { font-family: 'IBM Plex Mono'; font-size: 30px; color: ${K.tekst3}; }
.b-w strong { display: block; font-size: 40px; font-weight: 600; letter-spacing: -.015em; line-height: 1.1; white-space: nowrap; }
.b-w .tor { display: block; height: 12px; margin-top: 12px; background: ${K.linia}; border-radius: 3px; overflow: hidden; }
.b-w .tor i { display: block; height: 100%; width: 0; background: ${K.zloto}; border-radius: 3px; }
.b-w b { font-family: 'IBM Plex Mono'; font-weight: 600; font-size: 58px; letter-spacing: -.04em; text-align: right; line-height: 1; }
#b-pod { top: 1168px; font-size: 33px; line-height: 1.28; color: ${K.tekst2}; }
#b-pod strong { color: ${K.tekst}; font-weight: 600; }

/* C: wiek */
#c-leg { top: 628px; display: flex; justify-content: space-between; font-size: 27px; font-weight: 600; }
#c-wykres { top: 672px; height: ${WIEK_WYS}px; }
#c-wykres svg { display: block; width: 904px; height: ${WIEK_WYS}px; }
#c-wykres text { font-family: 'IBM Plex Mono'; font-size: 19px; fill: ${K.tekst3}; }
.c-wn { font-size: 33px; line-height: 1.2; font-weight: 600; white-space: nowrap; }
.c-wn small { font-size: 1em; font-weight: 400; color: ${K.tekst2}; }
#c-w1 { top: 1144px; } #c-w2 { top: 1200px; }

/* D: saldo rok po roku */
#d-wykres { top: 642px; height: ${SALDO_WYS + 120}px; }
#d-wykres svg { display: block; width: 904px; height: ${SALDO_WYS + 120}px; overflow: visible; }
#d-wykres text { font-family: 'IBM Plex Mono'; font-size: 24px; fill: ${K.tekst3}; }
#d-wykres text.wart { font-size: 30px; font-weight: 600; fill: ${K.tekst}; }
#d-wn { top: 1010px; font-size: 34px; line-height: 1.2; font-weight: 600; white-space: nowrap; }
#d-st1 { left: 88px; top: 1084px; } #d-st2 { left: 552px; top: 1084px; }
</style></head><body>
<div class="pas"></div>

<section class="plansza" id="s-A">
  ${glowa(`MIGRACJE · ${ZAKRES}`, ['Dokąd wyprowadzają', 'się poznaniacy?'])}
  <div class="tresc" id="a-mapa"><svg viewBox="${minX.toFixed(1)} ${minY.toFixed(1)} ${(maxX - minX).toFixed(1)} ${(maxY - minY).toFixed(1)}" aria-hidden="true">
    <g id="a-gminy">${M.map.gm.map((g) => `<path d="${g.d}" fill="${g.c === '306401' ? mieszaj(K.tekst2, K.pole, 0.42) : wypelnienie(wartoscGminy[g.c] ?? 0)}" stroke="${K.pole}" stroke-width="${j(1.6)}"/>`).join('')}
      ${M.map.pow.filter((p) => p.c === '3021').map((p) => `<path d="${p.d}" fill="none" stroke="${K.tekst}" stroke-opacity=".7" stroke-width="${j(2.2)}" stroke-dasharray="${j(9)} ${j(7)}"/>`).join('')}</g>
    <g id="a-luki">${luki.map((a) => { const d = `M${a.x1} ${a.y1}Q${a.cx.toFixed(1)} ${a.cy.toFixed(1)} ${a.x2} ${a.y2}`; return `<g data-k="${a.kolejnosc}"><path d="${d}" fill="none" stroke="${K.pole}" stroke-width="${(a.w + j(5)).toFixed(3)}" stroke-linecap="round" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1"/><path d="${d}" fill="none" stroke="${K.zloto}" stroke-width="${a.w}" stroke-linecap="round" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1"/><circle cx="${a.x2}" cy="${a.y2}" r="0" data-r="${(a.w * 0.5 + j(5)).toFixed(3)}" fill="${K.zloto}" stroke="${K.pole}" stroke-width="${j(2.5)}"/></g>`; }).join('')}</g>
    <g id="a-czastki"></g>
    <circle cx="${px0}" cy="${py0}" r="${j(9)}" fill="${K.tekst}" stroke="${K.pole}" stroke-width="${j(3.5)}"/>
    <g id="a-etykiety">${etykiety.map((e) => `<g data-k="${e.kolejnosc}"><text x="${e.x}" y="${e.y}" text-anchor="${e.kotwica}" font-size="${j(25)}" font-weight="600" stroke-width="${j(7)}" fill="${K.tekst}">${e.n}</text><text x="${e.x}" y="${(e.y + j(27)).toFixed(1)}" text-anchor="${e.kotwica}" font-size="${j(23)}" stroke-width="${j(7)}" fill="${K.tekst2}">${e.v}</text></g>`).join('')}</g>
  </svg></div>
  <div class="tresc" id="a-licznik"><span id="a-liczba">0</span><p><strong>wymeldowań z Poznania</strong> do innych gmin w latach ${ZAKRES}. Zameldowań: ${pl(zameldowania)}.</p></div>
  ${stopa('Sprawdź swoją gminę na mapie')}
</section>

<section class="plansza" id="s-B">
  ${glowa(`WYPROWADZKI Z POZNANIA · ${ZAKRES}`, ['Sześć gmin', 'pod Poznaniem'])}
  <div class="tresc" id="b-pod0" style="top:624px;font-size:33px;line-height:1.28;color:${K.tekst2}">Tu poznaniacy meldowali się najczęściej.</div>
  <div class="tresc" id="b-wiersze" style="top:694px">${top6.map((k, i) => `
    <div class="b-w" style="height:76px"><span class="nr">${i + 1}.</span><div><strong style="font-size:34px">${k.n}</strong><span class="tor" style="margin-top:8px;height:10px"><i></i></span></div><b style="font-size:50px">0</b></div>`).join('')}
  </div>
  <div class="tresc" id="b-pod"><strong>${udzialPowiatu}% wyprowadzek</strong> kończy się w powiecie poznańskim — tuż za granicą miasta.</div>
  ${stopa(`Zobacz wszystkie ${Object.keys(F).length} kierunków`)}
</section>

<section class="plansza" id="s-C">
  ${glowa(`WIEK · ${ZAKRES}`, ['Kto wyjeżdża,', 'a kto przyjeżdża?'])}
  <div class="tresc" id="c-leg"><span><i class="zn" style="background:${K.zloto}"></i>wyprowadzki z Poznania</span><span><i class="zn" style="background:${K.blekit}"></i>przeprowadzki do Poznania</span></div>
  <div class="tresc" id="c-wykres"><svg viewBox="0 0 904 ${WIEK_WYS}" aria-hidden="true">${wiek.map((w, i) => {
    const y = (wiek.length - 1 - i) * WIEK_W, maxSz = WIEK_SRODEK - WIEK_OS / 2 - 4;
    return `<g data-i="${i}"><rect class="l" x="${WIEK_SRODEK - WIEK_OS / 2}" y="${y + 2}" width="0" height="${WIEK_W - 5}" rx="3" fill="${K.zloto}" data-s="${((w.wyj / wiekMax) * maxSz).toFixed(1)}"/><rect class="p" x="${WIEK_SRODEK + WIEK_OS / 2}" y="${y + 2}" width="0" height="${WIEK_W - 5}" rx="3" fill="${K.blekit}" data-s="${((w.przyj / wiekMax) * maxSz).toFixed(1)}"/><text x="${WIEK_SRODEK}" y="${y + 19}" text-anchor="middle">${w.etykieta.replace('-', '–')}</text></g>`;
  }).join('')}</svg></div>
  <div class="tresc c-wn" id="c-w1"><i class="zn" style="background:${K.zloto}"></i>${procDzieci}% wyjeżdżających to dzieci do 14 lat </div>
  <div class="tresc c-wn" id="c-w2"><i class="zn" style="background:${K.blekit}"></i>${procMlodzi}% przyjeżdżających ma 20–29 lat</div>
  ${stopa('Sprawdź wiek w swojej dzielnicy')}
</section>

<section class="plansza" id="s-D">
  ${glowa(`SALDO MIGRACJI · ${ZAKRES}`, ['Ilu mieszkańców', 'traci Poznań?'])}
  <div class="tresc" id="d-wykres"><svg viewBox="0 0 904 ${SALDO_WYS + 120}" aria-hidden="true">
    ${salda.map((s, i) => `<text x="${(i * kol + kol / 2).toFixed(1)}" y="30" text-anchor="middle">${s.rok}</text>`).join('')}
    <line x1="0" x2="904" y1="48" y2="48" stroke="${K.liniaMocna}" stroke-width="2"/>
    <g id="d-slupki">${salda.map((s, i) => `<rect x="${(i * kol + 22).toFixed(1)}" width="${(kol - 44).toFixed(1)}" y="49" height="0" rx="4" fill="${K.zloto}" data-h="${((-s.v / saldoMax) * SALDO_WYS).toFixed(1)}"/>`).join('')}</g>
    <g id="d-wart">${salda.map((s, i) => `<text class="wart" x="${(i * kol + kol / 2).toFixed(1)}" y="${(49 + (-s.v / saldoMax) * SALDO_WYS + 38).toFixed(1)}" text-anchor="middle">${pl(s.v)}</text>`).join('')}</g>
  </svg></div>
  <div class="tresc" id="d-wn">W ${ostatnie.rok} r. strata była najmniejsza od ${Y[0]} r.</div>
  <div class="stat" id="d-st1"><b>${waskie(pl(bilansPowiat))}</b><span>bilans z powiatem poznańskim<br>w latach ${ZAKRES}</span></div>
  <div class="stat" id="d-st2"><b>${waskie(zeZnakiem(bilansReszta))}</b><span>bilans z resztą kraju<br>w latach ${ZAKRES}</span></div>
  ${stopa('Zobacz, skąd przyjeżdżają')}
</section>

<script>window.D = ${JSON.stringify(DANE)};</script>
<script>${readFileSync('social/migracje-relacje.strona.js', 'utf8')}</script>
</body></html>`;
const plikHtml = resolve(`social/migracje-relacje${SUFIKS}.html`);
writeFileSync(plikHtml, html);

await nagraj({
  plikHtml, plansze: wybrane,
  nazwaPliku: (s) => `social/migracje-${s}${SUFIKS}`,
  plikPodgladu: `social/migracje-podglad-naklejki${SUFIKS}.png`,
});
process.exit(0);
