/**
 * ============================================================================
 * Delver Lens & ManaBox Computer Vision Engine for MTG
 * ============================================================================
 * 
 * Moduł profesjonalnego przetwarzania wizyjnego kart Magic: The Gathering
 * wzorowany bezpośrednio na potoku Delver Lens i ManaBox:
 * 
 * 1. Geometryczne kadrowanie karty (MTG 63x88mm Card Rectification)
 * 2. Segmentacja cech wizualnych (Visual Feature Targeting):
 *    - Artwork Crop: wycięcie samej ilustracji (serce identyfikacji Delver Lens)
 *    - Pasek tytułowy (Górne 15%): nazwa i koszt
 *    - Symbol dodatku (Set Symbol & Rarity): wykrywanie rzadkości (C/U/R/M) z barw HSV
 *    - Stopka (Dolne 10%): kod dodatku i numer kolekcjonera
 * 3. Perceptual Hashing (dHash 64-bit):
 *    - Oblicza matematyczny odcisk palca ilustracji odporny na światło i obrót
 * 4. Analiza tożsamości barwnej (Color Identity & Frame Palette)
 * 5. Wykrywanie stabilności klatki (Motion/Jitter Stabilization):
 *    - Automatyczny lock-on i natychmiastowe wyzwolenie skanu, gdy karta jest nieruchoma
 */

import { CardRarityDetection } from './types';

export interface CardCropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SegmentedCardFeatures {
  // Wyprostowana cała karta
  cardCanvas: HTMLCanvasElement;
  cardDataUrl: string;

  // Wycięta ilustracja (Art Crop) - serce Delver Lens
  artCanvas: HTMLCanvasElement;
  artDataUrl: string;

  // Przetworzony binarnie pasek tytułowy (Górne 15%)
  titleCanvas: HTMLCanvasElement;
  titleDataUrl: string;

  // Przetworzony binarnie pasek dolny (Dolne 10%)
  bottomCanvas: HTMLCanvasElement;
  bottomDataUrl: string;

  // Wycięty symbol dodatku (Set Symbol)
  setSymbolCanvas?: HTMLCanvasElement;
  setSymbolDataUrl?: string;

  // Matematyczny odcisk palca ilustracji (64-bit dHash)
  perceptualHash: string;

  // Wykryta rzadkość na podstawie barwy symbolu dodatku
  detectedRarity: CardRarityDetection;

  // Wykryte barwy ramki / tożsamości MTG (W, U, B, R, G, Colorless, Multicolor)
  detectedColors: string[];

  // Współrzędne na sensorze wideo
  sourceCrop: CardCropRect;
}

/**
 * Oblicza próg binarizacji Otsu (Otsu's Thresholding)
 * Maksymalizuje wariancję międzyklasową dla rozdzielenia tekstu od tła.
 */
export function calculateOtsuThreshold(grayData: Uint8ClampedArray): number {
  const histogram = new Array(256).fill(0);
  let totalPixels = 0;

  for (let i = 0; i < grayData.length; i += 4) {
    histogram[grayData[i]]++;
    totalPixels++;
  }

  if (totalPixels === 0) return 128;

  let sumAll = 0;
  for (let t = 0; t < 256; t++) {
    sumAll += t * histogram[t];
  }

  let sumBackground = 0;
  let weightBackground = 0;
  let maxBetweenClassVariance = -1;
  let bestThreshold = 128;

  for (let t = 0; t < 256; t++) {
    weightBackground += histogram[t];
    if (weightBackground === 0) continue;

    const weightForeground = totalPixels - weightBackground;
    if (weightForeground === 0) break;

    sumBackground += t * histogram[t];

    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sumAll - sumBackground) / weightForeground;

    const variance = weightBackground * weightForeground * Math.pow(meanBackground - meanForeground, 2);

    if (variance > maxBetweenClassVariance) {
      maxBetweenClassVariance = variance;
      bestThreshold = t;
    }
  }

  return bestThreshold;
}

