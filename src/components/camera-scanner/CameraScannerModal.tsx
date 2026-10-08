import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Camera, 
  X, 
  Sparkles, 
  Check, 
  Layers, 
  RefreshCw, 
  Upload, 
  Zap, 
  ZapOff, 
  FolderPlus, 
  Search, 
  AlertCircle,
  Plus,
  Minus,
  CheckCircle2,
  ScanLine,
  Radio,
  Video,
  ZoomIn,
  ZoomOut,
  HelpCircle,
  Lightbulb,
  Sliders,
  ChevronDown,
  ChevronUp,
  Cpu
} from 'lucide-react';
import { ScryfallCard, CardCondition, CardLanguage, Catalog, AppSettings } from '../../types';
import { formatCurrency, getCardImageUri, getCardPrice, getRarityColor, getRarityLabel, handleCardImageError } from '../../utils/formatters';
import { CameraScannerModalProps, CameraDeviceOption, ScanResult } from './types';
import { searchCardInScryfall, playScannerChime } from './ocrProcessor';
import { calculateVideoSensorCrop } from './cvCardPipeline';
import { detectCardInSource, recognizeCard } from './scanEngine';
import { Quad, quadMovement } from './cardDetector';
import { EdhrecBadge } from '../EdhrecBadge';

import { useBackToClose } from '../../hooks/useBackButton';
export const CameraScannerModal: React.FC<CameraScannerModalProps> = ({
  isOpen,
  onClose,
  catalogs,
  settings,
  onSaveToCollection,
  showToast,
}) => {
  // „Wstecz” na telefonie zamyka to okno zamiast opuszczać stronę
  useBackToClose(isOpen, onClose);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const autoScanTimerRef = useRef<NodeJS.Timeout | null>(null);
  const motionTrackerTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraSnapInputRef = useRef<HTMLInputElement | null>(null);
  const viewfinderContainerRef = useRef<HTMLDivElement | null>(null);
  const cardReticleRef = useRef<HTMLDivElement | null>(null);
  const steadyCountRef = useRef<number>(0);
  // Pętla wykrywania karty: ostatnie położenie, liczba klatek bez karty i gotowość do kolejnego skanu
  const lastQuadRef = useRef<Quad | null>(null);
  const lostCountRef = useRef<number>(0);
  const scanArmedRef = useRef<boolean>(true);
  const [overlayPoints, setOverlayPoints] = useState<string | null>(null);

  // Camera State
  const [cameraDevices, setCameraDevices] = useState<CameraDeviceOption[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const prevDeviceIdRef = useRef<string>('');

  // Delver Lens Live Motion Stability & Lock-on
  const [isReticleLocked, setIsReticleLocked] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  // Scanning State (Delver Lens / ManaBox Vision Engine)
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number; step: number } | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [showTips, setShowTips] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanStatus, setScanStatus] = useState<string>('Nakieruj kartę na ramkę');
  const [isAutoScanEnabled, setIsAutoScanEnabled] = useState<boolean>(false);
  const [isBatchMode, setIsBatchMode] = useState<boolean>(true);
  const [sessionAddedCount, setSessionAddedCount] = useState<number>(0);

  // Detection & Confirmation State
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [activeCard, setActiveCard] = useState<ScryfallCard | null>(null);
  const [isFoil, setIsFoil] = useState<boolean>(false);
  const [selectedBinder, setSelectedBinder] = useState<string>(() => {
    const def = catalogs.find((c) => c.isDefault);
    return def ? def.name : catalogs[0]?.name || 'Klaser Główny';
  });
  const [quantity, setQuantity] = useState<number>(1);
  const [condition, setCondition] = useState<CardCondition>('NM');
  const [language, setLanguage] = useState<CardLanguage>('EN');
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [lastAddedNotice, setLastAddedNotice] = useState<string | null>(null);

  // Prints Drawer
  const [isPrintsOpen, setIsPrintsOpen] = useState<boolean>(false);
  const [prints, setPrints] = useState<ScryfallCard[]>([]);
  const [isLoadingPrints, setIsLoadingPrints] = useState<boolean>(false);

  // Manual fallback search
  const [manualQuery, setManualQuery] = useState<string>('');
  const [isSearchingManual, setIsSearchingManual] = useState<boolean>(false);

  // 1. Enumerate available video inputs (Auto-detecting OBS Virtual Camera & mobile webcams)
  const enumerateCameras = useCallback(async () => {
    try {
      if (!navigator?.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices
        .filter((d) => d.kind === 'videoinput')
        .map((d, idx) => ({
          deviceId: d.deviceId,
          label: d.label || `Kamera ${idx + 1}`,
        }));

      setCameraDevices(videoInputs);
      if (videoInputs.length > 0) {
        // Automatically check if OBS Virtual Camera or phone camera utility is available
        const obsCam = videoInputs.find((c) =>
          /obs|virtual/i.test(c.label)
        );
        const phoneCam = videoInputs.find((c) =>
          /droidcam|iriun|camo|epoccam/i.test(c.label)
        );
        const backCam = videoInputs.find((c) =>
          /back|tył|environment/i.test(c.label)
        );

        if (!selectedDeviceId) {
          if (obsCam) {
            setSelectedDeviceId(obsCam.deviceId);
          } else if (phoneCam) {
            setSelectedDeviceId(phoneCam.deviceId);
          } else if (backCam) {
            setSelectedDeviceId(backCam.deviceId);
          } else {
            setSelectedDeviceId(videoInputs[0].deviceId);
          }
        }
      }
    } catch (err) {
      console.warn('Błąd wykrywania kamer:', err);
    }
  }, [selectedDeviceId]);

  // 2. Start / Stop Camera Stream
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setIsTorchOn(false);
  }, []);

  const startCamera = useCallback(async () => {
    if (!isOpen) return;
    stopCamera();
    setCameraError(null);

    // Try modern navigator.mediaDevices.getUserMedia or legacy vendor prefixes
    const getMediaStream = async (constraints: MediaStreamConstraints): Promise<MediaStream> => {
      if (navigator?.mediaDevices?.getUserMedia) {
        return navigator.mediaDevices.getUserMedia(constraints);
      }
      const legacy =
        (navigator as any)?.getUserMedia ||
        (navigator as any)?.webkitGetUserMedia ||
        (navigator as any)?.mozGetUserMedia ||
        (navigator as any)?.msGetUserMedia;

      if (legacy) {
        return new Promise((resolve, reject) => {
          legacy.call(navigator, constraints, resolve, reject);
        });
      }
      throw new Error('NO_MEDIA_DEVICES');
    };

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
          facingMode: selectedDeviceId ? undefined : { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      };

      const stream = await getMediaStream(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch((e) => console.warn('Video play err:', e));
      }

      setIsCameraActive(true);

      // Check for torch capability
      const videoTrack = stream.getVideoTracks()[0];
      const capabilities = (videoTrack?.getCapabilities?.() || {}) as any;
      setHasTorch(Boolean(capabilities.torch));

      // Check for hardware zoom capability (ideal for high-res cameras with minimum focal distance)
      if (capabilities.zoom) {
        setZoomRange({
          min: capabilities.zoom.min || 1,
          max: capabilities.zoom.max || 4,
          step: capabilities.zoom.step || 0.1,
        });
        setZoomLevel(capabilities.zoom.min || 1);
      } else {
        setZoomRange(null);
      }

      // Attempt continuous auto-focus if hardware supports it
      try {
        if (capabilities.focusMode && Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes('continuous')) {
          await (videoTrack as any).applyConstraints({
            advanced: [{ focusMode: 'continuous' }]
          });
        }
      } catch (_) {}

      // Refresh camera labels after permission granted
      enumerateCameras();
    } catch (err: any) {
      console.warn('Błąd kamery:', err);
      setIsCameraActive(false);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('PERMISSION_DENIED');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraError('NO_CAMERA_FOUND');
      } else {
        setCameraError('IFRAME_OR_UNSUPPORTED');
      }
    }
  }, [isOpen, selectedDeviceId, stopCamera, enumerateCameras]);

  // Restart camera when device selection changes
  useEffect(() => {
    if (isOpen && selectedDeviceId && selectedDeviceId !== prevDeviceIdRef.current && isCameraActive) {
      prevDeviceIdRef.current = selectedDeviceId;
      startCamera();
    }
  }, [isOpen, selectedDeviceId, isCameraActive, startCamera]);

  // Toggle Torch / Latarka
  const toggleTorch = useCallback(async () => {
    if (!streamRef.current || !hasTorch) return;
    const videoTrack = streamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      try {
        const nextTorch = !isTorchOn;
        await (videoTrack as any).applyConstraints({
          advanced: [{ torch: nextTorch }],
        });
        setIsTorchOn(nextTorch);
      } catch (err) {
        console.warn('Błąd włączania latarki:', err);
      }
    }
  }, [hasTorch, isTorchOn]);

  // Adjust hardware camera zoom
  const handleZoomChange = useCallback(async (newZoom: number) => {
    setZoomLevel(newZoom);
    if (!streamRef.current) return;
    const videoTrack = streamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      try {
        await (videoTrack as any).applyConstraints({
          advanced: [{ zoom: newZoom }],
        });
      } catch (err) {
        console.warn('Błąd zmiany powiększenia zoom:', err);
      }
    }
  }, []);

  // Manage Camera on Modal Open/Close
  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
      if (autoScanTimerRef.current) clearInterval(autoScanTimerRef.current);
      setScanResult(null);
      setActiveCard(null);
      setLastAddedNotice(null);
    }
    return () => {
      stopCamera();
      if (autoScanTimerRef.current) clearInterval(autoScanTimerRef.current);
    };
  }, [isOpen, startCamera, stopCamera]);

  // Celownik we współrzędnych klatki wideo
  const getSensorGuide = useCallback(() => {
    const video = videoRef.current;
    if (!video) return null;
    if (viewfinderContainerRef.current && cardReticleRef.current) {
      const r = calculateVideoSensorCrop(video, cardReticleRef.current, viewfinderContainerRef.current);
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    const gh = h * 0.84;
    const gw = gh * (63 / 88);
    return { x: (w - gw) / 2, y: (h - gh) / 2, width: gw, height: gh };
  }, []);

  // Wspólna obsługa wyniku skanu (kamera i zdjęcie)
  const applyScanResult = useCallback((result: ScanResult) => {
    setScanResult(result);
    if (result.matchedCard) {
      setActiveCard(result.matchedCard);
      setManualQuery(result.matchedCard.name);
      const where = result.matchedCard.set ? ` [${result.matchedCard.set.toUpperCase()} #${result.matchedCard.collector_number}]` : '';
      setScanStatus(`Rozpoznano: "${result.matchedCard.name}"${where}`);
      if (soundEnabled) playScannerChime('success');
      return true;
    }
    if (result.cleanedTitle) {
      setManualQuery(result.cleanedTitle);
      setScanStatus(`Odczytano: "${result.cleanedTitle}". Nie znaleziono pewnego dopasowania`);
    } else {
      setScanStatus(result.isAutoCropped
        ? 'Nie rozpoznano karty. Popraw oświetlenie (bez odblasków) i przytrzymaj nieruchomo.'
        : 'Nie wykryto karty. Połóż ją na jasnym, jednolitym tle i wypełnij ramkę.');
    }
    return false;
  }, [soundEnabled]);

  // 3. Skan: wykrycie rogów, wyprostowanie, OCR nazwy i stopki, dopasowanie na serwerze
  const performScan = useCallback(async (quad?: Quad | null) => {
    if (isScanning) return;
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;

    setIsScanning(true);
    try {
      const result = await recognizeCard(video, {
        quad: quad || null,
        guide: getSensorGuide() || undefined,
        onStatus: setScanStatus
      });
      applyScanResult(result);
    } catch (err: any) {
      console.error('Błąd skanowania:', err);
      setScanStatus('Błąd przetwarzania klatki. Spróbuj ponownie lub wgraj zdjęcie.');
    } finally {
      setIsScanning(false);
    }
  }, [isScanning, getSensorGuide, applyScanResult]);

  // Pętla wykrywania karty na żywo (jak w ManaBox): kilka razy na sekundę szukamy rogów karty,
  // rysujemy jej obrys, a gdy karta leży nieruchomo — uruchamiamy skan. Po skanie czekamy,
  // aż karta zniknie z kadru, żeby nie skanować jej drugi raz.
  useEffect(() => {
    if (!isCameraActive || isScanning || activeCard) {
      setIsReticleLocked(false);
      steadyCountRef.current = 0;
      if (motionTrackerTimerRef.current) {
        clearInterval(motionTrackerTimerRef.current);
        motionTrackerTimerRef.current = null;
      }
      return;
    }

    const toDisplay = (q: Quad) => {
      const v = videoRef.current;
      const c = viewfinderContainerRef.current;
      if (!v || !c) return null;
      const rect = c.getBoundingClientRect();
      const scale = Math.max(rect.width / v.videoWidth, rect.height / v.videoHeight);
      const ox = (v.videoWidth * scale - rect.width) / 2;
      const oy = (v.videoHeight * scale - rect.height) / 2;
      return [q.tl, q.tr, q.br, q.bl].map((p) => `${(p.x * scale - ox).toFixed(1)},${(p.y * scale - oy).toFixed(1)}`).join(' ');
    };

    motionTrackerTimerRef.current = setInterval(() => {
      const v = videoRef.current;
      if (!v || v.readyState < 2 || isScanning || activeCard) return;
      try {
        const guide = getSensorGuide();
        if (!guide) return;
        const det = detectCardInSource(v, guide);
        if (!det) {
          lostCountRef.current += 1;
          steadyCountRef.current = 0;
          lastQuadRef.current = null;
          setOverlayPoints(null);
          setIsReticleLocked(false);
          if (lostCountRef.current >= 2) scanArmedRef.current = true; // karta zabrana — gotowi na następną
          return;
        }
        lostCountRef.current = 0;
        const prev = lastQuadRef.current;
        const moved = prev ? quadMovement(prev, det.quad) : Infinity;
        steadyCountRef.current = moved < guide.width * 0.015 ? steadyCountRef.current + 1 : 0;
        lastQuadRef.current = det.quad;
        setOverlayPoints(toDisplay(det.quad));
        const steady = steadyCountRef.current >= 2;
        setIsReticleLocked(steady);
        if (steady && isAutoScanEnabled && scanArmedRef.current) {
          scanArmedRef.current = false;
          performScan(det.quad);
        } else if (steady && !scanArmedRef.current) {
          setScanStatus('Zabierz kartę i połóż następną');
        }
      } catch (_) {}
    }, 160);

    return () => {
      if (motionTrackerTimerRef.current) {
        clearInterval(motionTrackerTimerRef.current);
        motionTrackerTimerRef.current = null;
      }
    };
  }, [isCameraActive, isScanning, activeCard, isAutoScanEnabled, performScan, getSensorGuide]);

  // 4. File and Image Processing (Upload, Drag-and-Drop, Clipboard Paste)
  const processImageFile = useCallback(
    async (file: File) => {
      if (!file || !file.type.startsWith('image/')) return;

      setIsScanning(true);
      setScanStatus('Wczytywanie zdjęcia...');

      const img = new Image();
      img.onload = async () => {
        try {
          const result = await recognizeCard(img, { onStatus: setScanStatus });
          applyScanResult(result);
        } catch (err: any) {
          console.error('Błąd przetwarzania zdjęcia:', err);
          setScanStatus('Nie udało się przetworzyć wskazanego pliku.');
        } finally {
          setIsScanning(false);
          URL.revokeObjectURL(img.src);
        }
      };
      img.src = URL.createObjectURL(file);
    },
    [applyScanResult]
  );

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        processImageFile(file);
      }
    },
    [processImageFile]
  );

  // Paste image directly from clipboard (Ctrl + V)
  useEffect(() => {
    if (!isOpen) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            processImageFile(file);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen, processImageFile]);

  // 5. Fetch Alternate Prints for active card
  const loadAlternatePrints = useCallback(async (card: ScryfallCard) => {
    setIsLoadingPrints(true);
    try {
      const res = await fetch(`/api/scryfall/prints?name=${encodeURIComponent(card.name)}`);
      if (res.ok) {
        const data = await res.json();
        const list: ScryfallCard[] = Array.isArray(data.data) ? data.data : [];
        setPrints(list);
      }
    } catch (err) {
      console.error('Błąd pobierania wydań:', err);
    } finally {
      setIsLoadingPrints(false);
    }
  }, []);

  const handleOpenPrints = useCallback(() => {
    if (!activeCard) return;
    setIsPrintsOpen(true);
    // Wydania ze skanu są już posortowane wg podobieństwa do zdjęcia — nie trzeba pytać Scryfall.
    const fromScan = scanResult?.possibleCards?.filter((c) => c.name === activeCard.name) || [];
    if (fromScan.length > 1) setPrints(fromScan);
    else loadAlternatePrints(activeCard);
  }, [activeCard, loadAlternatePrints, scanResult]);

  const handleSelectAlternatePrint = useCallback((printCard: ScryfallCard) => {
    setActiveCard(printCard);
    setIsPrintsOpen(false);
    showToast(`Wybrano wersję [${printCard.set.toUpperCase()}] #${printCard.collector_number}`);
  }, [showToast]);

  // 6. Manual Query Search
  const handleManualSearch = useCallback(async () => {
    if (!manualQuery.trim()) return;
    setIsSearchingManual(true);
    try {
      const { matchedCard, possibleCards } = await searchCardInScryfall(manualQuery.trim());
      if (matchedCard) {
        setActiveCard(matchedCard);
        setScanStatus(`Znaleziono: "${matchedCard.name}"`);
      } else {
        showToast(`Nie znaleziono karty dla "${manualQuery}"`);
      }
    } catch (err) {
      console.error('Błąd wyszukiwania:', err);
    } finally {
      setIsSearchingManual(false);
    }
  }, [manualQuery, showToast]);

  // 7. Save Card to Collection
  const handleAddCardToCollection = useCallback(async () => {
    if (!activeCard) return;
    setIsAdding(true);

    try {
      const normQty = isFoil ? 0 : quantity;
      const foilQty = isFoil ? quantity : 0;

      // Price calculation in PLN
      const plnPrice = getCardPrice(activeCard, isFoil, { ...settings, currency: 'PLN' });

      await onSaveToCollection({
        card: activeCard,
        quantity: normQty,
        quantityFoil: foilQty,
        condition,
        language,
        binder: selectedBinder,
        purchasePrice: plnPrice > 0 ? plnPrice : null,
      });

      setSessionAddedCount((prev) => prev + 1);
      const notice = `Dodano: "${activeCard.name}" [${activeCard.set.toUpperCase()}] (${isFoil ? 'Foil' : 'Standard'}) do katalogu "${selectedBinder}"`;
      setLastAddedNotice(notice);
      showToast(notice);

      if (isBatchMode) {
        // In Batch mode, clear the current match and resume scanning immediately
        setActiveCard(null);
        setScanResult(null);
        setQuantity(1);
        setIsPrintsOpen(false);
        setScanStatus('Gotowy na następną kartę. Nakieruj na ramkę.');
      } else {
        // In Single mode, close the modal
        onClose();
      }
    } catch (err: any) {
      console.error('Błąd zapisu karty:', err);
      showToast('Wystąpił błąd podczas zapisywania karty.');
    } finally {
      setIsAdding(false);
    }
  }, [
    activeCard,
    isFoil,
    quantity,
    condition,
    language,
    selectedBinder,
    settings,
    onSaveToCollection,
    isBatchMode,
    onClose,
    showToast,
  ]);

  // Blokada przewijania strony w tle, gdy modal skanera jest otwarty
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  // Globalne skróty klawiszowe w oknie skanera:
  // - SPACJA: blokuje przewijanie strony i uruchamia skanowanie ponownie
  // - ENTER: natychmiast dodaje rozpoznaną kartę do domyślnego klasera / kolekcji
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTextInput = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

      // 1. KLAWISZ SPACJI: Zapobieganie przewijaniu strony + ponowne / nowe skanowanie
      if (e.code === 'Space' || e.key === ' ') {
        if (!isTextInput) {
          e.preventDefault();
          e.stopPropagation();

          // Jeśli karta była już rozpoznana, czyścimy ją, by natychmiast zeskanować kolejną
          if (activeCard) {
            setActiveCard(null);
            setScanResult(null);
          }

          if (!isScanning) {
            performScan(lastQuadRef.current);
          }
        }
      }

      // 2. KLAWISZ ENTER: Dodanie rozpoznanej karty do kolekcji
      if (e.key === 'Enter') {
        // Jeśli użytkownik wpisuje frazę w wyszukiwarkę ręczną bez aktywnej karty, pozwól na standardowe Enter
        if (isTextInput && !activeCard) {
          return;
        }

        if (activeCard && !isAdding) {
          e.preventDefault();
          e.stopPropagation();
          handleAddCardToCollection();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true, passive: false });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [isOpen, activeCard, isAdding, isScanning, performScan, handleAddCardToCollection]);

  if (!isOpen) return null;

  // Active Card Prices
  const normPln = activeCard ? getCardPrice(activeCard, false, { ...settings, currency: 'PLN' }) : 0;
  const foilPln = activeCard ? getCardPrice(activeCard, true, { ...settings, currency: 'PLN' }) : 0;
  const activeThumbnail = activeCard ? getCardImageUri(activeCard, 'normal') : '';

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative bg-stone-900 sm:border border-stone-800 sm:rounded-2xl max-w-4xl w-full overflow-hidden shadow-2xl sm:my-auto text-stone-100 h-dvh sm:h-auto sm:max-h-[95vh] flex flex-col pt-[env(safe-area-inset-top)] sm:pt-0"
      >
        {/* Modal Top Header */}
        <div className="flex items-center justify-between gap-3 px-3 sm:px-5 py-2 sm:py-3 border-b border-stone-800 bg-stone-950/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-stone-100">
                  Skaner Kart MTG
                </h2>
              </div>
              <p className="text-xs text-stone-400 hidden sm:block">
                Rozpoznawanie karty, wydania i wyceny rynkowej
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Audio Feedback Toggle */}
            <button
              type="button"
              onClick={() => setSoundEnabled((prev) => !prev)}
              className={`p-1.5 px-2 rounded-lg border text-xs flex items-center gap-1 cursor-pointer transition-colors ${
                soundEnabled
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                  : 'bg-stone-900 border-stone-800 text-stone-500 hover:text-stone-300'
              }`}
              title={soundEnabled ? 'Dźwięk skanera włączony' : 'Dźwięk skanera wyciszony'}
            >
              {soundEnabled ? <Zap className="w-3.5 h-3.5 text-emerald-400" /> : <ZapOff className="w-3.5 h-3.5" />}
            </button>

            {/* Tips Toggle Button */}
            <button
              type="button"
              onClick={() => setShowTips((prev) => !prev)}
              className={`p-1.5 px-2.5 rounded-lg border text-xs flex items-center gap-1.5 cursor-pointer transition-colors ${
                showTips
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                  : 'bg-stone-900 border-stone-800 text-stone-300 hover:text-stone-100 hover:bg-stone-800'
              }`}
              title="Porady jak uzyskać idealną ostrość i odczyt"
            >
              <Lightbulb className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline font-semibold">Porady</span>
              {showTips ? <ChevronUp className="w-3 h-3 text-stone-400" /> : <ChevronDown className="w-3 h-3 text-stone-400" />}
            </button>

            {sessionAddedCount > 0 && (
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs tabular-nums font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{sessionAddedCount}</span>
              </span>
            )}

            <button
              onClick={onClose}
              title="Zamknij skaner"
              aria-label="Zamknij skaner"
              className="w-11 h-11 sm:w-auto sm:h-auto sm:p-1.5 flex items-center justify-center text-stone-300 sm:text-stone-400 bg-stone-800 sm:bg-transparent hover:text-stone-100 hover:bg-stone-800 rounded-full sm:rounded-lg transition-colors cursor-pointer ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Collapsible Tips Banner: Solves the high-resolution camera focus issue! */}
        {showTips && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-5 py-3 text-xs text-stone-300 space-y-2 animate-fade-in">
            <div className="flex items-center gap-2 text-amber-300 font-bold">
              <Lightbulb className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Dlaczego aparat o dużej rozdzielczości miewa problem z odczytem i jak to natychmiast poprawić:</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1 text-[11px] leading-relaxed">
              <div className="p-2.5 rounded-lg bg-stone-950/80 border border-amber-500/20 space-y-1">
                <span className="font-bold text-amber-300 flex items-center gap-1">
                  <ZoomIn className="w-3.5 h-3.5 text-amber-400" />
                  <span>1. Odległość 20 cm + Zoom</span>
                </span>
                <p className="text-stone-300">
                  Kamery wysokiej rozdzielczości nie mają obiektywu makro i tracą ostrość z bliska. <strong>Nie przysuwaj karty pod sam obiektyw!</strong> Trzymaj kartę w odległości 15–25 cm i użyj suwaka <strong>Zoom</strong> poniżej, by wypełnić kadr.
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-stone-950/80 border border-emerald-500/20 space-y-1">
                <span className="font-bold text-emerald-300 flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-emerald-400" />
                  <span>2. Detekcja na białej kartce / stole</span>
                </span>
                <p className="text-stone-300">
                  Gdy karta leży na białej kartce papieru lub biurku, skaner analizuje całą powierzchnię kadru i <strong>automatycznie wykrywa obrys karty (auto-crop 63×88mm)</strong>, precyzyjnie dzieląc ją na sekcje bez wciągania białego tła.
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-stone-950/80 border border-amber-500/20 space-y-1">
                <span className="font-bold text-amber-300 flex items-center gap-1">
                  <Camera className="w-3.5 h-3.5 text-emerald-400" />
                  <span>3. Kąt & Przycisk „Aparat”</span>
                </span>
                <p className="text-stone-300">
                  Pochyl kartę o 10°, by światło lampy nie odbijało się od koszulki. Na komputerze możesz też kliknąć zielony przycisk <strong>„Aparat”</strong>, który robi natywne zdjęcie z pełnym autofokusem!
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Modal Body: 2 Columns on Desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-y-auto">
          {/* Left Column: Camera Viewport */}
          <div className="lg:col-span-7 bg-black p-0 sm:p-4 flex flex-col justify-between relative border-b lg:border-b-0 lg:border-r border-stone-800">
            {/* Camera Viewfinder Container */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingOver(true);
              }}
              onDragLeave={() => setIsDraggingOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) processImageFile(file);
              }}
              ref={viewfinderContainerRef}
              className={`relative aspect-[3/4] max-h-[68dvh] sm:max-h-none sm:aspect-[4/3] w-full sm:rounded-xl overflow-hidden bg-stone-950 border flex items-center justify-center shadow-inner transition-colors ${
                isDraggingOver
                  ? 'border-amber-400 ring-2 ring-amber-400/50 bg-amber-950/20'
                  : 'border-stone-800'
              }`}
            >
              {/* Video Element */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${!isCameraActive ? 'hidden' : ''}`}
              />

              {/* Kamera niedostępna: powód i co zrobić */}
              {!isCameraActive && (
                <div className="p-5 text-center space-y-4 max-w-md my-auto">
                  <div className="w-14 h-14 rounded-2xl bg-stone-900 border border-stone-800 flex items-center justify-center mx-auto text-amber-400 shadow-lg">
                    <Video className="w-7 h-7" />
                  </div>

                  <div className="space-y-1.5">
                    <h4 className="text-base font-bold text-stone-100">
                      {cameraError === 'PERMISSION_DENIED'
                        ? 'Brak zgody na użycie kamery'
                        : cameraError === 'NO_CAMERA_FOUND'
                        ? 'Nie znaleziono kamery'
                        : cameraError
                        ? 'Przeglądarka nie udostępnia kamery'
                        : 'Uruchamianie kamery...'}
                    </h4>
                    <p className="text-sm text-stone-300 leading-relaxed">
                      {cameraError === 'PERMISSION_DENIED'
                        ? 'Zezwól na dostęp do kamery w ustawieniach przeglądarki (ikona kłódki obok adresu strony), a potem spróbuj ponownie.'
                        : cameraError === 'NO_CAMERA_FOUND'
                        ? 'To urządzenie nie ma dostępnej kamery. Możesz zrobić zdjęcie karty aparatem albo wybrać zdjęcie z galerii.'
                        : cameraError
                        ? 'Otwórz stronę bezpośrednio w przeglądarce (nie w podglądzie ani w ramce). Możesz też zrobić zdjęcie karty.'
                        : 'Jeśli przeglądarka zapyta o dostęp do kamery, zezwól.'}
                    </p>
                  </div>

                  <div className="flex flex-col gap-2">
                    {cameraError && (
                      <button
                        type="button"
                        onClick={() => startCamera()}
                        className="w-full h-12 px-4 rounded-xl bg-emerald-500 text-stone-950 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <RefreshCw className="w-4 h-4" />
                        <span>Spróbuj ponownie</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => cameraSnapInputRef.current?.click()}
                      className="w-full h-12 px-4 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Zrób zdjęcie karty</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full h-12 px-4 rounded-xl bg-stone-800 border border-stone-700 text-stone-200 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Upload className="w-4 h-4 text-stone-400" />
                      <span>Wybierz zdjęcie z dysku (lub wklej Ctrl+V)</span>
                    </button>
                  </div>

                  {/* Kamera z telefonu przez OBS — tylko na komputerze */}
                  {!isMobile && (
                    <details className="text-left p-3 rounded-xl bg-stone-950/90 border border-stone-800 text-xs text-stone-300">
                      <summary className="cursor-pointer font-bold text-amber-400 flex items-center gap-1.5">
                        <Radio className="w-3.5 h-3.5" />
                        <span>Kamera telefonu na komputerze (OBS)</span>
                      </summary>
                      <ol className="list-decimal list-inside space-y-1 mt-2 leading-normal">
                        <li>W OBS podłącz obraz z telefonu i kliknij <strong className="text-stone-100">„Uruchom kamerę wirtualną”</strong>.</li>
                        <li>Odśwież tę stronę i wybierz z listy kamer <strong className="text-emerald-400">„OBS Virtual Camera”</strong>.</li>
                      </ol>
                    </details>
                  )}
                </div>
              )}

              {/* MTG Card Target Reticle Overlay */}
              {isCameraActive && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-4">
                  {/* Card Outline Bounding Box (dokładne proporcje karty MTG 63x88mm) z maską zewnętrzną */}
                  <div
                    ref={cardReticleRef}
                    className={`relative aspect-[63/88] h-[84%] max-w-[85%] rounded-2xl flex flex-col justify-between transition-all duration-200 ${
                      isReticleLocked
                        ? 'border-2 border-emerald-400 ring-4 ring-emerald-500/50 shadow-[0_0_35px_rgba(52,211,153,0.55),0_0_0_9999px_rgba(0,0,0,0.65)]'
                        : 'border-2 border-amber-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.60)]'
                    }`}
                  >
                    {/* Corner Guides */}
                    <div className={`absolute -top-1.5 -left-1.5 w-4 h-4 border-t-4 border-l-4 rounded-tl transition-colors ${isReticleLocked ? 'border-emerald-400' : 'border-amber-400'}`} />
                    <div className={`absolute -top-1.5 -right-1.5 w-4 h-4 border-t-4 border-r-4 rounded-tr transition-colors ${isReticleLocked ? 'border-emerald-400' : 'border-amber-400'}`} />
                    <div className={`absolute -bottom-1.5 -left-1.5 w-4 h-4 border-b-4 border-l-4 rounded-bl transition-colors ${isReticleLocked ? 'border-emerald-400' : 'border-amber-400'}`} />
                    <div className={`absolute -bottom-1.5 -right-1.5 w-4 h-4 border-b-4 border-r-4 rounded-br transition-colors ${isReticleLocked ? 'border-emerald-400' : 'border-amber-400'}`} />

                    {/* Czysta ramka karty MTG (63x88mm) bez wyjaśnień sekcji */}
                    {isReticleLocked && (
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                        <span className="px-3 py-1 rounded-full bg-emerald-500 text-stone-950 font-bold text-[11px] shadow-lg flex items-center gap-1 animate-pulse">
                          <CheckCircle2 className="w-3.5 h-3.5 stroke-[3]" />
                          <span>KARTA WYKRYTA</span>
                        </span>
                      </div>
                    )}

                    {/* Laser Scanning Animation Line */}
                    {isScanning && (
                      <div className="absolute inset-x-2 h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_#34d399] animate-pulse transition-all" />
                    )}
                  </div>
                </div>
              )}

              {/* Obrys wykrytej karty (rogi znalezione na żywo) */}
              {isCameraActive && overlayPoints && (
                <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
                  <polygon
                    points={overlayPoints}
                    fill={isReticleLocked ? 'rgba(52,211,153,0.14)' : 'rgba(251,191,36,0.10)'}
                    stroke={isReticleLocked ? '#34d399' : '#fbbf24'}
                    strokeWidth={3}
                    strokeLinejoin="round"
                  />
                </svg>
              )}

              {/* Status Message Overlay at Bottom of Viewport */}
              <div className="absolute bottom-2 inset-x-4 flex items-center justify-center">
                <div className="px-3.5 py-1.5 rounded-full bg-stone-950/85 backdrop-blur-md border border-stone-800 text-xs text-stone-200 font-medium flex items-center gap-2 shadow-lg">
                  {isScanning ? (
                    <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                  ) : (
                    <ScanLine className="w-3.5 h-3.5 text-amber-400" />
                  )}
                  <span className="truncate max-w-[260px] sm:max-w-xs">{scanStatus}</span>
                </div>
              </div>
            </div>

            {/* Camera Controls Bar */}
            <div className="px-3 pb-3 sm:px-0 sm:pb-0 pt-3 flex flex-wrap items-center justify-between max-sm:justify-center gap-2 text-xs">
              <div className="flex flex-wrap items-center max-sm:justify-center gap-2">
                {/* Camera selector */}
                {cameraDevices.length > 0 && (
                  <select
                    value={selectedDeviceId}
                    onChange={(e) => setSelectedDeviceId(e.target.value)}
                    className="hidden sm:block bg-stone-900 border border-stone-700 rounded-lg px-2.5 py-1.5 text-stone-200 text-xs focus:outline-none focus:border-amber-500 cursor-pointer max-w-[200px] truncate"
                  >
                    {cameraDevices.map((c) => (
                      <option key={c.deviceId} value={c.deviceId}>
                        {/obs|virtual/i.test(c.label) ? 'OBS: ' : ''}
                        {c.label}
                      </option>
                    ))}
                  </select>
                )}

                {/* Hardware Zoom Slider & Presets (Key fix for high-resolution cameras with macro distance!) */}
                {zoomRange && isCameraActive && (
                  <div className="flex items-center gap-1.5 bg-stone-900/90 border border-stone-700 px-2 py-1 rounded-lg">
                    <ZoomIn className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="text-[11px] tabular-nums text-stone-300 font-semibold shrink-0">
                      {zoomLevel.toFixed(1)}x
                    </span>
                    <input
                      type="range"
                      min={zoomRange.min}
                      max={zoomRange.max}
                      step={zoomRange.step}
                      value={zoomLevel}
                      onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
                      className="w-16 accent-amber-500 cursor-pointer h-1 bg-stone-800 rounded"
                      title="Przybliżanie bez utraty ostrości"
                    />
                    <div className="flex items-center gap-0.5">
                      {[1, 1.5, 2].filter((z) => z >= zoomRange.min && z <= zoomRange.max).map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => handleZoomChange(preset)}
                          className={`px-1 py-0.5 rounded text-[11px] tabular-nums font-bold transition-colors ${
                            Math.abs(zoomLevel - preset) < 0.1
                              ? 'bg-amber-500 text-stone-950'
                              : 'bg-stone-800 text-stone-400 hover:text-stone-200'
                          }`}
                        >
                          {preset}x
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Torch / Latarka Toggle */}
                {hasTorch && (
                  <button
                    onClick={toggleTorch}
                    title="Włącz/wyłącz doświetlenie (latarkę)"
                    className={`p-2 rounded-lg border transition-colors cursor-pointer flex items-center gap-1 ${
                      isTorchOn
                        ? 'bg-amber-500 text-stone-950 border-amber-400'
                        : 'bg-stone-900 text-stone-300 border-stone-700 hover:bg-stone-800'
                    }`}
                  >
                    {isTorchOn ? <Zap className="w-4 h-4 fill-stone-950" /> : <ZapOff className="w-4 h-4" />}
                  </button>
                )}

                {/* Direct native camera snapshot input (works 100% even in iframes!) */}
                <input
                  ref={cameraSnapInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => cameraSnapInputRef.current?.click()}
                  title="Zrób zdjęcie natywnym aparatem w telefonie/laptopie (z autofokusem)"
                  className="hidden sm:flex px-2.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 font-semibold items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Aparat</span>
                </button>

                {/* Upload File Input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  title="Wgraj zdjęcie karty z pliku lub galerii (lub wklej Ctrl+V)"
                  className="hidden sm:flex px-2.5 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-300 hover:text-stone-100 items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-stone-400" />
                  <span className="hidden sm:inline">Plik / Zdjęcie</span>
                </button>
              </div>

              {/* Main Snapshot & Scan Button */}
              <div className="flex items-center gap-2 max-sm:relative max-sm:w-full max-sm:justify-center">
                <label className="flex items-center gap-1.5 text-stone-300 sm:text-stone-400 text-sm sm:text-xs cursor-pointer select-none min-h-11 sm:min-h-0 px-1 max-sm:absolute max-sm:left-0 max-sm:top-1/2 max-sm:-translate-y-1/2">
                  <input
                    type="checkbox"
                    checked={isAutoScanEnabled}
                    onChange={(e) => setIsAutoScanEnabled(e.target.checked)}
                    className="rounded border-stone-700 text-amber-500 focus:ring-0 bg-stone-900"
                  />
                  <span className="hidden sm:inline">Auto-skan</span>
                  <span className="sm:hidden">Auto</span>
                </label>

                <button
                  onClick={() => performScan(lastQuadRef.current)}
                  disabled={isScanning || !isCameraActive}
                  title="Rozpocznij skanowanie (lub naciśnij Spację)"
                  className="h-12 sm:h-auto px-6 sm:px-4 sm:py-2 rounded-full sm:rounded-xl bg-emerald-400 hover:bg-emerald-300 text-stone-950 font-bold text-sm sm:text-xs flex items-center gap-2 shadow-lg shadow-emerald-950/60 transition-all cursor-pointer disabled:opacity-50 active:scale-95"
                >
                  {isScanning ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Skanowanie...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 fill-stone-950" />
                      <span>Zeskanuj</span>
                      <kbd className="hidden sm:inline px-1.5 py-0.5 rounded bg-black/20 text-[11px] tabular-nums font-bold tracking-tight text-stone-900 border border-black/10">
                        Spacja
                      </kbd>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Card Confirmation & Add Form */}
          <div className={`lg:col-span-5 p-4 sm:p-5 flex flex-col justify-between space-y-4 bg-stone-900/90 ${
            activeCard
              ? 'max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-[60] max-sm:max-h-[80dvh] max-sm:overflow-y-auto max-sm:bg-stone-900 max-sm:rounded-t-3xl max-sm:border-t max-sm:border-stone-700 max-sm:shadow-[0_-12px_40px_rgba(0,0,0,0.6)] max-sm:pb-[calc(1rem+env(safe-area-inset-bottom))] max-sm:animate-[slideUp_.2s_ease-out]'
              : ''
          }`}>
            {activeCard && <div className="sm:hidden mx-auto w-10 h-1.5 rounded-full bg-stone-700 -mt-1" aria-hidden="true" />}
            {/* Visual Scan Debug Snippet (Delver Lens Preprocessing & Cutouts) */}
            {scanResult && (scanResult.debugCropUrl || scanResult.debugArtUrl || scanResult.debugTitleUrl) && (
              <div className="hidden sm:block p-2.5 bg-stone-950/85 rounded-xl border border-stone-800 space-y-2 text-xs text-left shrink-0">
                <div className="flex items-center justify-between text-[11px] text-stone-400">
                  <span className="font-semibold text-stone-300 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />
                    <span className="text-emerald-400 font-bold">Podgląd skanu:</span>
                  </span>
                  <div className="flex items-center gap-2">
                    {scanResult.isBlackBorderDetected ? (
                      <span className="text-[11px] px-1.5 py-0.5 rounded font-bold border bg-emerald-500/20 text-emerald-300 border-emerald-500/40 flex items-center gap-1 shadow-sm">
                        <span>Czarna ramka MTG</span>
                      </span>
                    ) : scanResult.isAutoCropped ? (
                      <span className="text-[11px] px-1.5 py-0.5 rounded font-bold border bg-emerald-500/20 text-emerald-300 border-emerald-500/40 animate-pulse">
                        Auto-Crop 63×88
                      </span>
                    ) : null}
                    {scanResult.detectedRarity && (
                      <span className={`text-[11px] px-1.5 py-0.5 rounded font-bold border ${
                        scanResult.detectedRarity === 'mythic' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' :
                        scanResult.detectedRarity === 'rare' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                        scanResult.detectedRarity === 'uncommon' ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' :
                        'bg-stone-800 text-stone-300 border-stone-700'
                      }`}>
                        {scanResult.detectedRarity}
                      </span>
                    )}
                    {scanResult.confidence > 0 && (
                      <span className="tabular-nums text-emerald-300 font-bold">
                        Pewność: {Math.round(scanResult.confidence)}%
                      </span>
                    )}
                  </div>
                </div>

                {/* Preprocessed Canvas Features (Delver Lens / ManaBox) */}
                <div className="space-y-1.5 pt-0.5">
                  {/* Artwork Crop & Set Symbol Grid */}
                  {scanResult.debugArtUrl && (
                    <div className="grid grid-cols-12 gap-2">
                      {/* Art Crop with dHash Fingerprint */}
                      <div className="col-span-8 p-1.5 rounded-lg bg-stone-900 border border-stone-800 space-y-1">
                        <div className="flex items-center justify-between text-[11px] text-stone-400">
                          <span className="tabular-nums text-emerald-300 font-semibold flex items-center gap-1">
                            <Sparkles className="w-2.5 h-2.5" />
                            <span>Ilustracja (Art Crop)</span>
                          </span>
                          {scanResult.perceptualHash && (
                            <span className="text-[8px] tabular-nums text-emerald-400/90 bg-black/40 px-1 rounded">
                              dHash: {scanResult.perceptualHash.slice(0, 8)}...
                            </span>
                          )}
                        </div>
                        <div className="bg-black/60 rounded p-1 flex items-center justify-center overflow-hidden border border-stone-800 max-h-16">
                          <img
                            src={scanResult.debugArtUrl}
                            alt="Wycinek ilustracji"
                            className="max-h-14 w-full object-contain rounded"
                          />
                        </div>
                      </div>

                      {/* Set Symbol & Rarity Crop */}
                      <div className="col-span-4 p-1.5 rounded-lg bg-stone-900 border border-stone-800 space-y-1 flex flex-col justify-between">
                        <div className="text-[11px] text-stone-400 tabular-nums">
                          <span>Symbol & Rarity</span>
                        </div>
                        <div className="bg-black/60 rounded p-1 flex items-center justify-center overflow-hidden border border-stone-800 flex-1 min-h-[36px]">
                          {scanResult.debugSetSymbolUrl ? (
                            <img
                              src={scanResult.debugSetSymbolUrl}
                              alt="Symbol setu"
                              className="max-h-8 object-contain"
                            />
                          ) : (
                            <span className="text-[11px] text-stone-500 italic">Brak</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Top Strip */}
                  {scanResult.debugTitleUrl && (
                    <div className="p-1.5 rounded-lg bg-stone-900 border border-stone-800 space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-stone-400">
                        <span className="tabular-nums text-amber-300 font-semibold flex items-center gap-1">
                          <span>Pasek górny (Nazwa/Koszt)</span>
                          {scanResult.isBlackBorderDetected && (
                            <span className="text-[8px] text-emerald-400 bg-emerald-950/60 px-1 rounded border border-emerald-500/30">wewnątrz ramki</span>
                          )}
                        </span>
                        <span className="text-stone-300 text-[8px] font-bold">Tytuł</span>
                      </div>
                      <div className="bg-white rounded p-1 flex items-center justify-center overflow-hidden border border-stone-300">
                        <img
                          src={scanResult.debugTitleUrl}
                          alt="Pasek tytułowy po binarizacji"
                          className="max-h-7 w-full object-contain filter contrast-125"
                        />
                      </div>
                    </div>
                  )}

                  {/* Bottom Strip */}
                  {scanResult.debugBottomUrl && (
                    <div className="p-1.5 rounded-lg bg-stone-900 border border-stone-800 space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-stone-400">
                        <span className="tabular-nums text-amber-300 font-semibold flex items-center gap-1">
                          <span>Stopka (Set/Numer)</span>
                          {scanResult.isBlackBorderDetected && (
                            <span className="text-[8px] text-emerald-400 bg-emerald-950/60 px-1 rounded border border-emerald-500/30">nad dolną ramką</span>
                          )}
                        </span>
                        <span className="text-stone-300 text-[8px] font-bold">Stopka</span>
                      </div>
                      <div className="bg-white rounded p-1 flex items-center justify-center overflow-hidden border border-stone-300">
                        <img
                          src={scanResult.debugBottomUrl}
                          alt="Stopka karty po binarizacji"
                          className="max-h-5 w-full object-contain filter contrast-125"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeCard ? (
              <div className="space-y-4 animate-fade-in">
                {/* Recognized Card Header Card */}
                <div className="p-3.5 bg-stone-950/80 rounded-xl border border-stone-800 space-y-3">
                  <div className="flex items-start gap-3">
                    {/* Card Thumbnail */}
                    <div className="shrink-0 w-20 h-28 rounded-lg overflow-hidden bg-stone-900 border border-stone-700 shadow-md relative">
                      <img
                        src={activeThumbnail}
                        alt={activeCard.name}
                        referrerPolicy="no-referrer"
                        onError={(e) => handleCardImageError(e, activeThumbnail)}
                        className="w-full h-full object-cover"
                      />
                      {isFoil && (
                        <div className="absolute top-1 right-1 bg-amber-500 text-stone-950 p-0.5 rounded shadow">
                          <Sparkles className="w-3 h-3 fill-stone-950" />
                        </div>
                      )}
                      {activeCard.edhrec_rank != null && (
                        <div className="absolute bottom-1 left-1 z-10">
                          <EdhrecBadge rank={activeCard.edhrec_rank} size="xs" />
                        </div>
                      )}
                    </div>

                    {/* Metadata */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="tabular-nums text-[11px] font-bold bg-stone-800 text-stone-200 px-1.5 py-0.5 rounded border border-stone-700">
                          {activeCard.set.toUpperCase()}
                        </span>
                        <span className="tabular-nums text-[11px] text-stone-400">
                          #{activeCard.collector_number}
                        </span>
                        <span className={`text-[11px] px-1.5 py-0.5 rounded border font-semibold ${getRarityColor(activeCard.rarity)}`}>
                          {getRarityLabel(activeCard.rarity)}
                        </span>
                      </div>

                      <h3 className="font-bold text-stone-100 text-sm mt-1 leading-snug">
                        {activeCard.name}
                      </h3>
                      <p className="text-[11px] text-stone-400 truncate mt-0.5">
                        {activeCard.type_line}
                      </p>

                      {/* Interactive Foil / Non-Foil Switcher */}
                      <div className="pt-2 mt-2 border-t border-stone-800/80 grid grid-cols-2 gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => setIsFoil(false)}
                          className={`p-1.5 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between ${
                            !isFoil
                              ? 'bg-amber-500/15 border-amber-500 ring-1 ring-amber-500/40'
                              : 'bg-stone-900 hover:bg-stone-850 border-stone-800 text-stone-400'
                          }`}
                        >
                          <span className={`text-[11px] font-bold ${!isFoil ? 'text-amber-300' : 'text-stone-400'}`}>
                            Standard
                          </span>
                          <span className="tabular-nums font-bold text-emerald-400 text-xs mt-0.5">
                            {formatCurrency(normPln, 'PLN')}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setIsFoil(true)}
                          className={`p-1.5 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between ${
                            isFoil
                              ? 'bg-amber-500/20 border-amber-400 ring-1 ring-amber-500/50'
                              : 'bg-stone-900 hover:bg-stone-850 border-stone-800 text-stone-400'
                          }`}
                        >
                          <span className="text-[11px] font-bold text-amber-400 flex items-center gap-1">
                            <Sparkles className="w-2.5 h-2.5" />
                            <span>Foil</span>
                          </span>
                          <span className="tabular-nums font-bold text-amber-300 text-xs mt-0.5">
                            {formatCurrency(foilPln, 'PLN')}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Print Correction Button */}
                  <div className="pt-2 border-t border-stone-800/80 flex items-center justify-between">
                    <span className="text-[11px] text-stone-400">
                      Wydanie: <strong className="text-stone-200">{activeCard.set_name}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={handleOpenPrints}
                      className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 underline cursor-pointer"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>Zmień print / edycję</span>
                    </button>
                  </div>
                </div>

                {/* Alternate Prints Selector Drawer */}
                {isPrintsOpen && (
                  <div className="p-3 bg-stone-950 rounded-xl border border-stone-800 space-y-2 max-h-56 overflow-y-auto">
                    <div className="flex items-center justify-between sticky top-0 bg-stone-950 pb-1 z-10 border-b border-stone-800/60">
                      <span className="text-[11px] font-bold text-amber-300 tabular-nums">
                        Dostępne wydania ({prints.length}):
                      </span>
                      <button
                        onClick={() => setIsPrintsOpen(false)}
                        className="text-[11px] text-stone-400 hover:text-stone-200"
                      >
                        ✕ Zamknij
                      </button>
                    </div>

                    {isLoadingPrints ? (
                      <div className="py-6 flex items-center justify-center space-x-2 text-stone-400 text-xs">
                        <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                        <span>Pobieranie wydań...</span>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {prints.map((p) => {
                          const isCur = p.id === activeCard.id;
                          return (
                            <div
                              key={p.id}
                              onClick={() => handleSelectAlternatePrint(p)}
                              className={`p-2 rounded-lg border text-xs flex items-center justify-between cursor-pointer transition-colors ${
                                isCur
                                  ? 'bg-amber-500/20 border-amber-500 text-stone-100 font-bold'
                                  : 'bg-stone-900 hover:bg-stone-850 border-stone-800 text-stone-300'
                              }`}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <span className="tabular-nums text-[11px] bg-stone-800 px-1 py-0.2 rounded border border-stone-700">
                                  {p.set.toUpperCase()}
                                </span>
                                <span className="truncate">{p.set_name} (#{p.collector_number})</span>
                              </div>
                              <div className="shrink-0 tabular-nums text-emerald-400 text-[11px]">
                                {formatCurrency(getCardPrice(p, false, { ...settings, currency: 'PLN' }), 'PLN')}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Catalog & Parameters Form */}
                <div className="space-y-3 p-3 bg-stone-950/60 rounded-xl border border-stone-800/80 text-xs">
                  {/* Catalog selection */}
                  <div>
                    <label className="block text-[11px] font-bold text-amber-300 mb-1 flex items-center gap-1.5">
                      <FolderPlus className="w-3.5 h-3.5 text-amber-400" />
                      <span>Docelowy klaser lub katalog</span>
                    </label>
                    <select
                      value={selectedBinder}
                      onChange={(e) => setSelectedBinder(e.target.value)}
                      className="w-full bg-stone-900 border border-stone-700 rounded-lg px-2.5 py-1.5 text-stone-100 text-xs focus:outline-none focus:border-amber-500 cursor-pointer"
                    >
                      {catalogs.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name} {c.isDefault ? '(Domyślny)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Quantity & Condition */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-stone-400 mb-1">
                        Ilość sztuk
                      </label>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                          className="w-7 h-7 rounded bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-300 flex items-center justify-center cursor-pointer"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-8 text-center tabular-nums font-bold text-stone-100">
                          {quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => setQuantity((q) => q + 1)}
                          className="w-7 h-7 rounded bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-300 flex items-center justify-center cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-stone-400 mb-1">
                        Stan karty
                      </label>
                      <select
                        value={condition}
                        onChange={(e) => setCondition(e.target.value as CardCondition)}
                        className="w-full bg-stone-900 border border-stone-700 rounded-lg px-2 py-1.5 text-stone-100 text-xs focus:outline-none focus:border-amber-500 cursor-pointer"
                      >
                        <option value="NM">Near Mint (NM)</option>
                        <option value="EX">Excellent (EX)</option>
                        <option value="GD">Good (GD)</option>
                        <option value="LP">Light Played (LP)</option>
                        <option value="PL">Played (PL)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Empty state before card is scanned */
              <div className="p-8 text-center space-y-3 my-auto">
                <div className="w-12 h-12 rounded-2xl bg-stone-950 border border-stone-800 flex items-center justify-center mx-auto text-amber-400">
                  <ScanLine className="w-6 h-6 animate-pulse" />
                </div>
                <h3 className="text-sm font-bold text-stone-200">
                  Brak aktywnego skanu
                </h3>
                <p className="text-xs text-stone-400 leading-relaxed max-w-xs mx-auto">
                  Umieść kartę w kadrze kamery i kliknij <strong className="text-emerald-400">„Zeskanuj”</strong>. Karta zostanie rozpoznana po nazwie, numerze i ilustracji.
                </p>

                {/* Suggested Cards if found */}
                {scanResult?.possibleCards && scanResult.possibleCards.length > 0 && !activeCard && (
                  <div className="pt-3 border-t border-stone-800 text-left space-y-2">
                    <p className="text-[11px] font-bold text-amber-300">
                      Podpowiedzi z bazy Scryfall (kliknij, aby wybrać):
                    </p>
                    <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                      {scanResult.possibleCards.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setActiveCard(c);
                            setManualQuery(c.name);
                            setScanStatus(`Wybrano: "${c.name}"`);
                          }}
                          className="w-full p-2 rounded-lg bg-stone-950 hover:bg-stone-800 border border-stone-800 hover:border-amber-500/50 text-stone-200 text-xs flex items-center justify-between transition-colors cursor-pointer text-left"
                        >
                          <span className="font-bold truncate">{c.name}</span>
                          <span className="text-[11px] tabular-nums text-stone-400 shrink-0 ml-2">[{c.set.toUpperCase()}]</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Manual text search fallback */}
                <div className="pt-4 border-t border-stone-800/80 space-y-2">
                  <p className="text-[11px] text-stone-400">
                    Lub wpisz nazwę karty ręcznie:
                  </p>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      placeholder="np. Lightning Bolt, Sol Ring..."
                      value={manualQuery}
                      onChange={(e) => setManualQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleManualSearch()}
                      className="flex-1 bg-stone-950 border border-stone-700 rounded-lg px-3 py-1.5 text-xs text-stone-200 placeholder-stone-500 focus:outline-none focus:border-amber-500"
                    />
                    <button
                      onClick={handleManualSearch}
                      disabled={isSearchingManual || !manualQuery.trim()}
                      className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-200 text-xs font-semibold cursor-pointer disabled:opacity-40"
                    >
                      {isSearchingManual ? 'Szukam...' : 'Znajdź'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Bottom Actions Area */}
            <div className={`pt-3 border-t border-stone-800 space-y-2.5 max-sm:sticky max-sm:-bottom-4 max-sm:bg-stone-900 max-sm:pb-1 ${activeCard ? '' : 'max-sm:hidden'}`}>
              {lastAddedNotice && (
                <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  <span className="truncate">{lastAddedNotice}</span>
                </div>
              )}

              <div className="flex items-center justify-between text-xs">
                <label className="flex items-center gap-2 text-stone-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isBatchMode}
                    onChange={(e) => setIsBatchMode(e.target.checked)}
                    className="rounded border-stone-700 text-amber-500 focus:ring-0 bg-stone-900"
                  />
                  <span>Skanowanie seryjne (nie zamykaj po dodaniu)</span>
                </label>
              </div>

              <div className="flex items-center gap-2">
                {activeCard && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveCard(null);
                      setScanResult(null);
                    }}
                    className="px-4 sm:px-3 h-12 sm:h-auto sm:py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 text-sm sm:text-xs font-semibold cursor-pointer transition-colors"
                  >
                    Odrzuć
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleAddCardToCollection}
                  disabled={!activeCard || isAdding}
                  title="Dodaj kartę do klasera (lub naciśnij Enter)"
                  className="flex-1 min-w-0 h-12 sm:h-auto sm:py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-stone-950 font-bold text-sm sm:text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 transition-all cursor-pointer disabled:opacity-40"
                >
                  {isAdding ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Zapisywanie w klaserze...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 stroke-[3]" />
                      <span className="truncate">
                        Dodaj do klasera "{selectedBinder}"
                      </span>
                      <kbd className="hidden sm:inline px-1.5 py-0.5 rounded bg-black/20 text-[11px] tabular-nums font-bold tracking-tight text-stone-900 border border-black/10">
                        Enter ↵
                      </kbd>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
