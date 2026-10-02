import { createWorker, Worker } from 'tesseract.js';
import { ScryfallCard } from '../../types';
import { fetchWithAuth } from '../../services/api';
import { ScanResult } from './types';
import { 
  extractAndSegmentDelverFeatures,
  CardCropRect, 
  binarizeStripCanvas 
} from './cvCardPipeline';

/**
 * Native Web Audio synthesizer for scanner audio feedback (like Delver Lens beep / chime)
 */
export function playScannerChime(type: 'success' | 'lock' | 'beep' = 'success'): void {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    if (type === 'lock') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.08);
    } else {
      // Pleasant double-chime (880Hz -> 1320Hz)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';

      osc1.frequency.setValueAtTime(880, now);
      osc2.frequency.setValueAtTime(1320, now + 0.07);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.07);
      osc2.start(now + 0.07);
      osc2.stop(now + 0.22);
    }
  } catch (_) {
    // Ignore audio context block if user hasn't interacted
  }
}

let tesseractWorkerPromise: Promise<Worker> | null = null;

/**
 * Initializes or retrieves a cached Tesseract.js worker configured for MTG card OCR
 */
export async function getTesseractWorker(
  onProgress?: (progress: number, status: string) => void
): Promise<Worker> {
  if (!tesseractWorkerPromise) {
    tesseractWorkerPromise = (async () => {
      onProgress?.(0.1, 'Inicjalizacja silnika OCR...');
      const worker = await createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            onProgress?.(0.3 + (m.progress || 0) * 0.5, 'Rozpoznawanie tekstu z kamery...');
          } else if (m.status === 'loading tesseract core') {
            onProgress?.(0.15, 'Ładowanie modułu WebAssembly...');
          } else if (m.status === 'loading language traineddata') {
            onProgress?.(0.25, 'Ładowanie bazy słowników MTG...');
          }
        },
      });

      // Optimize Tesseract parameters for card titles:
      // PSM 7 treats the image as a single text line (drastically increases single-line title accuracy!)
      try {
        await worker.setParameters({
          tessedit_pageseg_mode: '7' as any,
          tessedit_char_whitelist: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -',.:/’—–!?()[]",
        });
      } catch (err) {
        console.warn('Nie udało się ustawić parametrów Tesseract:', err);
      }

      return worker;
    })();
  }
  return tesseractWorkerPromise;
}

/**
 * Computes Otsu's optimal binarization threshold based on the luminance histogram
 */
function computeOtsuThreshold(data: Uint8ClampedArray): number {
  const histogram = new Array(256).fill(0);
  let totalPixels = 0;

  for (let i = 0; i < data.length; i += 4) {
    histogram[data[i]]++;
    totalPixels++;
  }

  if (totalPixels === 0) return 128;

  let sum = 0;
  for (let i = 0; i < 256; i++) {
    sum += i * histogram[i];
  }

  let sumB = 0;
  let wB = 0;
  let wF = 0;
  let maxVariance = 0;
  let threshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;
    wF = totalPixels - wB;
    if (wF === 0) break;

    sumB += t * histogram[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const betweenVariance = wB * wF * Math.pow(mB - mF, 2);

    if (betweenVariance > maxVariance) {
      maxVariance = betweenVariance;
      threshold = t;
    }
  }

  return threshold;
}

export type PreprocessMode = 'grayscale_enhanced' | 'otsu_binary' | 'otsu_inverted';

/**
 * Advanced image preprocessor for MTG card frames:
 * - Adaptive normalization to optimal OCR character height (45-60px)
 * - Dynamic range contrast stretching
 * - Otsu dynamic thresholding
 */
