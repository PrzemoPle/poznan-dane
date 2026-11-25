# Migracje — zbiór dla podstrony `/migracje/`

`dane.json` to jeden zestawiony zbiór, z którego korzysta `src/pages/migracje.astro` (nagłówek
liczony przy budowaniu, wykresy w przeglądarce). Powstał w listopadzie 2026 r. w osobnym
opracowaniu („Odpływ z Poznania, wersja 2") i został przeniesiony do serwisu bez zmian.
**W repozytorium nie ma skryptu, który go odtwarza** — po publikacji danych za kolejny rok
trzeba go zestawić ponownie z tablic GUS.

## Źródła

- GUS, Baza Demografia, tabl. 2g — macierz migracji wewnętrznych na pobyt stały między gminami
  (Poznań podzielony na 5 dzielnic), 2020–2025.
- GUS, Baza Demografia, tabl. 14 — migracje w Poznaniu według dzielnic, wieku i kierunków.
- GUS, tablica bilansowa 00PA — stan i ruch ludności dzielnic (2020 i 2021 po NSP 2021).
- GUS, Bank Danych Lokalnych — sumy dla miasta i mieszkania oddane do użytkowania.
- Granice: PRG (GUGiK, 2025) — gminy i powiaty; OpenStreetMap — osiedla Poznania.

## Pola

| Pole | Zawartość |
| --- | --- |
| `Y` | lata |
| `flows[teryt]` | gmina Wielkopolski: `n` nazwa, `p` powiat, `v[rok]` = [z Poznania, do Poznania, z Poznania jawne, liczba ukrytych komórek, do Poznania jawne, liczba ukrytych komórek] |
| `woj[kod]` | to samo dla pozostałych województw |
| `avgOut`, `avgIn` | średnia liczba osób na ukrytą komórkę w danym roku (do szacunku) |
| `dz[dzielnica][rok]` | ludność, wymeldowania poza Poznań `eo`, zameldowania spoza Poznania `ei`, kierunki w powiecie poznańskim `pp` (wartość ujemna = komórka ukryta) |
| `ages` | wiek (18 grup) i rodzaj kierunku dla miasta i dzielnic; `a[grupa]` = [do Poznania, z Poznania] |
| `pp[teryt]` | 17 gmin powiatu: mieszkania na 1000 ludności `dw` i ludność 2020/2025 |
| `tot[zmienna BDL]` | sumy roczne: 72305 ludność, 80121 zameldowania i 80123 wymeldowania w ruchu wewnętrznym, 80125 saldo |
| `map`, `city`, `dzPts` | uproszczone geometrie (ścieżki SVG) i punkty zaczepienia łuków |

## Kontrole wykonane przy przeniesieniu (25.11.2026)

- `tot` porównano z API Banku Danych Lokalnych (jednostka 023016264011, zmienne 72305, 80121,
  80123, 80125, lata 2019–2025): zgodność co do osoby.
- Suma kierunków z macierzy (`flows` + `woj`) wobec `tot`: wymeldowania różnią się w każdym roku
  o najwyżej 3 osoby, zameldowania o najwyżej 4 — to skutek szacowania ukrytych komórek.

Tablic Bazy Demografia (kierunki, wiek, dzielnice) nie porównywano ponownie komórka po komórce —
wiarygodność opiera się na powyższych sumach i na opisie metody z opracowania.
