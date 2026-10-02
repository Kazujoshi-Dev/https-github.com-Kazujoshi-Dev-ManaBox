import React, { useState } from 'react';
import { X, Upload, Swords, Crown, Sparkles, RefreshCw, Check } from 'lucide-react';
import { DeckItem, ScryfallCard } from '../types';
import { useBackToClose } from '../hooks/useBackButton';
import { 
  parseTxtDeckOrCollection, 
  resolveCardsFromScryfall, 
  ResolvedImportItem 
} from '../utils/textCardList';

interface DeckImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateDeck: (deckData: Omit<DeckItem, 'id' | 'createdAt' | 'updatedAt'>) => Promise<any>;
  showToast: (message: string) => void;
}

export const DeckImportModal: React.FC<DeckImportModalProps> = ({
  isOpen,
  onClose,
  onCreateDeck,
  showToast,
}) => {
  // „Wstecz” na telefonie zamyka to okno zamiast opuszczać stronę
  useBackToClose(isOpen, onClose);

  const [deckName, setDeckName] = useState<string>('');
  const [importText, setImportText] = useState<string>('');
  const [isResolving, setIsResolving] = useState<boolean>(false);
  const [resolveProgress, setResolveProgress] = useState<string>('');
  const [resolvedItems, setResolvedItems] = useState<ResolvedImportItem[] | null>(null);
  const [detectedCommander, setDetectedCommander] = useState<ScryfallCard | null>(null);
  const [isCreating, setIsCreating] = useState<boolean>(false);

  if (!isOpen) return null;

  // Handle File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const suggestedName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    if (!deckName) {
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

  // Handle Analyze Decklist
  const handleAnalyzeDecklist = async () => {
    if (!importText.trim()) return;

    setIsResolving(true);
    setResolveProgress('Analizowanie tekstu talii...');

    try {
      const parsed = parseTxtDeckOrCollection(importText);
      if (parsed.allLines.length === 0) {
        showToast('Nie znaleziono prawidłowych linii z kartami.');
        setIsResolving(false);
        return;
      }

      setResolveProgress(`Dopasowywanie ${parsed.allLines.length} kart w Scryfall...`);
      const resolved = await resolveCardsFromScryfall(parsed.allLines, (_curr, _tot, msg) => {
        setResolveProgress(msg);
      });

      setResolvedItems(resolved);

      // Detect Commander
      const cmdrCandidate = resolved.find((r) => r.parsed.isCommander && r.card != null);
      if (cmdrCandidate && cmdrCandidate.card) {
        setDetectedCommander(cmdrCandidate.card);
        if (!deckName) {
          setDeckName(`Talia: ${cmdrCandidate.card.name}`);
        }
      } else {
        const legendary = resolved.find((r) => {
          const typeLine = (r.card?.type_line || '').toLowerCase();
          return typeLine.includes('legendary') && typeLine.includes('creature');
        });
        if (legendary && legendary.card) {
          setDetectedCommander(legendary.card);
          if (!deckName) {
            setDeckName(`Talia: ${legendary.card.name}`);
          }
        }
      }

      const foundCount = resolved.filter((r) => r.card).length;
      showToast(`Pomyślnie dopasowano ${foundCount} kart!`);
    } catch (err) {
      console.error('Błąd analizy talii:', err);
      showToast('Wystąpił błąd podczas analizy talii.');
    } finally {
      setIsResolving(false);
    }
  };

  // Confirm and Create Deck
  const handleConfirmCreate = async () => {
    if (!resolvedItems || resolvedItems.length === 0) return;

    const validCards = resolvedItems.filter((r) => r.card != null);
    if (validCards.length === 0) {
      showToast('Brak poprawnych kart do utworzenia talii.');
      return;
    }

    setIsCreating(true);
    try {
      const finalCommander = detectedCommander || null;
      const deckCards: { card: ScryfallCard; quantity: number; isFoil?: boolean }[] = [];

      for (const item of validCards) {
        const card = item.card!;
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

      const finalName = deckName.trim() || (finalCommander ? `Talia: ${finalCommander.name}` : 'Nowa Talia EDH');

      await onCreateDeck({
        name: finalName,
        format: 'EDH Commander',
        description: `Zaimportowano z pliku tekstowego (.txt)`,
        cardSource: 'all',
        commander: finalCommander,
        cards: deckCards,
      });

      showToast(`Pomyślnie utworzono talię „${finalName}”!`);
      onClose();
    } catch (err) {
      console.error('Błąd tworzenia talii:', err);
      showToast('Nie udało się utworzyć talii.');
    } finally {
      setIsCreating(false);
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
            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <Swords className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-stone-100">
                Importuj Nową Talię EDH (.txt)
              </h2>
              <p className="text-xs text-stone-400">
                Wczytaj plik w formacie <code className="text-purple-300 font-mono">1x Nazwa (dodatek) nr</code> (Moxfield, Archidekt)
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

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs text-stone-300">
          {/* File Upload Shortcut */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-stone-950/70 border border-stone-800 rounded-xl">
            <div>
              <p className="font-bold text-stone-200 text-xs">Wybierz plik tekstowy talii (.txt)</p>
              <p className="text-[11px] text-stone-400">Pobrany np. z Moxfield, Archidekt lub plik z dysku</p>
            </div>
            <label className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-750 border border-stone-700 text-stone-200 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors shrink-0">
              <Upload className="w-4 h-4 text-purple-400" />
              <span>Wczytaj plik .txt</span>
              <input
                type="file"
                accept=".txt"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          {/* Deck Name Input */}
          <div className="space-y-1.5">
            <label className="font-bold text-stone-300 text-xs">Nazwa nowej talii:</label>
            <input
              type="text"
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              placeholder="np. Moja Talia EDH - Atraxa"
              className="w-full bg-stone-950 border border-stone-700 rounded-xl p-2.5 text-stone-200 text-xs focus:outline-none focus:border-purple-500"
            />
          </div>

          {/* Textarea */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label className="font-bold text-stone-300">Wklej listę kart talii:</label>
              <span className="text-[10px] text-stone-400 font-mono">Format: 1x Nazwa (kod) nr</span>
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

          {/* Analyze Button */}
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

          {/* Resolved Summary */}
          {resolvedItems && (
            <div className="space-y-3 p-3.5 bg-stone-950/80 border border-stone-800 rounded-xl animate-fade-in">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-stone-200">Podsumowanie analizy:</span>
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

              {/* Detected Commander Banner */}
              {detectedCommander && (
                <div className="p-2.5 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Crown className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      Wykryty Dowódca: <strong className="text-purple-300">{detectedCommander.name}</strong>
                    </span>
                  </div>
                  <span className="text-[10px] text-amber-300 font-mono font-bold">Commander</span>
                </div>
              )}

              {/* Card List preview */}
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

              {/* Actions */}
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
                  onClick={handleConfirmCreate}
                  disabled={foundCount === 0 || isCreating}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-stone-950 font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 cursor-pointer transition-all disabled:opacity-50"
                >
                  {isCreating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Tworzenie talii...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>Utwórz talię z {foundCount} kartami</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