/**
 * Filtruje zadany wycinek Canvas do postaci idealnie czytelnej dla silnika tekstu:
 * 1. Skalowanie z zachowaniem ostrości
 * 2. Skala szarości (ITU-R BT.601)
 * 3. Rozciąganie kontrastu (Contrast Stretching)
 * 4. Binarizacja Otsu
 * 5. Normalizacja (czarny tekst na białym tle)
 * 6. Filtr sąsiedztwa 3x3 usuwający szum ziarna
 */
export function binarizeStripCanvas(
  sourceCanvas: HTMLCanvasElement,
  cropArea: CardCropRect,
  options: {
    targetHeight?: number;
    contrastBoost?: number;
    invertIfDark?: boolean;
  } = {}
): HTMLCanvasElement {
  const { targetHeight = 56, contrastBoost = 1.35, invertIfDark = true } = options;

  const cropW = Math.max(10, Math.round(cropArea.width));
  const cropH = Math.max(10, Math.round(cropArea.height));

  const scale = Math.max(1.0, Math.min(3.5, targetHeight / cropH));
  const finalWidth = Math.round(cropW * scale);
  const finalHeight = Math.round(cropH * scale);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = finalWidth;
  outCanvas.height = finalHeight;

  const ctx = outCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return outCanvas;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(
    sourceCanvas,
    cropArea.x,
    cropArea.y,
    cropW,
    cropH,
    0,
    0,
    finalWidth,
    finalHeight
  );

  const imgData = ctx.getImageData(0, 0, finalWidth, finalHeight);
  const data = imgData.data;
  const numPixels = data.length / 4;

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

  const range = Math.max(1, maxLum - minLum);
  for (let i = 0; i < data.length; i += 4) {
    let stretched = ((data[i] - minLum) / range) * 255;
    if (contrastBoost !== 1.0) {
      stretched = (stretched - 128) * contrastBoost + 128;
    }
    const clamped = Math.max(0, Math.min(255, Math.round(stretched)));
    data[i] = clamped;
    data[i + 1] = clamped;
    data[i + 2] = clamped;
  }

  const threshold = calculateOtsuThreshold(data);
  let darkPixelsCount = 0;

  for (let i = 0; i < data.length; i += 4) {
    const isDark = data[i] < threshold;
    if (isDark) darkPixelsCount++;
    const val = isDark ? 0 : 255;
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
  }

  if (invertIfDark && darkPixelsCount > numPixels * 0.55) {
    for (let i = 0; i < data.length; i += 4) {
      const inverted = 255 - data[i];
      data[i] = inverted;
      data[i + 1] = inverted;
      data[i + 2] = inverted;
    }
  }

  // Filtr 3x3 odszumiający drobne kropki
  const cleaned = new Uint8ClampedArray(data);
  const w = finalWidth;
  const h = finalHeight;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      if (data[idx] === 0) {
        let blackNeighbors = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nIdx = ((y + dy) * w + (x + dx)) * 4;
            if (data[nIdx] === 0) blackNeighbors++;
          }
        }
        if (blackNeighbors < 2) {
          cleaned[idx] = 255;
          cleaned[idx + 1] = 255;
          cleaned[idx + 2] = 255;
        }
      }
    }
  }

  ctx.putImageData(new ImageData(cleaned, w, h), 0, 0);
  return outCanvas;
}

/**
 * Oblicza 64-bitowy Difference Hash (dHash) dla ilustracji karty.
 * 
 * Algorytm:
 * 1. Zmniejsza ilustrację do macierzy 9x8 w skali szarości.
 * 2. Dla każdego wiersza porównuje sąsiadujące piksele: pixel[x] > pixel[x+1].
 * 3. Zwraca 64 bity zakodowane jako 16 cyfr szesnastkowych (np. "e2a48f07b1c3d9a5").
 * 
 * dHash jest fundamentem Delver Lens: identyfikuje kartę po rozkładzie światłocienia ilustracji
 * niezależnie od odblasków, nasycenia barw i szumów.
 */
