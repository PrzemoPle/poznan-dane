"""Wykaz zadań jednostek pomocniczych (osiedli) z materiałów informacyjnych cz. 1.

Strony PDF 284–326: zadania przekazane przez rady osiedli wydziałom i jednostkom
miejskim, z podziałem na program budowy dróg lokalnych i pozostałe środki,
na lata 2027–2029. Każdy rekord zaczyna się wierszem „JEDNOSTKA POMOCNICZA -
OSIEDLE", a nazwa osiedla stoi w wierszu pod spodem.

Strona 328: zadania z konkursu „Płać podatki w Poznaniu i zamelduj się na Fyrtlu" (bez
wskazania osiedla).

Każdy wiersz sumujący dokumentu (ogółem, bieżące/majątkowe, działy, rozdziały, podsumy
jednostek) jest porównywany z sumą odczytanych pozycji; pierwsza niezgodność przerywa pracę.

Użycie: python osiedla.py <Materialy_cz_1.pdf> <data/budzet2027/osiedla-lista.json> <public/dane/budzet2027/osiedla.json>
"""
import json, re, sys
import pymupdf
from wiersze import wiersze

PREFIKS = 'JEDNOSTKA POMOCNICZA - OSIEDLE'
# wiersze działów bywają zapisane z dwoma miejscami po przecinku („563 247,00")
KWOTA = re.compile(r'^-?\d{1,3}( \d{3})*,\d{1,2}$')
KOD = re.compile(r'^([A-Z0-9ŁŚŻĆ]+/[A-Z]/\d+)\s+(.+)$')


def kwota(t):
    return round(float(t.replace(' ', '').replace(',', '.')), 2)


def sklej(czesci):
    """Skleja wiersze komórki; łącznik na końcu wiersza oznacza nazwę wieloczłonową."""
    out = ''
    for c in czesci:
        c = c.strip()
        if not c:
            continue
        if not out:
            out = c
        elif out.endswith('-') and len(out) > 1 and out[-2] != ' ':
            out += c                      # „Warszawskie-Pomet-" + „Maltańskie"; myślnik po spacji to pauza
        else:
            out += ' ' + c
    return re.sub(r'\s+', ' ', out).strip()


def kolumna(x):
    if x < 190: return 'osiedle'
    if x < 262: return 'jednostka'
    if x < 303: return 'kod'
    if x < 390: return 'nazwa'
    return 'kwota'


def czytaj(pdf, od=284, do=326):
    d = pymupdf.open(pdf)
    rekordy, sumy = [], []
    biezacy = None
    dzial = rozdzial = None
    rodzaj = None            # 'B' bieżące, 'M' majątkowe
    for nr in range(od, do + 1):
        for y, spany in wiersze(d[nr - 1]):
            if y < 72 or y > 570:
                continue                      # nagłówek tabeli i numer strony
            teksty = [s[2] for s in spany]
            pogrubione = all('Bold' in s[3] for s in spany if not KWOTA.match(s[2]))
            kwoty = [kwota(s[2]) for s in spany if s[0] > 390 and KWOTA.match(s[2])]
            pierwszy = spany[0]
            lewe = [s for s in spany if s[0] <= 390]
            start = any(s[2].startswith(PREFIKS) for s in lewe)

            if start:
                biezacy = {'osiedle': [], 'jednostka': [], 'kod': [], 'nazwa': [],
                           'grupa': len(sumy) - 1, 'kwoty': kwoty, 'dzial': dzial, 'rozdzial': rozdzial,
                           'rodzaj': rodzaj, 'strona': nr}
                rekordy.append(biezacy)
                for s in lewe:
                    t = s[2]
                    if t.startswith(PREFIKS):
                        t = t[len(PREFIKS):]
                    biezacy[kolumna(s[0])].append(t)
                continue

            if kwoty and pogrubione:
                # wiersz sumujący: dział, rozdział albo nagłówek sekcji
                biezacy = None
                etykieta = ' '.join(s[2] for s in lewe)
                kod = None
                m = re.match(r'^(\d{3}|\d{5})\b', pierwszy[2]) if pierwszy[0] < 80 else None
                if m:
                    kod = m.group(1)
                    etykieta = ' '.join(s[2] for s in lewe[1:])
                    if len(kod) == 3: dzial, rozdzial = kod, None
                    else: rozdzial = kod
                else:
                    e = etykieta.lower()
                    if 'bieżące' in e: rodzaj = 'B'
                    elif 'majątkowe' in e: rodzaj = 'M'
                sumy.append({'kod': kod, 'etykieta': etykieta, 'kwoty': kwoty,
                             'rodzaj': rodzaj, 'strona': nr, 'y': round(y)})
                continue

            if kwoty:
                raise SystemExit(f's. {nr} y={y:.0f}: kwoty poza rekordem i sumą: {teksty}')

            # wiersz kontynuacji: dopisek do rekordu albo do etykiety sumy
            if biezacy is not None:
                for s in lewe:
                    biezacy[kolumna(s[0])].append(s[2])
            elif sumy and pogrubione:
                sumy[-1]['etykieta'] += ' ' + ' '.join(teksty)
                e = sumy[-1]['etykieta'].lower()
                if sumy[-1]['kod'] is None:
                    if 'bieżące' in e: rodzaj = 'B'
                    elif 'majątkowe' in e: rodzaj = 'M'
                    sumy[-1]['rodzaj'] = rodzaj
            # „z tego:" i podobne wtręty pomijamy

    wynik = []
    for r in rekordy:
        if len(r['kwoty']) != 9:
            raise SystemExit(f"s. {r['strona']}: {len(r['kwoty'])} kwot zamiast 9: {r}")
        k = r['kwoty']
        for i in (0, 3, 6):
            if abs(k[i] - k[i + 1] - k[i + 2]) > 0.05:
                raise SystemExit(f"s. {r['strona']}: plan ≠ drogowy + pozostałe: {r}")
        kod, nazwa = sklej(r['kod']), sklej(r['nazwa'])
        m = KOD.match(kod)
        if m:                                 # krótka nazwa wpisana w jednej komórce z kodem
            kod, nazwa = m.group(1), sklej([m.group(2), nazwa])
        # jedyne słowo w wykazie przełamane w środku (dłuższe niż kolumna)
        jednostka = sklej(r['jednostka']).replace('OGÓLNOKSZTAŁCĄCYC H', 'OGÓLNOKSZTAŁCĄCYCH')
        if not (kod and nazwa and jednostka and sklej(r['osiedle'])):
            raise SystemExit(f"s. {r['strona']}: niepełny rekord: {r}")
        wynik.append({
            'osiedle': sklej(r['osiedle']),
            'jednostka': jednostka,
            'kod': kod,
            'nazwa': nazwa,
            'rodzaj': r['rodzaj'], 'dzial': r['dzial'], 'rozdzial': r['rozdzial'],
            'strona': r['strona'],
            'r2027': k[0], 'drogi2027': k[1],
            'r2028': k[3], 'drogi2028': k[4],
            'r2029': k[6], 'drogi2029': k[7],
            'grupa': r['grupa'],
        })
    sprawdz(wynik, sumy)
    return wynik, sumy


