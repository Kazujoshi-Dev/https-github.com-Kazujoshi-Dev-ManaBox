import { createWorker, Worker } from 'tesseract.js';
import { ScryfallCard } from '../../types';
import { ScanResult } from './types';

let tesseractWorkerPromise: Promise<Worker> | null = null;

/**
 * Initializes or retrieves a cached Tesseract.js worker
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
            onProgress?.(0.3 + m.progress * 0.6, 'Rozpoznawanie tekstu z kamery...');
          } else if (m.status === 'loading tesseract core') {
            onProgress?.(0.15, 'Ładowanie modułu WebAssembly...');
          } else if (m.status === 'loading language traineddata') {
            onProgress?.(0.25, 'Ładowanie słownika językowego...');
          }
        },
      });
      return worker;
    })();
  }
  return tesseractWorkerPromise;
}

/**
 * Enhanced Canvas image preprocessor for MTG cards
 * Enhances contrast, removes glare, and binarizes text for maximum OCR precision.
 */
export function preprocessCanvasForOcr(
  source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  cropArea: { x: number; y: number; width: number; height: number },
  options: {
    scale?: number;
    threshold?: number;
    invert?: boolean;
    contrast?: number;
  } = {}
): HTMLCanvasElement {
  const { scale = 2, threshold = 145, invert = false, contrast = 1.4 } = options;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(cropArea.width * scale));
  canvas.height = Math.max(1, Math.round(cropArea.height * scale));

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;

  // Smoothing for crisp text
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(
    source,
    cropArea.x,
    cropArea.y,
    cropArea.width,
    cropArea.height,
    0,
    0,
    canvas.width,
    canvas.height
  );

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;

  // Grayscale + Contrast + Adaptive Thresholding
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // Standard Luminance conversion
    let gray = 0.299 * r + 0.587 * g + 0.114 * b;

    // Contrast boost
    gray = (gray - 128) * contrast + 128;
    gray = Math.max(0, Math.min(255, gray));

    // Threshold binarization
    let val = gray >= threshold ? 255 : 0;
    if (invert) {
      val = 255 - val;
    }

    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

/**
 * Cleans extracted MTG Card Title
 */