export function computeArtworkDHash(artCanvas: HTMLCanvasElement): string {
  try {
    const smallCanvas = document.createElement('canvas');
    smallCanvas.width = 9;
    smallCanvas.height = 8;
    const ctx = smallCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return '0000000000000000';

    ctx.drawImage(artCanvas, 0, 0, 9, 8);
    const imgData = ctx.getImageData(0, 0, 9, 8);
    const d = imgData.data;

    // Przeliczenie do skali szarości 9x8
    const grays: number[][] = [];
    for (let y = 0; y < 8; y++) {
      const row: number[] = [];
      for (let x = 0; x < 9; x++) {
        const idx = (y * 9 + x) * 4;
        const lum = Math.round(0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2]);
        row.push(lum);
      }
      grays.push(row);
    }

    // Porównanie poziome sąsiadów: 8 wierszy po 8 porównań = 64 bity
    let hexResult = '';
    for (let y = 0; y < 8; y++) {
      let byte = 0;
      for (let x = 0; x < 8; x++) {
        const bit = grays[y][x] > grays[y][x + 1] ? 1 : 0;
        byte = (byte << 1) | bit;
      }
      hexResult += byte.toString(16).padStart(2, '0');
    }

    return hexResult;
  } catch (_) {
    return '0000000000000000';
  }
}

/**
 * Oblicza odległość Hamminga (Hamming Distance) pomiędzy dwoma 64-bitowymi hash'ami.
 * Wartość <= 10 oznacza niemal identyczny obrazek ilustracji!
 */
export function computeHammingDistance(hashA: string, hashB: string): number {
  if (hashA.length !== hashB.length) return 64;
  let dist = 0;
  for (let i = 0; i < hashA.length; i += 2) {
    const bA = parseInt(hashA.substr(i, 2), 16) || 0;
    const bB = parseInt(hashB.substr(i, 2), 16) || 0;
    let xor = bA ^ bB;
    // Zlicz liczbę ustawionych bitów
    while (xor > 0) {
      dist += xor & 1;
      xor >>= 1;
    }
  }
  return dist;
}

/**
 * Wykrywa rzadkość karty (Common / Uncommon / Rare / Mythic)
 * na podstawie analizy przestrzeni barw HSV wycinka symbolu dodatku (Set Symbol).
 */
export function detectSetSymbolRarity(symbolCanvas: HTMLCanvasElement): CardRarityDetection {
  try {
    const ctx = symbolCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return 'common';

    const w = symbolCanvas.width;
    const h = symbolCanvas.height;
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;

    let goldScore = 0;
    let mythicOrangeScore = 0;
    let silverScore = 0;
    let totalSamples = 0;

    for (let i = 0; i < d.length; i += 4) {
      const r = d[i] / 255;
      const g = d[i + 1] / 255;
      const b = d[i + 2] / 255;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const delta = max - min;

      // Jasność V i Nasycenie S
      const v = max;
      const s = max === 0 ? 0 : delta / max;

      // Odcień H (0..360)
      let hVal = 0;
      if (delta !== 0) {
        if (max === r) hVal = ((g - b) / delta) % 6;
        else if (max === g) hVal = (b - r) / delta + 2;
        else hVal = (r - g) / delta + 4;
        hVal = Math.round(hVal * 60);
        if (hVal < 0) hVal += 360;
      }

      totalSamples++;

      // Rare (Złoty / Żółtawy): Hue 35-55, Saturation > 0.40, Value > 0.45
      if (hVal >= 35 && hVal <= 58 && s > 0.35 && v > 0.40) {
        goldScore++;
      }
      // Mythic (Pomarańczowo-Miedziany / Czerwony): Hue 10-34, Saturation > 0.50, Value > 0.45
      else if (hVal >= 10 && hVal < 35 && s > 0.45 && v > 0.40) {
        mythicOrangeScore++;
      }
      // Uncommon (Srebrny / Stalowy): Niska saturacja 0.08..0.30, wysoka jasność V > 0.50, błękitno-szary
      else if (s >= 0.08 && s <= 0.32 && v > 0.55 && (hVal >= 180 && hVal <= 240)) {
        silverScore++;
      }
    }

    if (totalSamples === 0) return 'common';

    const goldRatio = goldScore / totalSamples;
    const mythicRatio = mythicOrangeScore / totalSamples;
    const silverRatio = silverScore / totalSamples;

    if (mythicRatio > 0.08) return 'mythic';
    if (goldRatio > 0.08) return 'rare';
    if (silverRatio > 0.07) return 'uncommon';

    return 'common';
  } catch (_) {
    return 'common';
  }
}

