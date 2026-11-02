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
// Granice w całych pikselach karty 300×420, więc przesunięcie o piksel to zwykłe wycięcie (bez skalowania).
const BW = 150; // połowa szerokości
const BH = 67; // ok. 16% wysokości
const BX0 = 0;
const BY0 = CARD_H - BH;

/** Zaokrąglony róg i skrajne brzegi pomijamy (tło zza karty, wypełnienie rogów w obrazach Scryfall). */
const CORNER = 16; // promień zaokrąglenia rogu karty (ok. 3 mm z 63 mm) w pikselach karty 300×420
const EDGE = 3;

/** Przesunięcie zdjęcia względem wzorca (niedokładnie wykryte rogi), w pikselach karty 300×420. */
const MAX_SHIFT = 12;
/** Krok zgrubnego szukania przesunięcia (potem dokładnie co 1 px). */
const COARSE_STEP = 2;
/** Dopasowanie lokalne wokół symbolu: rogi wykryte na zdjęciu przesuwają i skalują kadr różnie w różnych miejscach. */
const LOCAL_SHIFT = 4;
const LOCAL_PAD = 22;
/** Dokładne dopasowanie wokół symbolu. */
const FINE_SHIFT = 2;

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

/**
 * Udział symbolu (0 = brak, 1 = pełny symbol jak na wzorcu): od LIST_MIN karta z The List,
 * do REGULAR_MAX zwykłe wydanie, pomiędzy nie wiadomo. Słabo widoczny symbol (rozmycie, mała
 * rozdzielczość rogu) daje na prawdziwych zdjęciach ok. 0,5–0,6, zwykła karta okolice zera.
 */
export const LIST_MIN = 0.35;
export const REGULAR_MAX = 0.15;
const verdictOf = (share: number): ListVerdict => (share >= LIST_MIN ? 'list' : share <= REGULAR_MAX ? 'regular' : null);

