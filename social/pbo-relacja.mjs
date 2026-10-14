// Relacja na Instagram (1080×1920) zapowiadająca podstronę /pbo/.
// Liczby z data/pbo — grafika nie może mówić czego innego niż strona.
// Render przez Chrome bez okna, bo tylko przeglądarka wczyta fonty serwisu
// (Space Grotesk, IBM Plex Mono); generator SVG w etl/og-image.mjs ich nie widzi.
//
// Uruchom z katalogu projektu: node social/pbo-relacja.mjs

import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';

const { meta, pozycje } = JSON.parse(readFileSync('data/pbo/pozycje.json', 'utf8'));
const NIEMOZLIWA = 'realizacja niemożliwa';
const zalegle = pozycje.filter((p) => p.grupa === 'zalegle');
const wToku = zalegle.filter((p) => p.status_miasta !== NIEMOZLIWA);
const lat = Math.max(...wToku.map((p) => p.lat_od_glosowania));
const rokOd = Math.min(...zalegle.map((p) => p.glosowanie_rok));
const rokDo = Math.max(...zalegle.map((p) => p.glosowanie_rok));
const wartosc = wToku.reduce((s, p) => s + (p.kwota_pln || 0), 0);
const mln = (wartosc / 1e6).toLocaleString('pl-PL', { maximumFractionDigits: 1 });

// Fonty osadzone w HTML jako data: URI — odwołanie file:// z pliku HTML przeglądarka
// po cichu ignorowała i całość wychodziła Times New Roman. Bierzemy CSS samego pakietu
// fontsource, bo ma zakresy unicode dla podzbiorów (bez nich polskie znaki z innego kroju).
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
const SG = "'Space Grotesk Variable'";
const PLEX = "'IBM Plex Mono'";

const html = (podglad) => `<!doctype html><html lang="pl"><head><meta charset="utf-8"><style>
${fonty}
* { margin: 0; box-sizing: border-box; }
html, body { width: 1080px; height: 1920px; background: #14161a; overflow: hidden; }
body { position: relative; font-family: ${SG}; color: #f4f4f1; -webkit-font-smoothing: antialiased; }
.pas { position: absolute; inset: 0 0 auto 0; height: 10px; background: #b01327; }
.tresc { position: absolute; left: 88px; right: 88px; }
.marka { top: 262px; display: flex; align-items: center; gap: 18px; font-weight: 700; font-size: 40px; letter-spacing: -.02em; }
.marka svg { width: 46px; height: 46px; }
.nad { top: 372px; font-family: ${PLEX}; font-weight: 600; font-size: 25px; letter-spacing: .14em; color: #e0404f; }
h1 { top: 430px; white-space: nowrap; font-weight: 700; font-size: 90px; line-height: .98; letter-spacing: -.035em; }
/* pion: nagłówek 420–730, liczby 800–1215, wezwanie 1290, naklejka 1460–1610, źródło 1646 */
.liczby { top: 800px; }
.wiersz { display: grid; grid-template-columns: 300px 1fr; align-items: center; gap: 28px;
  padding: 24px 0; border-top: 2px solid #2a2e35; }
.wiersz:last-child { border-bottom: 2px solid #2a2e35; }
.wiersz b { font-family: ${PLEX}; font-weight: 600; font-size: 66px; letter-spacing: -.03em; color: #f4f4f1; white-space: nowrap; line-height: 1; }
.wiersz b small { font-size: .5em; letter-spacing: 0; color: #b3bac4; font-weight: 400; }
.wiersz b.akcent { color: #e0404f; }
.wiersz span { font-size: 31px; line-height: 1.25; color: #b3bac4; }
.wezwanie { top: 1290px; text-align: center; }
.wezwanie p { font-size: 42px; font-weight: 600; letter-spacing: -.01em; }
.wezwanie .adres { margin-top: 10px; font-family: ${PLEX}; font-weight: 600; font-size: 34px; color: #e0404f; }
.strzalka { position: absolute; left: 50%; top: 1408px; width: 40px; height: 24px; margin-left: -20px; }
/* miejsce na naklejkę z linkiem: 1460–1610, w czystej wersji nic tu nie stoi */
.miejsce { position: absolute; left: 190px; right: 190px; top: 1460px; height: 150px;
  border: 3px dashed #e0404f; border-radius: 22px; display: grid; place-items: center;
  font-family: ${PLEX}; font-size: 26px; color: #e0404f; letter-spacing: .06em; }
.zrodlo { top: 1646px; text-align: center; font-family: ${PLEX}; font-size: 19px; line-height: 1.5; color: #7d8590; }
</style></head><body>
<div class="pas"></div>
<div class="tresc marka">
  <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6.5 8.5 L14.3 16 L6.5 23.5" fill="none" stroke="#f4f4f1" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M25.5 8.5 L17.7 16 L25.5 23.5" fill="none" stroke="#b01327" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
  Poznań w danych
</div>
<div class="tresc nad">POZNAŃSKI BUDŻET OBYWATELSKI</div>
<h1 class="tresc">Na co głosowaliśmy,<br>a co wciąż<br>nie powstało</h1>
<div class="tresc liczby">
  <div class="wiersz"><b class="akcent">${wToku.length}</b><span>projektów wybranych w latach <span style="white-space:nowrap">${rokOd}–${rokDo}</span> wciąż nie ukończono</span></div>
  <div class="wiersz"><b>${lat}<small> lat</small></b><span>tyle czekają najstarsze, z głosowania w ${rokOd}&nbsp;r.</span></div>
  <div class="wiersz"><b>${mln}<small> mln zł</small></b><span>planowana wartość zaległych projektów</span></div>
</div>
<div class="tresc wezwanie">
  <p>Sprawdź projekty ze swojej okolicy</p>
  <p class="adres">poznanwdanych.pl/pbo</p>
</div>
<svg class="strzalka" viewBox="0 0 40 24" aria-hidden="true"><path d="M4 4 L20 19 L36 4" fill="none" stroke="#e0404f" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>
${podglad ? '<div class="miejsce">TU NAKLEJKA Z LINKIEM</div>' : ''}
<div class="tresc zrodlo">Dane: tabele „Stan realizacji projektów PBO”, Miasto Poznań<br>stan na ${meta.stan_na}</div>
</body></html>`;

// Najpierw powłoka Chromium z Playwrighta: robi zrzut i kończy pracę. Pełny Chrome
// w trybie bez okna potrafi zapisać zrzut i zawisnąć, więc jest tylko zapasem.
const POWLOKA = join(homedir(), 'Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell');
const CHROME = existsSync(POWLOKA) ? POWLOKA : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profil = mkdtempSync(join(tmpdir(), 'chrome-relacja-'));
for (const [nazwa, podglad] of [['pbo-relacja', false], ['pbo-relacja-podglad', true]]) {
  const plikHtml = resolve(`social/${nazwa}.html`);
  writeFileSync(plikHtml, html(podglad));
  execFileSync(CHROME, [
    ...(CHROME === POWLOKA ? [] : ['--headless=new']), `--user-data-dir=${profil}`, '--hide-scrollbars', '--force-device-scale-factor=1',
    '--window-size=1080,1920', '--virtual-time-budget=3000', '--allow-file-access-from-files',
    `--screenshot=${resolve(`social/${nazwa}.png`)}`, `file://${plikHtml}`,
  ], { stdio: 'ignore', timeout: 60_000, killSignal: 'SIGKILL' });
  console.log(`social/${nazwa}.png`);
}
