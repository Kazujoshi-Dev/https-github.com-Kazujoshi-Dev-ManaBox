import React, { useState } from 'react';
import { X, Download, Upload, FileText, Check, Copy, AlertCircle, RefreshCw, Layers, Sparkles } from 'lucide-react';
import { CollectionItem, Catalog } from '../types';
import { useBackToClose } from '../hooks/useBackButton';
import { 
  exportCollectionToTxt, 
  parseTxtDeckOrCollection, 
  resolveCardsFromScryfall, 
  downloadTxtFile,
  ResolvedImportItem
} from '../utils/textCardList';
import { useT, locale, MAIN_BINDER, binderName } from '../i18n';

interface ImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  collection: CollectionItem[];
  catalogs: Catalog[];
  onImportBulk: (items: any[], onProgress?: (done: number, total: number) => void) => Promise<void>;
  showToast: (message: string) => void;
  initialTab?: 'export' | 'import';
}

export const ImportExportModal: React.FC<ImportExportModalProps> = ({
  isOpen,
  onClose,
  collection,
  catalogs,
  onImportBulk,
  showToast,
  initialTab = 'export',
}) => {
  const t = useT();
  const [activeTab, setActiveTab] = useState<'export' | 'import'>(initialTab);
  const [copied, setCopied] = useState<boolean>(false);

  // Sync active tab with initialTab when opening
  React.useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Import State
  const [importText, setImportText] = useState<string>('');
  const [selectedCatalog, setSelectedCatalog] = useState<string>(() => {
    const def = catalogs.find((c) => c.isDefault);
    return def ? def.name : catalogs[0]?.name || MAIN_BINDER;
  });
  const [isResolving, setIsResolving] = useState<boolean>(false);
  const [resolveProgress, setResolveProgress] = useState<string>('');
  const [resolvedCards, setResolvedCards] = useState<ResolvedImportItem[] | null>(null);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  // Postęp dużych importów (dopasowanie kart i zapis w paczkach)
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null);
  const busy = isResolving || isImporting;
  // Zamknięcie w trakcie importu przerwałoby dodawanie kart
  const safeClose = React.useCallback(() => {
    if (busy) {
      showToast(t('Poczekaj chwilę, trwa import. Zamknięcie okna przerwie dodawanie kart.'));
      return;
    }
    onClose();
  }, [busy, onClose, showToast]);
  // „Wstecz” na telefonie zamyka to okno zamiast opuszczać stronę
  useBackToClose(isOpen, safeClose);

  if (!isOpen) return null;

  // Generated TXT preview
  const txtContent = exportCollectionToTxt(collection);
  const previewLines = txtContent.split('\n').slice(0, 14).join('\n');

  // Handle Export TXT
  const handleDownloadTxt = () => {
    const filename = `kolekcja-mtg-${new Date().toISOString().slice(0, 10)}.txt`;
    downloadTxtFile(filename, txtContent);
    showToast(t('Pobrano plik: {filename}', { filename }));
  };

  // Handle Copy to Clipboard
  const handleCopyTxt = () => {
    navigator.clipboard.writeText(txtContent);
    setCopied(true);
    showToast(t('Skopiowano listę kart do schowka!'));
    setTimeout(() => setCopied(false), 2500);
  };

  // Handle Export JSON
  const handleDownloadJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(collection, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `mana-screw-backup-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast(t('Pobrano pełną kopię zapasową kolekcji w formacie JSON'));
  };

  // Handle File Upload for Import (.txt or .json)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      if (file.name.endsWith('.json')) {
        try {
          const json = JSON.parse(content);
          if (Array.isArray(json)) {
            setIsImporting(true);
            await onImportBulk(json, (done, total) => setProgress({ label: t('Zapisywanie kart w kolekcji'), done, total }));
            showToast(t('Pomyślnie zaimportowano {length} pozycji z pliku JSON!', { length: json.length }));
            onClose();
          }
        } catch (err: any) {
          showToast(err instanceof SyntaxError ? t('Nieprawidłowy format pliku JSON.') : err?.message || t('Import nie powiódł się.'));
        } finally {
          setIsImporting(false);
          setProgress(null);
        }
      } else {
        // Text file
        setImportText(content);
        setResolvedCards(null);
      }
    };
    reader.readAsText(file);
  };

  // Handle Analyze / Resolve Scryfall Cards
  const handleAnalyzeText = async () => {
    if (!importText.trim()) return;

    setIsResolving(true);
    setResolveProgress(t('Analizowanie tekstu...'));

    try {
      const parsed = parseTxtDeckOrCollection(importText);
      if (parsed.allLines.length === 0) {
        showToast(t('Nie znaleziono prawidłowych linii z kartami w podanym tekście.'));
        setIsResolving(false);
        return;
      }

      setResolveProgress(t('Dopasowywanie {length} kart...', { length: parsed.allLines.length }));
      const resolved = await resolveCardsFromScryfall(parsed.allLines, (curr, tot, msg) => {
        setResolveProgress(msg);
        setProgress({ label: t('Rozpoznawanie kart'), done: curr, total: tot });
      });

      setResolvedCards(resolved);
      const foundCount = resolved.filter((r) => r.card).length;
      showToast(t('Pomyślnie dopasowano {foundCount} z {length} kart ze Scryfall!', { foundCount, length: resolved.length }));
    } catch (err: any) {
      console.error('Błąd parsowania:', err);
      showToast(err?.message && /Spróbuj|limit|Za dużo|Try|Too many/i.test(err.message) ? err.message : t('Wystąpił błąd podczas analizowania listy.'));
    } finally {
      setIsResolving(false);
      setProgress(null);
    }
  };

  // Confirm and Save Imported Cards into Collection
  const handleConfirmImport = async () => {
    if (!resolvedCards || resolvedCards.length === 0) return;

    setIsImporting(true);
    try {
      const validItems = resolvedCards
        .filter((r) => r.card != null)
        .map((r) => ({
          card: r.card!,
          quantity: r.parsed.isFoil ? 0 : r.parsed.quantity,
          quantityFoil: r.parsed.isFoil ? r.parsed.quantity : 0,
          condition: 'NM',
          language: 'EN',
          binder: selectedCatalog,
        }));

      if (validItems.length === 0) {
        showToast(t('Brak poprawnych kart do zaimportowania.'));
        return;
      }

      await onImportBulk(validItems, (done, total) => setProgress({ label: t('Zapisywanie kart w kolekcji'), done, total }));
      showToast(t('Zaimportowano {length} kart do klasera "{selectedCatalog}"!', { length: validItems.length, selectedCatalog: binderName(selectedCatalog) }));
      onClose();
    } catch (err: any) {
      console.error('Błąd importu:', err);
      showToast(err?.message || t('Wystąpił błąd podczas dodawania kart do kolekcji.'));
    } finally {
      setIsImporting(false);
      setProgress(null);
    }
  };

  const foundCount = resolvedCards ? resolvedCards.filter((r) => r.card).length : 0;
  const missingCount = resolvedCards ? resolvedCards.filter((r) => !r.card).length : 0;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) safeClose();
      }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative bg-stone-900 border border-stone-800 rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl my-auto text-stone-100 flex flex-col max-h-[92vh] max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none max-sm:rounded-t-3xl max-sm:max-h-[92dvh] max-sm:pb-[env(safe-area-inset-bottom)] max-sm:animate-[slideUp_.2s_ease-out] max-sm:mt-auto max-sm:mb-0 max-sm:overflow-y-auto"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800 bg-stone-950/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-stone-100">
                {t('Eksport i Import Kolekcji')}
              </h2>
              <p className="text-xs text-stone-400">
                {t('Pliki tekstowe .txt (format')} <code className="text-amber-300 font-mono">{t('1x Nazwa (dodatek) nr')}</code>) {t('oraz kopie JSON')}
              </p>
            </div>
          </div>

          <button
            onClick={safeClose}
            aria-label={t('Zamknij')}
            className="p-1.5 text-stone-400 hover:text-stone-100 hover:bg-stone-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Buttons */}
        <div className="flex border-b border-stone-800 bg-stone-950/40 px-6 pt-2 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('export')}
            className={`py-2 px-4 text-xs font-bold border-b-2 flex items-center gap-2 cursor-pointer transition-all ${
              activeTab === 'export'
                ? 'border-amber-500 text-amber-400 bg-amber-500/10 rounded-t-lg'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <Download className="w-4 h-4" />
            <span>{t('Eksportuj kolekcję (.txt / .json)')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('import')}
            className={`py-2 px-4 text-xs font-bold border-b-2 flex items-center gap-2 cursor-pointer transition-all ${
              activeTab === 'import'
                ? 'border-amber-500 text-amber-400 bg-amber-500/10 rounded-t-lg'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>{t('Importuj z Pliku .txt / Listy')}</span>
          </button>
        </div>

        {/* Pasek postępu dużego importu */}
        {progress && <ImportProgressBar {...progress} />}

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-stone-300">
          {activeTab === 'export' ? (
            <div className="space-y-4">
              <div className="p-3.5 bg-stone-950/70 border border-stone-800 rounded-xl space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-stone-300">{t('Twoja kolekcja zawiera:')}</span>
                  <span className="font-bold text-amber-300 tabular-nums">{t('{n} unikalnych wpisów', { n: collection.length })}</span>
                </div>
                <p className="text-[11px] text-stone-400">
                  {t('Eksport do pliku tekstowego jest zgodny ze standardem list MTG (Moxfield, Archidekt, Deckstats):')} <code className="text-amber-300/90 font-mono">1x Talisman of Impulse (tdc) 332</code>
                </p>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleDownloadTxt}
                  className="py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-950/50 cursor-pointer transition-all"
                >
                  <Download className="w-4 h-4 stroke-[2.5]" />
                  <span>{t('Pobierz plik .txt (Kolekcja)')}</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyTxt}
                  className="py-3 px-4 rounded-xl bg-stone-800 hover:bg-stone-750 text-stone-100 border border-stone-700 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-400">{t('Skopiowano listę!')}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-stone-400" />
                      <span>{t('Kopiuj listę .txt do schowka')}</span>
                    </>
                  )}
                </button>
              </div>

              {/* Preview Container */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-stone-400">
                  <span className="font-semibold text-stone-300">{t('Podgląd formatu tekstowego (.txt):')}</span>
                  <span className="tabular-nums text-[11px]">{t('pokazano początek pliku')}</span>
                </div>
                <div className="bg-stone-950 p-3 rounded-xl border border-stone-800 tabular-nums text-[11px] text-stone-300 max-h-48 overflow-y-auto whitespace-pre leading-relaxed select-all">
                  {previewLines}
                  {collection.length > 10 && '\n' + t('... (i pozostałe karty)')}
                </div>
              </div>

              {/* JSON Backup Alternative */}
              <div className="pt-2 border-t border-stone-800 flex items-center justify-between">
                <div>
                  <p className="font-bold text-stone-300 text-xs">{t('Pełna kopia zapasowa JSON')}</p>
                  <p className="text-[11px] text-stone-500">{t('Zawiera wszystkie metadane, daty i notatki')}</p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadJson}
                  className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-750 border border-stone-700 text-stone-300 hover:text-stone-100 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{t('Kopia .JSON')}</span>
                </button>
              </div>
            </div>
          ) : (
            /* IMPORT TAB */
            <div className="space-y-4">
              {/* File upload shortcut */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-stone-950/70 border border-stone-800 rounded-xl">
                <div>
                  <p className="font-bold text-stone-200 text-xs">{t('Wczytaj plik z dysku (.txt lub .json)')}</p>
                  <p className="text-[11px] text-stone-400">{t('Wybierz zapisany plik tekstowy lub przeciągnij go tutaj')}</p>
                </div>
                <label className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-750 border border-stone-700 text-stone-200 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors shrink-0">
                  <Upload className="w-4 h-4 text-amber-400" />
                  <span>{t('Wybierz plik (.txt / .json)')}</span>
                  <input
                    type="file"
                    accept=".txt,.json"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Catalog target select */}
              <div className="space-y-1.5">
                <label className="font-bold text-stone-300 text-xs flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-amber-400" />
                  <span>{t('Docelowy klaser dla importowanych kart:')}</span>
                </label>
                <select
                  value={selectedCatalog}
                  onChange={(e) => setSelectedCatalog(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-700 rounded-xl p-2.5 text-stone-200 text-xs focus:outline-none focus:border-amber-500 cursor-pointer"
                >
                  {catalogs.map((cat) => (
                    <option key={cat.id} value={cat.name}>
                      {binderName(cat.name)} {cat.isDefault ? t('(Domyślny)') : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Textarea for pasting card lines */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-bold text-stone-300">
                    {t('Lub wklej listę kart bezpośrednio:')}
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setImportText("1x Talisman of Impulse (tdc) 332\n1x Sol Ring (cmm) 401\n1x Rhystic Study (woe) 15\n1x Lightning Bolt (2x2) 117\n1x Cyclonic Rift (rtr) 35 *F*");
                      setResolvedCards(null);
                    }}
                    className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold hover:underline cursor-pointer"
                  >
                    {t('Wstaw przykład')}
                  </button>
                </div>
                <textarea
                  rows={6}
                  value={importText}
                  onChange={(e) => {
                    setImportText(e.target.value);
                    setResolvedCards(null);
                  }}
                  placeholder={t('np.:\n1x Talisman of Impulse (tdc) 332\n1x Sol Ring (c21) 263\n4x Counterspell (mh2) 267\n1x Lightning Bolt')}
                  className="w-full bg-stone-950 border border-stone-700 rounded-xl p-3 text-stone-200 tabular-nums text-[11px] focus:outline-none focus:border-amber-500 placeholder:text-stone-600"
                />
              </div>

              {/* Analyze button */}
              {!resolvedCards && (
                <button
                  type="button"
                  onClick={handleAnalyzeText}
                  disabled={!importText.trim() || isResolving}
                  className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-950/40 cursor-pointer transition-all disabled:opacity-50"
                >
                  {isResolving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>{resolveProgress || t('Dopasowywanie w Scryfall...')}</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 stroke-[2.5]" />
                      <span>{t('Przeanalizuj listę ze Scryfall API')}</span>
                    </>
                  )}
                </button>
              )}

              {/* Resolved Preview summary */}
              {resolvedCards && (
                <div className="space-y-3 p-3.5 bg-stone-950/80 border border-stone-800 rounded-xl animate-fade-in">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-stone-200">{t('Podsumowanie analizy listy:')}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        ✓ {t('Rozpoznano:')} {foundCount}
                      </span>
                      {missingCount > 0 && (
                        <span className="text-rose-400 font-bold bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                          ✕ {t('Nierozpoznano:')} {missingCount}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* List of matched cards */}
                  <div className="max-h-40 overflow-y-auto space-y-1 divide-y divide-stone-800/60 tabular-nums text-[11px] pr-1">
                    {resolvedCards.map((res, idx) => (
                      <div key={idx} className="pt-1 flex items-center justify-between gap-2">
                        <div className="truncate flex items-center gap-1.5">
                          <span className="text-stone-400">{res.parsed.quantity}x</span>
                          <span className={res.card ? 'text-stone-200' : 'text-rose-400 line-through'}>
                            {res.card ? res.card.name : res.parsed.name}
                          </span>
                          {res.parsed.set && (
                            <span className="text-[11px] text-stone-500">[{res.parsed.set.toUpperCase()}]</span>
                          )}
                          {res.parsed.isFoil && (
                            <span className="text-[11px] text-amber-300">{t('Foil')}</span>
                          )}
                        </div>
                        {res.card ? (
                          <span className="text-emerald-400 text-[11px] shrink-0 font-sans font-semibold">{t('OK')}</span>
                        ) : (
                          <span className="text-rose-400 text-[11px] shrink-0 font-sans">{t('Brak w Scryfall')}</span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Final Confirm Button */}
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setResolvedCards(null)}
                      className="px-3 py-2 rounded-xl bg-stone-800 hover:bg-stone-750 text-stone-300 text-xs font-semibold cursor-pointer transition-colors"
                    >
                      {t('Wróć do edycji')}
                    </button>

                    <button
                      type="button"
                      onClick={handleConfirmImport}
                      disabled={foundCount === 0 || isImporting}
                      className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 cursor-pointer transition-all disabled:opacity-50"
                    >
                      {isImporting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>{t('Zapisywanie w kolekcji...')}</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4 stroke-[3]" />
                          <span>{t('Dodaj {n} kart do klasera „{name}”', { n: foundCount, name: binderName(selectedCatalog) })}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/** Pasek postępu importu: etap, liczba przetworzonych pozycji i procent. */
const ImportProgressBar: React.FC<{ label: string; done: number; total: number }> = ({ label, done, total }) => {
  const t = useT();
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const fmt = (n: number) => n.toLocaleString(locale());
  return (
    <div className="px-6 py-3.5 border-b border-stone-800 bg-stone-950/60 space-y-2" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-stone-200 flex items-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
          {label}
        </span>
        <span className="text-stone-400 tabular-nums">
          {fmt(done)} / {fmt(total)} <span className="text-stone-200 font-medium ml-1">{pct}%</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-stone-800 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
        <div className="h-full rounded-full bg-amber-400 transition-[width] duration-300 ease-out" style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
      <p className="text-xs text-stone-500">{t('Nie zamykaj tego okna, dopóki import się nie zakończy.')}</p>
    </div>
  );
};
