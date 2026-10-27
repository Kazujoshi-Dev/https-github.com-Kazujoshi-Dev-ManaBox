/**
 * Odciski obrazów kart (perceptual hash) do rozpoznawania wydania po wyglądzie.
 *
 * Ten sam algorytm liczy odcisk obrazu wzorcowego ze Scryfall (indeks) i zdjęcia
 * karty z kamery (zapytanie), więc oba muszą przejść identyczną ścieżkę:
 * dekodowanie JPEG → skala szarości → uśrednianie do siatki → dHash.
 *
 * dHash koduje znak różnicy jasności sąsiednich pól siatki, dzięki czemu jest
 * odporny na zmianę jasności, kontrastu i kompresję. Dla każdego regionu
 * liczymy gradient poziomy i pionowy (2 × 256 bitów = 64 bajty).
 */
import jpeg from 'jpeg-js';

export const HASH_VERSION = 1;
export const REGION_BYTES = 64; // 512 bitów na region
export const HASH_BYTES = REGION_BYTES * 2; // region ilustracji + cała karta

const GRID = 16;

interface Region {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Ilustracja (wnętrze ramki — działa dla większości wariantów ramek). */
const ART_REGION: Region = { x0: 0.1, y0: 0.13, x1: 0.9, y1: 0.52 };
/** Cała karta bez skrajnych brzegów (zaokrąglone rogi, niedokładne kadrowanie). */
const CARD_REGION: Region = { x0: 0.04, y0: 0.03, x1: 0.96, y1: 0.97 };

export interface GrayImage {
  width: number;
  height: number;
  data: Float32Array;
}

export function decodeJpegToGray(buf: Uint8Array): GrayImage {
  const img = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 64, maxResolutionInMP: 12 });
  const { width, height, data } = img;
  const gray = new Float32Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }
  return { width, height, data: gray };
}

/** Surowe piksele RGB/RGBA (np. z dekodera AVIF) → skala szarości tym samym wzorem co przy JPEG. */
export function rawToGray(data: Uint8Array, width: number, height: number, channels: number): GrayImage {
  const gray = new Float32Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += channels) {
    gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }
  return { width, height, data: gray };
}

/** Uśrednia region obrazu do siatki outW × outH (filtr pudełkowy z wagami częściowych pikseli). */
function areaResize(img: GrayImage, r: Region, outW: number, outH: number): Float32Array {
  const out = new Float32Array(outW * outH);
  const rx0 = r.x0 * img.width;
  const ry0 = r.y0 * img.height;
  const cw = ((r.x1 - r.x0) * img.width) / outW;
  const ch = ((r.y1 - r.y0) * img.height) / outH;
  for (let oy = 0; oy < outH; oy++) {
    const sy0 = ry0 + oy * ch;
    const sy1 = sy0 + ch;
    for (let ox = 0; ox < outW; ox++) {
      const sx0 = rx0 + ox * cw;
      const sx1 = sx0 + cw;
      let sum = 0;
      let wsum = 0;
      for (let y = Math.floor(sy0); y < Math.ceil(sy1); y++) {
        if (y < 0 || y >= img.height) continue;
        const wy = Math.min(y + 1, sy1) - Math.max(y, sy0);
        if (wy <= 0) continue;
        const row = y * img.width;
        for (let x = Math.floor(sx0); x < Math.ceil(sx1); x++) {
          if (x < 0 || x >= img.width) continue;
          const wx = Math.min(x + 1, sx1) - Math.max(x, sx0);
          if (wx <= 0) continue;
          const w = wx * wy;
          sum += img.data[row + x] * w;
          wsum += w;
        }
      }
      out[oy * outW + ox] = wsum > 0 ? sum / wsum : 0;
    }
  }
  return out;
}

/**
 * Niedokładnie wykryte rogi karty przesuwają lub skalują cały kadr. Wariant odcisku
 * zapytania liczymy z regionów przekształconych tak samo, jak zrobiłby to taki błąd:
 * u' = 0.5 + (u − 0.5)·s + dx (analogicznie v).
 */
export interface FrameJitter {
  dx: number;
  dy: number;
  s: number;
}

const NO_JITTER: FrameJitter = { dx: 0, dy: 0, s: 1 };

function jitterRegion(r: Region, j: FrameJitter): Region {
  const fx = (u: number) => 0.5 + (u - 0.5) * j.s + j.dx;
  const fy = (v: number) => 0.5 + (v - 0.5) * j.s + j.dy;
  return { x0: fx(r.x0), y0: fy(r.y0), x1: fx(r.x1), y1: fy(r.y1) };
}

