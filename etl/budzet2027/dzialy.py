# Wydatki projektu 2027 wg działów i rozdziałów (zał. nr 2 do projektu uchwały budżetowej).
# Odczyt jest po OCR, więc nic nie przyjmujemy bez sumy kontrolnej.
import sys,re,json,unicodedata
m=open(sys.argv[1],encoding='utf-8').read()
rz=[[c.strip() for c in l.strip().strip('|').split('|')] for l in m.split('\n') if l.startswith('|')]
kw=lambda t: float(t.replace(' ','').replace('\xa0','').replace(',','.'))
RE_KW=re.compile(r'-?[\d \xa0]+,\d\d')
bez=lambda s: unicodedata.normalize('NFKD',s.replace('Ł','L').replace('ł','l')).encode('ascii','ignore').decode().upper()
i_pod=next(i for i,r in enumerate(rz) if r[0]=='PODSUMOWANIE')
# --- część szczegółowa: sekcje → działy → rozdziały
sekcje=[]; sek=dz=roz=None
for r in rz[:i_pod]:
    if len(r)<3 or not RE_KW.fullmatch(r[2] or ''): continue
    kod,nazwa,kwota=r[0],r[1],kw(r[2]); N=bez(nazwa)
    if not kod and N.startswith('WYDATKI NA ZADANIA') and 'OGOLEM' not in N:
        sek={'nazwa':nazwa,'kwota':kwota,'dzialy':[]}; sekcje.append(sek); dz=roz=None
    elif re.fullmatch(r'\d{3}',kod) and sek is not None:
        dz={'kod':kod,'nazwa':nazwa,'kwota':kwota,'rozdzialy':[]}; sek['dzialy'].append(dz); roz=None
    elif re.fullmatch(r'\d{5}',kod) and dz is not None and not (roz and roz['kod']==kod):
        roz={'kod':kod,'nazwa':nazwa,'kwota':kwota}; dz['rozdzialy'].append(roz)
# --- podsumowanie: działy łącznie z podziałem na bieżące i majątkowe
pods={}; d=None
for r in rz[i_pod:]:
    if len(r)<3 or not RE_KW.fullmatch(r[2] or ''): continue
    kod,nazwa,kwota=r[0],r[1],kw(r[2]); N=bez(nazwa)
    if re.fullmatch(r'\d{3}',kod): d={'kod':kod,'nazwa':nazwa,'kwota':kwota,'biezace':0.0,'majatkowe':0.0,'wynagrodzenia':0.0,'_':set()}; pods[kod]=d
    elif d is not None and not kod:
        # tylko pierwsze wystąpienie po dziale — za ostatnim działem stoi jeszcze blok „ogółem"
        if N.startswith('WYDATKI BIE') and 'b' not in d['_'] and 'm' not in d['_']: d['biezace']=kwota; d['_'].add('b')
        elif N.startswith('WYDATKI MAJ') and 'm' not in d['_']: d['majatkowe']=kwota; d['_'].add('m')
        elif 'WYNAGRODZENIA' in N and N.startswith('-') and 'w' not in d['_'] and 'm' not in d['_']: d['wynagrodzenia']=kwota; d['_'].add('w')
        elif 'OGOLEM' in N or N.startswith('RAZEM'): d=None
blad=[]
for s in sekcje:
    sd=round(sum(x['kwota'] for x in s['dzialy']),2)
    if abs(sd-s['kwota'])>0.01: blad.append(f"sekcja {s['nazwa'][:40]}: {s['kwota']} vs {sd}")
agg={}; rozd={}
for s in sekcje:
    for x in s['dzialy']:
        agg[x['kod']]=round(agg.get(x['kod'],0)+x['kwota'],2)
        for q in x['rozdzialy']:
            e=rozd.setdefault(x['kod'],{}).setdefault(q['kod'],{'kod':q['kod'],'nazwa':q['nazwa'],'kwota':0.0}); e['kwota']=round(e['kwota']+q['kwota'],2)
for k,v in agg.items():
    if k not in pods: blad.append(f'dział {k} brak w podsumowaniu')
    elif abs(pods[k]['kwota']-v)>0.01: blad.append(f"dział {k}: sekcje {v:,.2f} vs podsumowanie {pods[k]['kwota']:,.2f}")
for k,p in pods.items():
    if abs(p['biezace']+p['majatkowe']-p['kwota'])>0.01: blad.append(f"dział {k}: b+m {p['biezace']+p['majatkowe']:,.2f} vs {p['kwota']:,.2f}")
    sr=round(sum(q['kwota'] for q in rozd.get(k,{}).values()),2)
    p['rozdzialy_ok']=abs(sr-p['kwota'])<0.01
    p['rozdzialy']=sorted(rozd.get(k,{}).values(), key=lambda q:-q['kwota'])
S=lambda f: round(sum(p[f] for p in pods.values()),2)
print(f"działów {len(pods)} | razem {S('kwota'):,.2f} (ma być 8,205,666,215.18) | bieżące {S('biezace'):,.2f} (6,653,531,363.70) | majątkowe {S('majatkowe'):,.2f} (1,552,134,851.48)")
print('niezgodności:', len(blad)); [print('   ',b) for b in blad]
print('działy, w których rozdziały NIE sumują się do działu:', [k for k,p in pods.items() if not p['rozdzialy_ok']])
for p in sorted(pods.values(), key=lambda p:-p['kwota'])[:8]: print(f"  {p['kod']} {p['nazwa'][:44]:44} {p['kwota']/1e6:8.1f} mln | bież. {p['biezace']/1e6:8.1f} | maj. {p['majatkowe']/1e6:7.1f} | płace {p['wynagrodzenia']/1e6:7.1f}")
for q in pods.values(): q.pop('_',None)
json.dump({'sekcje':[{'nazwa':s['nazwa'],'kwota':s['kwota']} for s in sekcje],'dzialy':sorted(pods.values(), key=lambda p:-p['kwota'])},open(sys.argv[2],'w'),ensure_ascii=False,indent=1)
