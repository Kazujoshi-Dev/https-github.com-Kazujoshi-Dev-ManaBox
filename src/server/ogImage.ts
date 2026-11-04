/**
 * Obrazek podglądu linku (Open Graph, 1200×630) dla oferty „Sprzedam” i listy „Szukam”:
 * do pięciu kart rozłożonych jak w dłoni na ciemnym tle. Facebook, Messenger i Discord
 * pokazują go po wklejeniu linku, więc post z samym linkiem od razu pokazuje karty.
 *
 * Bez tekstu na obrazku: w kontenerze nie ma gwarancji czcionek, a tytuł i opis i tak
 * wyświetla Facebook z metadanych strony.
 */
import { APP_USER_AGENT } from './userAgent';

export const OG_W = 1200;
export const OG_H = 630;
const MAX_CARDS = 5;
const CARD_H = 540;
const CARD_W = Math.round((CARD_H * 488) / 680);
const RADIUS = Math.round(CARD_W * 0.045);
const MARGIN = 56;

/** Te same hosty co w proxy obrazów: tylko oficjalne źródła grafik kart. */
const ALLOWED_HOSTS = ['scryfall.io', 'scryfall.com', 'lorcast.io', 'assets.tcgdex.net'];

export function isAllowedCardImage(raw: string): boolean {
  if (!raw || raw.length > 2048) return false;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return false;
    const host = u.hostname.toLowerCase();
    return ALLOWED_HOSTS.some((d) => host === d || host.endsWith('.' + d));
  } catch {
    return false;
  }
}

let sharpLoader: Promise<any | null> | null = null;
function loadSharp(): Promise<any | null> {
  if (!sharpLoader) {
    sharpLoader = import('sharp')
      .then((m: any) => m.default || m)
      .catch((err) => {
        console.warn('[OG] Brak biblioteki sharp, podgląd linku bez kolażu kart:', err?.message || err);
        return null;
      });
  }
  return sharpLoader;
}

async function fetchImage(url: string): Promise<Buffer | null> {
  if (!isAllowedCardImage(url)) return null;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': APP_USER_AGENT, Accept: 'image/avif,image/webp,image/jpeg,image/png,image/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok || !isAllowedCardImage(res.url || url)) return null;
    if (!(res.headers.get('content-type') || '').startsWith('image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 0 && buf.length < 8 * 1024 * 1024 ? buf : null;
  } catch {
    return null;
  }
}

const roundedMask = () =>
  Buffer.from(
    `<svg width="${CARD_W}" height="${CARD_H}"><rect width="${CARD_W}" height="${CARD_H}" rx="${RADIUS}" ry="${RADIUS}" fill="#fff"/></svg>`
  );

const background = () =>
  Buffer.from(
    `<svg width="${OG_W}" height="${OG_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="g" cx="50%" cy="45%" r="75%">
      <stop offset="0%" stop-color="#292524"/>
      <stop offset="100%" stop-color="#0c0a09"/>
    </radialGradient>
  </defs>
  <rect width="${OG_W}" height="${OG_H}" fill="url(#g)"/>
  <rect x="0" y="${OG_H - 8}" width="${OG_W}" height="8" fill="#fbbf24"/>
</svg>`
  );

/** Pozycje kart: przy kilku kartach zachodzą na siebie, skrajne lekko obrócone. */
function layout(n: number): { left: number; top: number; angle: number }[] {
  if (n === 1) return [{ left: Math.round((OG_W - CARD_W) / 2), top: Math.round((OG_H - CARD_H) / 2) - 4, angle: 0 }];
  const span = Math.min(OG_W - MARGIN * 2 - CARD_W, (CARD_W + 24) * (n - 1));
  const start = Math.round((OG_W - CARD_W - span) / 2);
  const step = span / (n - 1);
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1) - 0.5; // -0.5 … 0.5
    return {
      left: Math.round(start + i * step),
      top: Math.round((OG_H - CARD_H) / 2 - 4 + Math.abs(t) * 36),
      angle: n >= 3 ? t * 12 : 0
    };
  });
}

/** JPEG 1200×630 z kartami; null, gdy nie ma sharp albo żadna grafika się nie pobrała. */
export async function renderCardsOgImage(imageUris: string[]): Promise<Buffer | null> {
  const sharp = await loadSharp();
  if (!sharp) return null;
  const uris = [...new Set(imageUris.filter(isAllowedCardImage))].slice(0, MAX_CARDS);
  if (uris.length === 0) return null;

  const raw = await Promise.all(uris.map(fetchImage));
  const cards: Buffer[] = [];
  for (const buf of raw) {
    if (!buf) continue;
    try {
      cards.push(
        await sharp(buf)
          .resize(CARD_W, CARD_H, { fit: 'cover' })
          .composite([{ input: roundedMask(), blend: 'dest-in' }])
          .png()
          .toBuffer()
      );
    } catch {
      /* uszkodzony obraz pomijamy */
    }
  }
  if (cards.length === 0) return null;

  const pos = layout(cards.length);
  const layers: { input: Buffer; left: number; top: number }[] = [];
  for (let i = 0; i < cards.length; i++) {
    const p = pos[i];
    let input = cards[i];
    let left = p.left;
    let top = p.top;
    if (p.angle) {
      const rotated = sharp(input).rotate(p.angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
      const { data, info } = await rotated.png().toBuffer({ resolveWithObject: true });
      input = data;
      left = Math.round(p.left + (CARD_W - info.width) / 2);
      top = Math.round(p.top + (CARD_H - info.height) / 2);
    }
    // sharp nie przyjmuje warstw wystających poza obraz
    left = Math.max(0, left);
    top = Math.max(0, top);
    layers.push({ input, left, top });
  }

  // Środkowa karta na wierzchu: najpierw skrajne, na końcu środek
  const mid = (layers.length - 1) / 2;
  const order = layers
    .map((l, i) => ({ l, d: Math.abs(i - mid), i }))
    .sort((a, b) => b.d - a.d || a.i - b.i)
    .map((x) => x.l);

  return sharp(background()).composite(order).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
}

// ---------- cache gotowych obrazków ----------

const TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, { at: number; buf: Buffer | null }>();
const pending = new Map<string, Promise<Buffer | null>>();

export async function cachedOgImage(key: string, build: () => Promise<Buffer | null>): Promise<Buffer | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.buf;
  const running = pending.get(key);
  if (running) return running;
  const p = build()
    .catch((err) => {
      console.warn('[OG] obrazek:', err?.message || err);
      return null;
    })
    .then((buf) => {
      if (cache.size > 200) cache.delete(cache.keys().next().value as string);
      cache.set(key, { at: Date.now(), buf });
      return buf;
    })
    .finally(() => pending.delete(key));
  pending.set(key, p);
  return p;
}

/** Krótki skrót listy kart: zmienia adres obrazka, gdy zmienia się oferta (Facebook trzyma stare obrazki w cache). */
export function shortHash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
