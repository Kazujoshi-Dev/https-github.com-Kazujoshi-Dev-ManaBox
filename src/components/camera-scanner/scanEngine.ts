/**
 * Silnik skanera kart (przeglądarka).
 *
 *  klatka kamery → wykrycie rogów karty → wyprostowanie perspektywy →
 *  1) sam obraz do serwera (odciski ilustracji i całej karty, jak w Delver Lens) —
 *     zwykle wystarcza i trwa ułamek sekundy;
 *  2) gdy obraz nie jest jednoznaczny: OCR nazwy (pasek tytułu) i stopki
 *     (kod setu + numer) → serwer (lokalna baza kart + odciski) → wynik z listą wydań.
 */
import type { Worker } from 'tesseract.js';
import { fetchWithAuth } from '../../services/api';
import { ScanResult } from './types';
import {
  CardRegion,
  Quad,
  Rect,
  detectCardQuad,
  rgbaToGray,
  scaleQuad,
  warpCardRegion
} from './cardDetector';
import { cleanCardTitle, getTesseractWorker } from './ocrProcessor';
import { t, tServer } from '../../i18n';
import type { GameId } from '../../games';

/** Pasek tytułu (nazwa karty, bez kosztu many po prawej). Marginesy z zapasem na niedokładne rogi. */
const TITLE_REGION: CardRegion = { u0: 0.06, v0: 0.03, u1: 0.74, v1: 0.105 };
/** Lewy dolny róg: numer kolekcjonerski, rzadkość, kod setu i język (karty od 2015 r.). */
const FOOTER_REGION: CardRegion = { u0: 0.03, v0: 0.915, u1: 0.46, v1: 0.985 };

/** Ilustracja (jak ART_REGION w src/server/cards/imageHash.ts, z lekkim zapasem). */
const ART_REGION: CardRegion = { u0: 0.08, v0: 0.11, u1: 0.92, v1: 0.55 };

/**
 * Odsetek ilustracji zajęty przez odblask, od którego podpowiadamy użytkownikowi, żeby przechylił kartę.
 * Odblask (np. lampy na folii albo koszulce) zmienia odcisk obrazu i to najczęstsza przyczyna braku rozpoznania.
 */
export const GLARE_WARN = 0.03;

/**
 * Odsetek pikseli ilustracji prześwietlonych do bieli (wszystkie kanały prawie na maksimum).
 * Jasne, ale kolorowe fragmenty grafiki (żółte niebo, biały płaszcz w cieniu) zwykle nie dochodzą do 245 we wszystkich kanałach.
 */
export function measureGlare(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number, region: CardRegion = ART_REGION): number {
  const x0 = Math.max(0, Math.floor(region.u0 * w));
  const x1 = Math.min(w, Math.ceil(region.u1 * w));
  const y0 = Math.max(0, Math.floor(region.v0 * h));
  const y1 = Math.min(h, Math.ceil(region.v1 * h));
  let clipped = 0;
  let total = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const p = (y * w + x) * 4;
      total++;
      if (rgba[p] >= 245 && rgba[p + 1] >= 245 && rgba[p + 2] >= 245) clipped++;
    }
  }
  return total ? clipped / total : 0;
}

/** Szerokość celownika w obrazie do wykrywania — kompromis szybkość/dokładność. */
const DETECT_GUIDE_WIDTH = 240;

let workCanvas: HTMLCanvasElement | null = null;
function canvas2d(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  return { canvas, ctx };
}

function sourceSize(src: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement) {
  if (src instanceof HTMLVideoElement) return { w: src.videoWidth, h: src.videoHeight };
  if (src instanceof HTMLImageElement) return { w: src.naturalWidth, h: src.naturalHeight };
  return { w: src.width, h: src.height };
}

/**
 * Szybkie wykrywanie karty (do pętli na żywo): pomniejszony wycinek wokół celownika.
 * Zwraca czworokąt we współrzędnych pełnej klatki albo null.
 */
