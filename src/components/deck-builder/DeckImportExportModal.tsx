import React, { useState } from 'react';
import { X, Download, Upload, Copy, Check, RefreshCw, Sparkles, Swords, Crown, Layers } from 'lucide-react';
import { DeckItem, ScryfallCard } from '../../types';
import { 
  exportDeckToTxt, 
  parseTxtDeckOrCollection, 
  resolveCardsFromScryfall, 
  downloadTxtFile,
  ResolvedImportItem
} from '../../utils/textCardList';

interface DeckImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  deck: DeckItem;
  onUpdateDeck: (updatedDeck: DeckItem) => void;
  showToast: (message: string) => void;
}

export const DeckImportExportModal: React.FC<DeckImportExportModalProps> = ({
  isOpen,
  onClose,
  deck,
  onUpdateDeck,
  showToast,
}) => {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [copied, setCopied] = useState<boolean>(false);

  // Import State
  const [importText, setImportText] = useState<string>('');
  const [importMode, setImportMode] = useState<'replace' | 'append'>('replace');
  const [isResolving, setIsResolving] = useState<boolean>(false);
  const [resolveProgress, setResolveProgress] = useState<string>('');
  const [resolvedItems, setResolvedItems] = useState<ResolvedImportItem[] | null>(null);
  const [detectedCommander, setDetectedCommander] = useState<ScryfallCard | null>(null);

  if (!isOpen) return null;

  // Deck TXT content
  const txtContent = exportDeckToTxt(deck);

  // Handle Download TXT
  const handleDownloadTxt = () => {
    const safeName = (deck.name || 'talia-edh').toLowerCase().replace(/[^a-z0-9]/g, '-');
    const filename = `${safeName}-${new Date().toISOString().slice(0, 10)}.txt`;
    downloadTxtFile(filename, txtContent);
    showToast(`Pobrano plik talii: ${filename}`);
  };

  // Handle Copy TXT
  const handleCopyTxt = () => {
    navigator.clipboard.writeText(txtContent);
    setCopied(true);
    showToast('Skopiowano listę talii do schowka!');
    setTimeout(() => setCopied(false), 2500);
  };

  // Handle File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setImportText(content);
      setResolvedItems(null);
      setDetectedCommander(null);
    };
    reader.readAsText(file);
  };

  // Handle Analyze Decklist
  const handleAnalyzeDecklist = async () => {
    if (!importText.trim()) return;

    setIsResolving(true);
    setResolveProgress('Analizowanie tekstu talii...');

    try {
      const parsed = parseTxtDeckOrCollection(importText);
      if (parsed.allLines.length === 0) {
        showToast('Nie znaleziono prawidłowych wpisów kart.');
        setIsResolving(false);
        return;
      }

      setResolveProgress(`Dopasowywanie ${parsed.allLines.length} kart w Scryfall...`);
      const resolved = await resolveCardsFromScryfall(parsed.allLines, (_curr, _tot, msg) => {
        setResolveProgress(msg);
      });

      setResolvedItems(resolved);

      // Check if commander was detected via // Commander header or *CMDR* tag
      const cmdrCandidate = resolved.find((r) => r.parsed.isCommander && r.card != null);
      if (cmdrCandidate && cmdrCandidate.card) {
        setDetectedCommander(cmdrCandidate.card);
      } else {
        // Find first legendary creature as commander candidate
        const legendary = resolved.find((r) => {
          const typeLine = (r.card?.type_line || '').toLowerCase();
          return typeLine.includes('legendary') && typeLine.includes('creature');
        });
        if (legendary && legendary.card) {
          setDetectedCommander(legendary.card);
        }
      }

      const foundCount = resolved.filter((r) => r.card).length;
      showToast(`Dopasowano ${foundCount} z ${resolved.length} kart!`);
    } catch (err) {
      console.error('Błąd analizy talii:', err);
      showToast('Wystąpił błąd podczas analizy talii.');
    } finally {
      setIsResolving(false);
    }
  };

  // Confirm Import into Deck
  const handleConfirmImport = () => {
    if (!resolvedItems || resolvedItems.length === 0) return;

    const validCards = resolvedItems.filter((r) => r.card != null);
    if (validCards.length === 0) {
      showToast('Brak poprawnie dopasowanych kart.');
      return;
    }

    let finalCommander = detectedCommander || deck.commander;
    let newDeckCards: { card: ScryfallCard; quantity: number; isFoil?: boolean }[] = [];

    if (importMode === 'append') {
      newDeckCards = [...deck.cards];
    }

    for (const item of validCards) {
      const card = item.card!;
      // Skip if this card is designated as commander
      if (finalCommander && (finalCommander.id === card.id || finalCommander.name.toLowerCase() === card.name.toLowerCase())) {
        continue;
      }

      const existingIdx = newDeckCards.findIndex(
        (c) => c.card.id === card.id || c.card.name.toLowerCase() === card.name.toLowerCase()
      );

      if (existingIdx >= 0) {
        // EDH singleton rule for non-basic lands
        const isBasic = (card.type_line || '').toLowerCase().includes('basic');
        if (!isBasic) {
          newDeckCards[existingIdx].quantity = 1;
        } else {
          newDeckCards[existingIdx].quantity += item.parsed.quantity;
        }
      } else {
        newDeckCards.push({
          card,
          quantity: item.parsed.quantity,
          isFoil: item.parsed.isFoil,
        });
      }
    }

    onUpdateDeck({
      ...deck,
      commander: finalCommander,
      cards: newDeckCards,
    });

    showToast(`Pomyślnie zaktualizowano talię „${deck.name}”!`);
    onClose();
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
            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <Swords className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-stone-100">
                Eksport i Import Talii: <span className="text-purple-300">{deck.name}</span>
              </h2>
              <p className="text-xs text-stone-400">
                Format standardowy: <code className="text-purple-300 font-mono">1x Nazwa Karty (dodatek) nr</code>
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

        {/* Tab Buttons */}
        <div className="flex border-b border-stone-800 bg-stone-950/40 px-6 pt-2 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('export')}
            className={`py-2 px-4 text-xs font-bold border-b-2 flex items-center gap-2 cursor-pointer transition-all ${
              activeTab === 'export'
                ? 'border-purple-500 text-purple-300 bg-purple-500/10 rounded-t-lg'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <Download className="w-4 h-4" />
            <span>Eksportuj Talię (.txt)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('import')}
            className={`py-2 px-4 text-xs font-bold border-b-2 flex items-center gap-2 cursor-pointer transition-all ${
              activeTab === 'import'
                ? 'border-purple-500 text-purple-300 bg-purple-500/10 rounded-t-lg'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>Importuj Karty do Talii</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-stone-300">
          {activeTab === 'export' ? (
            <div className="space-y-4">
              <div className="p-3.5 bg-stone-950/70 border border-stone-800 rounded-xl space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-stone-300">Skład talii:</span>
                  <span className="font-mono text-purple-300 font-bold">
                    {deck.commander ? '1 Dowódca + ' : ''}
                    {deck.cards?.reduce((s, c) => s + c.quantity, 0) || 0} kart
                  </span>
                </div>
                <p className="text-[11px] text-stone-400">
                  Wygenerowany plik tekstowy możesz wgrać do Moxfield, Archidekt, MTGGoldfish, TCGPlayer lub udostępnić znajomym.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleDownloadTxt}
                  className="py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-purple-950/50 cursor-pointer transition-all"
                >
                  <Download className="w-4 h-4 stroke-[2.5]" />
                  <span>Pobierz plik .txt (Talia)</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyTxt}
                  className="py-3 px-4 rounded-xl bg-stone-800 hover:bg-stone-750 text-stone-100 border border-stone-700 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-400">Skopiowano talię!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-stone-400" />
                      <span>Kopiuj listę do schowka</span>
                    </>
                  )}
                </button>
              </div>

              {/* Text Preview */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-stone-400">
                  <span className="font-semibold text-stone-300">Podgląd pliku .txt:</span>
                  <span className="font-mono text-[10px]">zgodny z formatem EDH</span>
                </div>
                <div className="bg-stone-950 p-3 rounded-xl border border-stone-800 font-mono text-[11px] text-stone-300 max-h-56 overflow-y-auto whitespace-pre leading-relaxed select-all">
                  {txtContent}
                </div>
              </div>
            </div>
          ) : (
            /* IMPORT TAB */
            <div className="space-y-4">
              {/* File upload shortcut */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-stone-950/70 border border-stone-800 rounded-xl">
                <div>
                  <p className="font-bold text-stone-200 text-xs">Wczytaj plik talii (.txt)</p>
                  <p className="text-[11px] text-stone-400">Wybierz plik tekstowy z dysku</p>
                </div>
                <label className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-750 border border-stone-700 text-stone-200 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors shrink-0">
                  <Upload className="w-4 h-4 text-purple-400" />
                  <span>Wybierz plik .txt</span>
                  <input
                    type="file"
                    accept=".txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Import Mode: Replace vs Append */}
              <div className="space-y-1.5">
                <label className="font-bold text-stone-300 text-xs">Tryb importu kart:</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setImportMode('replace')}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                      importMode === 'replace'
                        ? 'bg-purple-500/15 border-purple-500 text-purple-300'
                        : 'bg-stone-950 border-stone-800 text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    <p className="font-bold text-xs">Zastąp zawartość talii</p>
                    <p className="text-[10px] text-stone-500 mt-0.5">Usuwa dotychczasowe karty i wstawia nowe</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setImportMode('append')}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                      importMode === 'append'
                        ? 'bg-purple-500/15 border-purple-500 text-purple-300'
                        : 'bg-stone-950 border-stone-800 text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    <p className="font-bold text-xs">Dołącz do talii</p>
                    <p className="text-[10px] text-stone-500 mt-0.5">Zachowuje obecne karty i dodaje nowe</p>
                  </button>
                </div>
              </div>

              {/* Textarea for pasting */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-bold text-stone-300">
                    Wklej listę talii w formacie tekstowym:
                  </label>
                  <span className="text-[10px] text-stone-400 font-mono">
                    Format: 1x Nazwa (kod) nr
                  </span>
                </div>
                <textarea
                  rows={6}
                  value={importText}
                  onChange={(e) => {
                    setImportText(e.target.value);
                    setResolvedItems(null);
                  }}
                  placeholder="np.:&#10;// Commander&#10;1x Atraxa, Praetors' Voice (c16) 28 *CMDR*&#10;&#10;// Deck&#10;1x Talisman of Impulse (tdc) 332&#10;1x Sol Ring (c21) 263&#10;1x Cyclonic Rift"
                  className="w-full bg-stone-950 border border-stone-700 rounded-xl p-3 text-stone-200 font-mono text-[11px] focus:outline-none focus:border-purple-500 placeholder:text-stone-600"
                />
              </div>

              {/* Analyze button */}
              {!resolvedItems && (
                <button
                  type="button"
                  onClick={handleAnalyzeDecklist}
                  disabled={!importText.trim() || isResolving}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-purple-950/40 cursor-pointer transition-all disabled:opacity-50"
                >
                  {isResolving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>{resolveProgress || 'Dopasowywanie w Scryfall...'}</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 stroke-[2.5]" />
                      <span>Przeanalizuj listę talii ze Scryfall</span>
                    </>
                  )}
                </button>
              )}

              {/* Resolved Preview summary */}
              {resolvedItems && (
                <div className="space-y-3 p-3.5 bg-stone-950/80 border border-stone-800 rounded-xl animate-fade-in">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-stone-200">Podsumowanie analizy talii:</span>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        ✓ Rozpoznano: {foundCount}
                      </span>
                      {missingCount > 0 && (
                        <span className="text-rose-400 font-bold bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                          ✕ Nierozpoznano: {missingCount}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Detected Commander */}
                  {detectedCommander && (
                    <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <Crown className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>Wykryty Dowódca: <strong className="text-purple-300">{detectedCommander.name}</strong></span>
                      </div>
                      <span className="text-[10px] text-amber-300 font-mono">Commander</span>
                    </div>
                  )}

                  {/* List of matched cards */}
                  <div className="max-h-40 overflow-y-auto space-y-1 divide-y divide-stone-800/60 font-mono text-[11px] pr-1">
                    {resolvedItems.map((res, idx) => (
                      <div key={idx} className="pt-1 flex items-center justify-between gap-2">
                        <div className="truncate flex items-center gap-1.5">
                          <span className="text-stone-400">{res.parsed.quantity}x</span>
                          <span className={res.card ? 'text-stone-200' : 'text-rose-400 line-through'}>
                            {res.card ? res.card.name : res.parsed.name}
                          </span>
                          {res.parsed.isCommander && (
                            <span className="text-[10px] text-purple-300 font-bold">★ CMDR</span>
                          )}
                          {res.parsed.set && (
                            <span className="text-[10px] text-stone-500">[{res.parsed.set.toUpperCase()}]</span>
                          )}
                        </div>
                        {res.card ? (
                          <span className="text-emerald-400 text-[10px] shrink-0 font-sans font-semibold">OK</span>
                        ) : (
                          <span className="text-rose-400 text-[10px] shrink-0 font-sans">Brak</span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setResolvedItems(null)}
                      className="px-3 py-2 rounded-xl bg-stone-800 hover:bg-stone-750 text-stone-300 text-xs font-semibold cursor-pointer transition-colors"
                    >
                      Wróć do edycji
                    </button>

                    <button
                      type="button"
                      onClick={handleConfirmImport}
                      disabled={foundCount === 0}
                      className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-stone-950 font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 cursor-pointer transition-all disabled:opacity-50"
                    >
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>
                        {importMode === 'replace' ? 'Zastąp talię' : 'Dołącz'} {foundCount} kartami
                      </span>
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
