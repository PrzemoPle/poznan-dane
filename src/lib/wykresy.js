// Minimalna biblioteka wykresów SVG — bez zależności zewnętrznych.
// Wszystkie funkcje zwracają element <svg> gotowy do wstawienia w DOM.

const NS = 'http://www.w3.org/2000/svg';

export const PALETA = ['#b4132c', '#1f5d8c', '#a8791d', '#1f6b4f', '#6b3fa0', '#0f7c8a'];

export const fmt = {
  liczba: (n, frac = 0) =>
    n == null || Number.isNaN(n) ? '—' : n.toLocaleString('pl-PL', { maximumFractionDigits: frac, minimumFractionDigits: frac }),
  zl: (n) => (n == null ? '—' : `${fmt.liczba(n, n < 100 ? 2 : 0)} zł`),
  /** Duże kwoty w skrócie: 6,66 mld zł */
  kwota: (n) => {
    if (n == null || Number.isNaN(n)) return '—';
    const a = Math.abs(n);
    if (a >= 1e9) return `${fmt.liczba(n / 1e9, 2)} mld zł`;
    if (a >= 1e6) return `${fmt.liczba(n / 1e6, 1)} mln zł`;
    if (a >= 1e3) return `${fmt.liczba(n, 0)} zł`;
    return `${fmt.liczba(n, 2)} zł`;
  },
  skrot: (n) => {
    if (n == null || Number.isNaN(n)) return '—';
    const a = Math.abs(n);
    if (a >= 1e9) return `${fmt.liczba(n / 1e9, 1)} mld`;
    if (a >= 1e6) return `${fmt.liczba(n / 1e6, 1)} mln`;
    if (a >= 1e3) return `${fmt.liczba(n / 1e3, 0)} tys.`;
    return fmt.liczba(n, a < 10 ? 1 : 0);
  },
  data: (s) => (s ? s.split('-').reverse().join('.') : '—'),
  /**
   * Polska odmiana przez liczbę: formy = [pojedyncza, mnoga, dopełniaczowa].
   * ['osoba','osoby','osób'] → 1 osoba, 2 osoby, 5 osób, 22 osoby, 112 osób.
   */
  odmien: (n, [jedna, kilka, wiele]) => {
    const c = Math.abs(Math.round(n));
    if (c === 1) return jedna;
    const ost = c % 10;
    const dwie = c % 100;
    return ost >= 2 && ost <= 4 && !(dwie >= 12 && dwie <= 14) ? kilka : wiele;
  },
  /** Odmiana „rok" po polsku: 1 rok, 2 lata, 5 lat, 22 lata, 25 lat. */
  lata: (dni) => {
    const n = Math.round(dni / 365.25);
    return `${n} ${fmt.odmien(n, ['rok', 'lata', 'lat'])}`;
  },
  proc: (n, frac = 1) => (n == null ? '—' : `${fmt.liczba(n, frac)}%`),
};

function el(nazwa, atrybuty = {}, tekst) {
  const e = document.createElementNS(NS, nazwa);
  for (const [k, v] of Object.entries(atrybuty)) if (v != null) e.setAttribute(k, v);
  if (tekst != null) e.textContent = tekst;
  return e;
}

function skala(min, max, dlugosc) {
  const zakres = max - min || 1;
  return (v) => ((v - min) / zakres) * dlugosc;
}

/**
 * Co która etykieta osi X ma się pojawić, żeby podpisy się nie zderzały.
 * Liczy się dostępna szerokość, a nie liczba punktów: te same 31 lat mieści się
 * na desktopie, a na telefonie nachodzi na siebie.
 */
function krokEtykiet(etykiety, szerokoscOsi, rozmiarPisma = 11) {
  const najdluzsza = Math.max(...etykiety.map((e) => String(e).length), 1);
  const szerokoscEtykiety = najdluzsza * rozmiarPisma * 0.62 + 14; // 0.62 ≈ średnia szerokość znaku
  const zmiesci = Math.max(2, Math.floor(szerokoscOsi / szerokoscEtykiety));
  return Math.max(1, Math.ceil(etykiety.length / zmiesci));
}