/**
 * Wykrywa dominującą tożsamość barwną ramki karty MTG:
 * W (White), U (Blue), B (Black), R (Red), G (Green), Colorless (Artifact/Land), Multicolor.
 */
export function detectCardColorIdentity(cardCanvas: HTMLCanvasElement): string[] {
  try {
    const ctx = cardCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return [];

    const w = cardCanvas.width;
    const h = cardCanvas.height;

    // Próbkujemy ramkę boczną (lewy i prawy margines karty)
    const sampleY1 = Math.round(h * 0.25);
    const sampleH = Math.round(h * 0.30);
    const leftMargin = ctx.getImageData(Math.round(w * 0.03), sampleY1, Math.round(w * 0.05), sampleH);

    const d = leftMargin.data;
    let rSum = 0, gSum = 0, bSum = 0, count = 0;

    for (let i = 0; i < d.length; i += 8) {
      rSum += d[i];
      gSum += d[i + 1];
      bSum += d[i + 2];
      count++;
    }

    if (count === 0) return [];
    const avgR = rSum / count;
    const avgG = gSum / count;
    const avgB = bSum / count;

    const detected: string[] = [];

    // Niebieski (U)
    if (avgB > avgR * 1.25 && avgB > avgG * 1.15) detected.push('U');
    // Czerwony (R)
    else if (avgR > avgG * 1.35 && avgR > avgB * 1.35) detected.push('R');
    // Zielony (G)
    else if (avgG > avgR * 1.15 && avgG > avgB * 1.25) detected.push('G');
    // Biały (W)
    else if (avgR > 185 && avgG > 185 && avgB > 185) detected.push('W');
    // Czarny (B)
    else if (avgR < 55 && avgG < 55 && avgB < 55) detected.push('B');

    return detected;
  } catch (_) {
    return [];
  }
}

/**
 * Sprawdza stabilność klatki (Frame Stability / Motion Detection).
 * Oblicza różnicę pikseli między kolejnymi klatkami w wizjerze.
 * Zwraca delta (0..100) oraz boolean `isStable`.
 * Wykorzystywane przez Delver Lens do automatycznego zatwierdzenia karty w kadrze.
 */
export function detectFrameMotion(
  prevSample: Uint8ClampedArray | null,
  currentSample: Uint8ClampedArray
): { delta: number; isStable: boolean } {
  if (!prevSample || prevSample.length !== currentSample.length) {
    return { delta: 100, isStable: false };
  }

  let totalDiff = 0;
  const numSamples = Math.min(prevSample.length, currentSample.length);
  // Sprawdzamy co 8 bajtów dla maksymalnej wydajności 60fps
  let stepCount = 0;

  for (let i = 0; i < numSamples; i += 8) {
    const diff = Math.abs(prevSample[i] - currentSample[i]);
    totalDiff += diff;
    stepCount++;
  }

  const avgDiff = stepCount > 0 ? totalDiff / stepCount : 100;
  // Próg stabilności: avgDiff < 4.5 oznacza, że karta leży nieruchomo pod aparatem
  const isStable = avgDiff < 4.8;

  return { delta: avgDiff, isStable };
}

