/**
 * Rekomendacje kart dla dowódcy z EDHREC (https://edhrec.com).
 *
 * EDHREC nie ma oficjalnego API — korzystamy z publicznych plików JSON, z których
 * korzysta ich strona (json.edhrec.com). Żeby ich nie obciążać: najwyżej 1 zapytanie
 * na sekundę z całego serwera, wyniki trzymamy w pamięci przez 24 h, a w aplikacji
 * podpisujemy źródło i linkujemy do strony dowódcy na EDHREC.
 */

// Adres można nadpisać (np. w testach), domyślnie publiczne pliki JSON EDHREC.
const EDHREC_JSON = process.env.EDHREC_JSON_URL || 'https://json.edhrec.com/pages/commanders';
const USER_AGENT = 'ManaScrew/1.0 (https://manascrew.eu)';
const MIN_INTERVAL_MS = 1000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 400;

export interface EdhrecCard {
  name: string;
  /** Odsetek talii z tym dowódcą, które grają kartę (0–1). */
  inclusion: number;
  numDecks: number;
  /** Synergia EDHREC: o ile częściej karta występuje z tym dowódcą niż w innych taliach tych kolorów. */
  synergy: number;
  /** Lista EDHREC, z której pochodzi (np. creatures, instants, lands). */
  list: string;
}

export interface EdhrecCommander {
  slug: string;
  url: string;
  name: string;
  numDecks: number;
  cards: EdhrecCard[];
}

/** Nazwa → slug EDHREC: „Atraxa, Praetors' Voice” → „atraxa-praetors-voice”. */
export function edhrecSlug(name: string): string {
  const front = name.split('//')[0];
  return front
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’",.!?:()]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const cache = new Map<string, { at: number; data: EdhrecCommander | null }>();
let queue: Promise<unknown> = Promise.resolve();
let lastCallAt = 0;

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

// Listy, które nie mówią o typie karty — przy duplikatach wolimy listy typów
const GENERIC_LISTS = new Set(['newcards', 'topcards', 'highsynergycards', 'gamechangers']);

function parse(json: any, slug: string): EdhrecCommander | null {
  const lists: any[] = json?.container?.json_dict?.cardlists;
  if (!Array.isArray(lists)) return null;
  const byName = new Map<string, EdhrecCard>();
  let numDecks = Number(json?.num_decks_avg || json?.container?.json_dict?.card?.num_decks || 0);
  for (const list of lists) {
    const tag = String(list?.tag || '').toLowerCase();
    for (const v of Array.isArray(list?.cardviews) ? list.cardviews : []) {
      const name = typeof v?.name === 'string' ? v.name.trim() : '';
      const potential = Number(v?.potential_decks) || 0;
      const num = Number(v?.num_decks) || 0;
      if (!name || potential <= 0) continue;
      numDecks = Math.max(numDecks, potential);
      const card: EdhrecCard = {
        name,
        inclusion: Math.min(1, num / potential),
        numDecks: num,
        synergy: Number(v?.synergy) || 0,
        list: tag
      };
      const prev = byName.get(name.toLowerCase());
      if (!prev || (GENERIC_LISTS.has(prev.list) && !GENERIC_LISTS.has(tag))) {
        byName.set(name.toLowerCase(), prev ? { ...card, list: GENERIC_LISTS.has(tag) ? prev.list : tag } : card);
      }
    }
  }
  const header = typeof json?.header === 'string' ? json.header : '';
  return {
    slug,
    url: `https://edhrec.com/commanders/${slug}`,
    name: header.replace(/\s*\(Commander\)\s*$/i, '') || slug,
    numDecks,
    cards: [...byName.values()].sort((a, b) => b.inclusion - a.inclusion)
  };
}

/** Dane dowódcy z EDHREC (null, gdy EDHREC go nie zna). Rzuca błąd przy problemie z siecią. */
export async function getCommanderRecommendations(commanderName: string): Promise<EdhrecCommander | null> {
  const slug = edhrecSlug(commanderName);
  if (!slug) return null;
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

  const data = await throttled(async () => {
    const res = await fetch(`${EDHREC_JSON}/${slug}.json`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      redirect: 'follow'
    });
    if (res.status === 404 || res.status === 403) return null;
    if (!res.ok) throw new Error(`EDHREC HTTP ${res.status}`);
    return parse(await res.json(), slug);
  });

  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(slug, { at: Date.now(), data });
  return data;
}
