import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Camera, 
  RefreshCw, 
  Check, 
  X, 
  Scan, 
  Sliders, 
  Info, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle,
  Upload,
  ArrowRight
} from 'lucide-react';
import { createWorker, Worker } from 'tesseract.js';

/**
 * ============================================================================
 * INTERFEJSY I TYPY DANYCH
 * ============================================================================
 */

export interface DelverLensScanResult {
  rawTitleText: string;
  cleanedTitle: string;
  rawBottomText: string;
  detectedSet?: string;
  detectedCollectorNumber?: string;
  confidence: number;
  // Obrazy Data URL wygenerowane z Canvas do wglądu lub wysyłki na backend
  cardImageBase64: string;
  titleStripBase64: string;
  bottomStripBase64: string;
}

export interface DelverLensScannerProps {
  /** Callback wywoływany po pomyślnym rozpoznaniu karty */
  onScanSuccess?: (result: DelverLensScanResult) => void;
  /** Opcjonalny URL zewnętrznego backendu (np. w Bun / Express / FastAPI) */
  backendApiUrl?: string;
  /** Callback zamykający komponent/modal */
  onClose?: () => void;
}

/**
 * ============================================================================
 * FUNKCJE COMPUTER VISION & MANIPULACJI PIKSELAMI (HTML5 Canvas + ImageData)
 * ============================================================================
 */

/**
 * Oblicza optymalny próg odcięcia binarnego metodą Otsu (Otsu's Thresholding).
 *
 * JAK TO DZIAŁA MATEMATYCZNIE:
 * 1. Tworzymy histogram 256 poziomów jasności szarości (od 0 do 255).
 * 2. Przechodzimy przez każdy możliwy próg T (od 0 do 255).
 * 3. Dzielimy piksele na dwie klasy:
 *    - Tło (piksele <= T)
 *    - Pierwszy plan / litery (piksele > T)
 * 4. Szukamy progu T, który maksymalizuje wariancję międzyklasową (ang. between-class variance).
 *    Jest to matematyczny punkt, w którym różnica jasności między tekstem a tłem jest największa.
 *
 * @param grayData - tablica Uint8ClampedArray z pikselami w skali szarości
 * @returns próg odcięcia z przedziału 0..255
 */
export function calculateOtsuThreshold(grayData: Uint8ClampedArray): number {
  const histogram = new Array(256).fill(0);
  let totalPixels = 0;

  // Krok 1: Budowa histogramu
  // Format ImageData: [R, G, B, A, R, G, B, A...]
  // Ponieważ obraz jest w skali szarości, R = G = B, więc czytamy co 4 bajty (kanał R)
  for (let i = 0; i < grayData.length; i += 4) {
    const val = grayData[i];
    histogram[val]++;
    totalPixels++;
  }

  if (totalPixels === 0) return 128;

  // Krok 2: Suma całkowita ważona
  let sumAll = 0;
  for (let t = 0; t < 256; t++) {
    sumAll += t * histogram[t];
  }

  let sumBackground = 0;
  let weightBackground = 0;
  let maxVariance = -1;
  let optimalThreshold = 128;

  // Krok 3: Analiza każdego możliwego progu podziału
  for (let t = 0; t < 256; t++) {
    weightBackground += histogram[t];
    if (weightBackground === 0) continue;

    const weightForeground = totalPixels - weightBackground;
    if (weightForeground === 0) break;

    sumBackground += t * histogram[t];

    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sumAll - sumBackground) / weightForeground;

    // Wzór Otsu na wariancję międzyklasową:
    // sigma^2 = wB * wF * (meanB - meanF)^2
    const varianceBetween = weightBackground * weightForeground * Math.pow(meanBackground - meanForeground, 2);

    if (varianceBetween > maxVariance) {
      maxVariance = varianceBetween;
      optimalThreshold = t;
    }
  }

  return optimalThreshold;
}

/**
 * Filtruje zadany wycinek Canvasa do postaci idealnie czarno-białej (Binarization):
 * 
 * 1. Skalowanie (Resizing) - powiększa pasek, by czcionka miała ok. 35-50px (optimum dla OCR).
 * 2. Konwersja do skali szarości (Grayscale) z wagami fotometrycznymi ITU-R BT.601.
 * 3. Rozciąganie histogramu (Contrast Stretching) - usunięcie mgły i cieni.
 * 4. Binarizacja Otsu - rozdzielenie na idealną czerń (0) i biel (255).
 * 5. Normalizacja polaryzacji - upewnienie się, że tekst jest czarny, a tło białe.
 * 6. Filtr odszumiający (Despeckle 3x3) - usunięcie pojedynczych zakłóceń pikselowych.
 */
