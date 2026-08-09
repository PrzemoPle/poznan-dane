# Poznań w danych

Przeglądarka danych publicznych o Poznaniu — rejestr umów miasta, budżet, statystyki
i porównania z pięcioma największymi polskimi miastami. Statyczna strona (Astro),
bez backendu; wszystkie dane są pobierane wcześniej przez skrypty ETL i serwowane jako JSON.

## Źródła

| Źródło | Dostęp | Co daje |
|---|---|---|
| [Rejestr umów UM Poznania](https://bip.poznan.pl/bip/rejestr-umow/) | `POST https://bip.poznan.pl/api-json/bip/rejestr-umow/` | Umowy miasta i 274 jednostek, 2014 – 30.06.2026 |
| [GUS Bank Danych Lokalnych](https://bdl.stat.gov.pl/) | `https://bdl.stat.gov.pl/api/v1/` | 20 wskaźników × 6 miast, szeregi od 1995 r. + wydatki wg działów |
| [badam.poznan.pl](https://badam.poznan.pl/) | scraping tabel HTML | ~630 szeregów statystyki miejskiej w 15 działach |
| [Poznań Otwarte Dane](https://www.poznan.pl/opendata) | `POST https://www.poznan.pl/opendata/graphql` | Katalog 69 zbiorów i 49 API |
| [dane.gov.pl](https://dane.gov.pl/) | `https://api.dane.gov.pl/1.4/` | 25 zbiorów Urzędu Miasta Poznania |
| [CRU JSFP](https://rejestrumow.gov.pl/) | — | Umowy od 1.07.2026; brak publicznego API odczytu, na razie tylko odesłanie |

Uwaga: domena **dane.org.pl nie istnieje** (brak rekordu DNS). Krajowy portal otwartych
danych to `dane.gov.pl`, miejski — `poznan.pl/opendata`. Oba są podpięte.

## Uruchomienie

```bash
npm install
npm run etl        # pełne pobranie danych (~40 min, głównie rejestr umów)
npm run dev        # podgląd na http://localhost:4331
npm run build      # statyczny build do dist/
```

Poszczególne kroki ETL można uruchamiać osobno:

```bash
npm run etl:umowy    # rejestr umów; roczniki już pobrane są pomijane (FORCE=1 wymusza)
npm run etl:bdl      # GUS BDL
npm run etl:badam    # tabele badam.poznan.pl
npm run etl:katalog  # katalogi zbiorów danych
npm run etl:build    # przeliczenie agregatów do public/dane/
npm run etl:podmioty # profile kontrahentów i jednostek
npm run etl:og       # karta podglądu (public/og.png)
npm run etl:sprawdz  # kontrola kompletności roczników
```

## Struktura

```
etl/                skrypty pobierania i agregacji (czysty Node, bez zależności)
  lib.mjs           fetch z retry, pula wątków, zapis JSON
  fetch-umowy.mjs   rejestr umów — stronicowanie POST, oś rodzajów umów
  fetch-bdl.mjs     GUS BDL — wskaźniki i wydatki wg działów dla 6 miast
  fetch-badam.mjs   parser tabel HTML badam.poznan.pl + sklejanie w ciągi roczne
  fetch-opendata.mjs katalogi (GraphQL + REST)
  build-aggregates.mjs  agregaty, sezonowość, ciekawostki, roczniki dla przeglądarki
  build-podmioty.mjs    profile kontrahentów i jednostek (data/podmioty.json)
  og-image.mjs      karta podglądu do social mediów (public/og.png)
  sprawdz.mjs       kontrola kompletności roczników rejestru
  discover-bdl.mjs  pomocnik do wyszukiwania identyfikatorów zmiennych BDL
data/raw/           surowe pobrania (niewersjonowane)
public/dane/        dane serwowane stronie (generowane przez ETL, wersjonowane)
src/pages/          Pulpit, Rejestr umów, Budżet, Statystyki, Porównaj, Źródła, 404
  kontrahent/[slug]   profil kontrahenta (300 największych)
  jednostka/[slug]    profil jednostki miejskiej (wszystkie 262)
src/components/     ProfilPodmiotu.astro — wspólny widok profilu
src/lib/wykresy.js  wykresy SVG bez bibliotek zewnętrznych
```

## Decyzje, które warto znać

- **Stronicowanie rejestru umów.** API zwraca `total_size: 100` niezależnie od faktycznej
  liczby rekordów, a w środku stronicowania potrafi oddać niepełną stronę. Dlatego pętla
  kończy się dopiero po dwóch kolejnych stronach bez nowych identyfikatorów — wcześniejsza
  wersja urywała roczniki w połowie.
- **Rodzaj umowy.** API nie zwraca tego pola w rekordzie, więc każdy rocznik jest dodatkowo
  przechodzony po 12 rodzajach. Dla lat do 2023 pole jest w źródle prawie puste — stąd
  dominująca kategoria „nieokreślony”.
- **Sumy kontra mediany.** Umowa wieloletnia jest księgowana w całości w roku zawarcia
  (np. 12,2 mld zł za usługi przewozowe MPK na lata 2024–2039). Roczne sumy nie są więc
  wydatkami budżetu — wszędzie obok sumy pokazywana jest mediana.
- **Dwa źródła budżetu.** Dane GUS i tabele Urzędu Miasta są prezentowane obok siebie
  celowo, żeby rozjazd był widoczny, a nie zamaskowany.

- **Nazewnictwo dla czytelnika.** W tekście widocznym dla użytkownika nie używamy słowa
  „szereg" ani „szereg czasowy" — mówimy „wskaźnik". Żargon statystyczny odbija
  osoby, które przychodzą po konkretną liczbę, a nie po metodologię.
- **Umowy wieloletnie.** Rejestr podaje `termin_od` i `termin_do`; z nich liczymy czas
  obowiązywania. To 2,8% umów, ale 76% wartości rejestru — bez tego rozróżnienia
  roczne sumy są nieczytelne.
- **Profile podmiotów** budowane są z gotowych roczników (`public/dane/umowy/`), a nie
  z surowych pobrań. `data/podmioty.json` (~5 MB) jest wczytywany tylko przy budowaniu
  strony; przeglądarka dostaje wyłącznie lekki indeks `public/dane/profile.json`.