export function cleanCardTitle(rawText: string): string {
  if (!rawText) return '';

  const lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Pick the line most likely to be the title (usually the first clean alphabetical line)
  let candidate = lines[0] || '';

  // Filter out mana cost noise like "{2}{U}", "2UU", "1B", "{T}" or stray symbols
  candidate = candidate
    .replace(/\{[^}]+\}/g, ' ')
    .replace(/[|~_—–()[\]{}<>«»`"'\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Strip trailing numbers/mana symbols at the end of the line (e.g. "Sol Ring 1" -> "Sol Ring")
  candidate = candidate.replace(/\s+\d+[a-zA-Z]?$/, '');

  // Strip leading numbers or bullets
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

  // Pattern matching MTG set codes (3-4 alphanumeric) and collector numbers (1-4 digits)
  // e.g. "OTJ · 125", "MKM 045/280", "BLB 145", "MH3 #210"
  const regex = /\b([a-zA-Z0-9]{3,4})\b[\s•·/\\|#-]+([0-9]{1,4})\b/;
  const match = text.match(regex);

  if (match) {
    const rawSet = match[1].toLowerCase();
    const rawNum = match[2].replace(/^0+/, '') || '1'; // normalize leading zeros (e.g. 045 -> 45)

    // Ignore common words that resemble 3 letters like "the", "and", "for"
    const commonWords = new Set(['the', 'and', 'for', 'you', 'can', 'may', 'tap', 'all', 'one', 'two']);
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
 * Searches Scryfall API with OCR candidates (exact set/number -> exact title -> fuzzy title -> autocomplete)
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
      // Continue to title search if set+number lookup misses
    }
  }

  if (!cleanedTitle || cleanedTitle.length < 2) {
    return { matchedCard: null, possibleCards: [] };
  }

  // 2. Direct Scryfall Search (our server routes support fuzzy fallback)
  try {
    const searchRes = await fetch(
      `/api/scryfall/search?q=${encodeURIComponent(cleanedTitle.trim())}`
    );
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const cards: ScryfallCard[] = Array.isArray(searchData.data) ? searchData.data : [];

      if (cards.length > 0) {
        // Find best match (exact name match preferred)
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
    // Continue to autocomplete
  }

  // 3. Fallback: Autocomplete lookup to recover from minor OCR typos (e.g., "Sol Rlng" -> "Sol Ring")
  try {
    const autoRes = await fetch(
      `/api/scryfall/autocomplete?q=${encodeURIComponent(cleanedTitle.slice(0, 15).trim())}`
    );
    if (autoRes.ok) {
      const autoData = await autoRes.json();
      if (Array.isArray(autoData.data) && autoData.data.length > 0) {
        const bestName = autoData.data[0];
        const secondRes = await fetch(
          `/api/scryfall/search?q=${encodeURIComponent(`!"${bestName}"`)}`
        );
        if (secondRes.ok) {
          const secondData = await secondRes.json();
          const cards: ScryfallCard[] = Array.isArray(secondData.data) ? secondData.data : [];
          if (cards.length > 0) {
            return {
              matchedCard: cards[0],
              possibleCards: cards.slice(0, 8),
            };
          }
        }
      }
    }
  } catch (_) {
    // Nothing found
  }

  return { matchedCard: null, possibleCards: [] };
}

/**
 * Full Pipeline: Takes a video/canvas frame, crops card zones, runs OCR, queries Scryfall
 */
export async function scanMtgCardFrame(
  source: HTMLVideoElement | HTMLImageElement,
  frameWidth: number,
  frameHeight: number,
  onProgress?: (progress: number, status: string) => void
): Promise<ScanResult> {
  // Define Card Reticle Bounding Box centered in viewport with standard 2.5 : 3.5 ratio
  const cardAspectRatio = 2.5 / 3.5;
  let targetWidth = Math.round(frameWidth * 0.72);
  let targetHeight = Math.round(targetWidth / cardAspectRatio);

  if (targetHeight > frameHeight * 0.85) {
    targetHeight = Math.round(frameHeight * 0.85);
    targetWidth = Math.round(targetHeight * cardAspectRatio);
  }

  const cardX = Math.round((frameWidth - targetWidth) / 2);
  const cardY = Math.round((frameHeight - targetHeight) / 2);

  // Region A: Title Bar (Top 7% to 22% of the card, left 7% to 85%)
  const titleCrop = {
    x: cardX + Math.round(targetWidth * 0.07),
    y: cardY + Math.round(targetHeight * 0.06),
    width: Math.round(targetWidth * 0.82),
    height: Math.round(targetHeight * 0.16),
  };

  // Region B: Bottom Collector Bar (Bottom 7% to 18% of the card, left 6% to 60%)
  const collectorCrop = {
    x: cardX + Math.round(targetWidth * 0.06),
    y: cardY + Math.round(targetHeight * 0.84),
    width: Math.round(targetWidth * 0.65),
    height: Math.round(targetHeight * 0.12),
  };

  onProgress?.(0.1, 'Przygotowywanie klatki kamery...');

  // Create preprocessed canvases for title (standard threshold and high-contrast threshold)
  const titleCanvas = preprocessCanvasForOcr(source, titleCrop, { scale: 2.2, threshold: 140 });
  const titleCanvasInvert = preprocessCanvasForOcr(source, titleCrop, { scale: 2.2, threshold: 120, invert: true });
  const collectorCanvas = preprocessCanvasForOcr(source, collectorCrop, { scale: 2.5, threshold: 130 });

  const worker = await getTesseractWorker(onProgress);

  onProgress?.(0.35, 'Rozpoznawanie nazwy karty...');
  // OCR on title
  let ocrTitleRes = await worker.recognize(titleCanvas);
  let rawTitle = ocrTitleRes.data.text || '';
  let confidence = ocrTitleRes.data.confidence || 0;

  // If confidence is low or title is empty, try inverted canvas (for dark/white text frames)
  if (!rawTitle.trim() || confidence < 40) {
    const ocrTitleInvert = await worker.recognize(titleCanvasInvert);
    if ((ocrTitleInvert.data.text || '').trim().length > rawTitle.trim().length) {
      rawTitle = ocrTitleInvert.data.text;
      confidence = ocrTitleInvert.data.confidence;
    }
  }

  // Also quickly OCR bottom line for Set code and Collector Number
  onProgress?.(0.7, 'Rozpoznawanie edycji i numeru...');
  const ocrCollectorRes = await worker.recognize(collectorCanvas);
  const rawCollector = ocrCollectorRes.data.text || '';

  const { set: detectedSet, collectorNumber: detectedCollectorNumber } =
    extractSetAndCollectorNumber(rawCollector + ' ' + rawTitle);

  const cleanedTitle = cleanCardTitle(rawTitle);

  onProgress?.(0.85, 'Wyszukiwanie karty w bazie Scryfall...');
  const { matchedCard, possibleCards } = await searchCardInScryfall(
    cleanedTitle,
    detectedSet,
    detectedCollectorNumber
  );

  onProgress?.(1.0, matchedCard ? `Znaleziono: ${matchedCard.name}` : 'Gotowe');

  return {
    rawText: `${rawTitle}\n${rawCollector}`.trim(),
    cleanedTitle,
    detectedSet,
    detectedCollectorNumber,
    confidence,
    matchedCard,
    possibleCards,
  };
}