/** Ładne wartości osi: 0, 2 mln, 4 mln… */
function podzialka(min, max, ile = 5) {
  const zakres = max - min || 1;
  const krokSurowy = zakres / ile;
  const rzad = 10 ** Math.floor(Math.log10(krokSurowy));
  const krok = [1, 2, 2.5, 5, 10].map((m) => m * rzad).find((k) => k >= krokSurowy) ?? rzad * 10;
  const start = Math.ceil(min / krok) * krok;
  const out = [];
  for (let v = start; v <= max + krok * 0.001; v += krok) out.push(Number(v.toFixed(10)));
  return out;
}

/**
 * Wykres liniowy szeregów czasowych.
 * serie: [{ nazwa, punkty: [[etykietaX, wartość], …], kolor? }]
 */
export function liniowy(serie, { wysokosc = 260, szerokosc = 900, formatY = fmt.skrot, zeroBaseline = true, kropki = true } = {}) {
  // szerokość dobieramy do realnej szerokości kontenera, żeby viewBox był 1:1
  // i podpisy renderowały się w zadeklarowanym rozmiarze, a nie skalowane w dół
  const svg = el('svg', { class: 'wykres', viewBox: `0 0 ${szerokosc} ${wysokosc}`, role: 'img' });
  const M = { g: 14, p: 58, d: 30, l: 8 };
  const W = szerokosc - M.p - M.l;
  const H = wysokosc - M.g - M.d;

  const wszystkieX = [...new Set(serie.flatMap((s) => s.punkty.map((p) => String(p[0]))))].sort();
  const wartosci = serie.flatMap((s) => s.punkty.map((p) => p[1])).filter((v) => v != null);
  if (!wszystkieX.length || !wartosci.length) {
    svg.append(el('text', { x: szerokosc / 2, y: wysokosc / 2, 'text-anchor': 'middle', 'font-size': 13 }, 'Brak danych'));
    return svg;
  }

  let min = Math.min(...wartosci);
  let max = Math.max(...wartosci);
  if (zeroBaseline && min > 0) min = 0;
  if (min === max) { min -= 1; max += 1; }
  const margines = (max - min) * 0.08;
  max += margines;
  if (!zeroBaseline || min < 0) min -= margines;

  const sx = (etykieta) => M.p + (wszystkieX.indexOf(String(etykieta)) / Math.max(1, wszystkieX.length - 1)) * W;
  const sy = skala(min, max, H);
  const y = (v) => M.g + H - sy(v);

  // siatka pozioma + oś Y
  for (const t of podzialka(min, max)) {
    svg.append(el('line', { x1: M.p, x2: M.p + W, y1: y(t), y2: y(t), stroke: 'currentColor', 'stroke-opacity': t === 0 ? 0.35 : 0.12 }));
    svg.append(el('text', { x: M.p - 8, y: y(t) + 4, 'text-anchor': 'end', 'font-size': 11 }, formatY(t)));
  }

  // oś X — co n-ta etykieta, dobierane do dostępnej szerokości.
  // Ostatni rok pokazujemy zawsze, ale tylko jeśli nie wpadnie na poprzedni podpis.
  const co = krokEtykiet(wszystkieX, W);
  const ostatni = wszystkieX.length - 1;
  let poprzedni = -Infinity;
  wszystkieX.forEach((etykieta, i) => {
    const zKroku = i % co === 0;
    const wymuszony = i === ostatni && ostatni - poprzedni >= co * 0.6;
    if (!zKroku && !wymuszony) return;
    if (i === ostatni && !wymuszony) return;
    poprzedni = i;
    svg.append(el('text', { x: sx(etykieta), y: wysokosc - 8, 'text-anchor': 'middle', 'font-size': 11 }, etykieta));
  });

  serie.forEach((s, i) => {
    const kolor = s.kolor ?? PALETA[i % PALETA.length];
    const punkty = s.punkty.filter((p) => p[1] != null).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    if (!punkty.length) return;
    const d = punkty.map((p, j) => `${j ? 'L' : 'M'}${sx(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ');
    // class="linia" + pathLength=1 — CSS rysuje linię przez stroke-dashoffset
    svg.append(el('path', {
      d, class: 'linia', pathLength: 1, fill: 'none', stroke: kolor,
      'stroke-width': 2.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
      style: `animation-delay:${(i * 0.12).toFixed(2)}s`,
    }));
    if (!kropki) return;
    punkty.forEach((p, j) => {
      const kropka = el('circle', {
        cx: sx(p[0]), cy: y(p[1]), r: 3.2, fill: kolor, class: 'kropka',
        style: `--i:${j + i * 4}`,
      });
      kropka.append(el('title', {}, `${s.nazwa} · ${p[0]}: ${formatY(p[1])}`));
      svg.append(kropka);
    });
  });

  return svg;
}

/** Pionowe słupki: dane = [[etykieta, wartość], …] */
export function slupkowy(dane, {
  wysokosc = 240, szerokosc = 900, formatY = fmt.skrot,
  kolor = PALETA[0], kolorUjemny = '#1f5d8c',
} = {}) {
  // szerokość dobieramy do kontenera — inaczej podpisy osi kurczą się razem z rysunkiem
  const svg = el('svg', { class: 'wykres', viewBox: `0 0 ${szerokosc} ${wysokosc}`, role: 'img' });
  const M = { g: 14, p: 58, d: 30, l: 8 };
  const W = szerokosc - M.p - M.l;
  const H = wysokosc - M.g - M.d;
  if (!dane.length) return svg;

  const wartosci = dane.map((d) => d[1]);
  let min = Math.min(0, ...wartosci);
  let max = Math.max(0, ...wartosci) * 1.08;
  if (min === max) max = min + 1;
  const sy = skala(min, max, H);
  const y = (v) => M.g + H - sy(v);
  const szer = (W / dane.length) * 0.68;

  for (const t of podzialka(min, max)) {
    svg.append(el('line', { x1: M.p, x2: M.p + W, y1: y(t), y2: y(t), stroke: 'currentColor', 'stroke-opacity': t === 0 ? 0.35 : 0.12 }));
    svg.append(el('text', { x: M.p - 8, y: y(t) + 4, 'text-anchor': 'end', 'font-size': 11 }, formatY(t)));
  }

  const co = krokEtykiet(dane.map((d) => d[0]), W);
  dane.forEach(([etykieta, v], i) => {
    const cx = M.p + (i + 0.5) * (W / dane.length);
    const gora = v >= 0 ? y(v) : y(0);
    const wys = Math.abs(y(v) - y(0));
    const slupek = el('rect', {
      x: cx - szer / 2, y: gora, width: szer, height: Math.max(1, wys),
      fill: v >= 0 ? kolor : kolorUjemny, rx: 1,
      class: v >= 0 ? 's-dodatni' : 's-ujemny',
      style: `--i:${i}`,
    });
    slupek.append(el('title', {}, `${etykieta}: ${formatY(v)}`));
    svg.append(slupek);
    if (!(i % co) || i === dane.length - 1) {
      svg.append(el('text', { x: cx, y: wysokosc - 8, 'text-anchor': 'middle', 'font-size': 11 }, etykieta));
    }
  });

  return svg;
}

/**
 * Ranking poziomy: dane = [{ nazwa, wartosc }].
 *
 * Świadomie NIE jest to SVG. To lista z proporcjonalnymi paskami, a nie wykres —
 * a w SVG tekst skaluje się razem z rysunkiem, więc przy wąskim kontenerze etykiety
 * schodziły do 4 px. W HTML-u tekst ma rozmiar dziedziczony ze strony, zawija się,
 * da się go zaznaczyć i nie trzeba ucinać nazw.
 */
export function ranking(dane, { formatW = fmt.kwota, kolor = PALETA[0] } = {}) {
  const lista = document.createElement('ol');
  lista.className = 'ranking';
  const max = Math.max(...dane.map((d) => d.wartosc), 1);

  dane.forEach((d, i) => {
    const wiersz = document.createElement('li');
    wiersz.style.setProperty('--i', i);

    const nazwa = document.createElement('span');
    nazwa.className = 'r-nazwa';
    nazwa.textContent = d.nazwa;

    const pasek = document.createElement('span');
    pasek.className = 'r-pasek';
    const wypelnienie = document.createElement('i');
    wypelnienie.style.width = `${Math.max(1.5, (d.wartosc / max) * 100)}%`;
    wypelnienie.style.background = kolor;
    pasek.append(wypelnienie);

    const wartosc = document.createElement('span');
    wartosc.className = 'r-wartosc';
    wartosc.textContent = formatW(d.wartosc);

    wiersz.append(nazwa, pasek, wartosc);
    lista.append(wiersz);
  });

  return lista;
}

/** Struktura udziałów jako pasek skumulowany. */
export function struktura(dane, { formatW = fmt.kwota } = {}) {
  const suma = dane.reduce((s, d) => s + d.wartosc, 0) || 1;
  const box = document.createElement('div');
  const pasek = document.createElement('div');
  pasek.style.cssText = 'display:flex;height:26px;border-radius:3px;overflow:hidden;border:1px solid var(--linia)';
  const legenda = document.createElement('div');
  legenda.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px 18px;margin-top:12px;font-size:.82rem';

  dane.forEach((d, i) => {
    const udzial = (d.wartosc / suma) * 100;
    const kolor = PALETA[i % PALETA.length];
    const seg = document.createElement('div');
    seg.style.cssText = `width:${udzial}%;background:${kolor}`;
    seg.title = `${d.nazwa}: ${formatW(d.wartosc)} (${fmt.liczba(udzial, 1)}%)`;
    pasek.append(seg);

    const wpis = document.createElement('span');
    wpis.style.cssText = 'display:inline-flex;align-items:center;gap:6px';
    wpis.innerHTML = `<i style="width:10px;height:10px;border-radius:2px;background:${kolor};display:inline-block"></i>
      <span>${d.nazwa} <strong>${fmt.liczba(udzial, 1)}%</strong> <span style="color:var(--tekst-3)">${formatW(d.wartosc)}</span></span>`;
    legenda.append(wpis);
  });

  box.append(pasek, legenda);
  return box;
}

/** Legenda dla wykresu liniowego. */
export function legenda(serie) {
  const box = document.createElement('div');
  box.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px 18px;margin-top:10px;font-size:.82rem';
  serie.forEach((s, i) => {
    const kolor = s.kolor ?? PALETA[i % PALETA.length];
    const w = document.createElement('span');
    w.style.cssText = 'display:inline-flex;align-items:center;gap:6px';
    w.innerHTML = `<i style="width:14px;height:3px;border-radius:2px;background:${kolor};display:inline-block"></i>${s.nazwa}`;
    box.append(w);
  });
  return box;
}

/**
 * Wstawia wykres do kontenera.
 *
 * Przyjmuje albo gotowy węzeł, albo funkcję `(szerokosc) => węzeł`. W drugim wariancie
 * mierzy kontener i podaje jego rzeczywistą szerokość — dzięki temu viewBox może być
 * budowany 1:1 i podpisy renderują się w zadeklarowanym rozmiarze, zamiast kurczyć się
 * razem z rysunkiem. Przy zmianie szerokości okna wykres jest przerysowywany.
 */
export function podmien(selektor, cos) {
  const cel = typeof selektor === 'string' ? document.querySelector(selektor) : selektor;
  if (!cel) return;

  if (typeof cos !== 'function') {
    cel.replaceChildren(cos);
    return;
  }

  let ostatniaSzerokosc = 0;
  const przerysuj = () => {
    const szerokosc = Math.round(cel.clientWidth);
    // próg 8 px chroni przed przerysowywaniem w kółko przy drobnych drganiach układu
    if (!szerokosc || Math.abs(szerokosc - ostatniaSzerokosc) < 8) return;
    ostatniaSzerokosc = szerokosc;
    cel.replaceChildren(cos(szerokosc));
  };

  przerysuj();

  if (typeof ResizeObserver === 'function') {
    let timer;
    new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(przerysuj, 150);
    }).observe(cel);
  }
}
