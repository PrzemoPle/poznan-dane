# Składa pliki dla serwisu z odczytanych i zweryfikowanych tabel projektu budżetu 2027 i WPF.
#   zbuduj.py <katalog z wynikami parserów> <zal2.md> <WPF.pdf> <cpi_gus.json> <data/budzet2027> <public/dane/budzet2027>
import sys,json,re,os,unicodedata
sys.path.insert(0, sys.argv[0].rsplit('/',1)[0])
import pymupdf
from wiersze import wiersze
IN,ZAL2,WPF_PDF,CPI,OUT_DATA,OUT_PUB=sys.argv[1:7]
L=lambda n: json.load(open(f'{IN}/{n}.json'))
wpf=L('wpf'); dzied=L('dziedziny'); dzialy=L('dzialy'); doch=L('dochody')
lata=sorted(wpf['1'])
SERIE={'dochody':'1','dochodyBiezace':'1.1','pit':'1.1.1','cit':'1.1.2','subwencja':'1.1.3','nieruchomosci':'1.1.5.1',
       'dochodyMajatkowe':'1.2','wydatki':'2','wydatkiBiezace':'2.1','wynagrodzenia':'2.1.1','obslugaDlugu':'2.1.3',
       'wydatkiMajatkowe':'2.2','wynik':'3','kredyty':'4.1','splaty':'5.1','dlug':'6','nadwyzkaOperacyjna':'7.1',
       'wskaznikSplaty':'8.1','limitSplaty':'8.3'}
prognoza={k:{r:wpf[lp][r] for r in lata} for k,lp in SERIE.items()}
# --- założenia makro z objaśnień WPF (s. 105): rok, PKB, inflacja średnioroczna, …
doc=pymupdf.open(WPF_PDF); makro={}
for y,sp in wiersze(doc[104]):
    t=' '.join(s[2] for s in sp); m=re.match(r'^(20\d\d)\s+([\d,]+)%\s+([\d,]+)%\s+([\d,]+)%\s+([\d,]+)%\s+([\d,]+)%',t)
    if m: makro[m.group(1)]={'pkb':float(m.group(2).replace(',','.')),'inflacja':float(m.group(3).replace(',','.')),'wynagrodzenia':float(m.group(5).replace(',','.'))}
assert len(makro)==24 and makro['2027']['inflacja']==2.8, makro.get('2027')
cpi_gus=json.load(open(CPI))                       # {rok: wskaźnik, rok poprzedni = 100}
inflacja={r:{'w':round(v-100,1),'zrodlo':'gus'} for r,v in cpi_gus.items()}
inflacja['2026']={'w':3.0,'zrodlo':'zalozenie'}    # prognoza z wprowadzenia do projektu budżetu
for r,m in makro.items(): inflacja[r]={'w':m['inflacja'],'zrodlo':'zalozenie'}
# --- struktura ekonomiczna wydatków (blok RAZEM w zał. nr 2)
md=open(ZAL2,encoding='utf-8').read().split('\n'); i=max(k for k,l in enumerate(md) if re.match(r'^\|\s*\|\s*RAZEM\s*\|',l))
kw=lambda t: float(t.replace(' ','').replace('\xa0','').replace(',','.'))
ekon=[]; tryb=None
for l in md[i:i+16]:
    if 'Dział Rozdz' in l: break                    # koniec bloku — dalej zaczyna się kolejna tabela
    c=[x.strip() for x in l.strip().strip('|').split('|')]
    if len(c)<3 or not re.fullmatch(r'[\d \xa0]+,\d\d',c[2]): continue
    n=c[1]
    if n.startswith('WYDATKI BIE'): tryb='b'; continue
    if n.startswith('WYDATKI MAJ'): tryb='m'; continue
    if n=='RAZEM' or n.startswith('Wydatki jednostek bud'): continue
    ekon.append({'nazwa':n.lstrip('- ').replace('samorządku','samorządu'),'kwota':kw(c[2]),'rodzaj':'bieżące' if tryb=='b' else 'majątkowe'})