/**
 * Warianty dla zdjęcia z kamery: przesunięcia o ±2% i skala ±3%. Pierwszy to wariant
 * bez zmian (do zgrubnego przeszukania całego indeksu), pozostałe do dokładnego porównania.
 */
const QUERY_JITTERS: FrameJitter[] = [
  NO_JITTER,
  ...[-0.02, 0, 0.02].flatMap((dx) => [-0.02, 0, 0.02].map((dy) => ({ dx, dy, s: 1 }))).filter((j) => j.dx || j.dy),
  { dx: 0, dy: 0, s: 0.97 },
  { dx: 0, dy: 0, s: 1.03 }
];

function regionHash(img: GrayImage, r: Region, out: Uint8Array, offset: number): void {
  let bit = 0;
  const setBit = (on: boolean) => {
    if (on) out[offset + (bit >> 3)] |= 1 << (bit & 7);
    bit++;
  };
  // gradient poziomy: siatka (GRID+1) × GRID
  const h = areaResize(img, r, GRID + 1, GRID);
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) setBit(h[y * (GRID + 1) + x + 1] > h[y * (GRID + 1) + x]);
  }
  // gradient pionowy: siatka GRID × (GRID+1)
  const v = areaResize(img, r, GRID, GRID + 1);
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) setBit(v[(y + 1) * GRID + x] > v[y * GRID + x]);
  }
}

/** Odcisk karty: 64 bajty ilustracji + 64 bajty całej karty. Obraz musi być wyprostowaną, całą kartą. */
export function computeCardHash(img: GrayImage, jitter: FrameJitter = NO_JITTER): Uint8Array {
  const out = new Uint8Array(HASH_BYTES);
  regionHash(img, jitterRegion(ART_REGION, jitter), out, 0);
  regionHash(img, jitterRegion(CARD_REGION, jitter), out, REGION_BYTES);
  return out;
}

/** Odciski zdjęcia z kamery: [0] bez zmian, dalej warianty tolerujące niedokładne rogi. */
export function computeQueryHashes(img: GrayImage): Uint8Array[] {
  return QUERY_JITTERS.map((j) => computeCardHash(img, j));
}

const POPCOUNT8 = new Uint8Array(256);
for (let i = 0; i < 256; i++) POPCOUNT8[i] = (i & 1) + POPCOUNT8[i >> 1];

/** Odległość Hamminga dla fragmentu dwóch buforów. */
export function hamming(a: Uint8Array, aOff: number, b: Uint8Array, bOff: number, len: number): number {
  let d = 0;
  for (let i = 0; i < len; i++) d += POPCOUNT8[a[aOff + i] ^ b[bOff + i]];
  return d;
}

/**
 * Łączna odległość: ilustracja ma większą wagę (identyfikuje kartę),
 * cała karta rozróżnia ramki i wydania z tą samą ilustracją. Zakres 0..1024.
 */
export function combinedDistance(query: Uint8Array, store: Uint8Array, offset: number): number {
  const art = hamming(query, 0, store, offset, REGION_BYTES);
  const card = hamming(query, REGION_BYTES, store, offset + REGION_BYTES, REGION_BYTES);
  return art * 1.25 + card * 0.75;
}

export const HASH_WORDS = HASH_BYTES / 4;
const REGION_WORDS = REGION_BYTES / 4;

function popcount32(x: number): number {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (Math.imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24);
}

/** To samo co combinedDistance, ale na słowach 32-bitowych (ok. 2× szybciej przy przeszukiwaniu całego indeksu). */
export function combinedDistance32(query: Uint32Array, store: Uint32Array, wordOffset: number): number {
  let art = 0;
  let card = 0;
  for (let k = 0; k < REGION_WORDS; k++) art += popcount32(query[k] ^ store[wordOffset + k]);
  for (let k = REGION_WORDS; k < HASH_WORDS; k++) card += popcount32(query[k] ^ store[wordOffset + k]);
  return art * 1.25 + card * 0.75;
}

/** Widok 32-bitowy odcisku (kopiuje, gdy bufor nie jest wyrównany do 4 bajtów). */
export function asWords(hash: Uint8Array): Uint32Array {
  if (hash.byteOffset % 4 === 0) return new Uint32Array(hash.buffer, hash.byteOffset, hash.byteLength >> 2);
  return new Uint32Array(hash.slice().buffer);
}
