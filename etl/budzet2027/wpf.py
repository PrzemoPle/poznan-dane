import sys,re,json
sys.path.insert(0, sys.argv[0].rsplit('/',1)[0])
import pymupdf
from wiersze import wiersze
def liczba(t):
    t=t.strip()
    if t in ('x','X','-',''): return None
    if t.endswith('%'): return float(t[:-1].replace(',','.').replace(' ',''))
    if t in ('TAK','NIE'): return t
    return float(t.replace(' ','').replace('\xa0','').replace(',','.'))
doc=pymupdf.open(sys.argv[1]); dane={}; lp=None
for n in range(6,24):
    for y,sp in wiersze(doc[n-1]):
        t=sp[0][2].strip()
        if t=='Lp': lp=[s[2].strip() for s in sp[1:]]
        elif re.fullmatch(r'20\d\d',t):
            w=[s[2] for s in sp[1:]]
            assert len(w)==len(lp), (n,t,len(w),len(lp))
            for k,v in zip(lp,w): dane.setdefault(k,{})[t]=liczba(v)
json.dump(dane,open(sys.argv[2],'w'),ensure_ascii=False)
lata=sorted(dane['1'])
print('kolumn:',len(dane),'| lata:',lata[0],'–',lata[-1])
blad=0
for r in lata:
    d=dane
    if abs(d['1'][r]-d['2'][r]-d['3'][r])>0.01: blad+=1; print('  WYNIK≠', r)
    if abs(d['1.1'][r]+d['1.2'][r]-d['1'][r])>0.01: blad+=1; print('  DOCH≠', r)
    if abs(d['2.1'][r]+d['2.2'][r]-d['2'][r])>0.01: blad+=1; print('  WYD≠', r)
    if abs(d['1.1'][r]-d['2.1'][r]-d['7.1'][r])>0.01: blad+=1; print('  NADW.OPER≠', r)
print('niezgodności kontrolnych:',blad)
mld=lambda v: f'{v/1e9:.2f}'
print('rok   dochody wydatki majątk. wynik   dług   nadw.oper')
for r in lata[:10]: print(r, mld(dane['1'][r]), '  ', mld(dane['2'][r]), '  ', mld(dane['2.2'][r]), '  ', mld(dane['3'][r]), ' ', mld(dane['6'][r]), ' ', mld(dane['7.1'][r]))
# kontrola długu: dług(t) = dług(t-1) + zaciągnięte (4.1) - spłaty (5.1)
for a,b in zip(lata,lata[1:]):
    oczek=dane['6'][a]+dane['4.1'][b]-dane['5.1'][b]
    if abs(oczek-dane['6'][b])>1: print('  dług',b,'odchyłka',round(dane['6'][b]-oczek)); break
else: print('ścieżka długu spójna z kredytami i spłatami w każdym roku')
