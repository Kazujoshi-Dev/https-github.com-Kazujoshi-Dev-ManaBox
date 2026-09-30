/**
 * ============================================================================
 * MTG Card Computer Vision Pipeline (w stylu Delver Lens)
 * ============================================================================
 * 
 * Ten moduł odpowiada za wieloetapowe przetwarzanie obrazu (Image Preprocessing)
 * na elemencie HTML5 Canvas przed przekazaniem do rozpoznawania OCR:
 * 
 * 1. Kadrowanie karty (Cropping): Wycięcie wyłącznie obszaru wewnątrz wizjera 63x88mm.
 * 2. Segmentacja (Targeting): Wycięcie pasków:
 *    - Górne 15% (Nazwa karty i koszt many)
 *    - Dolne 10% (Kod dodatku i numer kolekcjonera)
 * 3. Skalowanie adaptacyjne (Adaptive Resizing): Dostosowanie wysokości tekstu do 45-60px.
 * 4. Skala szarości (Grayscale): Konwersja z wagami fotometrycznymi luminancji BT.601.
 * 5. Rozciąganie kontrastu (Contrast Stretching): Wykorzystanie pełnego zakresu dynamiki 0..255.
 * 6. Binarizacja Otsu (Thresholding): Automatyczne rozdzielenie na idealną czerń i biel.
 * 7. Normalizacja polaryzacji: Zapewnienie, że litery są czarne, a tło białe.
 * 8. Odszumanie (Despeckle): Usunięcie pojedynczych zakłóceń pikselowych.
 */

export interface CardCropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SegmentedCardStrips {
  // Oryginalna wycięta karta
  cardCanvas: HTMLCanvasElement;
  cardDataUrl: string;

  // Przetworzony binarnie pasek tytułowy (Górne 15%)
  titleCanvas: HTMLCanvasElement;
  titleDataUrl: string;

  // Przetworzony binarnie pasek dolny (Dolne 10%)
  bottomCanvas: HTMLCanvasElement;
  bottomDataUrl: string;

  // Wymiary wyciętej karty na matrycy wideo
  sourceCrop: CardCropRect;
}

/**
 * Oblicza optymalny próg binarizacji metodą Otsu (Otsu's Thresholding).
 * Algorytm analizuje histogram luminancji i znajduje próg T, który
 * maksymalizuje wariancję międzyklasową (rozdziela piksele tła od tekstu).
 */
export function calculateOtsuThreshold(grayData: Uint8ClampedArray): number {
  const histogram = new Array(256).fill(0);
  let totalPixels = 0;

  // 1. Zbuduj histogram poziomów szarości
  for (let i = 0; i < grayData.length; i += 4) {
    const val = grayData[i];
    histogram[val]++;
    totalPixels++;
  }

  if (totalPixels === 0) return 128;

  // 2. Oblicz sumę ważoną poziomów szarości
  let sumAll = 0;
  for (let t = 0; t < 256; t++) {
    sumAll += t * histogram[t];
  }

  let sumBackground = 0;
  let weightBackground = 0;
  let maxBetweenClassVariance = -1;
  let bestThreshold = 128;

  // 3. Sprawdź każdy możliwy próg od 0 do 255
  for (let t = 0; t < 256; t++) {
    weightBackground += histogram[t];
    if (weightBackground === 0) continue;

    const weightForeground = totalPixels - weightBackground;
    if (weightForeground === 0) break;

    sumBackground += t * histogram[t];

    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sumAll - sumBackground) / weightForeground;

    // Wariancja międzyklasowa = wB * wF * (uB - uF)^2
    const variance = weightBackground * weightForeground * Math.pow(meanBackground - meanForeground, 2);

    if (variance > maxBetweenClassVariance) {
      maxBetweenClassVariance = variance;
      bestThreshold = t;
    }
  }

  return bestThreshold;
}

/**
 * Przetwarza zadany wycinek Canvasa:
 * - Zamienia na skalę szarości (ITU-R BT.601)
 * - Rozciąga kontrast na pełny zakres 0-255
 * - Nakłada dynamiczny próg binarizacji Otsu
 * - Normalizuje polaryzację (czarny tekst na białym tle, optymalne dla Tesseract)
 * - Usuwa szum "pieprz i sól" (1px specks)
 */
