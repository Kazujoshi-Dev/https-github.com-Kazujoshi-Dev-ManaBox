/**
 * Rozpoznawanie kart z „The List” (Scryfall: set `plst`).
 *
 * Karta z The List to dodruk zwykłej karty z tą samą ilustracją, ramką i stopką (kod setu i numer
 * oryginału), różniąca się tylko małym symbolem planeswalkera w lewym dolnym rogu. Odcisk całej
 * karty i stopka tego nie rozróżniają, więc porównujemy sam lewy dolny róg zdjęcia z obrazami obu
 * wydań ze Scryfall. Miejsce symbolu wyznaczamy z różnicy tych dwóch obrazów, więc nie zależy ono
 * od rodzaju ramki (stara, nowa, futureshifted itd.).
 *
 * Wynik jest ostrożny: przy słabym, zasłoniętym (odblask) albo dziwnym obrazie zwracamy `null`
 * i rozpoznanie zostaje takie, jak bez tego sprawdzenia.
 */
import { APP_USER_AGENT } from '../userAgent';
import { areaResize, decodeJpegToGray, type GrayImage } from './imageHash';

/** Kanoniczny rozmiar karty (jak wyprostowana karta z kamery w scanEngine.ts). */
const CARD_W = 300;
const CARD_H = 420;
/** Lewy dolny pas karty, w którym jest symbol The List (z zapasem). */
const BAND = { x0: 0, y0: 0.84, x1: 0.5, y1: 1 };
const BW = Math.round(CARD_W * (BAND.x1 - BAND.x0)); // 150
const BH = Math.round(CARD_H * (BAND.y1 - BAND.y0)); // 67

/** Zaokrąglony róg i skrajne brzegi pomijamy (tło zza karty, wypełnienie rogów w obrazach Scryfall). */
const CORNER = 16;
const EDGE = 3;

/** Przesunięcie zdjęcia względem wzorca (niedokładnie wykryte rogi), w pikselach karty 300×420. */
const MAX_SHIFT = 5;
/** Dokładne dopasowanie wokół symbolu. */
const FINE_SHIFT = 1;

/** Różnica (w odchyleniach standardowych pasa) uznawana za część symbolu. */
const MASK_THRESHOLD = 1.2;
const MASK_MIN_AREA = 6;
const MASK_MAX_AREA = 500;
const MASK_MAX_SIDE = 36;
/** Symbol musi być wyraźny i skupiony w jednym miejscu, inaczej obrazy wzorcowe różnią się czymś innym. */
const MASK_MIN_STRENGTH = 1.6;
const MASK_MIN_SHARE = 0.35;
/** Okno porównania: ramka symbolu powiększona o tyle pikseli. */
const WINDOW_PAD = 5;
/** Otoczenie symbolu na zdjęciu musi zgadzać się z wzorcem (inaczej odblask, palec, koszulka). */
const RING_MAX_ERROR = 0.9;

/** Wynik powyżej: karta z The List; poniżej minus tej wartości: zwykłe wydanie; pomiędzy: nie wiadomo. */
export const LIST_DECISION = 0.3;

export type ListVerdict = 'list' | 'regular' | null;
export interface ListCheck {
  verdict: ListVerdict;
  /** −1..1: dodatnie = bliżej wydania z The List, ujemne = bliżej zwykłego; null, gdy nie dało się porównać. */
  score: number | null;
  reason?: string;
}

export const isListPrinting = (card: any): boolean => card?.set === 'plst';

/**
 * Kod setu i numer oryginału zapisane w numerze kolekcjonerskim karty z The List
 * (np. "MH1-123" → { set: "mh1", number: "123" }).
 */
export function listOrigin(card: any): { set: string; number: string } | null {
  if (!isListPrinting(card)) return null;
  const m = /^([a-z0-9]{2,6})-(.+)$/i.exec(String(card.collector_number || ''));
  return m ? { set: m[1].toLowerCase(), number: m[2].toLowerCase().replace(/^0+(?=\d)/, '') } : null;
}

/** Czy wydanie z The List jest dodrukiem właśnie tej zwykłej karty (ten sam set i numer). */
export function isListTwinOf(list: any, regular: any): boolean {
  const o = listOrigin(list);
  if (!o || !regular || isListPrinting(regular)) return false;
  return o.set === String(regular.set).toLowerCase() && o.number === String(regular.collector_number).toLowerCase().replace(/^0+(?=\d)/, '');
}

// ---------------------------------------------------------------------------------------------
// Obrazy wzorcowe