export type ListVerdict = 'list' | 'regular' | null;
export interface ListCheck {
  verdict: ListVerdict;
  /** Udział symbolu The List na zdjęciu (0 = brak, 1 = pełny); null, gdy nie dało się porównać. */
  score: number | null;
  reason?: string;
  /** Pomiary do logu (strojenie progów na prawdziwych skanach). */
  debug?: string;
  /** Porównana para do logu, np. "plst/MH1-123~mh1/123". */
  pair?: string;
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
/** Obraz w kanonicznym rozmiarze karty 300×420 (zdjęcie z przeglądarki zwykle już go ma). */
function canonical(img: GrayImage): GrayImage {
  if (img.width === CARD_W && img.height === CARD_H) return img;
  return { width: CARD_W, height: CARD_H, data: areaResize(img, { x0: 0, y0: 0, x1: 1, y1: 1 }, CARD_W, CARD_H) };
}

/** Pas karty kanonicznej (bez normalizacji) przesunięty o dx, dy pikseli; poza obrazem 0. */
function band(img: GrayImage, dx = 0, dy = 0): Float32Array {
  const out = new Float32Array(BW * BH);
  for (let y = 0; y < BH; y++) {
    const sy = BY0 + y + dy;
    if (sy < 0 || sy >= img.height) continue;
    const row = sy * img.width;
    for (let x = 0; x < BW; x++) {
      const sx = BX0 + x + dx;
      if (sx >= 0 && sx < img.width) out[y * BW + x] = img.data[row + sx];
    }
  }
  return out;
}

/** Piksele pasa brane pod uwagę (bez rogu i skrajnych brzegów). */
const USABLE: Uint8Array = (() => {
  const m = new Uint8Array(BW * BH);
  for (let y = 0; y < BH; y++) {
    for (let x = 0; x < BW; x++) {
      const fromBottom = BH - 1 - y;
      // tylko to, co leży poza łukiem zaokrąglonego rogu (tło za kartą, wypełnienie rogu w obrazach Scryfall)
      const corner = x < CORNER && fromBottom < CORNER && (CORNER - x) ** 2 + (CORNER - fromBottom) ** 2 > CORNER ** 2;
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
  /** Opis symbolu do logu: ramka x0-x1,y0-y1 w pasie 150×67, liczba pikseli, siła różnicy. */
  info: string;
  regular: Float32Array; // pas zwykłego wydania, znormalizowany
  list: Float32Array; // pas wydania z The List, dopasowany do zwykłego i znormalizowany
  mask: Uint8Array; // piksele symbolu
  window: Uint8Array; // okno wokół symbolu
  ring: Uint8Array; // okno bez symbolu
  localIdx: Int32Array; // otoczenie symbolu (bez symbolu) do lokalnego dopasowania zdjęcia
  commonIdx: Int32Array; // cały pas bez okna symbolu, do zgrubnego dopasowania
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
function buildPair(regularRaw: GrayImage, listRaw: GrayImage): { model: PairModel | null; reason?: string } {
  const regularImg = canonical(regularRaw);
  const listImg = canonical(listRaw);
  const regular = normalize(band(regularImg));
  const aligned = bestShift(regular, listImg, USABLE, 3);
  if (aligned.corr < 0.6) return { model: null, reason: `wzorce_niepodobne(${aligned.corr.toFixed(2)})` };
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
  const share = best.sum / total;
  const strength = area ? best.sum / area : 0;
  const stats = `pole=${area},udzial=${share.toFixed(2)},sila=${strength.toFixed(2)},wzorce=${aligned.corr.toFixed(2)}@${aligned.dx},${aligned.dy}`;
  if (area < MASK_MIN_AREA || area > MASK_MAX_AREA) return { model: null, reason: `zly_rozmiar(${stats})` };
  if (share < MASK_MIN_SHARE) return { model: null, reason: `roznica_rozproszona(${stats})` };
  if (strength < MASK_MIN_STRENGTH) return { model: null, reason: `slaby_symbol(${stats})` };

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
  if (x1 - x0 + 1 > MASK_MAX_SIDE || y1 - y0 + 1 > MASK_MAX_SIDE) return { model: null, reason: `zly_ksztalt(x${x0}-${x1},y${y0}-${y1},${stats})` };

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
  const local = new Uint8Array(regular.length);
  for (let y = Math.max(0, y0 - LOCAL_PAD); y <= Math.min(BH - 1, y1 + LOCAL_PAD); y++) {
    for (let x = Math.max(0, x0 - LOCAL_PAD); x <= Math.min(BW - 1, x1 + LOCAL_PAD); x++) {
      const i = y * BW + x;
      // bez symbolu z zapasem 2 px, żeby jego obecność nie ciągnęła dopasowania w żadną stronę
      const nearSymbol = x >= x0 - 2 && x <= x1 + 2 && y >= y0 - 2 && y <= y1 + 2;
      if (USABLE[i] && !nearSymbol) local[i] = 1;
    }
  }
  for (let y = Math.max(0, y0 - WINDOW_PAD); y <= Math.min(BH - 1, y1 + WINDOW_PAD); y++) {
    for (let x = Math.max(0, x0 - WINDOW_PAD); x <= Math.min(BW - 1, x1 + WINDOW_PAD); x++) {
      const i = y * BW + x;
      if (!USABLE[i]) continue;
      window[i] = 1;
      if (!mask[i]) ring[i] = 1;
    }
  }
  return { model: { info: `symbol=x${x0}-${x1},y${y0}-${y1},${stats}`, regular, list, mask, window, ring, localIdx: indicesOf(local), commonIdx: indicesOf(Uint8Array.from(USABLE, (u, i) => (u && !window[i] ? 1 : 0))) } };
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
/** Indeksy pikseli pasa zaznaczonych w masce (szybsze pętle niż przegląd całego pasa). */
function indicesOf(mask: Uint8Array): Int32Array {
  let n = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) n++;
  const out = new Int32Array(n);
  for (let i = 0, k = 0; i < mask.length; i++) if (mask[i]) out[k++] = i;
  return out;
}

/** Korelacja Pearsona wzorca i zdjęcia przesuniętego o dx, dy na wskazanych pikselach pasa (bez kopiowania). */
function correlationAt(fixed: Float32Array, photo: GrayImage, idx: Int32Array, dx: number, dy: number): number {
  let n = 0, sa = 0, sb = 0, sab = 0, saa = 0, sbb = 0;
  for (let k = 0; k < idx.length; k++) {
    const i = idx[k];
    const x = (i % BW) + BX0 + dx;
    const y = ((i / BW) | 0) + BY0 + dy;
    const b = x >= 0 && y >= 0 && x < photo.width && y < photo.height ? photo.data[y * photo.width + x] : 0;
    const a = fixed[i];
    n++;
    sa += a;
    sb += b;
    sab += a * b;
    saa += a * a;
    sbb += b * b;
  }
  if (!n) return 0;
  const cov = sab / n - (sa / n) * (sb / n);
  const va = saa / n - (sa / n) ** 2;
  const vb = sbb / n - (sb / n) ** 2;
  return va > 1e-9 && vb > 1e-9 ? cov / Math.sqrt(va * vb) : 0;
}

/** Przesunięcie zdjęcia najlepiej zgodne z wzorcem na pikselach `idx`: zgrubnie co `step`, potem co 1 px. */
function alignPhoto(fixed: Float32Array, photo: GrayImage, idx: Int32Array, center: { dx: number; dy: number }, range: number, step: number) {
  let best = { dx: center.dx, dy: center.dy, corr: -Infinity };
  const tryAt = (dx: number, dy: number) => {
    const corr = correlationAt(fixed, photo, idx, dx, dy);
    if (corr > best.corr) best = { dx, dy, corr };
  };
  for (let dy = center.dy - range; dy <= center.dy + range; dy += step) {
    for (let dx = center.dx - range; dx <= center.dx + range; dx += step) tryAt(dx, dy);
  }
  if (step > 1) {
    const c = { dx: best.dx, dy: best.dy };
    for (let dy = c.dy - step + 1; dy <= c.dy + step - 1; dy++) {
      for (let dx = c.dx - step + 1; dx <= c.dx + step - 1; dx++) if (dx !== c.dx || dy !== c.dy) tryAt(dx, dy);
    }
  }
  return best;
}

function frameScore(model: PairModel, photoRaw: GrayImage): { score: number | null; reason?: string; debug: string } {
  const photo = canonical(photoRaw);
  // 1. Zgrubnie: cały pas bez okolicy symbolu (ramka, tekst stopki).
  const coarse = alignPhoto(model.regular, photo, model.commonIdx, { dx: 0, dy: 0 }, MAX_SHIFT, COARSE_STEP);
  if (coarse.corr < 0.35) return { score: null, reason: 'zdjecie_niepodobne', debug: `kadr=${coarse.corr.toFixed(2)}@${coarse.dx},${coarse.dy}` };

  // 2. Lokalnie wokół symbolu (bez niego): błędy rogów i skali przesuwają róg inaczej niż resztę pasa.
  const local = alignPhoto(model.regular, photo, model.localIdx, coarse, LOCAL_SHIFT, 1);
  const at = local.corr > 0.3 ? local : coarse;

  // 3. Dokładnie: przesunięcie wybiera samo otoczenie symbolu (identyczne w obu wzorcach), więc nie faworyzuje
  // żadnego z nich. W tym położeniu porównujemy tylko piksele symbolu: reszta okna to głównie czarna ramka,
  // taka sama w obu wzorcach, i tylko rozcieńczałaby różnicę przy słabo widocznym symbolu.
  let best = { dx: at.dx, dy: at.dy, ring: Infinity, photo: null as Float32Array | null };
  for (let dy = at.dy - FINE_SHIFT; dy <= at.dy + FINE_SHIFT; dy++) {
    for (let dx = at.dx - FINE_SHIFT; dx <= at.dx + FINE_SHIFT; dx++) {
      const b = normalize(band(photo, dx, dy));
      const ring = meanSquaredError(b, model.regular, model.ring);
      if (ring < best.ring) best = { dx, dy, ring, photo: b };
    }
  }
  const b = best.photo!;
  const ringErr = best.ring;
  // Udział symbolu: rzut różnicy (zdjęcie − zwykłe) na różnicę (The List − zwykłe) w oknie symbolu.
  // 0 = brak symbolu, 1 = pełny symbol; niezależny od kontrastu, więc słabo widoczny symbol daje np. 0,5,
  // a nie remis między wzorcami jak przy porównaniu błędów.
  let num = 0;
  let den = 0;
  for (let i = 0; i < b.length; i++) {
    if (!model.window[i]) continue;
    const d = model.list[i] - model.regular[i];
    num += (b[i] - model.regular[i]) * d;
    den += d * d;
  }
  const share = den > 0 ? num / den : NaN;
  const errRegular = meanSquaredError(b, model.regular, model.mask);
  const errList = meanSquaredError(b, model.list, model.mask);
  // dawna miara (całe okno) tylko do logu, do porównania
  const winRegular = meanSquaredError(b, model.regular, model.window);
  const winList = meanSquaredError(b, model.list, model.window);
  const debug =
    `kadr=${coarse.corr.toFixed(2)}@${coarse.dx},${coarse.dy} róg=${local.corr.toFixed(2)}@${local.dx},${local.dy} ` +
    `@${best.dx},${best.dy} udzialSymbolu=${Number.isFinite(share) ? share.toFixed(2) : '-'} symbolZw=${errRegular.toFixed(2)} symbolLista=${errList.toFixed(2)} ` +
    `oknoZw=${winRegular.toFixed(2)} oknoLista=${winList.toFixed(2)} otoczenie=${ringErr.toFixed(2)}`;
  if (ringErr > RING_MAX_ERROR) return { score: null, reason: 'zaklocone_otoczenie', debug };
  if (!Number.isFinite(share)) return { score: null, reason: 'brak_kontrastu', debug };
  return { score: share, debug };
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
  const frames: string[] = [];
  for (const photo of photos) {
    const s = frameScore(model, photo);
    frames.push(`[${s.score === null ? s.reason : s.score.toFixed(2)} ${s.debug}]`);
    if (s.score === null) lastReason = s.reason;
    else scores.push(s.score);
  }
  const debug = `${model.info} klatki=${frames.join('')}`;
  if (!scores.length) return { verdict: null, score: null, reason: lastReason, debug };
  const score = scores.reduce((a, b) => a + b, 0) / scores.length;
  const verdict = verdictOf(score);
  return { verdict, score: Math.round(score * 100) / 100, debug };
}

/** Do testów: wzorce podane wprost zamiast pobierania ze Scryfall. */
export function checkListMarkWithImages(photos: GrayImage[], regularImg: GrayImage, listImg: GrayImage): ListCheck {
  const { model, reason } = buildPair(regularImg, listImg);
  if (!model) return { verdict: null, score: null, reason };
  const scores = photos.map((p) => frameScore(model, p)).filter((s) => s.score !== null).map((s) => s.score!);
  if (!scores.length) return { verdict: null, score: null, reason: 'brak_ocen' };
  const score = scores.reduce((a, b) => a + b, 0) / scores.length;
  return { verdict: verdictOf(score), score };
}
