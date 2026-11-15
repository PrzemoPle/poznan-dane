# Projekt budżetu 2027 — odczyt dokumentów

Jednorazowy odczyt projektu budżetu Poznania na 2027 r. i projektu WPF (stan na 13.11.2026).
Nie jest częścią cotygodniowego odświeżania: źródłem są pliki PDF, a nie API. Po uchwaleniu
budżetu (albo autopoprawce) trzeba go powtórzyć na nowych plikach.

## Źródła

Wszystkie z BIP: <https://bip.poznan.pl/bip/budzet-2027,doc,1003,4521/budzet-2027-r-projekt-budzetu-miasta,261623.html>

| Plik | Do czego | Postać |
| --- | --- | --- |
| Materiały informacyjne cz. 1 | dochody wg źródeł, zadania procesowe 2026–2027, zadania projektowe 2027 | PDF tekstowy |
| Projekt uchwały o WPF z załącznikami | prognoza 2027–2050, założenia makro | PDF tekstowy |
| Załącznik nr 2 (wydatki) | działy i rozdziały klasyfikacji | skan → tekst po OCR |
| Uzasadnienie | wydatki 2026–2027 wg 13 dziedzin, plan 2026, zadłużenie | skan → tekst po OCR |
| Załącznik nr 5 (wynik) | przychody i rozchody | skan → tekst po OCR |

Inflacja 2003–2025: GUS BDL, zmienna 217230 (Polska, rok poprzedni = 100). Lata 2026–2050 to
założenia z dokumentów budżetowych, nie dane.

## Kolejność

    python3 -m venv venv && venv/bin/pip install pymupdf
    venv/bin/python wpf.py        WPF.pdf out/wpf.json
    venv/bin/python zadania.py    Materialy_cz_1.pdf out/
    venv/bin/python dochody.py    Materialy_cz_1.pdf out/dochody.json
    python3 dzialy.py             zal2.md out/dzialy.json
    python3 uzasadnienie.py       uzasadnienie.md out/dziedziny.json
    venv/bin/python zbuduj.py     out zal2.md WPF.pdf cpi-gus.json ../../data/budzet2027 ../../public/dane/budzet2027

## Pułapki

- **Strony są obrócone o 90°.** PDFKit (macOS) gubi wtedy zgodność indeksów znaków z ich
  ramkami; PyMuPDF podaje współrzędne w układzie nieobróconym i trzeba je przeliczyć
  macierzą `page.rotation_matrix` (robi to `wiersze.py`).
- **Skany po OCR mają literówki** („Rołnictwo", „Obśluga"). Dlatego żadna liczba nie wchodzi
  bez sumy kontrolnej: rozdziały → dział → sekcja → ogółem, bieżące + majątkowe = razem,
  dochody − wydatki = wynik, dług(t) = dług(t−1) + kredyty − spłaty. `zbuduj.py` przerywa na
  pierwszej niezgodności.
- **Kolumna 2026 w wykazie zadań procesowych jest niepełna z założenia.** Zadań, które miały
  środki w 2026 r., a nie mają w 2027, dokument nie wymienia — suma wymienionych bywa niższa
  niż „RAZEM". W kolumnie 2027 wszystko sumuje się co do grosza.
- **„…, w tym:" w wykazie dochodów** oznacza listę niepełną; takich grup nie da się domknąć.
- **Blok „PODSUMOWANIE" w załączniku nr 2** powtarza działy łącznie dla gminy i powiatu —
  służy za kontrolę, nie wolno go doliczyć do sekcji.
- **Nowa klasyfikacja budżetowa od 2027 r.** utrudnia porównania z latami wcześniejszymi
  (m.in. zakupy niskocenne trafiły do wydatków majątkowych).
- **Plan a wykonanie.** W projekcie rezerwy (384 mln zł) stoją w dziale 758; w trakcie roku
  rozchodzą się po innych działach, więc projekt zaniża je względem przyszłego wykonania.