function imageUrl(card: any): string | null {
  return card?.image_uris?.normal || card?.card_faces?.[0]?.image_uris?.normal || null;
}

/** Pas karty (bez normalizacji) z przesunięciem dx, dy w pikselach karty 300×420. */
function band(img: GrayImage, dx = 0, dy = 0): Float32Array {
  const ox = dx / CARD_W;
  const oy = dy / CARD_H;
  return areaResize(img, { x0: BAND.x0 + ox, y0: BAND.y0 + oy, x1: BAND.x1 + ox, y1: BAND.y1 + oy }, BW, BH);
}

/** Piksele pasa brane pod uwagę (bez rogu i skrajnych brzegów). */
const USABLE: Uint8Array = (() => {
  const m = new Uint8Array(BW * BH);
  for (let y = 0; y < BH; y++) {
    for (let x = 0; x < BW; x++) {
      const fromBottom = BH - 1 - y;
      const corner = x < CORNER && fromBottom < CORNER && (CORNER - x) ** 2 + (CORNER - fromBottom) ** 2 > (CORNER * 0.4) ** 2;
      m[y * BW + x] = x >= EDGE && fromBottom >= EDGE && !corner ? 1 : 0;
    }
  }
  return m;
})();

/** Normalizacja jasności i kontrastu (średnia 0, odchylenie 1) po pikselach z `use`. */
function normalize(a: Float32Array, use: Uint8Array = USABLE): Float32Array {
  let n = 0;
  let sum = 0;
  let sq = 0;
  for (let i = 0; i < a.length; i++) {
    if (!use[i]) continue;
    n++;
    sum += a[i];
    sq += a[i] * a[i];
  }
  const mean = n ? sum / n : 0;
  const std = n ? Math.sqrt(Math.max(1e-6, sq / n - mean * mean)) : 1;
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = (a[i] - mean) / std;
  return out;
}

function correlation(a: Float32Array, b: Float32Array, use: Uint8Array): number {
  let n = 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    if (!use[i]) continue;
    n++;
    s += a[i] * b[i];
  }
  return n ? s / n : 0;
}

const refCache = new Map<string, { at: number; img: GrayImage | null }>();
const refInFlight = new Map<string, Promise<GrayImage | null>>();
const REF_CACHE_MAX = 300;
const REF_FAIL_TTL_MS = 10 * 60_000;
const REF_TIMEOUT_MS = 3000;

/** Obraz wydania ze Scryfall w kanonicznym rozmiarze (z pamięci podręcznej). */
async function referenceImage(card: any): Promise<GrayImage | null> {
  const id = String(card?.id || '');
  const url = imageUrl(card);
  if (!id || !url) return null;
  const cached = refCache.get(id);
  if (cached && (cached.img || Date.now() - cached.at < REF_FAIL_TTL_MS)) {
    refCache.delete(id);
    refCache.set(id, cached); // LRU: ostatnio użyte na koniec
    return cached.img;
  }
  let pending = refInFlight.get(id);
  if (!pending) {
    pending = (async () => {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': APP_USER_AGENT, Accept: 'image/jpeg' },
          redirect: 'follow',
          signal: AbortSignal.timeout(REF_TIMEOUT_MS)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const img = decodeJpegToGray(new Uint8Array(await res.arrayBuffer()));
        const canon: GrayImage = { width: CARD_W, height: CARD_H, data: areaResize(img, { x0: 0, y0: 0, x1: 1, y1: 1 }, CARD_W, CARD_H) };
        return canon;
      } catch {
        return null;
      }
    })();
    refInFlight.set(id, pending);
  }
  const img = await pending.finally(() => refInFlight.delete(id));
  refCache.set(id, { at: Date.now(), img });
  while (refCache.size > REF_CACHE_MAX) refCache.delete(refCache.keys().next().value as string);
  return img;
}

// ---------------------------------------------------------------------------------------------
// Para wzorców: zwykłe wydanie i wydanie z The List

interface PairModel {
  regular: Float32Array; // pas zwykłego wydania, znormalizowany
  list: Float32Array; // pas wydania z The List, dopasowany do zwykłego i znormalizowany
  mask: Uint8Array; // piksele symbolu
  window: Uint8Array; // okno wokół symbolu
  ring: Uint8Array; // okno bez symbolu
}

const pairCache = new Map<string, PairModel | null>();
const PAIR_CACHE_MAX = 300;

