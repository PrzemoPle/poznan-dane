// Generuje kartę podglądu (Open Graph) do public/og.png — 1200×630.
// Liczby bierze z gotowych agregatów, więc karta nie kłamie po odświeżeniu danych.
// sharp jest już w drzewie zależności Astro, nic nie doinstalowujemy.
//
// Uruchom: node etl/og-image.mjs   (albo `npm run etl:og`)

import sharp from 'sharp';
import { loadJSON, log } from './lib.mjs';

const SZER = 1200;
const WYS = 630;

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const pl = (n, m = 0) => n.toLocaleString('pl-PL', { maximumFractionDigits: m, minimumFractionDigits: m });

async function main() {
  const pod = await loadJSON('public/dane/podsumowanie.json');
  const bdl = await loadJSON('public/dane/bdl.json');
  if (!pod || !bdl) throw new Error('brak public/dane — uruchom najpierw npm run etl:build');

  const w = bdl.miasta.poznan.wskazniki;
  const lataBud = Object.keys(w.dochodyOgolem.wartosci).sort();
  const ostatni = lataBud[lataBud.length - 1];

  const kafle = [
    { etykieta: 'UMÓW W REJESTRZE', wartosc: pl(pod.umowy.liczba) },
    { etykieta: `BUDŻET ${ostatni}`, wartosc: `${pl(w.dochodyOgolem.wartosci[ostatni] / 1e9, 2)} mld zł` },
    { etykieta: 'WSKAŹNIKÓW', wartosc: pl(pod.badam.tematy.reduce((s, t) => s + t.pozycji, 0) + pod.bdl.wskazniki.length) },
  ];

  // Przebieg dochodów jako delikatna linia w tle — ten sam motyw co na stronie.
  const punkty = lataBud.map((r) => w.dochodyOgolem.wartosci[r]);
  const maks = Math.max(...punkty);
  const sciezka = punkty
    .map((v, i) => {
      const x = 70 + (i / (punkty.length - 1)) * (SZER - 140);
      // dolny pas, pod kaflami — linia ma być tłem, nie przeszkodą w czytaniu liczb
      const y = WYS - 26 - (v / maks) * 78;
      return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SZER}" height="${WYS}" viewBox="0 0 ${SZER} ${WYS}">
  <rect width="${SZER}" height="${WYS}" fill="#14161a"/>
  <rect width="${SZER}" height="6" fill="#b01327"/>
  <path d="${sciezka}" fill="none" stroke="#b01327" stroke-width="3" stroke-opacity="0.5"
        stroke-linejoin="round" stroke-linecap="round"/>
  <g transform="translate(70,96)">
    <path d="M0 0 L18 17 L0 34" fill="none" stroke="#f4f4f1" stroke-width="7"
          stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M46 0 L28 17 L46 34" fill="none" stroke="#b01327" stroke-width="7"
          stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <text x="136" y="130" fill="#f4f4f1" font-family="Helvetica,Arial,sans-serif"
        font-size="38" font-weight="700" letter-spacing="-1">Poznań w danych</text>
  <text x="70" y="250" fill="#f4f4f1" font-family="Helvetica,Arial,sans-serif"
        font-size="72" font-weight="700" letter-spacing="-2.5">Rejestr umów, budżet</text>
  <text x="70" y="330" fill="#f4f4f1" font-family="Helvetica,Arial,sans-serif"
        font-size="72" font-weight="700" letter-spacing="-2.5">i statystyki miasta</text>
  <text x="70" y="390" fill="#99a1ad" font-family="Helvetica,Arial,sans-serif" font-size="27">
    Dane publiczne z oficjalnych źródeł, z linkiem do każdego rekordu
  </text>
  ${kafle.map((k, i) => `
  <g transform="translate(${70 + i * 360},450)">
    <text x="0" y="0" fill="#6b7380" font-family="Courier,monospace" font-size="17"
          font-weight="700" letter-spacing="2.2">${esc(k.etykieta)}</text>
    <text x="0" y="52" fill="#f4f4f1" font-family="Courier,monospace" font-size="46"
          font-weight="700">${esc(k.wartosc)}</text>
  </g>`).join('')}
</svg>`;

  await sharp(Buffer.from(svg)).png().toFile('public/og.png');
  log(`Zapisano public/og.png (${SZER}×${WYS}) — ${kafle.map((k) => k.wartosc).join(' · ')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