assert abs(sum(e['kwota'] for e in ekon)-8205666215.18)<0.01, sum(e['kwota'] for e in ekon)
NAZWY_EKON={'uposażenia i wynagrodzenia oraz składki od nich naliczane':'Wynagrodzenia i składki','wydatki związane z realizacją ich zadań statutowych':'Zadania statutowe jednostek (zakupy, usługi, utrzymanie)',
 'Transfery bieżące':'Dotacje i inne transfery bieżące','Świadczenia na rzecz osób fizycznych':'Świadczenia dla mieszkańców','Wypłaty z tytułu gwarancji i poręczeń':'Poręczenia i gwarancje',
 'Obsługa długu jednostki samorządu terytorialnego':'Odsetki od długu','Nakłady na niefinansowe aktywa trwale (wydatki inwestycyjne)':'Inwestycje własne miasta',
 'Transfery majątkowe':'Dotacje na inwestycje innych podmiotów','Wydatki na wniesienie wkładów do spółek prawa handlowego':'Wkłady do spółek miejskich'}
for e in ekon: e['nazwa']=NAZWY_EKON.get(e['nazwa'],e['nazwa'])
# --- działy: poprawki literówek OCR w nazwach (kwoty zweryfikowane sumami)
NAZWY_DZ={'010':'Rolnictwo i łowiectwo','730':'Szkolnictwo wyższe i nauka','751':'Urzędy naczelnych organów władzy państwowej, kontroli i ochrony prawa',
 '754':'Bezpieczeństwo publiczne i ochrona przeciwpożarowa','756':'Dochody od osób prawnych i fizycznych — wydatki związane z poborem','925':'Ogrody botaniczne i zoologiczne oraz obszary chronionej przyrody'}
for d in dzialy['dzialy']:
    d['nazwa']=NAZWY_DZ.get(d['kod'],d['nazwa']); d.pop('rozdzialy_ok',None)
# --- dochody: sekcje → grupy → pozycje (opisy idą do pliku publicznego, żeby nie puchła strona)
def bez_opisow(w):
    o={k:v for k,v in w.items() if k not in ('opis','str','pozycje','podgrupy')}
    if w.get('podgrupy'): o['podgrupy']=[bez_opisow(x) for x in w['podgrupy']]
    if w.get('pozycje'): o['pozycje']=[bez_opisow(x) for x in w['pozycje']]
    return o
plan2026={'dochody':7134330141.95,'dochodyBiezace':6779478440.70,'dochodyMajatkowe':354851701.25,
          'wydatki':dzied['ogolem']['razem']['p2026'],'wydatkiBiezace':dzied['biezace']['razem']['p2026'],'wydatkiMajatkowe':dzied['majatkowe']['razem']['p2026'],
          'nadwyzkaOperacyjna':331602330.92,'dlug':2191981859.05}
plan2026['wynik']=round(plan2026['dochody']-plan2026['wydatki'],2)
assert abs(plan2026['dochodyBiezace']-plan2026['wydatkiBiezace']-plan2026['nadwyzkaOperacyjna'])<0.01
assert abs(sum(g['p2026'] for s in doch for g in s['grupy'])-plan2026['dochody'])<0.01
projekt={k:prognoza[k]['2027'] for k in prognoza}
assert abs(plan2026['dlug']+projekt['kredyty']-projekt['splaty']-projekt['dlug'])<0.01
zbiorcze={
 'meta':{'stanNa':'2026-11-13','opis':'Projekt budżetu Miasta Poznania na 2027 r. i projekt wieloletniej prognozy finansowej, przedłożone Radzie Miasta przez Prezydenta',
         'plan2026':'plan budżetu na 2026 r. według stanu na 30 września 2026 r.',
         'bip':'https://bip.poznan.pl/bip/budzet-2027,doc,1003,4521/budzet-2027-r-projekt-budzetu-miasta,261623.html'},
 'plan2026':plan2026,'projekt2027':projekt,'prognoza':prognoza,'inflacja':inflacja,'makro':makro,
 'finansowanie':{'przychody':[{'nazwa':'Kredyty i pożyczki krajowe','kwota':1073434578.00},{'nazwa':'Kredyty zagraniczne','kwota':150000000.00},
     {'nazwa':'Niewykorzystane środki z rozliczeń z lat ubiegłych','kwota':43242106.12},{'nazwa':'Spłaty pożyczek udzielonych przez miasto','kwota':34426212.00},{'nazwa':'Wolne środki','kwota':2918.03}],
   'rozchody':[{'nazwa':'Wykup obligacji','kwota':115000000.00},{'nazwa':'Spłata kredytów zagranicznych','kwota':61501544.00},{'nazwa':'Spłata kredytów krajowych','kwota':41773150.00},{'nazwa':'Pożyczki udzielane przez miasto','kwota':10061024.00}]},
 'dziedziny':dzied,'dzialy':dzialy['dzialy'],'ekonomiczne':ekon,'dochody':[{'nazwa':s['nazwa'],'grupy':[bez_opisow(g) for g in s['grupy']]} for s in doch]}