export function binarizeStripCanvas(
  sourceCanvas: HTMLCanvasElement,
  cropArea: CardCropRect,
  options: {
    targetHeight?: number; // Docelowa optymalna wysokość paska dla OCR (~55px)
    contrastBoost?: number;
    invertIfDark?: boolean; // Czy automatycznie odwracać, gdy tło jest ciemne
  } = {}
): HTMLCanvasElement {
  const { targetHeight = 56, contrastBoost = 1.25, invertIfDark = true } = options;

  const cropW = Math.max(10, Math.round(cropArea.width));
  const cropH = Math.max(10, Math.round(cropArea.height));

  // Skalowanie adaptacyjne: Tesseract wymaga, by litery miały ok. 30-45px wysokości.
  const scale = Math.max(1.0, Math.min(3.5, targetHeight / cropH));
  const finalWidth = Math.round(cropW * scale);
  const finalHeight = Math.round(cropH * scale);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = finalWidth;
  outCanvas.height = finalHeight;

  const ctx = outCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return outCanvas;

  // Wysoka jakość interpolacji dwuliniowej przy powiększaniu paska
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

  // Pobranie surowej tablicy pikseli RGBA
  const imgData = ctx.getImageData(0, 0, finalWidth, finalHeight);
  const data = imgData.data;
  const numPixels = data.length / 4;

  // --------------------------------------------------------------------------
  // KROK A: Konwersja do skali szarości (Luminancja BT.601) + Analiza Min/Max
  // --------------------------------------------------------------------------
  let minLum = 255;
  let maxLum = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // Wagi fotometryczne: ludzkie oko jest najbardziej czułe na zieleń (0.587),
    // potem czerwień (0.299), a najmniej na błękit (0.114).
    const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

    data[i] = lum;
    data[i + 1] = lum;
    data[i + 2] = lum;
    // data[i+3] to Alpha (pozostaje 255)

    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
  }

  // --------------------------------------------------------------------------
  // KROK B: Dynamiczne rozciąganie histogramu (Contrast Stretching)
  // --------------------------------------------------------------------------
  const range = Math.max(1, maxLum - minLum);
  for (let i = 0; i < data.length; i += 4) {
    // Rozciągnięcie najciemniejszego piksela do 0, a najjaśniejszego do 255
    let stretched = ((data[i] - minLum) / range) * 255;

    // Dodatkowy boost kontrastu wokół osi środka 128
    if (contrastBoost !== 1.0) {
      stretched = (stretched - 128) * contrastBoost + 128;
    }

    const clamped = Math.max(0, Math.min(255, Math.round(stretched)));
    data[i] = clamped;
    data[i + 1] = clamped;
    data[i + 2] = clamped;
  }

  // --------------------------------------------------------------------------
  // KROK C: Progowanie binarne Otsu (Binarization)
  // --------------------------------------------------------------------------
  const threshold = calculateOtsuThreshold(data);

  let darkPixelsCount = 0;
  for (let i = 0; i < data.length; i += 4) {
    const isDark = data[i] < threshold;
    if (isDark) darkPixelsCount++;

    // Na razie: ciemne piksele to 0 (czarny), jasne to 255 (biały)
    const val = isDark ? 0 : 255;
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
  }

  // --------------------------------------------------------------------------
  // KROK D: Normalizacja Polaryzacji (Zawsze Czarny Tekst na Białym Tle)
  // --------------------------------------------------------------------------
  // Jeśli większość pikseli paska jest ciemna (np. ciemna ramka karty, czarny pasek
  // z białymi literami), silnik OCR miałby problem, ponieważ oczekuje czarnego tekstu
  // na jasnym tle. W takim przypadku odwracamy kolory!
  if (invertIfDark && darkPixelsCount > numPixels * 0.55) {
    for (let i = 0; i < data.length; i += 4) {
      const inverted = 255 - data[i];
      data[i] = inverted;
      data[i + 1] = inverted;
      data[i + 2] = inverted;
    }
  }

  // --------------------------------------------------------------------------
  // KROK E: Filtr odszumiający (Usuwanie odosobnionych pikseli 1px)
  // --------------------------------------------------------------------------
  // Prosty filtr sąsiedztwa 3x3: jeśli czarny piksel nie ma wokół siebie innych
  // czarnych pikseli, zamieniamy go na biały (usuwa drobne kropki i szum matrycy).
  const cleaned = new Uint8ClampedArray(data);
  const w = finalWidth;
  const h = finalHeight;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      if (data[idx] === 0) { // czarny piksel
        // Policz ilu czarnych sąsiadów ma ten piksel w oknie 3x3
        let blackNeighbors = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nIdx = ((y + dy) * w + (x + dx)) * 4;
            if (data[nIdx] === 0) blackNeighbors++;
          }
        }
        // Jeśli piksel jest samotną kropką (mniej niż 2 sąsiadów), usuń go (zrób biały)
        if (blackNeighbors < 2) {
          cleaned[idx] = 255;
          cleaned[idx + 1] = 255;
          cleaned[idx + 2] = 255;
        }
      }
    }
  }

  // Zapisz zmanipulowane piksele z powrotem do Canvasa
  ctx.putImageData(new ImageData(cleaned, w, h), 0, 0);
  return outCanvas;
}