def sprawdz(rek, sumy):
    """Każdy wiersz sumujący dokumentu musi wynikać z odczytanych rekordów."""
    pola = ['r2027', 'drogi2027', None, 'r2028', 'drogi2028', None, 'r2029', 'drogi2029', None]

    def suma(wybor):
        out = []
        for i, p in enumerate(pola):
            if p is None:
                out.append(round(out[i - 2] - out[i - 1], 2))
            else:
                out.append(round(sum(r[p] for r in wybor), 2))
        return out

    bledy = []
    for i, s in enumerate(sumy):
        e = s['etykieta'].lower()
        if s['kod'] and len(s['kod']) == 3:
            wybor = [r for r in rek if r['rodzaj'] == s['rodzaj'] and r['dzial'] == s['kod']]
        elif s['kod']:
            wybor = [r for r in rek if r['rodzaj'] == s['rodzaj'] and r['rozdzial'] == s['kod']
                     and r['dzial'] == s['kod'][:3]]
        elif e.startswith('wydatki ogółem'):
            wybor = rek
        elif 'bieżące' in e or 'majątkowe' in e:
            wybor = [r for r in rek if r['rodzaj'] == s['rodzaj']]
        else:
            # podsuma jednostki w obrębie rozdziału: rekordy do następnego wiersza sumującego
            wybor = [r for r in rek if r['grupa'] == i]
        if any(abs(a - b) > 0.05 for a, b in zip(suma(wybor), s['kwoty'])):
            bledy.append((s['strona'], s['kod'], s['etykieta'], s['kwoty'], suma(wybor)))
    if bledy:
        for b in bledy:
            print('NIEZGODNE', b, file=sys.stderr)
        raise SystemExit(f'{len(bledy)} wierszy sumujących nie zgadza się z rekordami')