function bestShift(fixed: Float32Array, img: GrayImage, use: Uint8Array, range: number, center = { dx: 0, dy: 0 }) {
  let best = { dx: center.dx, dy: center.dy, corr: -Infinity, band: fixed };
  for (let dy = center.dy - range; dy <= center.dy + range; dy++) {
    for (let dx = center.dx - range; dx <= center.dx + range; dx++) {
      const b = normalize(band(img, dx, dy));
      const corr = correlation(fixed, b, use);
      if (corr > best.corr) best = { dx, dy, corr, band: b };
    }
  }
  return best;
}

/** Wyznacza symbol z różnicy obrazów obu wydań; null, gdy różnica nie wygląda na pojedynczy symbol. */
function buildPair(regularImg: GrayImage, listImg: GrayImage): { model: PairModel | null; reason?: string } {
  const regular = normalize(band(regularImg));
  const aligned = bestShift(regular, listImg, USABLE, 3);
  if (aligned.corr < 0.6) return { model: null, reason: 'wzorce_niepodobne' };
  const list = aligned.band;

  const diff = new Float32Array(regular.length);
  const strong = new Uint8Array(regular.length);
  let total = 0;
  for (let i = 0; i < diff.length; i++) {
    if (!USABLE[i]) continue;
    diff[i] = list[i] - regular[i];
    if (Math.abs(diff[i]) > MASK_THRESHOLD) {
      strong[i] = 1;
      total += Math.abs(diff[i]);
    }
  }
  if (!total) return { model: null, reason: 'brak_roznicy' };

  // Największa spójna plama różnicy (8-sąsiedztwo) = symbol.
  const label = new Int32Array(regular.length).fill(-1);
  let best = { sum: 0, pixels: [] as number[] };
  for (let start = 0; start < strong.length; start++) {
    if (!strong[start] || label[start] >= 0) continue;
    const pixels: number[] = [];
    let sum = 0;
    const stack = [start];
    label[start] = start;
    while (stack.length) {
      const p = stack.pop()!;
      pixels.push(p);
      sum += Math.abs(diff[p]);
      const px = p % BW;
      const py = (p - px) / BW;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const nx = px + ox;
          const ny = py + oy;
          if (nx < 0 || ny < 0 || nx >= BW || ny >= BH) continue;
          const q = ny * BW + nx;
          if (strong[q] && label[q] < 0) {
            label[q] = start;
            stack.push(q);
          }
        }
      }
    }
    if (sum > best.sum) best = { sum, pixels };
  }
  const area = best.pixels.length;
  if (area < MASK_MIN_AREA || area > MASK_MAX_AREA) return { model: null, reason: `zly_rozmiar_${area}` };
  if (best.sum / total < MASK_MIN_SHARE) return { model: null, reason: 'roznica_rozproszona' };
  if (best.sum / area < MASK_MIN_STRENGTH) return { model: null, reason: 'slaby_symbol' };

  let x0 = BW;
  let y0 = BH;
  let x1 = 0;
  let y1 = 0;
  for (const p of best.pixels) {
    const x = p % BW;
    const y = (p - x) / BW;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  if (x1 - x0 + 1 > MASK_MAX_SIDE || y1 - y0 + 1 > MASK_MAX_SIDE) return { model: null, reason: 'zly_ksztalt' };

  // Symbol z marginesem 1 px (krawędzie zmiękczone przez skalowanie) i okno wokół niego.
  const mask = new Uint8Array(regular.length);
  for (const p of best.pixels) {
    const x = p % BW;
    const y = (p - x) / BW;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const nx = x + ox;
        const ny = y + oy;
        if (nx >= 0 && ny >= 0 && nx < BW && ny < BH && USABLE[ny * BW + nx]) mask[ny * BW + nx] = 1;
      }
    }
  }
  const window = new Uint8Array(regular.length);
  const ring = new Uint8Array(regular.length);
  for (let y = Math.max(0, y0 - WINDOW_PAD); y <= Math.min(BH - 1, y1 + WINDOW_PAD); y++) {
    for (let x = Math.max(0, x0 - WINDOW_PAD); x <= Math.min(BW - 1, x1 + WINDOW_PAD); x++) {
      const i = y * BW + x;
      if (!USABLE[i]) continue;
      window[i] = 1;
      if (!mask[i]) ring[i] = 1;
    }
  }
  return { model: { regular, list, mask, window, ring } };
}

