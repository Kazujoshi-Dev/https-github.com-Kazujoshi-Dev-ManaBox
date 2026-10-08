import React, { useState, useEffect } from 'react';
import { 
  X, 
  Upload, 
  Download, 
  Copy, 
  Check, 
  Swords, 
  Crown, 
  Sparkles, 
  RefreshCw, 
  FileText, 
  AlertCircle,
  Plus,
  Layers
} from 'lucide-react';
import { DeckItem, DeckCardEntry, ScryfallCard } from '../types';
import { useBackToClose } from '../hooks/useBackButton';
import { getCardImageUri } from '../utils/formatters';
import { 
  parseTxtDeckOrCollection, 
  resolveCardsFromScryfall, 
  exportDeckToTxt, 
  downloadTxtFile,
  ResolvedImportItem 
} from '../utils/textCardList';
import { getDeckFormat } from '../utils/mtgFormats';
import { useT } from '../i18n';

interface DeckImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  // If provided, allows exporting this deck or adding cards to it
  deck?: DeckItem | null;
  // Called when creating a brand-new deck from the imported list
  onCreateDeck?: (deckData: Omit<DeckItem, 'id' | 'createdAt' | 'updatedAt'>) => Promise<any>;
  // Called when adding/replacing cards in the currently opened deck
  onUpdateDeckCards?: (newCards: DeckCardEntry[], commander?: ScryfallCard | null, mode?: 'append' | 'replace') => Promise<any>;
  showToast: (message: string) => void;
  initialTab?: 'export' | 'import';
}

