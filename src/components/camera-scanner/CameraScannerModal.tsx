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
  ExternalLink,
  Smartphone,
  Copy,
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
import { CameraScannerModalProps, CameraDeviceOption, ScanResult, ScannerEngine } from './types';
import { scanMtgCardFrame, scanCardWithAi, searchCardInScryfall } from './ocrProcessor';
import { EdhrecBadge } from '../EdhrecBadge';

export const CameraScannerModal: React.FC<CameraScannerModalProps> = ({
  isOpen,
  onClose,
  catalogs,
  settings,
  onSaveToCollection,
  showToast,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const autoScanTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraSnapInputRef = useRef<HTMLInputElement | null>(null);
  const viewfinderContainerRef = useRef<HTMLDivElement | null>(null);
  const titleBoxRef = useRef<HTMLDivElement | null>(null);
  const collectorBoxRef = useRef<HTMLDivElement | null>(null);

  // Camera State
  const [cameraDevices, setCameraDevices] = useState<CameraDeviceOption[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);
  const prevDeviceIdRef = useRef<string>('');

  const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const standaloneUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}?scanner=open`
    : '';

  const handleCopyStandaloneUrl = () => {
    if (standaloneUrl) {
      navigator.clipboard.writeText(standaloneUrl);
      setCopiedUrl(true);
      showToast('Skopiowano bezpośredni link URL do schowka!');
      setTimeout(() => setCopiedUrl(false), 2500);
    }
  };

  // Scanning State
  const [selectedEngine, setSelectedEngine] = useState<ScannerEngine>('ai_vision');
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

  // 3. Scan Action (AI Vision or Local OCR)
  const performScan = useCallback(async () => {
    if (isScanning) return;
    if (!videoRef.current || videoRef.current.readyState < 2) return;

    setIsScanning(true);
    setScanStatus(selectedEngine === 'ai_vision' ? '✨ Analiza klatki przez Gemini AI Vision...' : 'Pobieranie klatki i analiza OCR...');

    try {
      const video = videoRef.current;
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;

      let customTitleCrop: { x: number; y: number; width: number; height: number } | undefined;
      let customCollectorCrop: { x: number; y: number; width: number; height: number } | undefined;
      let cardAreaCrop: { x: number; y: number; width: number; height: number } | undefined;

      // Project DOM reticle coordinates directly onto video sensor pixels
      if (viewfinderContainerRef.current) {
        const containerRect = viewfinderContainerRef.current.getBoundingClientRect();
        const scale = Math.max(containerRect.width / width, containerRect.height / height);
        const displayedW = width * scale;
        const displayedH = height * scale;
        const offsetX = (displayedW - containerRect.width) / 2;
        const offsetY = (displayedH - containerRect.height) / 2;

        if (titleBoxRef.current) {
          const titleRect = titleBoxRef.current.getBoundingClientRect();
          const relX = titleRect.left - containerRect.left;
          const relY = titleRect.top - containerRect.top;
          const padX = titleRect.width * 0.04;
          const padY = titleRect.height * 0.15;

          customTitleCrop = {
            x: Math.max(0, Math.round((relX - padX + offsetX) / scale)),
            y: Math.max(0, Math.round((relY - padY + offsetY) / scale)),
            width: Math.min(width, Math.round((titleRect.width + padX * 2) / scale)),
            height: Math.min(height, Math.round((titleRect.height + padY * 2) / scale)),
          };
        }

        if (collectorBoxRef.current) {
          const colRect = collectorBoxRef.current.getBoundingClientRect();
          const colRelX = colRect.left - containerRect.left;
          const colRelY = colRect.top - containerRect.top;
          customCollectorCrop = {
            x: Math.max(0, Math.round((colRelX + offsetX) / scale)),
            y: Math.max(0, Math.round((colRelY + offsetY) / scale)),
            width: Math.min(width, Math.round(colRect.width / scale)),
            height: Math.min(height, Math.round(colRect.height / scale)),
          };
        }

        // Entire card viewport area for AI Vision
        cardAreaCrop = {
          x: Math.max(0, Math.round((containerRect.width * 0.08 + offsetX) / scale)),
          y: Math.max(0, Math.round((containerRect.height * 0.08 + offsetY) / scale)),
          width: Math.min(width, Math.round((containerRect.width * 0.84) / scale)),
          height: Math.min(height, Math.round((containerRect.height * 0.84) / scale)),
        };
      }

      let result: ScanResult;

      if (selectedEngine === 'ai_vision') {
        try {
          result = await scanCardWithAi(
            video,
            width,
            height,
            (_p, statusText) => setScanStatus(statusText),
            { cardArea: cardAreaCrop }
          );
        } catch (aiErr: any) {
          console.warn('AI Vision scan failed, falling back to local OCR:', aiErr);
          setScanStatus('AI niedostępne, automatyczne przejście na lokalny OCR...');
          result = await scanMtgCardFrame(
            video,
            width,
            height,
            (_p, statusText) => setScanStatus(statusText),
            { customTitleCrop, customCollectorCrop }
          );
        }
      } else {
        result = await scanMtgCardFrame(
          video,
          width,
          height,
          (_p, statusText) => setScanStatus(statusText),
          { customTitleCrop, customCollectorCrop }
        );
      }

      setScanResult(result);

      if (result.matchedCard) {
        setActiveCard(result.matchedCard);
        setManualQuery(result.matchedCard.name);
        if (result.isFoilDetected) {
          setIsFoil(true);
        }
        setScanStatus(`Rozpoznano: "${result.matchedCard.name}"`);
      } else if (result.cleanedTitle) {
        setManualQuery(result.cleanedTitle);
        setScanStatus(`Odczytano: "${result.cleanedTitle}" - sprawdź podpowiedzi`);
      } else {
        setScanStatus('Nie odczytano karty. Skorzystaj z suwaka Zoom lub zmień kąt oświetlenia.');
      }
    } catch (err: any) {
      console.error('Błąd skanowania:', err);
      setScanStatus('Błąd przetwarzania klatki. Spróbuj ponownie lub wgraj zdjęcie.');
    } finally {
      setIsScanning(false);
    }
  }, [isScanning, selectedEngine]);

  // Auto-scan interval handler
  useEffect(() => {
    if (isAutoScanEnabled && isCameraActive && !activeCard && !isScanning) {
      autoScanTimerRef.current = setInterval(() => {
        performScan();
      }, 3500);
    } else {
      if (autoScanTimerRef.current) {
        clearInterval(autoScanTimerRef.current);
        autoScanTimerRef.current = null;
      }
    }
    return () => {
      if (autoScanTimerRef.current) clearInterval(autoScanTimerRef.current);
    };
  }, [isAutoScanEnabled, isCameraActive, activeCard, isScanning, performScan]);

  // 4. File and Image Processing (Upload, Drag-and-Drop, Clipboard Paste)
  const processImageFile = useCallback(
    async (file: File) => {
      if (!file || !file.type.startsWith('image/')) return;

      setIsScanning(true);
      setScanStatus(selectedEngine === 'ai_vision' ? '✨ Analiza zdjęcia przez Gemini AI...' : 'Wczytywanie i analiza OCR zdjęcia...');

      const img = new Image();
      img.onload = async () => {
        try {
          let result: ScanResult;

          if (selectedEngine === 'ai_vision') {
            try {
              result = await scanCardWithAi(img, img.naturalWidth, img.naturalHeight, (_p, statusText) => {
                setScanStatus(statusText);
              });
            } catch (aiErr) {
              console.warn('AI vision file scan fallback:', aiErr);
              result = await scanMtgCardFrame(img, img.naturalWidth, img.naturalHeight, (_p, statusText) => {
                setScanStatus(statusText);
              });
            }
          } else {
            result = await scanMtgCardFrame(img, img.naturalWidth, img.naturalHeight, (_p, statusText) => {
              setScanStatus(statusText);
            });
          }

          setScanResult(result);
          if (result.matchedCard) {
            setActiveCard(result.matchedCard);
            setManualQuery(result.matchedCard.name);
            if (result.isFoilDetected) {
              setIsFoil(true);
            }
            setScanStatus(`Rozpoznano: "${result.matchedCard.name}"`);
          } else if (result.cleanedTitle) {
            setManualQuery(result.cleanedTitle);
            setScanStatus(`Odczytano tekst: "${result.cleanedTitle}" - sprawdź podpowiedzi`);
          } else {
            setScanStatus('Nie znaleziono pasującej karty na zdjęciu. Spróbuj innego ujęcia.');
          }
        } catch (err: any) {
          console.error('Błąd OCR pliku:', err);
          setScanStatus('Nie udało się przetworzyć wskazanego pliku.');
        } finally {
          setIsScanning(false);
        }
      };
      img.src = URL.createObjectURL(file);
    },
    [selectedEngine]
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
    loadAlternatePrints(activeCard);
  }, [activeCard, loadAlternatePrints]);

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
      const notice = `Dodano: "${activeCard.name}" [${activeCard.set.toUpperCase()}] (${isFoil ? 'Foil ✨' : 'Standard'}) do katalogu "${selectedBinder}"`;
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
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative bg-stone-900 border border-stone-800 rounded-2xl max-w-4xl w-full overflow-hidden shadow-2xl my-auto text-stone-100 max-h-[95vh] flex flex-col"
      >
        {/* Modal Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-stone-800 bg-stone-950/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-extrabold text-stone-100">
                  Skaner Kart MTG
                </h2>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 fill-amber-400" />
                  <span>AI Vision + OCR</span>
                </span>
              </div>
              <p className="text-xs text-stone-400 hidden sm:block">
                Automatyczna identyfikacja karty, wycena rynkowa Scryfall i ranking EDHREC
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Engine Selector */}
            <div className="flex items-center p-0.5 bg-stone-900 border border-stone-800 rounded-xl shadow-inner text-xs">
              <button
                type="button"
                onClick={() => setSelectedEngine('ai_vision')}
                className={`px-3 py-1 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  selectedEngine === 'ai_vision'
                    ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-stone-950 shadow-md font-extrabold'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
                title="Gemini 3.8 Flash AI Vision: Najwyższa celność (99%), rozpoznaje całą grafikę, ilustrację i stylizowany tekst"
              >
                <Sparkles className="w-3.5 h-3.5 fill-current" />
                <span>AI Vision</span>
                <span className="hidden md:inline text-[9px] uppercase px-1 py-0.2 rounded bg-black/20 font-black">99% celność</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedEngine('local_ocr')}
                className={`px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  selectedEngine === 'local_ocr'
                    ? 'bg-stone-800 text-stone-100 border border-stone-700 shadow-md'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
                title="Tesseract.js: Lokalne rozpoznawanie tekstu bezpośrednio w Twojej przeglądarce"
              >
                <ScanLine className="w-3.5 h-3.5" />
                <span>Lokalny OCR</span>
              </button>
            </div>

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
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-mono font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{sessionAddedCount}</span>
              </span>
            )}

            <button
              onClick={onClose}
              title="Zamknij skaner"
              className="p-1.5 text-stone-400 hover:text-stone-100 hover:bg-stone-800 rounded-lg transition-colors cursor-pointer ml-1"
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

              <div className="p-2.5 rounded-lg bg-stone-950/80 border border-amber-500/20 space-y-1">
                <span className="font-bold text-amber-300 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>2. Używaj trybu AI Vision</span>
                </span>
                <p className="text-stone-300">
                  Karty MTG mają stylizowaną czcionkę <em>Beleren</em>, na której klasyczny OCR często się myli. Silnik <strong>AI Vision (Gemini)</strong> analizuje całą grafikę, ilustrację i kolory – rozpoznaje kartę w ułamku sekundy nawet pod kątem!
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-stone-950/80 border border-amber-500/20 space-y-1">
                <span className="font-bold text-amber-300 flex items-center gap-1">
                  <Camera className="w-3.5 h-3.5 text-emerald-400" />
                  <span>3. Kąt & Przycisk „Aparat”</span>
                </span>
                <p className="text-stone-300">
                  Pochyl kartę o 10°, by światło lampy nie odbijało się od koszulki. W telefonie możesz też kliknąć zielony przycisk <strong>„Aparat”</strong>, który robi natywne zdjęcie z pełnym autofokusem!
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Modal Body: 2 Columns on Desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-y-auto">
          {/* Left Column: Camera Viewport */}
          <div className="lg:col-span-7 bg-black p-4 flex flex-col justify-between relative border-b lg:border-b-0 lg:border-r border-stone-800">
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
              className={`relative aspect-[3/4] sm:aspect-[4/3] w-full rounded-xl overflow-hidden bg-stone-950 border flex items-center justify-center shadow-inner transition-colors ${
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

              {/* Camera Offline / Blocked State */}
              {!isCameraActive && (
                <div className="p-5 text-center space-y-3.5 max-w-lg my-auto">
                  <div className="w-14 h-14 rounded-2xl bg-stone-900 border border-stone-800 flex items-center justify-center mx-auto text-amber-400 shadow-lg">
                    <Video className="w-7 h-7" />
                  </div>

                  <div>
                    <h4 className="text-sm sm:text-base font-extrabold text-stone-100 flex items-center justify-center gap-1.5">
                      <span>Kamera z OBS / Telefonu</span>
                    </h4>
                    <p className="text-xs text-stone-300 mt-1 leading-relaxed">
                      Wbudowana ramka podglądu AI Studio blokuje dostęp do kamer systemowych (w tym wirtualnej kamery OBS).
                    </p>
                    <p className="text-xs text-amber-400 font-semibold mt-1">
                      Otwórz aplikację w pełnym oknie przeglądarki, aby połączyć się z OBS Virtual Camera:
                    </p>
                  </div>

                  <div className="flex flex-col gap-2 pt-1">
                    {/* Primary Button: Direct Native Anchor to bypass popup blocker */}
                    <a
                      href={standaloneUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-stone-950 font-extrabold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-950/50 transition-all hover:scale-[1.01]"
                    >
                      <ExternalLink className="w-4 h-4 stroke-[2.5]" />
                      <span>↗️ Otwórz w nowej karcie (Dla OBS / Kamery)</span>
                    </a>

                    {/* Copy Link Button */}
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 bg-stone-950 px-2.5 py-1.5 rounded-lg border border-stone-800 text-[10px] font-mono text-stone-300 truncate text-left select-all">
                        {standaloneUrl}
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyStandaloneUrl}
                        className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-750 text-stone-200 border border-stone-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
                      >
                        {copiedUrl ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-400">Skopiowano</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-stone-400" />
                            <span>Kopiuj link</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* OBS Quick Setup Instructions */}
                    <div className="p-3 rounded-xl bg-stone-950/90 border border-stone-800/90 text-left space-y-1.5 text-xs text-stone-300">
                      <p className="font-bold text-amber-400 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                        <Radio className="w-3 h-3 text-amber-400" />
                        <span>Połączenie z telefonem przez OBS (3 proste kroki):</span>
                      </p>
                      <ol className="list-decimal list-inside space-y-1 text-[11px] text-stone-300 leading-normal pl-0.5">
                        <li>W programie OBS podłącz obraz z telefonu i kliknij w prawym dolnym rogu: <strong className="text-stone-100">„Uruchom kamerę wirtualną”</strong> (Start Virtual Camera).</li>
                        <li>Otwórz aplikację w osobnej karcie przeglądarki klikając zielony przycisk powyżej.</li>
                        <li>Zezwól przeglądarce na dostęp do kamery i wybierz z listy: <strong className="text-emerald-400">„OBS Virtual Camera”</strong>!</li>
                      </ol>
                    </div>

                    {/* Secondary Desktop / Mobile Actions */}
                    {isMobile ? (
                      <button
                        type="button"
                        onClick={() => cameraSnapInputRef.current?.click()}
                        className="w-full py-2 px-4 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>📸 Zrób zdjęcie aparatem w telefonie</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full py-2 px-4 rounded-xl bg-stone-800 hover:bg-stone-750 border border-stone-700 text-stone-200 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
                      >
                        <Upload className="w-3.5 h-3.5 text-stone-400" />
                        <span>📁 Wybierz plik ze zdjęciem karty z dysku (lub wklej Ctrl+V)</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* MTG Card Target Reticle Overlay */}
              {isCameraActive && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-4">
                  {/* Card Outline Bounding Box (2.5 : 3.5 aspect ratio) */}
                  <div className="relative aspect-[2.5/3.5] h-[82%] max-w-[85%] border-2 border-amber-400/80 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] flex flex-col justify-between p-2 transition-all">
                    {/* Corner Guides */}
                    <div className="absolute -top-1.5 -left-1.5 w-4 h-4 border-t-4 border-l-4 border-amber-400 rounded-tl" />
                    <div className="absolute -top-1.5 -right-1.5 w-4 h-4 border-t-4 border-r-4 border-amber-400 rounded-tr" />
                    <div className="absolute -bottom-1.5 -left-1.5 w-4 h-4 border-b-4 border-l-4 border-amber-400 rounded-bl" />
                    <div className="absolute -bottom-1.5 -right-1.5 w-4 h-4 border-b-4 border-r-4 border-amber-400 rounded-br" />

                    {/* Reticle Target Display depending on engine */}
                    {selectedEngine === 'ai_vision' ? (
                      <div className="flex-1 flex flex-col justify-between items-center py-2 px-1">
                        <div className="px-3 py-1 rounded-full bg-amber-500/25 border border-amber-400/50 text-amber-200 text-[10px] font-bold flex items-center gap-1.5 shadow backdrop-blur-sm">
                          <Sparkles className="w-3.5 h-3.5 fill-amber-300" />
                          <span>Umieść całą kartę w kadrze</span>
                        </div>

                        <div className="text-[10px] text-stone-300 bg-stone-950/85 border border-stone-800 px-3 py-1 rounded-md font-mono text-center shadow">
                          AI rozpozna kartę po ilustracji, ramce i tekście
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Zone 1: Title Line Target */}
                        <div
                          ref={titleBoxRef}
                          className="w-[90%] h-[16%] border-2 border-dashed border-amber-400 bg-amber-400/15 rounded-lg flex items-center justify-between px-2 text-[10px] text-amber-200 font-mono font-bold mx-auto mt-1.5 shadow-sm"
                        >
                          <span className="flex items-center gap-1">🏷️ NAZWA KARTY</span>
                          <span className="text-[9px] bg-amber-500/20 px-1 py-0.5 rounded text-amber-300">Tytuł</span>
                        </div>

                        {/* Laser Scanning Animation Line */}
                        {isScanning && (
                          <div className="absolute inset-x-2 h-1 bg-gradient-to-r from-transparent via-amber-400 to-transparent shadow-[0_0_12px_#fbbf24] animate-pulse transition-all" />
                        )}

                        {/* Zone 2: Collector & Set Info Target */}
                        <div
                          ref={collectorBoxRef}
                          className="w-[75%] h-[12%] border border-dashed border-amber-400/70 bg-amber-400/10 rounded-lg flex items-center justify-between px-2 text-[10px] text-amber-300 font-mono font-bold mb-1.5"
                        >
                          <span>🔢 SET / NR</span>
                          <span className="text-[9px] opacity-75">np. OTJ 125</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
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
            <div className="pt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                {/* Camera selector */}
                {cameraDevices.length > 0 && (
                  <select
                    value={selectedDeviceId}
                    onChange={(e) => setSelectedDeviceId(e.target.value)}
                    className="bg-stone-900 border border-stone-700 rounded-lg px-2.5 py-1.5 text-stone-200 text-xs focus:outline-none focus:border-amber-500 cursor-pointer max-w-[200px] truncate"
                  >
                    {cameraDevices.map((c) => (
                      <option key={c.deviceId} value={c.deviceId}>
                        {/obs|virtual/i.test(c.label) ? '🎥 OBS: ' : '📷 '}
                        {c.label}
                      </option>
                    ))}
                  </select>
                )}

                {/* Hardware Zoom Slider & Presets (Key fix for high-resolution cameras with macro distance!) */}
                {zoomRange && isCameraActive && (
                  <div className="flex items-center gap-1.5 bg-stone-900/90 border border-stone-700 px-2 py-1 rounded-lg">
                    <ZoomIn className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="text-[10px] font-mono text-stone-300 font-semibold shrink-0">
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
                          className={`px-1 py-0.5 rounded text-[9px] font-mono font-bold transition-colors ${
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
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
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
                  className="px-2.5 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-300 hover:text-stone-100 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-stone-400" />
                  <span className="hidden sm:inline">Plik / Zdjęcie</span>
                </button>
              </div>

              {/* Main Snapshot & Scan Button */}
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-stone-400 text-xs cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isAutoScanEnabled}
                    onChange={(e) => setIsAutoScanEnabled(e.target.checked)}
                    className="rounded border-stone-700 text-amber-500 focus:ring-0 bg-stone-900"
                  />
                  <span className="hidden sm:inline">Auto-skan (3.5s)</span>
                  <span className="sm:hidden">Auto</span>
                </label>

                <button
                  onClick={performScan}
                  disabled={isScanning || !isCameraActive}
                  className={`px-4 py-2 rounded-xl text-stone-950 font-extrabold text-xs flex items-center gap-2 shadow-lg transition-all cursor-pointer disabled:opacity-50 ${
                    selectedEngine === 'ai_vision'
                      ? 'bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-300 hover:to-amber-500 shadow-amber-950/60'
                      : 'bg-stone-200 hover:bg-white shadow-stone-950/60'
                  }`}
                >
                  {isScanning ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>{selectedEngine === 'ai_vision' ? 'Analiza AI...' : 'OCR...'}</span>
                    </>
                  ) : (
                    <>
                      {selectedEngine === 'ai_vision' ? (
                        <>
                          <Sparkles className="w-4 h-4 fill-stone-950" />
                          <span>Zeskanuj (AI Vision)</span>
                        </>
                      ) : (
                        <>
                          <Camera className="w-4 h-4 stroke-[2.5]" />
                          <span>Zeskanuj (OCR)</span>
                        </>
                      )}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Card Confirmation & Add Form */}
          <div className="lg:col-span-5 p-4 sm:p-5 flex flex-col justify-between space-y-4 bg-stone-900/90">
            {/* Visual Scan Debug Snippet */}
            {scanResult?.debugCropUrl && (
              <div className="p-2.5 bg-stone-950/85 rounded-xl border border-stone-800 space-y-1.5 text-xs text-left shrink-0">
                <div className="flex items-center justify-between text-[10px] text-stone-400">
                  <span className="font-semibold text-stone-300 flex items-center gap-1.5">
                    {scanResult.engineUsed === 'ai_vision' ? (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                        <span className="text-amber-300 font-bold">Silnik AI Vision (Gemini 3.8 Flash):</span>
                      </>
                    ) : (
                      <>
                        <ScanLine className="w-3.5 h-3.5 text-stone-400" />
                        <span>Lokalny OCR (Tesseract.js):</span>
                      </>
                    )}
                  </span>
                  {scanResult.confidence > 0 && (
                    <span className="font-mono text-amber-300 font-bold">
                      Pewność: {Math.round(scanResult.confidence)}%
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2.5">
                  <img
                    src={scanResult.debugCropUrl}
                    alt="Odczytany kadr"
                    className="h-10 max-w-[120px] border border-amber-500/40 rounded bg-black object-contain px-1 shrink-0"
                  />
                  <div className="text-[11px] font-mono text-stone-200 truncate flex-1">
                    {scanResult.cleanedTitle ? (
                      <div>
                        <span className="text-stone-400 text-[10px] block">Rozpoznano:</span>
                        <span className="font-bold text-amber-300">"{scanResult.cleanedTitle}"</span>
                        {scanResult.detectedSet && (
                          <span className="ml-1 text-[10px] text-stone-400 font-sans">
                            [{scanResult.detectedSet.toUpperCase()}]
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-amber-400/80 italic">Brak wyraźnego dopasowania</span>
                    )}
                  </div>
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
                        <span className="uppercase font-mono text-[10px] font-bold bg-stone-800 text-stone-200 px-1.5 py-0.5 rounded border border-stone-700">
                          {activeCard.set.toUpperCase()}
                        </span>
                        <span className="font-mono text-[10px] text-stone-400">
                          #{activeCard.collector_number}
                        </span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold ${getRarityColor(activeCard.rarity)}`}>
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
                          <span className={`text-[10px] font-bold ${!isFoil ? 'text-amber-300' : 'text-stone-400'}`}>
                            Standard
                          </span>
                          <span className="font-mono font-bold text-emerald-400 text-xs mt-0.5">
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
                          <span className="text-[10px] font-bold text-amber-400 flex items-center gap-1">
                            <Sparkles className="w-2.5 h-2.5" />
                            <span>Foil ✨</span>
                          </span>
                          <span className="font-mono font-bold text-amber-300 text-xs mt-0.5">
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
                      <span className="text-[11px] font-bold text-amber-300 uppercase font-mono">
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
                                <span className="uppercase font-mono text-[10px] bg-stone-800 px-1 py-0.2 rounded border border-stone-700">
                                  {p.set.toUpperCase()}
                                </span>
                                <span className="truncate">{p.set_name} (#{p.collector_number})</span>
                              </div>
                              <div className="shrink-0 font-mono text-emerald-400 text-[11px]">
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
                    <label className="block text-[10px] uppercase font-bold text-amber-300 mb-1 flex items-center gap-1.5">
                      <FolderPlus className="w-3.5 h-3.5 text-amber-400" />
                      <span>Docelowy Klaser / Katalog:</span>
                    </label>
                    <select
                      value={selectedBinder}
                      onChange={(e) => setSelectedBinder(e.target.value)}
                      className="w-full bg-stone-900 border border-stone-700 rounded-lg px-2.5 py-1.5 text-stone-100 text-xs focus:outline-none focus:border-amber-500 cursor-pointer"
                    >
                      {catalogs.map((c) => (
                        <option key={c.id} value={c.name}>
                          📁 {c.name} {c.isDefault ? '(Domyślny)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Quantity & Condition */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] uppercase font-semibold text-stone-400 mb-1">
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
                        <span className="w-8 text-center font-mono font-bold text-stone-100">
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
                      <label className="block text-[10px] uppercase font-semibold text-stone-400 mb-1">
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
                  Umieść kartę w kadrze kamery i kliknij <strong className="text-amber-400">„Zeskanuj klatkę”</strong>. Algorytm OCR automatycznie odczyta tytuł i wydanie.
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
                          <span className="text-[10px] font-mono text-stone-400 shrink-0 ml-2">[{c.set.toUpperCase()}]</span>
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
            <div className="pt-3 border-t border-stone-800 space-y-2.5">
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
                    className="px-3 py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-semibold cursor-pointer transition-colors"
                  >
                    Odrzuć
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleAddCardToCollection}
                  disabled={!activeCard || isAdding}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-stone-950 font-extrabold text-xs tracking-wider uppercase flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 transition-all cursor-pointer disabled:opacity-40"
                >
                  {isAdding ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Zapisywanie w klaserze...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 stroke-[3]" />
                      <span>
                        Dodaj do klasera "{selectedBinder}"
                      </span>
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
