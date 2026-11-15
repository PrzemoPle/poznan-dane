import sys,re,json
m=open(sys.argv[1],encoding='utf-8').read().split('\n')
def kw(t):
    t=t.strip().replace('\xa0',' ')
    return None if t in ('','-') else float(t.replace(' ','').replace(',','.'))
def tabela(tytul):
    i=next(k for k,l in enumerate(m) if tytul in l.replace('\t',' '))
    wiersze=[]
    for l in m[i+1:]:
        if l.startswith('|'):
            kom=[c.strip() for c in l.strip().strip('|').split('|')]
            wiersze.append(kom)
        elif wiersze: break    # tabela jest ciągła — pierwsza linia spoza niej kończy odczyt
    return wiersze
out={}
NAZWY={'Gospodarka przestrzenia, gospodarka nieruchomościami oraz rewitalizacja':'Gospodarka przestrzenna, nieruchomości i rewitalizacja',
       'Obśluga długu publicznego':'Obsługa długu publicznego','Gospodarka komunalna i ochroną środowiska':'Gospodarka komunalna i ochrona środowiska'}
for klucz,tyt in (('ogolem','WYDATKI OGÓŁEM WEDŁUG DZIEDZIN'),('biezace','WYDATKI BIEŻĄCE WEDŁUG DZIEDZIN'),('majatkowe','WYDATKI MAJĄTKOWE WEDŁUG DZIEDZIN')):
    rz=[r for r in tabela(tyt) if len(r)>=7 and re.fullmatch(r'[\d \xa0]+,\d\d',r[2])]
    poz=[{'nazwa':NAZWY.get(r[1],r[1]),'p2026':kw(r[2]),'p2027':kw(r[4])} for r in rz if 'Razem' not in r[1]]
    razem=next(r for r in rz if 'Razem' in r[1])
    s26=round(sum(p['p2026'] for p in poz),2); s27=round(sum(p['p2027'] for p in poz),2)
    ok=abs(s26-kw(razem[2]))<0.01 and abs(s27-kw(razem[4]))<0.01
    print(f'{klucz:9} pozycji {len(poz):2} | suma 2026 {s26:,.2f} vs razem {kw(razem[2]):,.2f} | suma 2027 {s27:,.2f} vs {kw(razem[4]):,.2f} | {"OK" if ok else "!!! NIEZGODNE"}')
    out[klucz]={'pozycje':poz,'razem':{'p2026':kw(razem[2]),'p2027':kw(razem[4])}}
# spójność między tabelami: ogółem = bieżące + majątkowe w każdej dziedzinie
b={p['nazwa']:p for p in out['biezace']['pozycje']}; mj={p['nazwa']:p for p in out['majatkowe']['pozycje']}
zle=0
for p in out['ogolem']['pozycje']:
    for r in ('p2026','p2027'):
        s=b[p['nazwa']][r]+(mj[p['nazwa']][r] if p['nazwa'] in mj else 0)
        if abs(s-p[r])>0.01: zle+=1; print('   ≠', p['nazwa'], r, p[r], s)
print('dziedziny: ogółem = bieżące + majątkowe →', 'OK we wszystkich' if not zle else f'{zle} niezgodności')
json.dump(out,open(sys.argv[2],'w'),ensure_ascii=False,indent=1)