export function detectCardInSource(
  src: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  guide: Rect
): { quad: Quad; quality: number } | null {
  const { w, h } = sourceSize(src);
  if (!w || !h || guide.width < 20) return null;
  const margin = 0.3;
  const roi = {
    x: Math.max(0, Math.floor(guide.x - guide.width * margin)),
    y: Math.max(0, Math.floor(guide.y - guide.height * margin)),
    x1: Math.min(w, Math.ceil(guide.x + guide.width * (1 + margin))),
    y1: Math.min(h, Math.ceil(guide.y + guide.height * (1 + margin)))
  };
  const rw = roi.x1 - roi.x;
  const rh = roi.y1 - roi.y;
  const scale = Math.min(1, DETECT_GUIDE_WIDTH / guide.width);
  const dw = Math.max(1, Math.round(rw * scale));
  const dh = Math.max(1, Math.round(rh * scale));
  if (!workCanvas) workCanvas = document.createElement('canvas');
  if (workCanvas.width !== dw || workCanvas.height !== dh) {
    workCanvas.width = dw;
    workCanvas.height = dh;
  }
  const ctx = workCanvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'medium';
  ctx.drawImage(src, roi.x, roi.y, rw, rh, 0, 0, dw, dh);
  const data = ctx.getImageData(0, 0, dw, dh).data;
  const det = detectCardQuad(rgbaToGray(data, dw, dh), dw, dh, {
    x: (guide.x - roi.x) * (dw / rw),
    y: (guide.y - roi.y) * (dh / rh),
    width: guide.width * (dw / rw),
    height: guide.height * (dh / rh)
  });
  if (!det) return null;
  return { quad: scaleQuad(det.quad, rw / dw, rh / dh, roi.x, roi.y), quality: det.quality };
}

/** Czworokąt z prostokąta (gdy karty nie udało się wykryć — używamy celownika). */
export function rectToQuad(r: Rect): Quad {
  return {
    tl: { x: r.x, y: r.y },
    tr: { x: r.x + r.width, y: r.y },
    br: { x: r.x + r.width, y: r.y + r.height },
    bl: { x: r.x, y: r.y + r.height }
  };
}

function toCanvas(rgba: Uint8ClampedArray, w: number, h: number): HTMLCanvasElement {
  const { canvas, ctx } = canvas2d(w, h);
  ctx.putImageData(new ImageData(rgba, w, h), 0, 0);
  return canvas;
}

/**
 * Przygotowanie paska tekstu do OCR: skala szarości, rozciągnięcie kontrastu,
 * binaryzacja Otsu i odwrócenie, jeśli tekst jest jasny na ciemnym tle
 * (np. biała stopka na czarnej ramce) — Tesseract najlepiej czyta ciemny tekst na jasnym.
 */
function prepareForOcr(rgba: Uint8ClampedArray, w: number, h: number): HTMLCanvasElement {
  const gray = rgbaToGray(rgba, w, h);
  const sorted = Float32Array.from(gray).sort();
  const lo = sorted[Math.floor(sorted.length * 0.02)];
  const hi = sorted[Math.floor(sorted.length * 0.98)];
  const range = Math.max(1, hi - lo);
  const hist = new Array(256).fill(0);
  const norm = new Uint8ClampedArray(gray.length);
  for (let i = 0; i < gray.length; i++) {
    norm[i] = ((gray[i] - lo) / range) * 255;
    hist[norm[i]]++;
  }
  // próg Otsu
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, threshold = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = gray.length - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      threshold = i;
    }
  }
  let dark = 0;
  for (let i = 0; i < norm.length; i++) if (norm[i] <= threshold) dark++;
  const invert = dark > norm.length / 2; // przewaga ciemnego tła → jasny tekst
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < norm.length; i++) {
    const isText = invert ? norm[i] > threshold : norm[i] <= threshold;
    const v = isText ? 0 : 255;
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
  // biała ramka dookoła poprawia działanie Tesseracta
  const pad = 12;
  const { canvas, ctx } = canvas2d(w + pad * 2, h + pad * 2);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(toCanvas(out, w, h), pad, pad);
  return canvas;
}

const LANG_CODES = 'EN|DE|FR|IT|ES|PT|JA|JP|KO|RU|ZHS|ZHT|PH|CS|CT';

/** Kod setu i numer kolekcjonerski ze stopki (np. "0123/0280 R / DMU • EN" albo "R 0123 / DMU • EN"). */
export function parseFooter(raw: string): { set?: string; collectorNumber?: string } {
  const text = (raw || '').toUpperCase().replace(/[|]/g, 'I');
  let collectorNumber: string | undefined;
  const slash = text.match(/\b(\d{1,4})\s*[/\\]\s*\d{1,4}\b/);
  const rarityFirst = text.match(/\b[CURMSLTPB]\s+(\d{3,4}[A-Z]?)\b/);
  const bare = text.match(/(?:^|\s)(\d{3,4})(?=\s|$)/m);
  const num = slash?.[1] || rarityFirst?.[1] || bare?.[1];
  if (num) collectorNumber = num.replace(/^0+(?=\d)/, '');

  let set: string | undefined;
  const withLang = text.match(new RegExp(`\\b([A-Z0-9]{3,5})\\s*[•·*.,:-]?\\s*(?:${LANG_CODES})\\b`));
  if (withLang) set = withLang[1];
  if (!set) {
    // druga linia stopki zaczyna się od kodu setu
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const cand = lines[1]?.match(/^([A-Z][A-Z0-9]{2,4})\b/);
    if (cand) set = cand[1];
  }
  return { set: set?.toLowerCase(), collectorNumber };
}

