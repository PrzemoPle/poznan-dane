// Wspólne narzędzia ETL: pobieranie z retry, limitowanie równoległości, zapis JSON.
import { mkdir, writeFile, readFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';

// Nagłówki HTTP muszą być ASCII — bez polskich znaków.
export const UA = 'poznan-dane/1.0 (open data browser; contact: pp@plewinscy.pl)';

export async function fetchRetry(url, opts = {}, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), opts.timeout ?? 45_000);
      const res = await fetch(url, {
        ...opts,
        signal: ctrl.signal,
        headers: { 'User-Agent': UA, ...(opts.headers || {}) },
      });
      // Treść czytamy jeszcze pod limitem czasu. Wcześniej zegar stawał po nagłówkach,
      // więc serwer, który przysłał nagłówki i zamilkł, mógł powiesić proces na godziny.
      const tresc = await res.arrayBuffer();
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      return new Response(tresc, { status: res.status, statusText: res.statusText, headers: res.headers });
    } catch (e) {
      lastErr = e;
      await sleep(500 * 2 ** i);
    }
  }
  throw lastErr;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Pobranie z oczekiwaniem na JSON.
 *
 * Istnieje, bo rejestrumow.gov.pl potrafi oddać stronę HTML z kodem 200 — zapewne
 * zabezpieczenie przed botami, które wchodzi przy dłuższej serii zapytań z adresów
 * serwerowni. Dla `fetchRetry` to poprawna odpowiedź, więc błąd wychodził dopiero
 * przy `res.json()`, poza pętlą ponawiania: zero drugich szans i wywrócony cały ETL
 * (tak zamarł serwis między 28.09 a 12.10.2026). Tutaj nie-JSON jest zwykłym błędem,
 * czyli podlega ponawianiu i odczekaniu.
 */
export async function fetchJSON(url, opts = {}, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetchRetry(url, opts, 1);
      const typ = res.headers.get('content-type') ?? '';
      const tresc = await res.text();
      if (!typ.includes('json')) {
        throw new Error(`odpowiedź nie jest JSON-em (${typ || 'brak typu'}): ${tresc.slice(0, 60)}`);
      }
      return JSON.parse(tresc);
    } catch (e) {
      lastErr = e;
      if (i < tries - 1) await sleep(1000 * 2 ** i);
    }
  }
  throw lastErr;
}

/** Uruchamia `worker` dla każdego elementu z zadanym limitem równoległości. */
export async function pool(items, limit, worker) {
  const out = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return out;
}

export async function saveJSON(path, data) {
  await mkdir(dirname(path), { recursive: true });
  // Zapis przez plik tymczasowy i podmianę nazwy: czytelnik trafia albo na starą,
  // albo na nową zawartość, nigdy na plik w połowie zapisu. Ma to znaczenie, gdy
  // przeliczanie agregatów idzie równolegle z pobieraniem roczników.
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(data));
  await rename(tmp, path);
  return path;
}

export async function loadJSON(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

export const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
