// Animacje relacji „Migracje". Bez przejść CSS: stan każdej klatki liczymy z czasu t (sekundy),
// więc generator może zrobić zrzut dowolnej chwili i wideo wychodzi zawsze takie samo.
const E = (id) => document.getElementById(id);
const clamp = (x) => Math.max(0, Math.min(1, x));
const post = (t, od, ile) => clamp((t - od) / ile);
const wyj = (x) => 1 - Math.pow(1 - x, 3);
const wewy = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const pl = (n) => Math.round(n).toLocaleString('pl-PL').replace('-', '−');
// duże liczby krojem o stałej szerokości: spację tysięcy zastępuje wąski odstęp (.odst)
const waskie = (n) => pl(n).replace(/[\u00a0\u202f ]/g, '<i class="odst"></i>');
function pojaw(el, p, dy) {
  const q = wyj(clamp(p));
  el.style.opacity = q;
  el.style.transform = 'translateY(' + (1 - q) * (dy == null ? 30 : dy) + 'px)';
}
const D = window.D;
const CZAS = { A: 8, B: 8, C: 9, D: 8.5 };

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
  const faza = t < CZAS[s] - 0.4 ? Math.sin((t - tCTA) * 4.2) * 9 * p : 0;
  strz.style.transform = 'translateY(' + faza + 'px)';
  pojaw(sek.querySelector('.zrodlo'), post(t, tCTA + 0.2, 0.5), 0);
}

// ---------- A: mapa z łukami ----------
// Cząsteczki tworzymy raz; ich położenie zależy tylko od czasu, więc każda klatka jest powtarzalna.
const CZASTKI = [];
(function () {
  const g = E('a-czastki'), maks = Math.max.apply(null, D.luki.map((a) => a.v));
  D.luki.forEach((a) => {
    const ile = Math.max(2, Math.round((a.v / maks) * 9));
    for (let k = 0; k < ile; k++) {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('r', D.czastkaR * (0.8 + (a.v / maks) * 0.7));
      c.setAttribute('fill', D.kolory.tekst);
      g.appendChild(c);
      // przesunięcie fazy i prędkość z numeru cząsteczki — bez losowania, żeby wideo było powtarzalne
      CZASTKI.push({ a, el: c, faza: (k / ile + a.kolejnosc * 0.137) % 1, v: 0.2 + ((a.kolejnosc * 7 + k * 3) % 5) * 0.012 });
    }
  });
})();
const T_LUK = 1.0, ODSTEP = 0.14, RYS = 0.75;
const postepLuku = (a, t) => wyj(post(t, T_LUK + a.kolejnosc * ODSTEP, RYS));
function klatkaA(t) {
  wspolne('A', t, 5.6);
  pojaw(E('a-mapa'), post(t, 0.6, 0.5), 20);
  E('a-luki').querySelectorAll('g').forEach((g) => {
    const a = D.luki.find((x) => x.kolejnosc === Number(g.dataset.k)), p = postepLuku(a, t);
    g.querySelectorAll('path').forEach((sc) => sc.setAttribute('stroke-dashoffset', 1 - p));
    const kropka = g.querySelector('circle');
    kropka.setAttribute('r', Number(kropka.dataset.r) * wyj(post(t, T_LUK + a.kolejnosc * ODSTEP + RYS * 0.8, 0.3)));
  });
  CZASTKI.forEach((c) => {
    const a = c.a, f = (t * c.v + c.faza) % 1, u = 1 - f;
    c.el.setAttribute('cx', u * u * a.x1 + 2 * u * f * a.cx + f * f * a.x2);
    c.el.setAttribute('cy', u * u * a.y1 + 2 * u * f * a.cy + f * f * a.y2);
    // cząsteczka jest widoczna dopiero na narysowanej części łuku; przy końcach łagodnie gaśnie
    c.el.setAttribute('opacity', postepLuku(a, t) >= f ? Math.sin(Math.PI * f) * 0.9 * post(t, T_LUK + a.kolejnosc * ODSTEP + 0.3, 0.4) : 0);
  });
  E('a-etykiety').querySelectorAll('g').forEach((g) => {
    g.setAttribute('opacity', wyj(post(t, T_LUK + Number(g.dataset.k) * ODSTEP + RYS, 0.4)));
  });
  pojaw(E('a-licznik'), post(t, 1.0, 0.45), 26);
  const liczba = E('a-liczba');
  // licznik rośnie, więc rezerwujemy mu szerokość liczby końcowej — inaczej tekst obok skacze przy każdej cyfrze
  if (!liczba.style.minWidth) { liczba.innerHTML = waskie(D.wymeldowania); liczba.style.minWidth = liczba.offsetWidth + 'px'; }
  liczba.innerHTML = waskie(D.wymeldowania * wewy(post(t, 1.1, 2.6)));
}

