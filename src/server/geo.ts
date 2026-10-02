/**
 * Wyszukiwanie miejscowości (geokodowanie) przez Nominatim — darmowy geokoder OpenStreetMap.
 *
 * Zasady korzystania z publicznego serwera Nominatim: najwyżej 1 zapytanie na sekundę,
 * identyfikujący User-Agent i zapamiętywanie wyników. Dlatego zapytania idą przez
 * kolejkę z odstępem 1,1 s, a wyniki trzymamy w pamięci podręcznej.
 * https://operations.osmfoundation.org/policies/nominatim/
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'ManaScrew/1.0 (https://manascrew.eu)';
const MIN_INTERVAL_MS = 1100;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_MAX = 2000;

export interface CitySuggestion {
  city: string; // np. "Kraków"
  label: string; // np. "Kraków, małopolskie, Polska"
  countryCode: string | null;
  lat: number;
  lon: number;
}

const cache = new Map<string, { at: number; data: CitySuggestion[] }>();
/** Podpowiedzi wydane klientom — zapisać można tylko miejscowość pochodzącą z geokodera. */
const issued = new Map<string, CitySuggestion>();
let queue: Promise<unknown> = Promise.resolve();
let lastCallAt = 0;

/** Zaokrąglenie do 2 miejsc (~1 km) — zapisujemy tylko przybliżone położenie miasta. */
export const roundCoord = (v: number) => Math.round(v * 100) / 100;

function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCallAt = Date.now();
    return fn();
  });
  queue = run.catch(() => undefined);
  return run;
}

const PLACE_TYPES = new Set(['city', 'town', 'village', 'hamlet', 'municipality', 'suburb', 'borough', 'administrative']);

export async function searchCities(rawQuery: string): Promise<CitySuggestion[]> {
  const q = rawQuery.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (q.length < 2) return [];
  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

  const params = new URLSearchParams({
    q,
    format: 'jsonv2',
    addressdetails: '1',
    limit: '8',
    'accept-language': 'pl',
    featureType: 'settlement',
    // Europa (wraz z Turcją i Islandią); bounded=1 zawęża wyniki do tego obszaru
    viewbox: '-25,72,45,34',
    bounded: '1'
  });
  const data = await throttled(async () => {
    const res = await fetch(`${NOMINATIM_URL}?${params}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }
    });
    if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
    return (await res.json()) as any[];
  });

  const seen = new Set<string>();
  const out: CitySuggestion[] = [];
  for (const r of Array.isArray(data) ? data : []) {
    const a = r.address || {};
    const city = a.city || a.town || a.village || a.municipality || a.hamlet || r.name;
    if (!city || (r.addresstype && !PLACE_TYPES.has(r.addresstype))) continue;
    const region = a.state || a.county;
    const label = [city, region, a.country].filter(Boolean).join(', ');
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({
      city: String(city).slice(0, 80),
      label: label.slice(0, 160),
      countryCode: a.country_code ? String(a.country_code).slice(0, 4) : null,
      lat: roundCoord(Number(r.lat)),
      lon: roundCoord(Number(r.lon))
    });
    if (out.length >= 6) break;
  }

  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: Date.now(), data: out });
  for (const s of out) {
    if (issued.size >= CACHE_MAX * 3) issued.delete(issued.keys().next().value as string);
    issued.set(s.label, s);
  }
  return out;
}

/**
 * Zwraca zaufaną wersję wybranej podpowiedzi (z geokodera), albo null.
 * Klient przesyła tylko etykietę — współrzędne bierzemy z naszych danych.
 */
export async function resolveSuggestion(label: unknown): Promise<CitySuggestion | null> {
  if (typeof label !== 'string' || !label.trim() || label.length > 160) return null;
  const known = issued.get(label);
  if (known) return known;
  // np. po restarcie serwera — szukamy ponownie i bierzemy dokładnie tę samą etykietę
  const again = await searchCities(label.split(',')[0]);
  return again.find((s) => s.label === label) || null;
}