export function preprocessCanvasForOcr(
  source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  cropArea: { x: number; y: number; width: number; height: number },
  options: {
    scale?: number;
    mode?: PreprocessMode;
    contrastBoost?: number;
    targetHeight?: number;
  } = {}
): HTMLCanvasElement {
  const { mode = 'grayscale_enhanced', contrastBoost = 1.3, targetHeight = 52 } = options;

  const canvas = document.createElement('canvas');
  const cropW = Math.max(10, Math.round(cropArea.width));
  const cropH = Math.max(10, Math.round(cropArea.height));

  // Determine optimal scale: on high-res cameras (1080p/4k), cropH can be 100-200px.
  // Blowing it up by 2.5 destroys Tesseract's neural net which expects ~35-50px font height.
  let effectiveScale = options.scale;
  if (!effectiveScale) {
    effectiveScale = Math.max(0.75, Math.min(3.0, targetHeight / cropH));
  }

  canvas.width = Math.max(20, Math.round(cropW * effectiveScale));
  canvas.height = Math.max(20, Math.round(cropH * effectiveScale));

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(
    source,
    Math.max(0, cropArea.x),
    Math.max(0, cropArea.y),
    cropW,
    cropH,
    0,
    0,
    canvas.width,
    canvas.height
  );

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;

  // 1. Calculate luminance and find min/max for dynamic range stretch
  let minLum = 255;
  let maxLum = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    data[i] = lum;
    data[i + 1] = lum;
    data[i + 2] = lum;

    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
  }

  // 2. Contrast stretching across minLum..maxLum
  const range = Math.max(1, maxLum - minLum);
  for (let i = 0; i < data.length; i += 4) {
    let stretched = ((data[i] - minLum) / range) * 255;
    // Apply contrast boost centered at 128
    stretched = (stretched - 128) * contrastBoost + 128;
    const clamped = Math.max(0, Math.min(255, Math.round(stretched)));
    data[i] = clamped;
    data[i + 1] = clamped;
    data[i + 2] = clamped;
  }

  // 3. Apply mode: Grayscale enhanced OR Otsu binary / Inverted
  if (mode === 'otsu_binary' || mode === 'otsu_inverted') {
    const otsuThresh = computeOtsuThreshold(data);
    const invert = mode === 'otsu_inverted';

    for (let i = 0; i < data.length; i += 4) {
      let val = data[i] >= otsuThresh ? 255 : 0;
      if (invert) val = 255 - val;
      data[i] = val;
      data[i + 1] = val;
      data[i + 2] = val;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

/**
 * Cleans extracted MTG Card Title from noise and symbols
 */
export function cleanCardTitle(rawText: string): string {
  if (!rawText) return '';

  const lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Pick the line most likely to be the title (alphabetical characters with length > 2)
  let candidate = lines.find((l) => /[a-zA-Z]{3,}/.test(l)) || lines[0] || '';

  // Remove mana symbols like "{2}{U}", "(2)(U)", "{T}", "(T)", "[R]"
  candidate = candidate
    .replace(/\{[^}]+\}/g, ' ')
    .replace(/\([^)]+\)/g, ' ')
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/[|~_—–()[\]{}<>«»`"'\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Strip trailing numbers/mana symbols at the end of the line (e.g. "Sol Ring 1", "Lightning Bolt R")
  candidate = candidate.replace(/\s+[0-9XYZWURGB]{1,3}$/i, '');

  // Strip leading numbers or bullets (e.g. "1. Sol Ring" -> "Sol Ring")
  candidate = candidate.replace(/^[\d\W_]+/, '');

  return candidate.trim();
}

/**
 * Extracts potential Set Code and Collector Number from OCR text (e.g., "OTJ 125", "BLB 045", "MH3 210")
 */
export function extractSetAndCollectorNumber(text: string): {
  set?: string;
  collectorNumber?: string;
} {
  if (!text) return {};

  const regex = /\b([a-zA-Z0-9]{3,4})\b[\s•·/\\|#-]+([0-9]{1,4})\b/;
  const match = text.match(regex);

  if (match) {
    const rawSet = match[1].toLowerCase();
    const rawNum = match[2].replace(/^0+/, '') || '1';

    const commonWords = new Set(['the', 'and', 'for', 'you', 'can', 'may', 'tap', 'all', 'one', 'two', 'any']);
    if (!commonWords.has(rawSet)) {
      return {
        set: rawSet,
        collectorNumber: rawNum,
      };
    }
  }

  return {};
}

/**
 * Computes Levenshtein distance for fuzzy string comparison
 */
function levenshteinDistance(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const matrix = Array.from({ length: bn + 1 }, (_, i) => [i]);
  for (let j = 0; j <= an; j++) matrix[0][j] = j;

  for (let i = 1; i <= bn; i++) {
    for (let j = 1; j <= an; j++) {
      if (b[i - 1].toLowerCase() === a[j - 1].toLowerCase()) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[bn][an];
}

/**
 * Searches Scryfall API with multiple robust fallback tiers:
 * 1. Direct Set + Collector number lookup
 * 2. Scryfall Fuzzy Named endpoint (`/api/scryfall/named?fuzzy=...`)
 * 3. Scryfall Autocomplete with Levenshtein similarity ranking
 * 4. Scryfall full-text search
 */
export async function searchCardInScryfall(
  cleanedTitle: string,
  detectedSet?: string,
  detectedNumber?: string
): Promise<{ matchedCard: ScryfallCard | null; possibleCards: ScryfallCard[] }> {
  // 1. Try exact set + collector number if detected
  if (detectedSet && detectedNumber) {
    try {
      const directRes = await fetch(
        `/api/scryfall/card-print/${encodeURIComponent(detectedSet)}/${encodeURIComponent(detectedNumber)}`
      );
      if (directRes.ok) {
        const exactCard: ScryfallCard = await directRes.json();
        if (exactCard && exactCard.name) {
          return {
            matchedCard: exactCard,
            possibleCards: [exactCard],
          };
        }
      }
    } catch (_) {
      // Continue to name search
    }
  }

  if (!cleanedTitle || cleanedTitle.length < 2) {
    return { matchedCard: null, possibleCards: [] };
  }

  // 2. Scryfall Fuzzy Named API (Scryfall's internal spellchecker for MTG cards)
  try {
    const fuzzyUrl = detectedSet
      ? `/api/scryfall/named?fuzzy=${encodeURIComponent(cleanedTitle)}&set=${encodeURIComponent(detectedSet)}`
      : `/api/scryfall/named?fuzzy=${encodeURIComponent(cleanedTitle)}`;

    const fuzzyRes = await fetch(fuzzyUrl);
    if (fuzzyRes.ok) {
      const fuzzyCard: ScryfallCard = await fuzzyRes.json();
      if (fuzzyCard && fuzzyCard.name) {
        return {
          matchedCard: fuzzyCard,
          possibleCards: [fuzzyCard],
        };
      }
    }
  } catch (_) {
    // Continue to autocomplete & search
  }

  // 3. Autocomplete + Levenshtein fuzzy distance matching
  try {
    // Search first 2-3 words or first 16 characters
    const queryStem = cleanedTitle.split(/\s+/).slice(0, 3).join(' ').slice(0, 16).trim();
    const autoRes = await fetch(`/api/scryfall/autocomplete?q=${encodeURIComponent(queryStem)}`);

    if (autoRes.ok) {
      const autoData = await autoRes.json();
      const suggestions: string[] = Array.isArray(autoData.data) ? autoData.data : [];

      if (suggestions.length > 0) {
        // Sort suggestions by similarity to cleanedTitle
        suggestions.sort((a, b) => {
          const distA = levenshteinDistance(cleanedTitle, a);
          const distB = levenshteinDistance(cleanedTitle, b);
          return distA - distB;
        });

        const bestCandidate = suggestions[0];
        // Fetch the best candidate card directly
        const cardRes = await fetch(`/api/scryfall/named?exact=${encodeURIComponent(bestCandidate)}`);
        if (cardRes.ok) {
          const bestCard: ScryfallCard = await cardRes.json();
          if (bestCard && bestCard.name) {
            return {
              matchedCard: bestCard,
              possibleCards: [bestCard],
            };
          }
        }
      }
    }
  } catch (_) {
    // Continue
  }

  // 4. Standard Search
  try {
    const searchRes = await fetch(`/api/scryfall/search?q=${encodeURIComponent(cleanedTitle.trim())}`);
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const cards: ScryfallCard[] = Array.isArray(searchData.data) ? searchData.data : [];

      if (cards.length > 0) {
        const exactMatch = cards.find(
          (c) => c.name.toLowerCase() === cleanedTitle.toLowerCase()
        );
        return {
          matchedCard: exactMatch || cards[0],
          possibleCards: cards.slice(0, 8),
        };
      }
    }
  } catch (_) {
    // Nothing found
  }

  return { matchedCard: null, possibleCards: [] };
}

export interface ScanFrameOptions {
  customTitleCrop?: { x: number; y: number; width: number; height: number };
  customCollectorCrop?: { x: number; y: number; width: number; height: number };
  cardCrop?: CardCropRect;
}

/**
 * ============================================================================
 * GŁÓWNY POTOK DELVER LENS & MANABOX (Computer Vision + Feature Matching)
 * ============================================================================
 * 
 * Zastępuje powolny OCR zaawansowanym potokiem:
 * 1. Kadrowanie karty (63x88mm)
 * 2. Segmentacja cech: Art Crop (Ilustracja), Pasek Tytułu, Symbol Setu, Stopka
 * 3. 64-bitowy fingerprint wizualny dHash ilustracji
 * 4. Wykrywanie rzadkości z barwy symbolu dodatku (C/U/R/M)
 * 5. Błyskawiczna identyfikacja wizualna i dopasowanie Scryfall
 * 6. Sygnał dźwiękowy (Audio Chime) potwierdzający pomyślny skan
 */
export async function scanCardWithDelverLens(
  source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  frameWidth: number,
  frameHeight: number,
  onProgress?: (progress: number, status: string) => void,
  options?: {
    cardCrop?: CardCropRect;
  }
): Promise<ScanResult> {
  let cardCrop = options?.cardCrop;

  if (!cardCrop) {
    const cardAspectRatio = 63 / 88;
    let targetWidth = Math.round(frameWidth * 0.72);
    let targetHeight = Math.round(targetWidth / cardAspectRatio);

    if (targetHeight > frameHeight * 0.85) {
      targetHeight = Math.round(frameHeight * 0.85);
      targetWidth = Math.round(targetHeight * cardAspectRatio);
    }

    const cardX = Math.round((frameWidth - targetWidth) / 2);
    const cardY = Math.round((frameHeight - targetHeight) / 2);

    cardCrop = {
      x: cardX,
      y: cardY,
      width: targetWidth,
      height: targetHeight,
    };
  }

  onProgress?.(0.15, 'Segmentacja sekcji karty (pasek nazwy, ilustracja, stopka)...');

  // 1. Ekstrakcja cech Delver Lens z wykadrowanej karty (dokładny wizjer 63x88mm)
  const features = extractAndSegmentDelverFeatures(source, cardCrop);

  onProgress?.(0.30, `Wycinek karty | dHash [${features.perceptualHash.slice(0, 8)}...] | Rzadkość: ${features.detectedRarity.toUpperCase()}`);

  // 2. Szybki odczyt tekstu paska tytułowego (PSM 7) jako silna podpowiedź nazwy
  let titleHint = '';
  try {
    const worker = await getTesseractWorker();
    const titleRes = await worker.recognize(features.titleCanvas);
    if (titleRes?.data?.text) {
      titleHint = cleanCardTitle(titleRes.data.text);
    }
  } catch (_) {}

  try {
    onProgress?.(0.55, 'Identyfikacja wizualna i dopasowanie bazy Scryfall...');

    const response = await fetchWithAuth('/api/scanner/delver-identify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cardImageBase64: features.cardDataUrl,
        artImageBase64: features.artDataUrl,
        titleImageBase64: features.titleDataUrl,
        bottomImageBase64: features.bottomDataUrl,
        fullFrameBase64: features.fullFrameDataUrl,
        perceptualHash: features.perceptualHash,
        detectedRarity: features.detectedRarity,
        detectedColors: features.detectedColors,
        isAutoCropped: features.isAutoCropped,
        hintTitle: titleHint,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.matchedCard) {
        // Dźwiękowy sygnał sukcesu jak w Delver Lens / ManaBox
        playScannerChime('success');

        onProgress?.(1.0, `Zidentyfikowano: "${data.matchedCard.name}"`);

        return {
          rawText: data.cardName || data.matchedCard.name,
          cleanedTitle: data.cardName || data.matchedCard.name,
          detectedSet: data.setCode || data.matchedCard.set,
          detectedCollectorNumber: data.collectorNumber || data.matchedCard.collector_number,
          confidence: data.confidence || 95,
          matchedCard: data.matchedCard,
          possibleCards: data.possibleCards || [data.matchedCard],
          debugCropUrl: features.cardDataUrl,
          debugArtUrl: features.artDataUrl,
          debugTitleUrl: features.titleDataUrl,
          debugBottomUrl: features.bottomDataUrl,
          debugSetSymbolUrl: features.setSymbolDataUrl,
          perceptualHash: features.perceptualHash,
          detectedRarity: features.detectedRarity,
          detectedColorIdentity: features.detectedColors,
          engineUsed: 'delver_lens',
          isFoilDetected: Boolean(data.isFoil),
          isAutoCropped: features.isAutoCropped,
          isBlackBorderDetected: features.isBlackBorderDetected,
        };
      }
    }
  } catch (netErr) {
    console.warn('Delver identify backend error, próbuję lokalny odczyt:', netErr);
  }

  // Fallback awaryjny (np. offline)
  onProgress?.(0.70, 'Fallback: lokalne dopasowywanie tytułu...');
  const ocrFallback = await scanMtgCardFrame(source as any, frameWidth, frameHeight, onProgress, { cardCrop });
  
  if (ocrFallback.matchedCard) {
    playScannerChime('success');
  }

  return {
    ...ocrFallback,
    debugArtUrl: features.artDataUrl,
    debugSetSymbolUrl: features.setSymbolDataUrl,
    perceptualHash: features.perceptualHash,
    detectedRarity: features.detectedRarity,
    detectedColorIdentity: features.detectedColors,
    engineUsed: 'delver_lens',
    isAutoCropped: features.isAutoCropped,
  };
}

/**
 * Full Delver Lens Pipeline:
 * 1. Kadrowanie karty (Cropping 63x88mm wewnątrz wizjera)
 * 2. Segmentacja (Targeting: Górne 15% - Nazwa/Koszt, Dolne 10% - Kod Setu/Numer)
 * 3. Filtrowanie binarne (ImageData: Skala szarości BT.601, Kontrast, Próg Otsu, Usuwanie szumów)
 * 4. Rozpoznanie OCR (Tesseract.js z PSM 7 na czystym czarno-białym pasku)
 */
export async function scanMtgCardFrame(
  source: HTMLVideoElement | HTMLImageElement,
  frameWidth: number,
  frameHeight: number,
  onProgress?: (progress: number, status: string) => void,
  options?: ScanFrameOptions
): Promise<ScanResult> {
  let cardCrop = options?.cardCrop;

  // Obliczenie geometrii domyślnej proporcji MTG 63x88mm, jeśli nie przekazano dokładnego wycinka
  if (!cardCrop) {
    const cardAspectRatio = 63 / 88; // standardowa karta MTG 63mm x 88mm (~0.7159)
    let targetWidth = Math.round(frameWidth * 0.72);
    let targetHeight = Math.round(targetWidth / cardAspectRatio);

    if (targetHeight > frameHeight * 0.85) {
      targetHeight = Math.round(frameHeight * 0.85);
      targetWidth = Math.round(targetHeight * cardAspectRatio);
    }

    const cardX = Math.round((frameWidth - targetWidth) / 2);
    const cardY = Math.round((frameHeight - targetHeight) / 2);

    cardCrop = {
      x: cardX,
      y: cardY,
      width: targetWidth,
      height: targetHeight,
    };
  }

  onProgress?.(0.15, 'Kadrowanie karty i segmentacja pasków (Canvas)...');

  // KROK 1 i 2 i 3: Kadrowanie karty, wyodrębnienie górnych 15% i dolnych 10% oraz binarizacja ImageData
  const strips = extractAndSegmentDelverFeatures(source, cardCrop);

  onProgress?.(0.3, 'Inicjalizacja silnika OCR Tesseract...');
  const worker = await getTesseractWorker(onProgress);

  // KROK 4: Rozpoznanie OCR zoptymalizowanego czarno-białego paska tytułowego (górne 15%)
  onProgress?.(0.45, 'Rozpoznawanie nazwy karty (Pasek górny 15% - Binarized)...');
  let ocrRes = await worker.recognize(strips.titleCanvas);
  let rawTitle = ocrRes.data.text || '';
  let confidence = ocrRes.data.confidence || 0;

  // Fallback: jeśli binarizacja miała trudne tło (np. karta Extended Art lub mocne refleksy),
  // wykonaj pass z ulepszoną skalą szarości
  if (!rawTitle.trim() || confidence < 45) {
    onProgress?.(0.6, 'Dostrajanie kontrastu (Pass 2: Adaptacyjna skala szarości)...');
    const grayTitleCanvas = preprocessCanvasForOcr(strips.cardCanvas, {
      x: Math.round(strips.cardCanvas.width * 0.04),
      y: Math.round(strips.cardCanvas.height * 0.035),
      width: Math.round(strips.cardCanvas.width * 0.92),
      height: Math.round(strips.cardCanvas.height * 0.14),
    }, { mode: 'grayscale_enhanced', targetHeight: 56 });

    const ocrGrayRes = await worker.recognize(grayTitleCanvas);
    if ((ocrGrayRes.data.text || '').trim().length > rawTitle.trim().length || (ocrGrayRes.data.confidence || 0) > confidence) {
      rawTitle = ocrGrayRes.data.text;
      confidence = ocrGrayRes.data.confidence || confidence;
    }
  }

  // KROK 5: Rozpoznanie paska dolnego (dolne 10% - Set Code i Numer Kolekcjonera)
  let detectedSet: string | undefined;
  let detectedCollectorNumber: string | undefined;

  try {
    onProgress?.(0.7, 'Rozpoznawanie kodu setu i numeru karty (Pasek dolny 10%)...');
    const ocrBottom = await worker.recognize(strips.bottomCanvas);
    const extracted = extractSetAndCollectorNumber(ocrBottom.data.text || '');
    detectedSet = extracted.set;
    detectedCollectorNumber = extracted.collectorNumber;
  } catch (err) {
    console.warn('Nie udało się odczytać dolnego paska karty:', err);
  }

  const cleanedTitle = cleanCardTitle(rawTitle);

  onProgress?.(0.85, 'Dopasowywanie w bazie Scryfall...');
  const { matchedCard, possibleCards } = await searchCardInScryfall(
    cleanedTitle,
    detectedSet,
    detectedCollectorNumber
  );

  onProgress?.(1.0, matchedCard ? `Znaleziono: ${matchedCard.name}` : 'Gotowe');

  return {
    rawText: rawTitle.trim(),
    cleanedTitle,
    detectedSet,
    detectedCollectorNumber,
    confidence,
    matchedCard,
    possibleCards,
    debugCropUrl: strips.cardDataUrl,
    debugTitleUrl: strips.titleDataUrl,
    debugBottomUrl: strips.bottomDataUrl,
    engineUsed: 'delver_lens',
  };
}

