// Animacje relacji „Budżet 2027". Bez przejść CSS: stan każdej klatki liczymy z czasu t (sekundy),
// więc generator może zrobić zrzut dowolnej chwili i wideo wychodzi zawsze takie samo.
const E = (id) => document.getElementById(id);
const clamp = (x) => Math.max(0, Math.min(1, x));
const post = (t, od, ile) => clamp((t - od) / ile);
const wyj = (x) => 1 - Math.pow(1 - x, 3);
const wewy = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const pl = (n, m) => n.toLocaleString('pl-PL', { minimumFractionDigits: m, maximumFractionDigits: m });
const mld = (zl) => pl(zl / 1e9, 2);
function pojaw(el, p, dy) {
  const q = wyj(clamp(p));
  el.style.opacity = q;
  el.style.transform = 'translateY(' + (1 - q) * (dy == null ? 30 : dy) + 'px)';
}
const D = window.D;
const CZAS = { A: 6.5, B: 8.5, C: 9, D: 8.5 };

/** Części wspólne: logo, nadtytuł, wiersze nagłówka i wezwanie na dole. */
function wspolne(s, t, tCTA) {
  const sek = E('s-' + s);
  pojaw(sek.querySelector('.marka'), post(t, 0, 0.35), 0);
  pojaw(sek.querySelector('.nad'), post(t, 0.1, 0.4), 16);
  sek.querySelectorAll('h1 span').forEach((w, i) => pojaw(w, post(t, 0.22 + i * 0.13, 0.5), 40));
  pojaw(sek.querySelector('.wezwanie'), post(t, tCTA, 0.5), 24);
  const strz = sek.querySelector('.strzalka');
  const p = post(t, tCTA + 0.3, 0.4);
  strz.style.opacity = wyj(p);
  // strzałka lekko „oddycha", ale na ostatniej klatce wraca na miejsce (ta klatka jest też grafiką statyczną)
  const koniec = CZAS[s];
  const faza = t < koniec - 0.4 ? Math.sin((t - tCTA) * 4.2) * 9 * p : 0;
  strz.style.transform = 'translateY(' + faza + 'px)';
  pojaw(sek.querySelector('.zrodlo'), post(t, tCTA + 0.2, 0.5), 0);
}

// ---------- A: okładka ----------
function klatkaA(t) {
  wspolne('A', t, 4.3);
  const p = wewy(post(t, 0.9, 1.7));
  E('a-liczba').textContent = mld(D.wydatki * p);
  pojaw(E('a-blok'), post(t, 0.8, 0.4), 30);
  pojaw(E('a-pod'), post(t, 2.5, 0.5), 20);
  pojaw(E('a-st1'), post(t, 3.1, 0.5), 24);
  pojaw(E('a-st2'), post(t, 3.5, 0.5), 24);
  // tło: słupki wydatków rok po roku, rosnące od lewej
  E('a-tlo').querySelectorAll('rect').forEach((r, i, w) => {
    const q = wyj(post(t, 0.5 + i * 0.07, 0.9));
    const h = Number(r.dataset.h) * q;
    r.setAttribute('height', h); r.setAttribute('y', 300 - h);
  });
}

// ---------- B: pięć liczb ----------
function klatkaB(t) {
  wspolne('B', t, 6.3);
  document.querySelectorAll('#s-B .wiersz').forEach((w, i) => {
    const start = 0.9 + i * 1.0;
    pojaw(w, post(t, start, 0.45), 34);
    const p = wewy(post(t, start + 0.05, 0.8));
    w.querySelector('b span').textContent = mld(Number(w.dataset.v) * p);
  });
}