/**
 * Disney Lorcana: stopka w lewym dolnym rogu, np. „207/204 • EN • 1” (numer / liczba kart • język • dodatek).
 * Kod dodatku Lorcast to liczba albo krótki kod (np. P1, D23).
 */
export function parseLorcanaFooter(raw: string): { set?: string; collectorNumber?: string } {
  const text = (raw || '').toUpperCase().replace(/[|]/g, 'I').replace(/[•·*]/g, ' • ');
  const num = text.match(/\b(\d{1,3})\s*[/\\]\s*\d{1,3}\b/);
  const set = text.match(/\b(?:EN|DE|FR|IT|JA|JP|ZH)\b\s*•?\s*([A-Z]?\d{1,2})\b/);
  return {
    collectorNumber: num ? num[1].replace(/^0+(?=\d)/, '') : undefined,
    set: set ? set[1].toLowerCase() : undefined
  };
}

let ocrQueue: Promise<unknown> = Promise.resolve();
/** Tesseract ma jeden wątek roboczy — zadania OCR wykonujemy po kolei. */
function withWorker<T>(fn: (w: Worker) => Promise<T>): Promise<T> {
  const run = ocrQueue.then(async () => fn(await getTesseractWorker()));
  ocrQueue = run.catch(() => undefined);
  return run;
}

async function ocrTitle(canvas: HTMLCanvasElement): Promise<string> {
  return withWorker(async (worker) => {
    await worker.setParameters({
      tessedit_pageseg_mode: '7' as any,
      tessedit_char_whitelist: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ ,'-’"
    });
    const res = await worker.recognize(canvas);
    return cleanCardTitle(res.data.text || '');
  });
}

async function ocrFooter(canvas: HTMLCanvasElement): Promise<string> {
  return withWorker(async (worker) => {
    await worker.setParameters({
      tessedit_pageseg_mode: '6' as any,
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/•*. '
    });
    const res = await worker.recognize(canvas);
    return res.data.text || '';
  });
}

/** Pewność, od której wynik samego obrazu uznajemy bez czekania na OCR. */
export const QUICK_IMAGE_CONFIDENCE = 85;