async function pairModel(regularCard: any, listCard: any): Promise<{ model: PairModel | null; reason?: string }> {
  const key = `${regularCard.id}|${listCard.id}`;
  if (pairCache.has(key)) return { model: pairCache.get(key)!, reason: pairCache.get(key) ? undefined : 'wzorzec_odrzucony' };
  const [r, l] = await Promise.all([referenceImage(regularCard), referenceImage(listCard)]);
  if (!r || !l) return { model: null, reason: 'brak_obrazu_wzorca' }; // nie zapamiętujemy: może się udać później
  const built = buildPair(r, l);
  pairCache.set(key, built.model);
  while (pairCache.size > PAIR_CACHE_MAX) pairCache.delete(pairCache.keys().next().value as string);
  return built;
}

// ---------------------------------------------------------------------------------------------
// Porównanie zdjęcia

function meanSquaredError(a: Float32Array, b: Float32Array, use: Uint8Array): number {
  let n = 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    if (!use[i]) continue;
    n++;
    s += (a[i] - b[i]) ** 2;
  }
  return n ? s / n : Infinity;
}

/** Wynik −1..1 dla jednej klatki albo null, gdy klatka nic nie rozstrzyga. */
function frameScore(model: PairModel, photo: GrayImage): { score: number | null; reason?: string } {
  // Dopasowanie zdjęcia do wzorca po wspólnej treści (bez symbolu): ramka, tekst stopki.
  const common = new Uint8Array(model.regular.length);
  for (let i = 0; i < common.length; i++) common[i] = USABLE[i] && !model.window[i] ? 1 : 0;
  const coarse = bestShift(model.regular, photo, common, MAX_SHIFT);
  if (coarse.corr < 0.35) return { score: null, reason: 'zdjecie_niepodobne' };

  // Dokładnie wokół symbolu: najmniejszy błąd względem każdego wzorca (symetrycznie dla obu).
  let errRegular = Infinity;
  let errList = Infinity;
  let ringErr = Infinity;
  for (let dy = coarse.dy - FINE_SHIFT; dy <= coarse.dy + FINE_SHIFT; dy++) {
    for (let dx = coarse.dx - FINE_SHIFT; dx <= coarse.dx + FINE_SHIFT; dx++) {
      const b = normalize(band(photo, dx, dy));
      errRegular = Math.min(errRegular, meanSquaredError(b, model.regular, model.window));
      errList = Math.min(errList, meanSquaredError(b, model.list, model.window));
      ringErr = Math.min(ringErr, meanSquaredError(b, model.regular, model.ring));
    }
  }
  if (ringErr > RING_MAX_ERROR) return { score: null, reason: 'zaklocone_otoczenie' };
  const sum = errRegular + errList;
  if (!(sum > 0)) return { score: null, reason: 'brak_kontrastu' };
  return { score: (errRegular - errList) / sum };
}

/**
 * Czy sfotografowana karta to wydanie z The List (`listCard`), czy zwykłe (`regularCard`).
 * `photos` to wyprostowane klatki całej karty (jak do odcisków); kilka klatek uśredniamy.
 */
export async function checkListMark(photos: GrayImage[], regularCard: any, listCard: any): Promise<ListCheck> {
  if (!photos.length) return { verdict: null, score: null, reason: 'brak_zdjecia' };
  const { model, reason } = await pairModel(regularCard, listCard);
  if (!model) return { verdict: null, score: null, reason };
  const scores: number[] = [];
  let lastReason: string | undefined;
  for (const photo of photos) {
    const s = frameScore(model, photo);
    if (s.score === null) lastReason = s.reason;
    else scores.push(s.score);
  }
  if (!scores.length) return { verdict: null, score: null, reason: lastReason };
  const score = scores.reduce((a, b) => a + b, 0) / scores.length;
  const verdict: ListVerdict = score >= LIST_DECISION ? 'list' : score <= -LIST_DECISION ? 'regular' : null;
  return { verdict, score: Math.round(score * 100) / 100 };
}

/** Do testów: wzorce podane wprost zamiast pobierania ze Scryfall. */
export function checkListMarkWithImages(photos: GrayImage[], regularImg: GrayImage, listImg: GrayImage): ListCheck {
  const { model, reason } = buildPair(regularImg, listImg);
  if (!model) return { verdict: null, score: null, reason };
  const scores = photos.map((p) => frameScore(model, p)).filter((s) => s.score !== null).map((s) => s.score!);
  if (!scores.length) return { verdict: null, score: null, reason: 'brak_ocen' };
  const score = scores.reduce((a, b) => a + b, 0) / scores.length;
  return { verdict: score >= LIST_DECISION ? 'list' : score <= -LIST_DECISION ? 'regular' : null, score };
}