// ---------- C: inwestycje nominalnie i po odjęciu inflacji ----------
const C_H = D.wykresWys, C_MAX = D.wykresMax;
function klatkaC(t) {
  wspolne('C', t, 7.0);
  const m = wewy(post(t, 4.3, 1.2));            // 0 = w złotych, 1 = w cenach z 2027 r.
  pojaw(E('c-wykres'), post(t, 0.7, 0.4), 0);
  E('c-slupki').querySelectorAll('rect').forEach((r, i) => {
    const d = D.inwestycje[i];
    const wzrost = wyj(post(t, 0.9 + i * 0.07, 0.8));
    const v = (d.nom + (d.real - d.nom) * m) * wzrost;
    const h = (v / C_MAX) * C_H;
    r.setAttribute('height', h); r.setAttribute('y', C_H - h);
    // po przełączeniu wyróżniamy lata, w których realnie wydano więcej niż w projekcie 2027
    const wiecej = d.rok < 2027 && d.real > D.inwestycje[D.inwestycje.length - 1].real;
    r.setAttribute('fill', d.rodzaj === 'projekt' ? '#e0404f' : d.rodzaj === 'plan' ? '#6b7380' : (wiecej && m > 0.5 ? '#f4f4f1' : '#4f8fc4'));
  });
  const prz = E('c-przelacznik');
  pojaw(prz, post(t, 0.8, 0.4), 0);
  // suwak: przycinamy jasną kopię napisów do pigułki zajmującej połowę przełącznika
  const szer = prz.clientWidth, pol = szer / 2, lewa = 4 + m * (pol - 4);
  prz.querySelector('.galka').style.clipPath = 'inset(4px ' + (szer - lewa - (pol - 4)) + 'px 4px ' + lewa + 'px round 999px)';
  // podpisy nad słupkami
  const e27 = E('c-e27'), e11 = E('c-e11');
  e27.style.opacity = wyj(post(t, 2.6, 0.4));
  e11.style.opacity = wyj(post(t, 5.4, 0.4));
  const d11 = D.inwestycje.find((x) => x.rok === D.szczytRok);
  e11.setAttribute('y', C_H - ((d11.nom + (d11.real - d11.nom) * m) / C_MAX) * C_H - 14);
  // wniosek pod wykresem: najpierw „rekord", potem korekta
  const w1 = E('c-w1'), w2 = E('c-w2');
  const a = post(t, 2.7, 0.5), b = post(t, 5.5, 0.5);
  w1.style.opacity = wyj(a) * (1 - wyj(post(t, 4.3, 0.5)));
  w1.style.transform = 'translateY(' + (1 - wyj(a)) * 20 + 'px)';
  pojaw(w2, b, 20);
}

// ---------- D: wyszukiwarka ----------
function klatkaD(t) {
  wspolne('D', t, 6.6);
  pojaw(E('d-pod'), post(t, 0.7, 0.4), 16);
  pojaw(E('d-pole'), post(t, 0.8, 0.4), 20);
  const okna = [[1.2, 2.9], [3.0, 4.6], [4.7, 6.2]];       // [początek pisania, czyszczenie]
  let tekst = '', pisze = false;
  D.przyklady.forEach((x, i) => {
    const [od, doK] = okna[i];
    const dl = x.fraza.length, czasPisania = Math.min(1.0, dl * 0.075);
    if (t >= od && t < doK) { tekst = x.fraza.slice(0, Math.round(post(t, od, czasPisania) * dl)); pisze = true; }
    pojaw(E('d-k' + i), post(t, od + czasPisania + 0.15, 0.45), 26);
  });
  const pole = E('d-tekst');
  if (t >= 6.2) { pole.textContent = 'Twoja ulica…'; pole.style.color = '#7d8590'; }
  else { pole.textContent = tekst; pole.style.color = '#f4f4f1'; }
  // kursor miga, gdy nikt nie pisze; na końcu zostaje widoczny
  E('d-kursor').style.opacity = t > CZAS.D - 0.4 || pisze || Math.floor(t * 2.2) % 2 === 0 ? 1 : 0;
}

const KLATKI = { A: klatkaA, B: klatkaB, C: klatkaC, D: klatkaD };
window.czasTrwania = (s) => CZAS[s];
window.klatka = (s, t) => {
  for (const k of Object.keys(KLATKI)) E('s-' + k).style.display = k === s ? 'block' : 'none';
  KLATKI[s](t);
  return true;
};