async function identify(body: Record<string, unknown>, onStatus?: (text: string) => void, game: GameId = 'mtg'): Promise<any> {
  // Lorcana: rozpoznanie po obrazie w bazie kart Lorcany (bez nazwy z OCR)
  const url = game === 'lorcana' ? '/api/scanner/lorcana-identify' : '/api/scanner/delver-identify';
  const res = await fetchWithAuth(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (res.status === 429) onStatus?.(t('Skanujesz zbyt szybko, chwila przerwy.'));
  if (res.status === 503) {
    const err = await res.json().catch(() => ({}));
    if (err?.error) onStatus?.(tServer(err.error));
  }
  return res.ok ? res.json() : {};
}

export interface RecognizeOptions {
  onStatus?: (text: string) => void;
  /** Wynik szybkiego wykrywania z pętli na żywo (oszczędza ponowne wykrywanie). */
  quad?: Quad | null;
  /** Celownik we współrzędnych źródła — gdzie szukać karty, gdy brak `quad`. */
  guide?: Rect;
  /** Najpierw samo rozpoznanie po obrazie (domyślnie tak); OCR tylko, gdy obraz nie wystarczy. */
  imageFirst?: boolean;
  /** Gra karciana (domyślnie MTG); w Lorcanie OCR czyta tylko numer ze stopki. */
  game?: GameId;
}

/** Pełne rozpoznanie karty z klatki kamery lub zdjęcia. */
export async function recognizeCard(
  src: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  opts: RecognizeOptions = {}
): Promise<ScanResult> {
  const { w, h } = sourceSize(src);
  const guide: Rect = opts.guide || (() => {
    // zdjęcie bez celownika: zakładamy kartę w centrum, zajmującą większość kadru
    const gh = Math.min(h * 0.85, (w * 0.85) / (63 / 88));
    const gw = gh * (63 / 88);
    return { x: (w - gw) / 2, y: (h - gh) / 2, width: gw, height: gh };
  })();

  opts.onStatus?.(t('Wykrywanie karty...'));
  let quad = opts.quad || detectCardInSource(src, guide)?.quad || null;
  const detected = Boolean(quad);
  if (!quad) quad = rectToQuad(guide);

  // Pełna klatka w natywnej rozdzielczości — źródło do prostowania.
  const { canvas: frame, ctx } = canvas2d(w, h);
  ctx.drawImage(src, 0, 0, w, h);
  const pixels = ctx.getImageData(0, 0, w, h).data;

  const cardRgba = warpCardRegion(pixels, w, h, quad, 300, 420);
  const cardCanvas = toCanvas(cardRgba, 300, 420);
  const cardDataUrl = cardCanvas.toDataURL('image/jpeg', 0.85);
  const glare = measureGlare(cardRgba, 300, 420);
  frame.width = frame.height = 0; // zwolnienie pamięci (piksele zostają w `pixels`)

  const base: ScanResult = {
    rawText: '',
    cleanedTitle: '',
    confidence: 0,
    matchedCard: null,
    possibleCards: [],
    debugCropUrl: cardDataUrl,
    engineUsed: 'delver_lens',
    isAutoCropped: detected,
    quad: detected ? quad : undefined,
    glare
  };

  const game = opts.game || 'mtg';
  // 1. Szybka ścieżka: tylko obraz. Bez OCR odpowiedź przychodzi w ułamku sekundy.
  if ((detected || game === 'lorcana') && opts.imageFirst !== false) {
    opts.onStatus?.(t('Dopasowywanie w bazie kart...'));
    const quick = await identify({ cardImageBase64: cardDataUrl, sampleStage: 'quick', glare }, opts.onStatus, game).catch(() => ({}));
    if (quick.matchedCard && (quick.confidence || 0) >= QUICK_IMAGE_CONFIDENCE) {
      return {
        ...base,
        confidence: quick.confidence,
        matchedCard: quick.matchedCard,
        possibleCards: quick.possibleCards || [],
        method: quick.method
      };
    }
  }

  // 2L. Lorcana: obraz niejednoznaczny (np. dodruk z tą samą ilustracją) — numer i dodatek ze stopki
  if (game === 'lorcana') {
    const footerRgba = warpCardRegion(pixels, w, h, quad, 600, 150, FOOTER_REGION);
    const footerCanvas = prepareForOcr(footerRgba, 600, 150);
    opts.onStatus?.(t('Odczyt numeru karty...'));
    const footer = parseLorcanaFooter(await ocrFooter(footerCanvas).catch(() => ''));
    opts.onStatus?.(t('Dopasowywanie w bazie kart...'));
    const data: any = await identify(
      { cardImageBase64: cardDataUrl, hintSet: footer.set, hintCollector: footer.collectorNumber },
      opts.onStatus,
      game
    ).catch(() => ({}));
    return {
      ...base,
      detectedSet: footer.set,
      detectedCollectorNumber: footer.collectorNumber,
      confidence: data.confidence || 0,
      matchedCard: data.matchedCard || null,
      possibleCards: data.possibleCards || [],
      debugBottomUrl: footerCanvas.toDataURL('image/png'),
      method: data.method
    };
  }

  // 2. Obraz niejednoznaczny: OCR nazwy i stopki, potem pełne dopasowanie.
  const titleRgba = warpCardRegion(pixels, w, h, quad, 640, 100, TITLE_REGION);
  const footerRgba = warpCardRegion(pixels, w, h, quad, 600, 150, FOOTER_REGION);
  const titleCanvas = prepareForOcr(titleRgba, 640, 100);
  const footerCanvas = prepareForOcr(footerRgba, 600, 150);

  opts.onStatus?.(t('Odczyt nazwy i numeru karty...'));
  const [title, footerText] = await Promise.all([
    ocrTitle(titleCanvas).catch(() => ''),
    ocrFooter(footerCanvas).catch(() => '')
  ]);
  const footer = parseFooter(footerText);

  opts.onStatus?.(t('Dopasowywanie w bazie kart...'));
  const data: any = await identify(
    {
      cardImageBase64: cardDataUrl,
      hintTitle: title,
      hintSet: footer.set,
      hintCollector: footer.collectorNumber,
      sampleStage: 'full',
      glare
    },
    opts.onStatus
  );

  return {
    ...base,
    rawText: title,
    cleanedTitle: title,
    detectedSet: footer.set,
    detectedCollectorNumber: footer.collectorNumber,
    confidence: data.confidence || 0,
    matchedCard: data.matchedCard || null,
    possibleCards: data.possibleCards || [],
    debugTitleUrl: titleCanvas.toDataURL('image/png'),
    debugBottomUrl: footerCanvas.toDataURL('image/png'),
    method: data.method
  };
}