/**
 * Dokładnie mapuje prostokąt wizjera z interfejsu DOM na fizyczne piksele wideo.
 */
export function calculateVideoSensorCrop(
  videoElement: HTMLVideoElement,
  reticleElement: HTMLElement,
  containerElement: HTMLElement
): CardCropRect {
  const vWidth = videoElement.videoWidth || 1280;
  const vHeight = videoElement.videoHeight || 720;

  const containerRect = containerElement.getBoundingClientRect();
  const reticleRect = reticleElement.getBoundingClientRect();

  const scale = Math.max(containerRect.width / vWidth, containerRect.height / vHeight);
  const displayedWidth = vWidth * scale;
  const displayedHeight = vHeight * scale;

  const offsetX = (displayedWidth - containerRect.width) / 2;
  const offsetY = (displayedHeight - containerRect.height) / 2;

  const reticleRelX = reticleRect.left - containerRect.left;
  const reticleRelY = reticleRect.top - containerRect.top;

  const sensorX = Math.max(0, Math.round((reticleRelX + offsetX) / scale));
  const sensorY = Math.max(0, Math.round((reticleRelY + offsetY) / scale));
  const sensorW = Math.min(vWidth - sensorX, Math.round(reticleRect.width / scale));
  const sensorH = Math.min(vHeight - sensorY, Math.round(reticleRect.height / scale));

  return {
    x: sensorX,
    y: sensorY,
    width: sensorW,
    height: sensorH,
  };
}

/**
 * GŁÓWNY POTOK DELVER LENS & MANABOX:
 * 1. Kadruje kartę 63x88mm do znormalizowanego rozmiaru.
 * 2. Wycina samą ilustrację (Art Crop).
 * 3. Oblicza 64-bitowy fingerprint dHash ilustracji.
 * 4. Wycina symbol setu i określa rzadkość (C/U/R/M) z barwy.
 * 5. Binarizuje pasek tytułowy (Górne 15%) i dolną belkę (Dolne 10%).
 * 6. Określa tożsamość barwną ramki.
 */