f=zbiorcze['finansowanie']
assert abs(sum(x['kwota'] for x in f['przychody'])-1301105814.15)<0.01 and abs(sum(x['kwota'] for x in f['rozchody'])-228335718.00)<0.01
assert abs(projekt['dochody']+1301105814.15-projekt['wydatki']-228335718.00)<0.01      # budżet się bilansuje
os.makedirs(OUT_DATA,exist_ok=True); os.makedirs(OUT_PUB,exist_ok=True)
json.dump(zbiorcze,open(f'{OUT_DATA}/zbiorcze.json','w'),ensure_ascii=False,indent=1)
# --- zadania: plik publiczny, doczytywany dopiero przy wyszukiwaniu
def jednostki(J,rodzaj):
    out=[]
    for j in J:
        for z in j['zadania']:
            out.append({'r':rodzaj,'j':j['nazwa'],'k':z['kod'],'n':z['nazwa'],'a':z.get('p2026'),'b':z.get('p2027'),'s':z['str'],
                        'd':[{'n':d['nazwa'],'a':d.get('p2026'),'b':d.get('p2027'),'o':d['opis']} for d in z['dzialania']] or None,'o':z['opis'] or None})
    return out
zad=jednostki(L('projektowe'),'P')+jednostki(L('procesowe'),'B')+jednostki(L('oswiata'),'B')
# W wykazie zbiorczym oświaty nazwa pierwszego składnika stoi wiersz nad jego kwotami i skleja się
# z nazwą zadania („Dydaktyka i wychowanie, w tym: Prowadzenie zajęć…"). Rozdzielamy je z powrotem.
for z in zad:
    m=re.match(r'^(.*?),? w tym(?: m\.in\.)?:\s*(.+)$', z['n'])
    if m and z['d']:
        # ciąg dalszy tej nazwy (po wierszu z kwotami) trafił już do składnika — sklejamy oba kawałki
        z['n']=m.group(1); z['d'][0]['n']=(m.group(2)+' '+z['d'][0]['n']).strip()
    z['n']=re.sub(r',? w tym(?: m\.in\.)?:$','',z['n'])
assert not [z['k'] for z in zad if z['d'] and any(not d['n'] for d in z['d'])], 'składnik bez nazwy'
json.dump({'zadania':zad},open(f'{OUT_PUB}/zadania.json','w'),ensure_ascii=False,separators=(',',':'))
json.dump({'dochody':doch},open(f'{OUT_PUB}/dochody.json','w'),ensure_ascii=False,separators=(',',':'))
print('zbiorcze.json:', os.path.getsize(f'{OUT_DATA}/zbiorcze.json')//1024, 'kB | zadania.json:', os.path.getsize(f'{OUT_PUB}/zadania.json')//1024, 'kB | dochody.json:', os.path.getsize(f'{OUT_PUB}/dochody.json')//1024, 'kB')
print('zadań:', len(zad), '| projektowych:', sum(1 for z in zad if z['r']=='P'), f"({sum(z['b'] for z in zad if z['r']=='P')/1e6:,.1f} mln) | bieżących:", sum(1 for z in zad if z['r']=='B'), f"({sum(z['b'] for z in zad if z['r']=='B')/1e6:,.1f} mln)")
print('inflacja:', {r:inflacja[r]['w'] for r in ('2003','2022','2025','2026','2027','2030')}, '| ekon. pozycji:', len(ekon))
print('wszystkie asercje kontrolne przeszły')