export const DeckImportExportModal: React.FC<DeckImportExportModalProps> = ({
  isOpen,
  onClose,
  deck,
  onCreateDeck,
  onUpdateDeckCards,
  showToast,
  initialTab,
}) => {
  const t = useT();
  // „Wstecz” na telefonie zamyka to okno zamiast opuszczać stronę
  useBackToClose(isOpen, onClose);

  // Determine default tab: if deck is present, default to export unless specified
  const [activeTab, setActiveTab] = useState<'export' | 'import'>(
    initialTab || (deck ? 'export' : 'import')
  );
  const [copied, setCopied] = useState<boolean>(false);

  // Import State
  const [deckName, setDeckName] = useState<string>('');
  const [importText, setImportText] = useState<string>('');
  const [isResolving, setIsResolving] = useState<boolean>(false);
  const [resolveProgress, setResolveProgress] = useState<string>('');
  const [resolvedItems, setResolvedItems] = useState<ResolvedImportItem[] | null>(null);
  const [detectedCommander, setDetectedCommander] = useState<ScryfallCard | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [importTargetMode, setImportTargetMode] = useState<'append' | 'replace' | 'new_deck'>(
    deck ? 'append' : 'new_deck'
  );

  // Sync tab whenever modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialTab) {
        setActiveTab(initialTab);
      } else {
        setActiveTab(deck ? 'export' : 'import');
      }
      setImportTargetMode(deck ? 'append' : 'new_deck');
      setCopied(false);
      setResolvedItems(null);
      setDetectedCommander(null);
      setDeckName('');
      setImportText('');
    }
  }, [isOpen, initialTab, deck]);

  if (!isOpen) return null;

  // Formatted TXT export content for existing deck
  const txtExportContent = deck ? exportDeckToTxt(deck) : '';
  const previewLines = txtExportContent.split('\n').slice(0, 16).join('\n');

  // Handle Export TXT Download
  const handleDownloadTxt = () => {
    if (!deck) return;
    const safeName = (deck.name || 'talia-edh')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const filename = `${safeName}-${new Date().toISOString().slice(0, 10)}.txt`;
    downloadTxtFile(filename, txtExportContent);
    showToast(t('Pobrano plik: {filename}', { filename }));
  };

  // Handle Copy to Clipboard
  const handleCopyTxt = () => {
    if (!txtExportContent) return;
    navigator.clipboard.writeText(txtExportContent);
    setCopied(true);
    showToast(t('Skopiowano listę talii w formacie .txt do schowka!'));
    setTimeout(() => setCopied(false), 2500);
  };

  // Handle File Upload for Import
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const suggestedName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    if (!deckName && !deck) {
      setDeckName(suggestedName);
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setImportText(content);
      setResolvedItems(null);
      setDetectedCommander(null);
    };
    reader.readAsText(file);
  };

  // Handle Analyze Decklist with Scryfall
  const handleAnalyzeDecklist = async () => {
    if (!importText.trim()) return;

    setIsResolving(true);
    setResolveProgress(t('Analizowanie tekstu talii...'));

    try {
      const parsed = parseTxtDeckOrCollection(importText);
      if (parsed.allLines.length === 0) {
        showToast(t('Nie znaleziono prawidłowych linii z kartami w tekście.'));
        setIsResolving(false);
        return;
      }

      setResolveProgress(t('Dopasowywanie {length} kart w Scryfall...', { length: parsed.allLines.length }));
      const resolved = await resolveCardsFromScryfall(parsed.allLines, (_curr, _tot, msg) => {
        setResolveProgress(msg);
      });

      setResolvedItems(resolved);

      // Detect Commander candidate
      const cmdrCandidate = resolved.find((r) => r.parsed.isCommander && r.card != null);
      if (cmdrCandidate && cmdrCandidate.card) {
        setDetectedCommander(cmdrCandidate.card);
        if (!deckName && !deck) {
          setDeckName(t('Talia: {name}', { name: cmdrCandidate.card.name }));
        }
      } else {
        const legendary = resolved.find((r) => {
          const typeLine = (r.card?.type_line || '').toLowerCase();
          return typeLine.includes('legendary') && (typeLine.includes('creature') || typeLine.includes('planeswalker'));
        });
        if (legendary && legendary.card) {
          setDetectedCommander(legendary.card);
          if (!deckName && !deck) {
            setDeckName(t('Talia: {name}', { name: legendary.card.name }));
          }
        }
      }

      const foundCount = resolved.filter((r) => r.card).length;
      showToast(t('Pomyślnie dopasowano {foundCount} z {length} kart ze Scryfall!', { foundCount, length: resolved.length }));
    } catch (err: any) {
      console.error('Błąd analizy talii:', err);
      showToast(t('Wystąpił błąd podczas analizy talii.'));
    } finally {
      setIsResolving(false);
    }
  };

  // Confirm Import
  const handleConfirmImport = async () => {
    if (!resolvedItems || resolvedItems.length === 0) return;

    const validItems = resolvedItems.filter((r) => r.card != null);
    if (validItems.length === 0) {
      showToast(t('Brak poprawnych kart do zaimportowania.'));
      return;
    }

    setIsSubmitting(true);
    try {
      const finalCommander = detectedCommander || (deck?.commander ?? null);

      // Convert resolved cards to deck entries
      const deckCards: DeckCardEntry[] = [];
      for (const item of validItems) {
        const card = item.card!;
        // Skip commander if it is also in the list
        if (finalCommander && (finalCommander.id === card.id || finalCommander.name.toLowerCase() === card.name.toLowerCase())) {
          continue;
        }

        const isBasic = (card.type_line || '').toLowerCase().includes('basic');
        deckCards.push({
          card,
          quantity: isBasic ? item.parsed.quantity : 1,
          isFoil: item.parsed.isFoil,
        });
      }

      // Check target mode
      if (deck && importTargetMode !== 'new_deck' && onUpdateDeckCards) {
        await onUpdateDeckCards(deckCards, finalCommander, importTargetMode);
        showToast(
          importTargetMode === 'replace'
            ? t('Zastąpiono karty w talii „{name}” ({length} kart)!', { name: deck.name, length: deckCards.length })
            : t('Dodano {length} kart do talii „{name}”!', { length: deckCards.length, name: deck.name })
        );
        onClose();
      } else if (onCreateDeck) {
        const finalName = deckName.trim() || (finalCommander ? t('Talia: {name}', { name: finalCommander.name }) : t('Nowa Talia EDH'));
        await onCreateDeck({
          name: finalName,
          format: 'EDH Commander',
          description: t('Zaimportowano z pliku tekstowego (.txt)'),
          cardSource: 'all',
          commander: finalCommander,
          cards: deckCards,
        });
        showToast(t('Pomyślnie utworzono talię „{finalName}”!', { finalName }));
        onClose();
      }
    } catch (err: any) {
      console.error('Błąd zapisu talii:', err);
      showToast(t('Nie udało się zapisać talii.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const foundCount = resolvedItems ? resolvedItems.filter((r) => r.card).length : 0;
  const missingCount = resolvedItems ? resolvedItems.filter((r) => !r.card).length : 0;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
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
              <Swords className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-stone-100">
                {deck ? t('Talia EDH: {name}', { name: deck.name }) : t('Importuj Talię EDH Commander (.txt)')}
              </h2>
              <p className="text-xs text-stone-400">
                {t('Pliki tekstowe .txt (format')} <code className="text-amber-300 font-mono">{t('1x Nazwa (dodatek) nr')}</code>)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-100 hover:bg-stone-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Buttons (if deck is provided, allow both export and import) */}
        {deck && (
          <div className="flex border-b border-stone-800 bg-stone-950/40 px-6 pt-2 gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('export')}
              className={`py-2 px-4 text-xs font-bold border-b-2 flex items-center gap-2 cursor-pointer transition-all ${
                activeTab === 'export'
                  ? 'border-amber-500 text-amber-300 bg-amber-500/10 rounded-t-lg'
                  : 'border-transparent text-stone-400 hover:text-stone-200'
              }`}
            >
              <Download className="w-4 h-4" />
              <span>{t('Eksportuj do .txt')}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('import')}
              className={`py-2 px-4 text-xs font-bold border-b-2 flex items-center gap-2 cursor-pointer transition-all ${
                activeTab === 'import'
                  ? 'border-amber-500 text-amber-300 bg-amber-500/10 rounded-t-lg'
                  : 'border-transparent text-stone-400 hover:text-stone-200'
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>{t('Importuj z .txt do talii')}</span>
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-stone-300">
          {activeTab === 'export' && deck ? (
            /* EXPORT TAB */
            <div className="space-y-4">
              <div className="p-3.5 bg-stone-950/70 border border-stone-800 rounded-xl space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-stone-300">{t('Talia:')}</span>
                  <span className="font-bold text-amber-300 tabular-nums">{deck.name}</span>
                </div>
                {deck.commander && (
                  <div className="flex items-center gap-2 text-amber-300 font-semibold text-xs">
                    <Crown className="w-3.5 h-3.5" />
                    <span>{t('Dowódca:')} {deck.commander.name} ({deck.commander.set?.toUpperCase()} #{deck.commander.collector_number})</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-[11px] text-stone-400 pt-1 border-t border-stone-800/80">
                  <span>{t('Liczba kart w talii:')}</span>
                  <span className="tabular-nums font-bold text-stone-200">
                    {(deck.commander ? 1 : 0) + (deck.cards?.reduce((s, c) => s + c.quantity, 0) || 0)} / {getDeckFormat(deck.format).deckSize} {t('kart')}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleDownloadTxt}
                  className="py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-950/50 cursor-pointer transition-all"
                >
                  <Download className="w-4 h-4 stroke-[2.5]" />
                  <span>{t('Pobierz plik .txt')}</span>
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

              {/* Formatted Text Preview */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-stone-400">
                  <span className="font-semibold text-stone-300">{t('Podgląd pliku tekstowego (.txt):')}</span>
                  <span className="tabular-nums text-[11px]">{t('format: 1x Nazwa (kod) nr')}</span>
                </div>
                <div className="bg-stone-950 p-3 rounded-xl border border-stone-800 tabular-nums text-[11px] text-stone-300 max-h-56 overflow-y-auto whitespace-pre leading-relaxed select-all">
                  {previewLines}
                  {txtExportContent.split('\n').length > 16 && '\n' + t('... (i pozostałe karty)')}
                </div>
              </div>

              <p className="text-[11px] text-stone-400">
                {t('Format pliku jest w 100% kompatybilny z popularnymi platformami MTG (Moxfield, Archidekt, TappedOut, MTGGoldfish).')}
              </p>
            </div>
          ) : (
            /* IMPORT TAB */
            <div className="space-y-4">
              {/* File upload shortcut */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-stone-950/70 border border-stone-800 rounded-xl">
                <div>
                  <p className="font-bold text-stone-200 text-xs">{t('Wybierz plik tekstowy talii (.txt)')}</p>
                  <p className="text-[11px] text-stone-400">{t('Pobrany np. z Moxfield, Archidekt lub plik z dysku')}</p>
                </div>
                <label className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-750 border border-stone-700 text-stone-200 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors shrink-0">
                  <Upload className="w-4 h-4 text-amber-400" />
                  <span>{t('Wczytaj plik .txt')}</span>
                  <input
                    type="file"
                    accept=".txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Target Deck Mode (if modifying existing deck) */}
              {deck && (
                <div className="space-y-1.5 p-3 bg-stone-950/50 border border-stone-800 rounded-xl">
                  <label className="font-bold text-stone-300 text-xs flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-amber-400" />
                    <span>{t('Tryb importu dla talii „{name}”:', { name: deck.name })}</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => setImportTargetMode('append')}
                      className={`p-2 rounded-lg text-[11px] font-semibold text-center border transition-all cursor-pointer ${
                        importTargetMode === 'append'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                          : 'bg-stone-900 text-stone-400 border-stone-800 hover:bg-stone-850'
                      }`}
                    >
                      {t('Dodaj do talii')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportTargetMode('replace')}
                      className={`p-2 rounded-lg text-[11px] font-semibold text-center border transition-all cursor-pointer ${
                        importTargetMode === 'replace'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                          : 'bg-stone-900 text-stone-400 border-stone-800 hover:bg-stone-850'
                      }`}
                    >
                      {t('Zastąp karty')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportTargetMode('new_deck')}
                      className={`p-2 rounded-lg text-[11px] font-semibold text-center border transition-all cursor-pointer ${
                        importTargetMode === 'new_deck'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                          : 'bg-stone-900 text-stone-400 border-stone-800 hover:bg-stone-850'
                      }`}
                    >
                      {t('Utwórz nową talię')}
                    </button>
                  </div>
                </div>
              )}

              {/* Deck Name Input (if creating new deck) */}
              {(!deck || importTargetMode === 'new_deck') && (
                <div className="space-y-1.5">
                  <label className="font-bold text-stone-300 text-xs">{t('Nazwa nowej talii:')}</label>
                  <input
                    type="text"
                    value={deckName}
                    onChange={(e) => setDeckName(e.target.value)}
                    placeholder={t('np. Moja Talia EDH - Atraxa')}
                    className="w-full bg-stone-950 border border-stone-700 rounded-xl p-2.5 text-stone-200 text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>
              )}

              {/* Textarea for pasting card lines */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-bold text-stone-300">{t('Wklej listę kart talii:')}</label>
                  <button
                    type="button"
                    onClick={() => {
                      setImportText(
                        `// Commander\n1x Atraxa, Praetors' Voice (2xm) 196 *CMDR*\n\n// Deck\n1x Talisman of Impulse (tdc) 332\n1x Sol Ring (cmm) 401\n1x Rhystic Study (woe) 15\n1x Cyclonic Rift (rtr) 35\n1x Demonic Tutor (uma) 93\n1x Arcane Signet (eld) 331 *F*`
                      );
                      setResolvedItems(null);
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
                    setResolvedItems(null);
                  }}
                  placeholder={t('np.:\n// Commander\n1x Atraxa, Praetors\' Voice (2xm) 196 *CMDR*\n\n// Deck\n1x Talisman of Impulse (tdc) 332\n1x Sol Ring (cmm) 401\n1x Rhystic Study (woe) 15')}
                  className="w-full bg-stone-950 border border-stone-700 rounded-xl p-3 text-stone-200 tabular-nums text-[11px] focus:outline-none focus:border-amber-500 placeholder:text-stone-600"
                />
              </div>

              {/* Analyze button */}
              {!resolvedItems && (
                <button
                  type="button"
                  onClick={handleAnalyzeDecklist}
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
                      <span>{t('Przeanalizuj listę talii ze Scryfall API')}</span>
                    </>
                  )}
                </button>
              )}

              {/* Resolved Preview summary */}
              {resolvedItems && (
                <div className="space-y-3 p-3.5 bg-stone-950/80 border border-stone-800 rounded-xl animate-fade-in">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-stone-200">{t('Podsumowanie analizy:')}</span>
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

                  {/* Commander Candidate Box */}
                  {detectedCommander && (
                    <div className="p-2.5 bg-amber-950/30 border border-amber-500/30 rounded-xl flex items-center gap-3">
                      {getCardImageUri(detectedCommander, 'art_crop') && (
                        <img
                          src={getCardImageUri(detectedCommander, 'art_crop')}
                          alt={detectedCommander.name}
                          className="w-10 h-10 object-cover rounded-lg border border-amber-500/40"
                        />
                      )}
                      <div>
                        <span className="text-[11px] font-bold text-amber-400 block">
                          {t('Wykryty Dowódca')}
                        </span>
                        <p className="text-xs font-bold text-white">
                          {detectedCommander.name}{' '}
                          <span className="text-stone-400 tabular-nums text-[11px]">
                            [{detectedCommander.set?.toUpperCase()} #{detectedCommander.collector_number}]
                          </span>
                        </p>
                      </div>
                    </div>
                  )}

                  {/* List of matched cards */}
                  <div className="max-h-40 overflow-y-auto space-y-1 divide-y divide-stone-800/60 tabular-nums text-[11px] pr-1">
                    {resolvedItems.map((res, idx) => (
                      <div key={idx} className="pt-1 flex items-center justify-between gap-2">
                        <div className="truncate flex items-center gap-1.5">
                          <span className="text-stone-400">{res.parsed.quantity}x</span>
                          <span className={res.card ? 'text-stone-200' : 'text-rose-400 line-through'}>
                            {res.card ? res.card.name : res.parsed.name}
                          </span>
                          {res.parsed.set && (
                            <span className="text-[11px] text-stone-500">[{res.parsed.set.toUpperCase()}]</span>
                          )}
                          {res.parsed.collectorNumber && (
                            <span className="text-[11px] text-stone-500">#{res.parsed.collectorNumber}</span>
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
                      onClick={() => setResolvedItems(null)}
                      className="px-3 py-2 rounded-xl bg-stone-800 hover:bg-stone-750 text-stone-300 text-xs font-semibold cursor-pointer transition-colors"
                    >
                      {t('Wróć do edycji')}
                    </button>

                    <button
                      type="button"
                      onClick={handleConfirmImport}
                      disabled={foundCount === 0 || isSubmitting}
                      className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-950/40 cursor-pointer transition-all disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>{t('Zapisywanie talii...')}</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4 stroke-[3]" />
                          <span>
                            {deck && importTargetMode === 'append'
                              ? t('Dodaj {foundCount} kart do talii „{name}”', { foundCount, name: deck.name })
                              : deck && importTargetMode === 'replace'
                              ? t('Zastąp karty w talii „{name}” ({foundCount})', { name: deck.name, foundCount })
                              : t('Utwórz talię z {foundCount} kartami', { foundCount })}
                          </span>
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

export default DeckImportExportModal;
