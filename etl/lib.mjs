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
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      return res;
    } catch (e) {
      lastErr = e;
      await sleep(500 * 2 ** i);
    }
  }
  throw lastErr;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
