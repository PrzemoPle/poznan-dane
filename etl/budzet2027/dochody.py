# Wykaz dochodów wg źródeł (Materiały informacyjne cz. 1, s. 8–37): sekcja → grupa → podgrupa → pozycja, lata 2026 i 2027.
import sys,re,json
sys.path.insert(0, sys.argv[0].rsplit('/',1)[0])
import pymupdf
from wiersze import wiersze
RE_KW=re.compile(r'^-?\d{1,3}(?: \d{3})*,\d\d$'); kw=lambda t: float(t.replace(' ','').replace(',','.'))
doc=pymupdf.open(sys.argv[1])
sekcje=[]; sek=grupa=podgrupa=poz=None; bufor=[]; bufor_x=None
for n in range(8,38):
    for y,sp in wiersze(doc[n-1]):
        if y<60 or y>565: continue
        font=sp[0][3]; t0=sp[0][2].strip()
        kwoty=[s for s in sp if RE_KW.match(s[2].strip()) and s[0]>560]
        nazwa=' '.join(s[2].strip() for s in sp if s not in kwoty and s[0]<600 and not (s[0]>760))
        if 'Bold' in font and 'Italic' not in font:
            if re.match(r'^(I|II)\. DOCHODY', t0):
                sek={'nazwa':t0,'grupy':[]}; sekcje.append(sek); grupa=podgrupa=poz=None; bufor=[]
                continue
            # część nagłówków grup i pozycji złożono pogrubieniem bez kursywy (np. „9.1."); rozpoznajemy je
            # po wcięciu i kwotach, a resztę pogrubionych wierszy (tabele pomocnicze w opisach) pomijamy
            if not ((sp[0][0]<60 and re.match(r'^\d+(\.\d+)*\. ', t0)) or (bufor) or (len(kwoty)>=2 and sp[0][0]<100)): continue
        if 'Bold' in font:
            if nazwa and not RE_KW.match(nazwa):
                if not bufor: bufor_x=sp[0][0]
                bufor.append(nazwa)
            if len(kwoty)>=2:
                pelna=' '.join(bufor).strip(); x=bufor_x if bufor_x is not None else sp[0][0]; bufor=[]; bufor_x=None
                e={'nazwa':pelna,'p2026':kw(kwoty[0][2]),'p2027':kw(kwoty[1][2]),'opis':'','str':n}
                if x<60 and re.match(r'^\d+\.\d+\.',pelna): e['pozycje']=[]; podgrupa=e; grupa['podgrupy'].append(e); poz=e
                elif x<60: e['pozycje']=[]; e['podgrupy']=[]; grupa=e; podgrupa=None; sek['grupy'].append(e); poz=e
                else: (podgrupa or grupa)['pozycje'].append(e); poz=e
        elif poz is not None and not bufor:
            poz['opis']=(poz['opis']+'\n'+nazwa+('  ['+' → '.join(s[2].strip() for s in kwoty[:2])+']' if len(kwoty)>=2 else '')).strip()
zle=[]; n_poz=0
for s in sekcje:
    for g in s['grupy']:
        dzieci=g['podgrupy'] if g['podgrupy'] else g['pozycje']
        for wezel,dz in [(g,dzieci)]+[(p,p['pozycje']) for p in g['podgrupy']]:
            n_poz+=len(dz) if dz and 'pozycje' not in dz[0] else 0
            if dz:
                for f in ('p2026','p2027'):
                    sd=round(sum(d[f] for d in dz),2)
                    if abs(sd-wezel[f])>0.01: zle.append(f"{wezel['nazwa'][:50]} [{f}]: {wezel[f]:,.2f} vs suma {sd:,.2f} (różnica {wezel[f]-sd:,.2f})")
    print(f"{s['nazwa']}: grup {len(s['grupy'])}, 2026 {sum(g['p2026'] for g in s['grupy']):,.2f}, 2027 {sum(g['p2027'] for g in s['grupy']):,.2f}")
print('pozycji:', n_poz, '| niezgodności:', len(zle)); [print('   ',z) for z in zle]
json.dump(sekcje,open(sys.argv[2],'w'),ensure_ascii=False)
