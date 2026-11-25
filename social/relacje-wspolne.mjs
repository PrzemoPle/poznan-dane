// Wspólne zaplecze generatorów relacji (1080×1920): paleta serwisu, osadzanie krojów oraz nagrywanie
// klatek z Chrome'a przez protokół DevTools i składanie wideo ffmpeg-iem — bez Puppeteera i Playwrighta.
// Strona z planszami musi udostępniać dwie funkcje: czasTrwania(plansza) i klatka(plansza, t).

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const KL_S = 30;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Kolory z arkusza serwisu (src/styles/global.css). Na jasnym tle akcentem jest czerwień herbu bez
// rozjaśnienia, a serie danych (złoto, błękit) mają ciemniejsze odcienie — tak jak na stronie.
export const MOTYWY = {
  ciemny: { tlo: '#14161a', tekst: '#f4f4f1', tekst2: '#b3bac4', tekst3: '#7d8590', pas: '#b01327', akcent: '#e0404f',
    linia: '#2a2e35', liniaMocna: '#3a4250', pole: '#1b1f26', karta: '#191c22', blekit: '#4f8fc4', zloto: '#d6a850', plan: '#6b7380' },
  jasny: { tlo: '#f4f4f1', tekst: '#14161a', tekst2: '#5b616c', tekst3: '#7a808b', pas: '#b01327', akcent: '#b01327',
    linia: '#dcdbd5', liniaMocna: '#c9c8c1', pole: '#fcfcfa', karta: '#fcfcfa', blekit: '#1f5d8c', zloto: '#a8791d', plan: '#8d939e' },
};

/** Mieszanka dwóch kolorów #rrggbb; udzial = ile pierwszego (0–1). */
export function mieszaj(a, b, udzial) {
  const k = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [k(a), k(b)];
  return `#${x.map((v, i) => Math.round(v * udzial + y[i] * (1 - udzial)).toString(16).padStart(2, '0')).join('')}`;
}

/** Kroje serwisu wpisane w arkusz jako data:URI — strona z planszami nie pobiera niczego z sieci. */
export function fontyCss() {
  const nm = resolve('node_modules');
  const osadz = (plikCss) => {
    const katalog = plikCss.slice(0, plikCss.lastIndexOf('/'));
    return readFileSync(plikCss, 'utf8').replace(/url\((['"]?)(\.\/files\/[^)'"]+)\1\)/g, (_, __, sciezka) => {
      const typ = sciezka.endsWith('.woff2') ? 'font/woff2' : 'font/woff';
      return `url(data:${typ};base64,${readFileSync(join(katalog, sciezka)).toString('base64')})`;
    });
  };
  return [
    `${nm}/@fontsource-variable/space-grotesk/wght.css`,
    `${nm}/@fontsource/ibm-plex-mono/400.css`,
    `${nm}/@fontsource/ibm-plex-mono/600.css`,
  ].map(osadz).join('\n');
}

/**
 * Nagrywa plansze: dla każdej wideo MP4 (H.264, 30 kl./s, 1,5 s postoju na końcu) i grafikę PNG
 * z ostatniej klatki; na koniec podgląd pierwszej planszy z zaznaczonym miejscem na naklejkę.
 */
export async function nagraj({ plikHtml, plansze, nazwaPliku, plikPodgladu }) {
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
    const proba = 'Zażółć gęślą jaźń 0123456789 mld zł −+%';
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

  for (const s of plansze) {
    const trwa = await js(`czasTrwania('${s}')`);
    const klatek = Math.round(trwa * KL_S);
    const kat = mkdtempSync(join(tmpdir(), `relacja-${s}-`));
    for (let i = 0; i < klatek; i++) {
      await js(`klatka('${s}', ${(i / KL_S).toFixed(4)})`);
      await zrzut(join(kat, `k${String(i).padStart(4, '0')}.png`));
    }
    // ostatnia klatka = pełna plansza; z niej grafika statyczna, a w wideo jeszcze 1,5 s postoju
    await js(`klatka('${s}', ${trwa})`);
    const nazwa = nazwaPliku(s);
    await zrzut(`${nazwa}.png`);
    writeFileSync(join(kat, `k${String(klatek).padStart(4, '0')}.png`), readFileSync(`${nazwa}.png`));
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(KL_S), '-i', join(kat, 'k%04d.png'),
      '-vf', 'tpad=stop_mode=clone:stop_duration=1.5,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17',
      '-profile:v', 'high', '-r', String(KL_S), '-movflags', '+faststart', `${nazwa}.mp4`]);
    rmSync(kat, { recursive: true, force: true });
    console.log(`${nazwa}.mp4 (${(trwa + 1.5).toFixed(1)} s, ${klatek + 1} klatek) + ${nazwa}.png`);
  }
  // podgląd z zaznaczonym miejscem na naklejkę — tylko do orientacji, nie do publikacji
  await js(`document.body.classList.add('podglad'), klatka('${plansze[0]}', czasTrwania('${plansze[0]}'))`);
  await zrzut(plikPodgladu);
  console.log(plikPodgladu);
  await cdp('Browser.close').catch(() => {});
  ws.close();
  sprzatnij();
}