def czytaj_fyrtel(pdf, strona=328):
    """Konkurs „Płać podatki w Poznaniu i zamelduj się na Fyrtlu" — jedna strona, bez kolumny osiedla."""
    d = pymupdf.open(pdf)
    rek, ogolem, dzial, biezacy = [], None, None, None
    for y, spany in wiersze(d[strona - 1]):
        if y < 95 or y > 570:
            continue
        kwoty = [kwota(s[2]) for s in spany if s[0] > 570 and KWOTA.match(s[2])]
        lewe = [s for s in spany if s[0] <= 570]
        pogrubione = all('Bold' in s[3] for s in spany)
        if kwoty and pogrubione:
            biezacy = None
            if lewe and re.fullmatch(r'\d{3}', lewe[0][2]):
                dzial = lewe[0][2]
            elif lewe and lewe[0][2].startswith('WYDATKI OGÓŁEM'):
                ogolem = kwoty
            continue
        if kwoty:
            if len(kwoty) != 3:
                raise SystemExit(f'fyrtel: {len(kwoty)} kwot zamiast 3: {[s[2] for s in spany]}')
            biezacy = {'jednostka': [], 'kod': [], 'nazwa': [], 'kwoty': kwoty, 'dzial': dzial}
            rek.append(biezacy)
        if biezacy is None:
            continue
        for s in lewe:
            if s[0] < 150: continue               # kolumna „Paragraf"
            k = 'jednostka' if s[0] < 320 else 'kod' if s[0] < 380 else 'nazwa'
            biezacy[k].append(s[2])
    wynik = [{'jednostka': sklej(r['jednostka']), 'kod': sklej(r['kod']), 'nazwa': sklej(r['nazwa']),
              'dzial': r['dzial'], 'r2027': r['kwoty'][0], 'r2028': r['kwoty'][1], 'r2029': r['kwoty'][2],
              'strona': strona} for r in rek]
    for i, pole in enumerate(('r2027', 'r2028', 'r2029')):
        if ogolem is None or abs(sum(r[pole] for r in wynik) - ogolem[i]) > 0.05:
            raise SystemExit(f'fyrtel: suma {pole} nie zgadza się z wierszem „WYDATKI OGÓŁEM": {ogolem}')
    return wynik


def identyfikator(nazwa):
    s = nazwa.lower()
    for a, b in zip('ąćęłńóśżź', 'acelnoszz'):
        s = s.replace(a, b)
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def zbuduj(pdf, lista, wyjscie):
    """Plik dla serwisu: 42 osiedla (także te bez żadnej pozycji) i wszystkie pozycje wykazu."""
    rek, sumy = czytaj(pdf)
    fyrtel = czytaj_fyrtel(pdf)
    spis = json.load(open(lista, encoding='utf-8'))
    osiedla = sorted(spis['osiedla'], key=lambda o: identyfikator(o['nazwa']))
    indeks = {o['nazwa'].upper(): i for i, o in enumerate(osiedla)}
    nieznane = sorted({r['osiedle'] for r in rek} - set(indeks))
    if nieznane:
        raise SystemExit(f'osiedla spoza oficjalnego wykazu: {nieznane}')
    if len(osiedla) != 42:
        raise SystemExit(f'w wykazie osiedli jest {len(osiedla)} pozycji zamiast 42')
    dzialy = {s['kod']: s['etykieta'] for s in sumy if s['kod'] and len(s['kod']) == 3}
    zl = lambda v: int(v) if float(v).is_integer() else v
    zadania = []
    for r in rek:
        z = {'o': indeks[r['osiedle']], 'j': r['jednostka'], 'k': r['kod'], 'n': r['nazwa'], 'r': r['rodzaj'],
             'dz': r['dzial'], 'a': zl(r['r2027']), 's': r['strona']}
        if r['drogi2027']: z['d'] = zl(r['drogi2027'])
        if r['r2028']: z['b'] = zl(r['r2028'])
        if r['drogi2028']: z['bd'] = zl(r['drogi2028'])
        if r['r2029']: z['c'] = zl(r['r2029'])
        if r['drogi2029']: z['cd'] = zl(r['drogi2029'])
        zadania.append(z)
    razem = lambda pole: zl(round(sum(r[pole] for r in rek), 2))
    plik = {
        'meta': {
            'strony': '284–326 i 328',
            'razem2027': razem('r2027'), 'drogi2027': razem('drogi2027'),
            'razem2028': razem('r2028'), 'razem2029': razem('r2029'),
            'majatkowe2027': zl(round(sum(r['r2027'] for r in rek if r['rodzaj'] == 'M'), 2)),
            'pozycji': len(rek),
            'mieszkancyStan': spis['stanNa'], 'mieszkancyUrl': spis['url'],
        },
        'dzialy': dzialy,
        'osiedla': [{'id': identyfikator(o['nazwa']), 'n': o['nazwa'], 'm': o['mieszkancy']} for o in osiedla],
        'zadania': zadania,
        'fyrtel': [{'j': f['jednostka'], 'k': f['kod'], 'n': f['nazwa'], 'dz': f['dzial'], 'a': zl(f['r2027']),
                    'b': zl(f['r2028']), 'c': zl(f['r2029']), 's': f['strona']} for f in fyrtel],
    }
    json.dump(plik, open(wyjscie, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    bez = [o['nazwa'] for i, o in enumerate(osiedla) if not any(z['o'] == i for z in zadania)]
    print(f"{len(rek)} pozycji, {len(osiedla)} osiedli (bez pozycji: {', '.join(bez) or 'brak'}), "
          f"{plik['meta']['razem2027']:,} zł w 2027 r.; konkurs: {len(fyrtel)} zadania, "
          f"{sum(f['r2027'] for f in fyrtel):,.0f} zł")


if __name__ == '__main__':
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    zbuduj(*sys.argv[1:4])
