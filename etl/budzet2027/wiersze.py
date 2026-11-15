# Zamienia stronę PDF na wiersze: lista (y, [(x0, x1, tekst, font, rozmiar, flagi)]) w układzie widzianym przez czytelnika.
import pymupdf, sys, json
def wiersze(page, tol=2.5):
    spany=[]
    M=page.rotation_matrix   # współrzędne tekstu są w układzie nieobróconym — przeliczamy na widok czytelnika
    for blok in page.get_text('dict')['blocks']:
        for linia in blok.get('lines', []):
            for sp in linia['spans']:
                t=sp['text'].strip()
                if not t: continue
                x0,y0,x1,y1=pymupdf.Rect(sp['bbox'])*M
                spany.append(((y0+y1)/2, x0, x1, t, sp['font'], round(sp['size'],1), sp['flags']))
    spany.sort()
    rz=[]
    for s in spany:
        if rz and abs(rz[-1][0]-s[0])<=tol: rz[-1][1].append(s[1:])
        else: rz.append([s[0],[s[1:]]])
    for r in rz: r[1].sort()
    return rz
if __name__=='__main__':
    doc=pymupdf.open(sys.argv[1])
    for n in map(int, sys.argv[2:]):
        p=doc[n-1]
        print(f'##### s.{n} rozmiar {p.rect.width:.0f}x{p.rect.height:.0f} rot {p.rotation}')
        for y,sp in wiersze(p):
            print(f'{y:6.1f} | ' + ' ¦ '.join(f'[{x0:.0f}-{x1:.0f} {f.split("-")[-1][:8]}{sz}] {t}' for x0,x1,t,f,sz,fl in sp)[:330])