/**
 * Dokładnie mapuje prostokąt wizjera z interfejsu użytkownika (DOM)
 * na fizyczne piksele matrycy wideo czujnika kamery, uwzględniając
 * skalowanie CSS (object-cover).
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

  // W CSS video ma object-fit: cover, co oznacza, że zachowuje proporcje
  // i wypełnia cały kontener, obcinając ewentualne brzegi.
  const scale = Math.max(containerRect.width / vWidth, containerRect.height / vHeight);
  const displayedWidth = vWidth * scale;
  const displayedHeight = vHeight * scale;

  // Przesunięcie środka (letterbox / pillarbox offset)
  const offsetX = (displayedWidth - containerRect.width) / 2;
  const offsetY = (displayedHeight - containerRect.height) / 2;

  // Współrzędne wizjera względem kontenera
  const reticleRelX = reticleRect.left - containerRect.left;
  const reticleRelY = reticleRect.top - containerRect.top;

  // Przeliczenie na współrzędne sensora kamery
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
 * Główna funkcja potoku Delver Lens:
 * 1. Wycina całą kartę z klatki wideo na dedykowany Canvas.
 * 2. Segmentuje kartę na:
 *    - Górne 15% (Nazwa i Koszt Many)
 *    - Dolne 10% (Symbol Setu i Numer Kolekcjonera)
 * 3. Poddaje oba paski filtrowaniu binarnemu na poziomie ImageData (Grayscale + Dynamic Contrast + Otsu).
 */
export function extractAndPreprocessCardStrips(
  videoSource: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  sensorCrop: CardCropRect
): SegmentedCardStrips {
  // 1. Stwórz Canvas dla wyciętej karty
  const cardCanvas = document.createElement('canvas');
  cardCanvas.width = Math.max(40, sensorCrop.width);
  cardCanvas.height = Math.max(40, sensorCrop.height);

  const cardCtx = cardCanvas.getContext('2d', { willReadFrequently: true });
  if (!cardCtx) {
    throw new Error('Nie udało się utworzyć kontekstu 2D dla Canvasa karty.');
  }

  cardCtx.imageSmoothingEnabled = true;
  cardCtx.imageSmoothingQuality = 'high';

  // Narysuj WYŁĄCZNIE zawartość wewnątrz jasnego prostokąta karty
  cardCtx.drawImage(
    videoSource,
    sensorCrop.x,
    sensorCrop.y,
    sensorCrop.width,
    sensorCrop.height,
    0,
    0,
    cardCanvas.width,
    cardCanvas.height
  );

  const cardW = cardCanvas.width;
  const cardH = cardCanvas.height;

  // --------------------------------------------------------------------------
  // 2. SEGMENTACJA: Górne 15% karty (Tytuł / Nazwa / Koszt)
  // --------------------------------------------------------------------------
  // W MTG pasek nazwy zaczyna się ok. 3.5% od góry karty i kończy na ok. 15.5%.
  // Dodajemy 3% margines z lewej i prawej strony, by odciąć czarną/białą zewnętrzną ramkę karty.
  const titleCropArea: CardCropRect = {
    x: Math.round(cardW * 0.04),
    y: Math.round(cardH * 0.035),
    width: Math.round(cardW * 0.92),
    height: Math.round(cardH * 0.13), // 13-15% wysokości karty
  };

  // --------------------------------------------------------------------------
  // 3. SEGMENTACJA: Dolne 10% karty (Set Code & Collector Number)
  // --------------------------------------------------------------------------
  // W MTG stopka z informacją o dodatku i numerze znajduje się na samym dole (88% - 98%).
  const bottomCropArea: CardCropRect = {
    x: Math.round(cardW * 0.04),
    y: Math.round(cardH * 0.88),
    width: Math.round(cardW * 0.92),
    height: Math.round(cardH * 0.10), // 10% wysokości karty
  };

  // --------------------------------------------------------------------------
  // 4. FILTROWANIE BINARNE obu pasków za pomocą Canvas API & ImageData
  // --------------------------------------------------------------------------
  const titleCanvas = binarizeStripCanvas(cardCanvas, titleCropArea, {
    targetHeight: 56, // Optymalne 56px dla pojedynczego wiersza OCR
    contrastBoost: 1.35,
    invertIfDark: true,
  });

  const bottomCanvas = binarizeStripCanvas(cardCanvas, bottomCropArea, {
    targetHeight: 44, // Stopka z mniejszą czcionką
    contrastBoost: 1.4,
    invertIfDark: true,
  });

  let cardDataUrl = '';
  let titleDataUrl = '';
  let bottomDataUrl = '';

  try {
    cardDataUrl = cardCanvas.toDataURL('image/jpeg', 0.88);
    titleDataUrl = titleCanvas.toDataURL('image/png');
    bottomDataUrl = bottomCanvas.toDataURL('image/png');
  } catch (_) {}

  return {
    cardCanvas,
    cardDataUrl,
    titleCanvas,
    titleDataUrl,
    bottomCanvas,
    bottomDataUrl,
    sourceCrop: sensorCrop,
  };
}