// ---------- B: sześć kierunków ----------
function klatkaB(t) {
  wspolne('B', t, 5.9);
  pojaw(E('b-pod0'), post(t, 0.7, 0.4), 16);
  const maks = D.top6[0];
  document.querySelectorAll('#s-B .b-w').forEach((w, i) => {
    const start = 1.0 + i * 0.42;
    pojaw(w, post(t, start, 0.4), 30);
    const p = wewy(post(t, start + 0.05, 1.1));
    w.querySelector('.tor i').style.width = (D.top6[i] / maks) * 100 * p + '%';
    w.querySelector('b').textContent = pl(D.top6[i] * p);
  });
  pojaw(E('b-pod'), post(t, 4.6, 0.5), 22);
}

// ---------- C: wiek ----------
function klatkaC(t) {
  wspolne('C', t, 7.0);
  pojaw(E('c-leg'), post(t, 0.7, 0.4), 14);
  const a1 = wyj(post(t, 3.3, 0.5)), a2 = wyj(post(t, 5.1, 0.5));   // wyróżnienie dzieci, potem dwudziestolatków
  E('c-wykres').querySelectorAll('g').forEach((g) => {
    const i = Number(g.dataset.i), wzrost = wyj(post(t, 0.9 + i * 0.07, 0.8));
    const l = g.querySelector('.l'), p = g.querySelector('.p');
    const sl = Number(l.dataset.s) * wzrost, sp = Number(p.dataset.s) * wzrost;
    l.setAttribute('width', sl); l.setAttribute('x', D.wiekLewa - sl);
    p.setAttribute('width', sp);
    l.setAttribute('opacity', D.dzieci.indexOf(i) >= 0 ? 1 : 1 - 0.55 * a1);
    p.setAttribute('opacity', D.dwudziesto.indexOf(i) >= 0 ? 1 : 1 - 0.55 * a2);
    g.querySelector('text').setAttribute('opacity', wzrost);
  });
  pojaw(E('c-w1'), post(t, 3.4, 0.5), 20);
  pojaw(E('c-w2'), post(t, 5.2, 0.5), 20);
}

// ---------- D: saldo rok po roku ----------
function klatkaD(t) {
  wspolne('D', t, 6.5);
  pojaw(E('d-wykres'), post(t, 0.7, 0.4), 0);
  const ost = D.salda.length - 1, wyroznienie = wyj(post(t, 3.6, 0.5));
  const slupki = E('d-slupki').querySelectorAll('rect'), wart = E('d-wart').querySelectorAll('text');
  slupki.forEach((r, i) => {
    const p = wyj(post(t, 0.9 + i * 0.36, 0.7));
    r.setAttribute('height', Number(r.dataset.h) * p);
    r.setAttribute('opacity', i === ost ? 1 : 1 - 0.55 * wyroznienie);
    wart[i].setAttribute('opacity', wyj(post(t, 1.3 + i * 0.36, 0.35)) * (i === ost ? 1 : 1 - 0.45 * wyroznienie));
  });
  pojaw(E('d-wn'), post(t, 3.7, 0.5), 20);
  pojaw(E('d-st1'), post(t, 4.6, 0.5), 24);
  pojaw(E('d-st2'), post(t, 5.0, 0.5), 24);
}

const KLATKI = { A: klatkaA, B: klatkaB, C: klatkaC, D: klatkaD };
window.czasTrwania = (s) => CZAS[s];
window.klatka = (s, t) => {
  for (const k of Object.keys(KLATKI)) E('s-' + k).style.display = k === s ? 'block' : 'none';
  KLATKI[s](t);
  return true;
};
