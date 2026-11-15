# Wykazy zadań z „Materiałów informacyjnych cz. 1": procesowe (2026 i 2027) oraz projektowe (plan 2027).
import sys,re,json
sys.path.insert(0, sys.argv[0].rsplit('/',1)[0])
import pymupdf
from wiersze import wiersze
RE_KW=re.compile(r'^-?\d{1,3}(?: \d{3})*,\d\d$')
RE_KOD=re.compile(r'^[A-ZĄĆĘŁŃÓŚŹŻ0-9]+(?:/[A-ZĄĆĘŁŃÓŚŹŻ0-9]+)*/\d{3}[a-z]?$')
kw=lambda t: float(t.replace(' ','').replace(',','.'))
def parsuj(doc, od, do, tryb):
    # tryb 'proc': kolumny 2026 | 2027 | %; tryb 'proj': jedna kolumna „Plan 2027"
    jednostki=[]; jed=None; zad=None; dz=None; ost=None; grupa=None; poprz_naglowek=None
    x_nazwy = 110 if tryb=='proc' else 100
    for n in range(od, do+1):
        p=doc[n-1]; H=p.rect.height
        for y,sp in wiersze(p):
            if y < (100 if tryb=='proc' else 75) and any(s[2].startswith(('Nr zadania','Numer','zad./','Nazwa','1')) for s in sp[:1]): continue
            if y > H-40: continue                      # stopka: numer strony i przypis
            font=sp[0][3]; tekst0=sp[0][2].strip()
            kwoty=[s for s in sp if RE_KW.match(s[2].strip()) and s[0] > (560 if tryb=='proc' else 480)]
            opisowe=[s for s in sp if s not in kwoty and not (s[0]>740 and re.fullmatch(r'[\d,]+|-',s[2].strip()))]
            def wartosci():
                if tryb=='proj': return {'p2027': kw(kwoty[-1][2])} if kwoty else {}
                w={}
                for s in kwoty:
                    if s[1] < 700: w['p2026']=kw(s[2])
                    elif s[1] < 762: w['p2027']=kw(s[2])
                return w
            if 'Bold' in font and 'Italic' not in font:
                if tekst0.startswith('RAZEM'):
                    if jed is not None: jed['razem']=wartosci()
                    continue
                if not kwoty:
                    nazwa=' '.join(s[2].strip() for s in opisowe)
                    if poprz_naglowek is not None and not poprz_naglowek['zadania']:
                        if poprz_naglowek.get('_y_str')==(n,) or True:
                            # dwa nagłówki pod rząd: pierwszy to grupa (np. URZĄD MIASTA POZNANIA) albo ciąg dalszy nazwy
                            if abs(y-poprz_naglowek['_y'])<16 and n==poprz_naglowek['_n']:
                                poprz_naglowek['nazwa']+=' '+nazwa; poprz_naglowek['_y']=y; continue
                            grupa=poprz_naglowek['nazwa']; jednostki.remove(poprz_naglowek)
                    jed={'nazwa':nazwa,'grupa':grupa,'zadania':[],'razem':None,'_y':y,'_n':n}; jednostki.append(jed)
                    poprz_naglowek=jed; zad=dz=ost=None
                    continue
            if jed is None: continue
            if 'Italic' in font or ('Bold' in font and kwoty):
                kod = tekst0 if sp[0][1] <= x_nazwy+8 and sp[0][0] < x_nazwy else None
                nazwa=' '.join(s[2].strip() for s in opisowe if s[0] >= x_nazwy-8 and s is not (sp[0] if kod else None))
                if kod and RE_KOD.match(kod):
                    zad={'kod':kod,'nazwa':nazwa,'dzialania':[],'opis':'','str':n,**wartosci()}; jed['zadania'].append(zad); dz=None; ost=zad
                elif kod and re.fullmatch(r'\d{2}',kod) and zad is not None:
                    dz={'nr':kod,'nazwa':nazwa,'opis':'',**wartosci()}; zad['dzialania'].append(dz); ost=dz
                elif kwoty and zad is not None and not kod:
                    # wiersz bez kodu z kwotami (wykaz zbiorczy oświaty): traktujemy jak działanie
                    dz={'nr':'','nazwa':nazwa,'opis':'',**wartosci()}; zad['dzialania'].append(dz); ost=dz
                elif ost is not None:
                    ost['nazwa']=(ost['nazwa']+' '+' '.join(s[2].strip() for s in opisowe)).strip()
                    for k,v in wartosci().items(): ost.setdefault(k,v)      # kwota bywa o wiersz niżej niż początek nazwy
            elif ost is not None:
                ost['opis']=(ost['opis']+'\n'+' '.join(s[2].strip() for s in opisowe)).strip()
    for j in jednostki: j.pop('_y',None); j.pop('_n',None)
    return jednostki
def kontrola(jednostki, pola):
    zle=[]; n_zad=0; n_dz=0
    for j in jednostki:
        for f in pola:
            sz=round(sum(z.get(f,0) for z in j['zadania']),2)
            if j['razem'] is None: zle.append(f"{j['nazwa'][:40]}: brak RAZEM"); break
            if abs(sz-j['razem'].get(f,0))>0.01: zle.append(f"{j['nazwa'][:44]} [{f}]: zadania {sz:,.2f} vs RAZEM {j['razem'].get(f,0):,.2f}")
        for z in j['zadania']:
            n_zad+=1; n_dz+=len(z['dzialania'])
            for f in pola:
                if z['dzialania']:
                    sd=round(sum(d.get(f,0) for d in z['dzialania']),2)
                    if abs(sd-z.get(f,0))>0.01: zle.append(f"{z['kod']} [{f}]: działania {sd:,.2f} vs zadanie {z.get(f,0):,.2f}")
    return zle,n_zad,n_dz
if __name__=='__main__':
    doc=pymupdf.open(sys.argv[1]); out=sys.argv[2]
    for nazwa,od,do,tryb,pola in (('procesowe',39,131,'proc',('p2026','p2027')),('oswiata',133,134,'proc',('p2026','p2027')),('projektowe',201,282,'proj',('p2027',))):
        j=parsuj(doc,od,do,tryb); zle,nz,nd=kontrola(j,pola)
        print(f"{nazwa}: jednostek {len(j)}, zadań {nz}, działań/etapów {nd}, " + ', '.join(f"{f}: {sum(x['razem'].get(f,0) for x in j if x['razem']):,.2f}" for f in pola))
        print(f"   niezgodności sum: {len(zle)}"); [print('     ',z) for z in zle[:14]]
        json.dump(j,open(f'{out}/{nazwa}.json','w'),ensure_ascii=False)