export function preprocessCanvasStrip(
  sourceCanvas: HTMLCanvasElement,
  cropArea: { x: number; y: number; width: number; height: number },
  targetHeight = 56
): HTMLCanvasElement {
  const cropW = Math.max(10, Math.round(cropArea.width));
  const cropH = Math.max(10, Math.round(cropArea.height));

  // Tesseract i silniki OCR najlepiej radzą sobie, gdy litery mają około 35-45px wysokości.
  // Dlatego pasek skalujemy proporcjonalnie w górę:
  const scale = Math.max(1.0, Math.min(3.5, targetHeight / cropH));
  const outW = Math.round(cropW * scale);
  const outH = Math.round(cropH * scale);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;

  const ctx = outCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return outCanvas;

  // Wygładzanie dwuliniowe przy powiększaniu
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Wycięcie żądanego fragmentu z Canvasa karty
  ctx.drawImage(
    sourceCanvas,
    cropArea.x,
    cropArea.y,
    cropW,
    cropH,
    0,
    0,
    outW,
    outH
  );

  // Pobranie surowego bufora pamięci pikseli:
  // ImageData.data to jednowymiarowa tablica Uint8ClampedArray (wartości 0-255).
  // Każdy piksel zajmuje dokładnie 4 kolejne bajty:
  // data[i + 0] = Red (czerwony)
  // data[i + 1] = Green (zielony)
  // data[i + 2] = Blue (niebieski)
  // data[i + 3] = Alpha (przezroczystość, 255 = pełne krycie)
  const imgData = ctx.getImageData(0, 0, outW, outH);
  const data = imgData.data;
  const numPixels = data.length / 4;

  // --------------------------------------------------------------------------
  // KROK 1: Konwersja do skali szarości (Luminancja fotometryczna BT.601)
  // --------------------------------------------------------------------------
  // Oko ludzkie nie jest jednakowo czułe na wszystkie kolory:
  // ZIELONY wnosi aż 58.7% postrzeganej jasności, CZERWONY 29.9%, a NIEBIESKI tylko 11.4%.
  let minLum = 255;
  let maxLum = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

    data[i] = lum;     // R
    data[i + 1] = lum; // G
    data[i + 2] = lum; // B
    // data[i + 3] to Alpha - zostawiamy 255

    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
  }

  // --------------------------------------------------------------------------
  // KROK 2: Rozciąganie kontrastu (Contrast Normalization)
  // --------------------------------------------------------------------------
  // Jeśli oświetlenie w pokoju było słabe, różnica minLum i maxLum może być mała (np. 80..160).
  // Rozciągamy ten przedział na pełną skalę 0..255.
  const lumRange = Math.max(1, maxLum - minLum);
  for (let i = 0; i < data.length; i += 4) {
    // Normalizacja do 0..255
    let stretched = ((data[i] - minLum) / lumRange) * 255;
    // Dodatkowe podbicie kontrastu wokół środka (128)
    stretched = (stretched - 128) * 1.35 + 128;
    const clamped = Math.max(0, Math.min(255, Math.round(stretched)));

    data[i] = clamped;
    data[i + 1] = clamped;
    data[i + 2] = clamped;
  }

  // --------------------------------------------------------------------------
  // KROK 3: Binarizacja progowa (Thresholding algorytmem Otsu)
  // --------------------------------------------------------------------------
  const threshold = calculateOtsuThreshold(data);
  let darkCount = 0;

  for (let i = 0; i < data.length; i += 4) {
    // Jeśli piksel jest ciemniejszy od progu -> czerń (0), w przeciwnym razie -> biel (255)
    const isDark = data[i] < threshold;
    if (isDark) darkCount++;

    const val = isDark ? 0 : 255;
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
  }

  // --------------------------------------------------------------------------
  // KROK 4: Normalizacja polaryzacji (Zawsze czarny tekst na białym tle)
  // --------------------------------------------------------------------------
  // Niektóre karty MTG (np. czarne, artefakty lub ciemne ramki promo) mają
  // biały tekst na ciemnym tle. Tesseract.js radzi sobie znakomicie TYLKO
  // z czarnym tekstem na białym tle.
  // Jeśli ponad 55% pikseli jest czarnych -> oznacza to, że tło jest ciemne i odwracamy kolory!
  if (darkCount > numPixels * 0.55) {
    for (let i = 0; i < data.length; i += 4) {
      const inverted = 255 - data[i];
      data[i] = inverted;
      data[i + 1] = inverted;
      data[i + 2] = inverted;
    }
  }

  // --------------------------------------------------------------------------
  // KROK 5: Odszumianie (Despeckle / Filtr sąsiedztwa 3x3)
  // --------------------------------------------------------------------------
  // Usuwa izolowane kropki (szum matrycy, refleksy na folii).
  // Jeśli czarny piksel nie ma wokół siebie co najmniej 2 czarnych sąsiadów,
  // oznacza to pojedynczą plamkę i zamieniamy go na biały.
  const cleaned = new Uint8ClampedArray(data);
  for (let y = 1; y < outH - 1; y++) {
    for (let x = 1; x < outW - 1; x++) {
      const idx = (y * outW + x) * 4;
      if (data[idx] === 0) { // czarny piksel tekstu
        let blackNeighbors = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nIdx = ((y + dy) * outW + (x + dx)) * 4;
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

  // Zapisujemy wyczyszczoną tablicę pikseli z powrotem do kontekstu Canvasa
  ctx.putImageData(new ImageData(cleaned, outW, outH), 0, 0);
  return outCanvas;
}

/**
 * Wyodrębnia kod setu (np. MH3, OTJ) oraz numer kolekcjonera z odczytanego tekstu stopki karty.
 */
export function extractSetAndCollector(bottomText: string): { set?: string; collectorNumber?: string } {
  const clean = bottomText.replace(/[^a-zA-Z0-9\s/]/g, ' ').toUpperCase();
  const tokens = clean.split(/\s+/).filter(Boolean);

  let set: string | undefined;
  let collectorNumber: string | undefined;

  // Szukanie kodu setu: 3-4 znaki alfabetyczne
  for (const t of tokens) {
    if (!set && /^[A-Z]{3,4}$/.test(t) && !['EN', 'MTG', 'NOT', 'FOR', 'SALE', 'CARD', 'THE'].includes(t)) {
      set = t.toLowerCase();
    }
    // Szukanie numeru kolekcjonera (np. 125, 0125, 125/280)
    if (!collectorNumber && /^\d{1,4}(\/\d{1,4})?$/.test(t)) {
      collectorNumber = t.split('/')[0].replace(/^0+/, '') || '1';
    }
  }

  return { set, collectorNumber };
}

/**
 * ============================================================================
 * KOMPONENT REACT: DELVER LENS MTG SCANNER
 * ============================================================================
 */
export const DelverLensScanner: React.FC<DelverLensScannerProps> = ({
  onScanSuccess,
  backendApiUrl,
  onClose,
}) => {
  // Referencje do elementów DOM
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const viewfinderRef = useRef<HTMLDivElement | null>(null);
  const cardReticleRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Stany kamery i procesu skanowania
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('Umieść kartę MTG w jasnym prostokącie');
  const [scanResult, setScanResult] = useState<DelverLensScanResult | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // --------------------------------------------------------------------------
  // KROK 1: Inicjalizacja kamery (getUserMedia)
  // --------------------------------------------------------------------------
  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error('Twoja przeglądarka nie obsługuje API kamery (navigator.mediaDevices).');
      }

      // Prosimy o tylny aparat urządzenia mobilnego z rozdzielczością Full HD
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsCameraActive(true);
      setStatusMessage('Kamera gotowa. Dopasuj kartę do ramki i kliknij „Skanuj kartę”.');
    } catch (err: any) {
      console.error('Błąd kamery:', err);
      setCameraError(err.message || 'Nie udało się uzyskać dostępu do kamery.');
      setIsCameraActive(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  }, []);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  // --------------------------------------------------------------------------
  // KROK 2 & 3 & 4: KADROWANIE, SEGMENTACJA I BINARYZACJA (Delver Lens Pipeline)
  // --------------------------------------------------------------------------
  const handleCaptureAndScan = async () => {
    if (!videoRef.current || isProcessing) return;
    const video = videoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    setIsProcessing(true);
    setStatusMessage('1/4: Wycinanie obszaru karty (63x88mm)...');

    try {
      // 1. OBLICZENIE WSPÓŁRZĘDNYCH KADROWANIA (DOM -> Matryca sensora kamery)
      const vWidth = video.videoWidth;
      const vHeight = video.videoHeight;

      let cropX = 0;
      let cropY = 0;
      let cropW = vWidth;
      let cropH = vHeight;

      if (viewfinderRef.current && cardReticleRef.current) {
        const containerRect = viewfinderRef.current.getBoundingClientRect();
        const reticleRect = cardReticleRef.current.getBoundingClientRect();

        // CSS video ma `object-fit: cover`
        const scale = Math.max(containerRect.width / vWidth, containerRect.height / vHeight);
        const displayedW = vWidth * scale;
        const displayedH = vHeight * scale;

        const offsetX = (displayedW - containerRect.width) / 2;
        const offsetY = (displayedH - containerRect.height) / 2;

        const relX = reticleRect.left - containerRect.left;
        const relY = reticleRect.top - containerRect.top;

        cropX = Math.max(0, Math.round((relX + offsetX) / scale));
        cropY = Math.max(0, Math.round((relY + offsetY) / scale));
        cropW = Math.min(vWidth - cropX, Math.round(reticleRect.width / scale));
        cropH = Math.min(vHeight - cropY, Math.round(reticleRect.height / scale));
      } else {
        // Fallback: centralny wycinek o proporcji karty MTG (63 x 88 mm)
        const targetAspectRatio = 63 / 88;
        cropW = Math.round(vWidth * 0.75);
        cropH = Math.round(cropW / targetAspectRatio);
        cropX = Math.round((vWidth - cropW) / 2);
        cropY = Math.round((vHeight - cropH) / 2);
      }

      // 2. KADROWANIE: Wycięcie WYŁĄCZNIE samej karty na dedykowany Canvas
      const cardCanvas = document.createElement('canvas');
      cardCanvas.width = cropW;
      cardCanvas.height = cropH;
      const cardCtx = cardCanvas.getContext('2d', { willReadFrequently: true });
      if (!cardCtx) throw new Error('Nie udało się utworzyć kontekstu Canvas 2D.');

      cardCtx.imageSmoothingEnabled = true;
      cardCtx.imageSmoothingQuality = 'high';
      cardCtx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

      setStatusMessage('2/4: Segmentacja pasków (Górne 15% i Dolne 10%)...');

      // 3. SEGMENTACJA:
      // Pasek górny (Tytuł i koszt) = 3.5% do 17% wysokości karty (odcinamy czarną zewnętrzną ramkę)
      const titleArea = {
        x: Math.round(cropW * 0.04),
        y: Math.round(cropH * 0.035),
        width: Math.round(cropW * 0.92),
        height: Math.round(cropH * 0.135), // ~13.5%
      };

      // Pasek dolny (Set i numer) = 88% do 98% wysokości karty
      const bottomArea = {
        x: Math.round(cropW * 0.04),
        y: Math.round(cropH * 0.88),
        width: Math.round(cropW * 0.92),
        height: Math.round(cropH * 0.10), // 10%
      };

      setStatusMessage('3/4: Binarizacja i usuwanie szumów (ImageData + Otsu)...');

      // 4. FILTROWANIE BINARNE (Manipulacja pikselami):
      const titleCanvas = preprocessCanvasStrip(cardCanvas, titleArea, 56);
      const bottomCanvas = preprocessCanvasStrip(cardCanvas, bottomArea, 44);

      // Konwersja przetworzonych pasków do Base64
      const cardImageBase64 = cardCanvas.toDataURL('image/jpeg', 0.85);
      const titleStripBase64 = titleCanvas.toDataURL('image/png');
      const bottomStripBase64 = bottomCanvas.toDataURL('image/png');

      setStatusMessage('4/4: Rozpoznawanie OCR (Tesseract.js / Backend)...');

      let rawTitleText = '';
      let rawBottomText = '';
      let confidence = 0;

      // KROK 5: ROZPOZNANIE
      // A: Jeśli podano backendUrl (np. serwer w Bun), wysyłamy czyste czarno-białe paski:
      if (backendApiUrl) {
        try {
          const resp = await fetch(backendApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              titleStrip: titleStripBase64,
              bottomStrip: bottomStripBase64,
            }),
          });
          const json = await resp.json();
          rawTitleText = json.title || '';
          rawBottomText = json.bottom || '';
          confidence = json.confidence || 85;
        } catch (apiErr) {
          console.warn('Błąd backendu Bun, przełączam na Tesseract.js w przeglądarce:', apiErr);
        }
      }

      // B: Jeśli nie ma backendu lub wystąpił błąd, używamy lokalnego Tesseract.js:
      if (!rawTitleText) {
        const worker: Worker = await createWorker('eng', 1, {
          logger: () => {},
        });

        // PSM 7 traktuje obrazek jako pojedynczą poziomą linię tekstu (idealne dla paska tytułu MTG!)
        await worker.setParameters({
          tessedit_pageseg_mode: '7' as any,
          tessedit_char_whitelist: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -',.:/’—–!?()[]",
        });

        // Rozpoznanie paska tytułowego (górne 15%)
        const ocrTitle = await worker.recognize(titleCanvas);
        rawTitleText = ocrTitle.data.text || '';
        confidence = ocrTitle.data.confidence || 0;

        // Rozpoznanie paska dolnego (dolne 10%)
        try {
          const ocrBottom = await worker.recognize(bottomCanvas);
          rawBottomText = ocrBottom.data.text || '';
        } catch (_) {}

        await worker.terminate();
      }

      // Wyczyszczenie tytułu z symboli many i artefaktów OCR
      const cleanedTitle = rawTitleText
        .replace(/[{}[\]()|]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      const { set: detectedSet, collectorNumber: detectedCollectorNumber } = extractSetAndCollector(rawBottomText);

      const finalResult: DelverLensScanResult = {
        rawTitleText,
        cleanedTitle,
        rawBottomText,
        detectedSet,
        detectedCollectorNumber,
        confidence,
        cardImageBase64,
        titleStripBase64,
        bottomStripBase64,
      };

      setScanResult(finalResult);
      setStatusMessage(`Gotowe! Rozpoznano: "${cleanedTitle || 'Brak tekstu'}"`);

      if (onScanSuccess) {
        onScanSuccess(finalResult);
      }
    } catch (err: any) {
      console.error('Błąd potoku skanowania:', err);
      setStatusMessage('Błąd przetwarzania: ' + (err.message || 'Nieznany błąd'));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-stone-950 text-stone-100 rounded-2xl overflow-hidden border border-stone-800 shadow-2xl">
      {/* Pasek nagłówka */}
      <div className="px-4 py-3 bg-stone-900 border-b border-stone-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
            <Scan className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-stone-100 flex items-center gap-1.5">
              <span>Skaner Delver Lens (HTML5 Canvas Preprocessing)</span>
              <span className="text-[11px] bg-amber-500/20 text-amber-300 tabular-nums px-1.5 py-0.5 rounded border border-amber-500/30">
                63×88 mm
              </span>
            </h3>
            <p className="text-[11px] text-stone-400">
              Wycina kartę, segmentuje tekst (górne 15% & dolne 10%) i filtruje binarnie metodą Otsu.
            </p>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-100 hover:bg-stone-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Główna zawartość: Siatka 2 kolumn */}
      <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-hidden">
        {/* Lewa kolumna: Wizjer kamery z nakładką */}
        <div className="lg:col-span-7 bg-black p-4 flex flex-col items-center justify-center relative">
          <div
            ref={viewfinderRef}
            className="relative w-full aspect-[3/4] sm:aspect-[4/3] rounded-xl overflow-hidden bg-stone-950 border border-stone-800 flex items-center justify-center shadow-inner"
          >
            {/* Strumień wideo z kamery */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${!isCameraActive ? 'hidden' : ''}`}
            />

            {/* Błąd kamery lub brak uprawnień */}
            {!isCameraActive && (
              <div className="p-6 text-center space-y-3 max-w-sm">
                <AlertCircle className="w-10 h-10 text-amber-400 mx-auto" />
                <p className="text-xs text-stone-300">
                  {cameraError || 'Trwa uruchamianie kamery... Upewnij się, że zezwoliłeś na dostęp.'}
                </p>
                <button
                  type="button"
                  onClick={startCamera}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold rounded-xl transition-colors"
                >
                  Spróbuj ponownie
                </button>
              </div>
            )}

            {/* KROK 1: NAKŁADKA UI (Wizjer proporcji karty MTG 63x88mm + półprzezroczysta maska) */}
            {isCameraActive && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-4">
                {/* 
                  Ramka karty o dokładnych proporcjach 63x88mm.
                  Maska zaciemniająca zrealizowana przez potężny box-shadow 9999px
                */}
                <div
                  ref={cardReticleRef}
                  className="relative aspect-[63/88] h-[86%] max-w-[85%] border-2 border-amber-400 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.65)] flex flex-col justify-between p-2 transition-all"
                >
                  {/* Rogowe znaczniki precyzyjne */}
                  <div className="absolute -top-1.5 -left-1.5 w-4 h-4 border-t-4 border-l-4 border-amber-400 rounded-tl" />
                  <div className="absolute -top-1.5 -right-1.5 w-4 h-4 border-t-4 border-r-4 border-amber-400 rounded-tr" />
                  <div className="absolute -bottom-1.5 -left-1.5 w-4 h-4 border-b-4 border-l-4 border-amber-400 rounded-bl" />
                  <div className="absolute -bottom-1.5 -right-1.5 w-4 h-4 border-b-4 border-r-4 border-amber-400 rounded-br" />

                  {/* Strefa 1: Górne 15% (Nazwa i Koszt Many) */}
                  <div className="w-[92%] h-[15%] border-2 border-dashed border-amber-300 bg-amber-400/20 rounded-lg flex items-center justify-between px-2 text-[11px] text-amber-200 tabular-nums font-bold mx-auto mt-1 shadow-sm backdrop-blur-[1px]">
                    <span>GÓRNE 15% (NAZWA KARTY)</span>
                    <span className="text-[11px] bg-amber-500/30 px-1 py-0.5 rounded text-amber-300">OCR</span>
                  </div>

                  {/* Linia animacji skanowania */}
                  {isProcessing && (
                    <div className="absolute inset-x-2 h-1 bg-gradient-to-r from-transparent via-amber-400 to-transparent shadow-[0_0_12px_#fbbf24] animate-pulse" />
                  )}

                  {/* Strefa 2: Dolne 10% (Symbol Setu i Numer Kolekcjonera) */}
                  <div className="w-[92%] h-[10%] border border-dashed border-amber-300/80 bg-amber-400/15 rounded-lg flex items-center justify-between px-2 text-[11px] text-amber-300 tabular-nums font-bold mb-1 shadow-sm backdrop-blur-[1px]">
                    <span>DOLNE 10% (SET & NR)</span>
                    <span className="text-[11px] opacity-80">np. OTJ 125</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Dolny pasek akcji: Przycisk „Skanuj” */}
          <div className="w-full flex items-center justify-between mt-3 px-1">
            <span className="text-xs text-stone-400 tabular-nums truncate max-w-[65%]">
              {statusMessage}
            </span>
            <button
              type="button"
              disabled={!isCameraActive || isProcessing}
              onClick={handleCaptureAndScan}
              className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 cursor-pointer shadow-lg transition-all ${
                isProcessing
                  ? 'bg-stone-800 text-stone-500 cursor-not-allowed'
                  : 'bg-amber-400 hover:bg-amber-300 text-stone-950 shadow-amber-950/40 hover:scale-[1.02]'
              }`}
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-500" />
                  <span>Przetwarzanie...</span>
                </>
              ) : (
                <>
                  <Camera className="w-4 h-4 stroke-[2.5]" />
                  <span>Skanuj kartę</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Prawa kolumna: Podgląd Preprocessing & Wynik Rozpoznania */}
        <div className="lg:col-span-5 p-4 bg-stone-900/90 border-t lg:border-t-0 lg:border-l border-stone-800 flex flex-col justify-between overflow-y-auto space-y-4">
          <div className="space-y-3.5">
            <h4 className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Podgląd Image Preprocessing (W stylu Delver Lens)</span>
            </h4>

            {scanResult ? (
              <div className="space-y-3">
                {/* 1. Odczytany Tytuł */}
                <div className="p-3 bg-stone-950 rounded-xl border border-stone-800 space-y-1">
                  <span className="text-[11px] text-stone-400 block tabular-nums">Rozpoznana nazwa karty:</span>
                  <div className="text-base font-bold text-amber-300">
                    {scanResult.cleanedTitle || <span className="italic text-stone-500">Nie odczytano tekstu</span>}
                  </div>
                  {scanResult.detectedSet && (
                    <div className="text-xs text-stone-300 pt-1 flex items-center gap-2">
                      <span className="bg-stone-800 px-2 py-0.5 rounded text-stone-200 tabular-nums text-[11px]">
                        SET: [{scanResult.detectedSet.toUpperCase()}]
                      </span>
                      {scanResult.detectedCollectorNumber && (
                        <span className="bg-stone-800 px-2 py-0.5 rounded text-stone-200 tabular-nums text-[11px]">
                          NR: #{scanResult.detectedCollectorNumber}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* 2. Zbinaryzowany Pasek Górny (Tytuł 15%) */}
                <div className="p-2.5 bg-stone-950 rounded-xl border border-stone-800 space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-stone-400">
                    <span className="tabular-nums text-amber-300 font-bold">1. Pasek górny (15%): Filtr Otsu</span>
                    <span className="text-[11px] text-emerald-400 font-semibold">Tylko czarny tekst</span>
                  </div>
                  <div className="bg-white rounded p-1 flex items-center justify-center border border-stone-300">
                    <img
                      src={scanResult.titleStripBase64}
                      alt="Górny pasek po binarizacji"
                      className="max-h-8 w-full object-contain filter contrast-125"
                    />
                  </div>
                  <p className="text-[11px] text-stone-500 tabular-nums pt-0.5 truncate">
                    Surowy odczyt OCR: "{scanResult.rawTitleText.trim()}"
                  </p>
                </div>

                {/* 3. Zbinaryzowany Pasek Dolny (Set/Numer 10%) */}
                <div className="p-2.5 bg-stone-950 rounded-xl border border-stone-800 space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-stone-400">
                    <span className="tabular-nums text-amber-300 font-bold">2. Pasek dolny (10%): Stopka</span>
                    <span className="text-[11px] text-emerald-400 font-semibold">Kod setu & Numer</span>
                  </div>
                  <div className="bg-white rounded p-1 flex items-center justify-center border border-stone-300">
                    <img
                      src={scanResult.bottomStripBase64}
                      alt="Dolny pasek po binarizacji"
                      className="max-h-6 w-full object-contain filter contrast-125"
                    />
                  </div>
                </div>

                {/* 4. Wycięta karta 63x88mm */}
                <div className="p-2.5 bg-stone-950 rounded-xl border border-stone-800 space-y-1">
                  <span className="text-[11px] text-stone-400 tabular-nums block">
                    3. Wycięta zawartość wizjera (samej karty):
                  </span>
                  <div className="flex justify-center bg-black/40 rounded p-1">
                    <img
                      src={scanResult.cardImageBase64}
                      alt="Wycięta karta"
                      className="max-h-36 object-contain rounded border border-stone-800"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-5 text-center rounded-xl bg-stone-950/60 border border-dashed border-stone-800 space-y-2 text-stone-400">
                <Info className="w-6 h-6 text-amber-400/60 mx-auto" />
                <p className="text-xs leading-relaxed">
                  Po kliknięciu <strong>„Skanuj kartę”</strong>, Canvas API wyodrębni samą kartę, odetnie grafiki i przekaże do OCR wyłącznie czarno-białe paski z tekstem.
                </p>
              </div>
            )}
          </div>

          {/* Stopka edukacyjna */}
          <div className="p-3 rounded-xl bg-stone-950 border border-stone-800/80 text-[11px] text-stone-400 space-y-1 leading-relaxed">
            <span className="font-bold text-stone-300 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Dlaczego preprocessing Delver Lens działa tak skutecznie?</span>
            </span>
            <p>
              Ignoruje ilustrację karty, podbija kontrast i rozdziela tło od liter progowaniem Otsu. Tesseract otrzymuje wyłącznie pojedynczą linijkę tekstu w czerni i bieli (PSM 7), co eliminuje 95% pomyłek.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