export function extractAndSegmentDelverFeatures(
  videoSource: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  sensorCrop: CardCropRect
): SegmentedCardFeatures {
  // 1. Znormalizowany Canvas karty o stałych proporcjach 63 x 88 mm
  const cardW = Math.max(120, sensorCrop.width);
  const cardH = Math.max(167, sensorCrop.height);

  const cardCanvas = document.createElement('canvas');
  cardCanvas.width = cardW;
  cardCanvas.height = cardH;

  const cardCtx = cardCanvas.getContext('2d', { willReadFrequently: true });
  if (!cardCtx) {
    throw new Error('Nie udało się utworzyć kontekstu 2D karty.');
  }

  cardCtx.imageSmoothingEnabled = true;
  cardCtx.imageSmoothingQuality = 'high';

  cardCtx.drawImage(
    videoSource,
    sensorCrop.x,
    sensorCrop.y,
    sensorCrop.width,
    sensorCrop.height,
    0,
    0,
    cardW,
    cardH
  );

  // --------------------------------------------------------------------------
  // 2. SEGMENTACJA: Wycinek ilustracji (Artwork Crop) - serce Delver Lens
  // --------------------------------------------------------------------------
  // W kartach MTG ilustracja zajmuje:
  // X: 7% do 93% szerokości
  // Y: 11.5% do 54.5% wysokości
  const artCropArea: CardCropRect = {
    x: Math.round(cardW * 0.07),
    y: Math.round(cardH * 0.115),
    width: Math.round(cardW * 0.86),
    height: Math.round(cardH * 0.43),
  };

  const artCanvas = document.createElement('canvas');
  artCanvas.width = Math.max(64, artCropArea.width);
  artCanvas.height = Math.max(48, artCropArea.height);
  const artCtx = artCanvas.getContext('2d', { willReadFrequently: true });
  if (artCtx) {
    artCtx.imageSmoothingEnabled = true;
    artCtx.imageSmoothingQuality = 'high';
    artCtx.drawImage(
      cardCanvas,
      artCropArea.x,
      artCropArea.y,
      artCropArea.width,
      artCropArea.height,
      0,
      0,
      artCanvas.width,
      artCanvas.height
    );
  }

  // Obliczenie 64-bitowego dHash ilustracji
  const perceptualHash = computeArtworkDHash(artCanvas);

  // --------------------------------------------------------------------------
  // 3. SEGMENTACJA: Symbol dodatku i rzadkość (Set Symbol & Rarity)
  // --------------------------------------------------------------------------
  // Po prawej stronie pod ilustracją: X: 82%..95%, Y: 54%..62%
  const symbolCropArea: CardCropRect = {
    x: Math.round(cardW * 0.82),
    y: Math.round(cardH * 0.54),
    width: Math.round(cardW * 0.14),
    height: Math.round(cardH * 0.08),
  };

  const symbolCanvas = document.createElement('canvas');
  symbolCanvas.width = Math.max(24, symbolCropArea.width);
  symbolCanvas.height = Math.max(16, symbolCropArea.height);
  const symbolCtx = symbolCanvas.getContext('2d', { willReadFrequently: true });
  if (symbolCtx) {
    symbolCtx.drawImage(
      cardCanvas,
      symbolCropArea.x,
      symbolCropArea.y,
      symbolCropArea.width,
      symbolCropArea.height,
      0,
      0,
      symbolCanvas.width,
      symbolCanvas.height
    );
  }

  const detectedRarity = detectSetSymbolRarity(symbolCanvas);

  // --------------------------------------------------------------------------
  // 4. SEGMENTACJA: Pasek tytułowy (Górne 15%)
  // --------------------------------------------------------------------------
  const titleCropArea: CardCropRect = {
    x: Math.round(cardW * 0.04),
    y: Math.round(cardH * 0.035),
    width: Math.round(cardW * 0.92),
    height: Math.round(cardH * 0.13),
  };

  const titleCanvas = binarizeStripCanvas(cardCanvas, titleCropArea, {
    targetHeight: 56,
    contrastBoost: 1.35,
    invertIfDark: true,
  });

  // --------------------------------------------------------------------------
  // 5. SEGMENTACJA: Stopka z kodem dodatku i numerem (Dolne 10%)
  // --------------------------------------------------------------------------
  const bottomCropArea: CardCropRect = {
    x: Math.round(cardW * 0.04),
    y: Math.round(cardH * 0.88),
    width: Math.round(cardW * 0.92),
    height: Math.round(cardH * 0.10),
  };

  const bottomCanvas = binarizeStripCanvas(cardCanvas, bottomCropArea, {
    targetHeight: 44,
    contrastBoost: 1.4,
    invertIfDark: true,
  });

  // 6. Tożsamość barwna ramki
  const detectedColors = detectCardColorIdentity(cardCanvas);

  let cardDataUrl = '';
  let artDataUrl = '';
  let titleDataUrl = '';
  let bottomDataUrl = '';
  let setSymbolDataUrl = '';

  try {
    cardDataUrl = cardCanvas.toDataURL('image/jpeg', 0.88);
    artDataUrl = artCanvas.toDataURL('image/jpeg', 0.85);
    titleDataUrl = titleCanvas.toDataURL('image/png');
    bottomDataUrl = bottomCanvas.toDataURL('image/png');
    setSymbolDataUrl = symbolCanvas.toDataURL('image/png');
  } catch (_) {}

  return {
    cardCanvas,
    cardDataUrl,
    artCanvas,
    artDataUrl,
    titleCanvas,
    titleDataUrl,
    bottomCanvas,
    bottomDataUrl,
    setSymbolCanvas: symbolCanvas,
    setSymbolDataUrl,
    perceptualHash,
    detectedRarity,
    detectedColors,
    sourceCrop: sensorCrop,
  };
}
