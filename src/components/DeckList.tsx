import React, { useState } from 'react';
import { DeckItem, AppSettings } from '../types';
import { getCardPrice, formatCurrency } from '../utils/formatters';
import { exportDeckToTxt, downloadTxtFile } from '../utils/textCardList';
import { Swords, Plus, Crown, Trash2, Download, Copy, Check, Upload, FileText } from 'lucide-react';

interface DeckListProps {
  decks: DeckItem[];
  settings: AppSettings;
  onSelectDeck: (deck: DeckItem) => void;
  onCreateDeckClick: () => void;
  onDeleteDeck: (deckId: string) => void;
  onOpenImportDeck?: () => void;
  showToast?: (message: string) => void;
}

export const DeckList: React.FC<DeckListProps> = ({
  decks,
  settings,
  onSelectDeck,
  onCreateDeckClick,
  onDeleteDeck,
  onOpenImportDeck,
  showToast,
}) => {
  const [copiedDeckId, setCopiedDeckId] = useState<string | null>(null);

  const handleExportDeckFile = (e: React.MouseEvent, deck: DeckItem) => {
    e.stopPropagation();
    const content = exportDeckToTxt(deck);
    const safeName = (deck.name || 'talia-edh')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const filename = `${safeName}-${new Date().toISOString().slice(0, 10)}.txt`;
    downloadTxtFile(filename, content);
    showToast?.(`Pobrano plik: ${filename}`);
  };

  const handleCopyDeckList = (e: React.MouseEvent, deck: DeckItem) => {
    e.stopPropagation();
    const content = exportDeckToTxt(deck);
    navigator.clipboard.writeText(content);
    setCopiedDeckId(deck.id);
    showToast?.(`Skopiowano listę talii „${deck.name}” w formacie .txt!`);
    setTimeout(() => setCopiedDeckId(null), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Decks Header Banner */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 shadow-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-purple-600/30 border border-purple-500/40 flex items-center justify-center">
            <Swords className="w-5 h-5 text-purple-300" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Twoje Talie (Format EDH Commander)
            </h2>
            <p className="text-xs text-stone-400">
              Twórz talie 100-kartowe, stakuj karty według typów, eksportuj i importuj pliki .txt (<code className="text-purple-300 font-mono">1x Nazwa (set) nr</code>).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {onOpenImportDeck && (
            <button
              onClick={onOpenImportDeck}
              className="px-3.5 py-2.5 bg-stone-800 hover:bg-stone-750 text-purple-300 hover:text-purple-200 border border-purple-500/40 font-bold text-xs rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all shrink-0"
              title="Importuj talię z pliku .txt (np. format '1x Talisman of Impulse (tdc) 332')"
            >
              <Upload className="w-4 h-4 text-purple-400" />
              <span>Importuj talię .txt</span>
            </button>
          )}

          <button
            onClick={onCreateDeckClick}
            className="px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-purple-950/50 flex items-center justify-center gap-2 cursor-pointer transition-all shrink-0"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Utwórz nową talię EDH</span>
          </button>
        </div>
      </div>

      {/* Decks Grid */}
      {decks.length === 0 ? (
        <div className="bg-stone-900/60 border border-dashed border-stone-800 rounded-2xl p-12 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-purple-950/50 border border-purple-800/40 text-purple-400 mx-auto flex items-center justify-center">
            <Swords className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Nie masz jeszcze żadnych talii</h3>
            <p className="text-xs text-stone-400 max-w-sm mx-auto mt-1">
              Utwórz swoją pierwszą talię EDH Commander lub zaimportuj gotową listę z pliku .txt (Moxfield, Archidekt).
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button
              onClick={onCreateDeckClick}
              className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer transition-all inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Utwórz nową talię</span>
            </button>

            {onOpenImportDeck && (
              <button
                onClick={onOpenImportDeck}
                className="px-4 py-2 bg-stone-800 hover:bg-stone-750 text-purple-300 border border-purple-500/40 text-xs font-bold rounded-xl shadow-md cursor-pointer transition-all inline-flex items-center gap-2"
              >
                <Upload className="w-4 h-4 text-purple-400" />
                <span>Importuj z pliku .txt</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {decks.map(deck => {
            const count = (deck.commander ? 1 : 0) + (deck.cards?.reduce((s, c) => s + c.quantity, 0) || 0);
            let deckVal = 0;
            if (deck.commander) deckVal += getCardPrice(deck.commander, false, settings);
            deck.cards?.forEach(c => {
              deckVal += getCardPrice(c.card, false, settings) * c.quantity;
            });

            return (
              <div
                key={deck.id}
                onClick={() => onSelectDeck(deck)}
                className="group bg-stone-900 border border-stone-800 hover:border-purple-500/50 rounded-2xl p-5 shadow-xl transition-all cursor-pointer flex flex-col justify-between space-y-4 relative overflow-hidden"
              >
                {/* Subtle commander art background glow if present */}
                {deck.commander && (
                  <div
                    className="absolute inset-0 opacity-15 bg-cover bg-center pointer-events-none group-hover:opacity-25 transition-opacity"
                    style={{
                      backgroundImage: `url(${deck.commander.image_uris?.art_crop || deck.commander.image_uris?.normal || ''})`
                    }}
                  />
                )}

                <div className="relative z-10 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          {deck.format || 'EDH Commander'}
                        </span>
                      </div>
                      <h3 className="text-lg font-black text-white group-hover:text-purple-200 transition-colors">
                        {deck.name}
                      </h3>
                    </div>

                    <div className="flex items-center gap-1">
                      {/* Export TXT button */}
                      <button
                        type="button"
                        onClick={(e) => handleExportDeckFile(e, deck)}
                        className="text-stone-400 hover:text-purple-300 p-1.5 rounded-lg hover:bg-stone-800 transition-colors cursor-pointer"
                        title="Pobierz talię jako plik .txt (format '1x Karta (kod) nr')"
                      >
                        <Download className="w-4 h-4" />
                      </button>

                      {/* Copy TXT button */}
                      <button
                        type="button"
                        onClick={(e) => handleCopyDeckList(e, deck)}
                        className="text-stone-400 hover:text-purple-300 p-1.5 rounded-lg hover:bg-stone-800 transition-colors cursor-pointer"
                        title="Kopiuj listę talii w formacie .txt do schowka"
                      >
                        {copiedDeckId === deck.id ? (
                          <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteDeck(deck.id);
                        }}
                        className="text-stone-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-stone-800 transition-colors cursor-pointer"
                        title="Usuń talię"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {deck.description && (
                    <p className="text-xs text-stone-400 line-clamp-2">
                      {deck.description}
                    </p>
                  )}

                  {/* Commander Info if selected */}
                  {deck.commander ? (
                    <div className="flex items-center gap-2.5 p-2 bg-stone-950/80 rounded-xl border border-amber-500/30">
                      <div className="w-8 h-10 rounded overflow-hidden border border-amber-500/40 shrink-0">
                        <img
                          src={deck.commander.image_uris?.art_crop || deck.commander.image_uris?.small}
                          alt={deck.commander.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[10px] text-amber-400 font-bold block truncate">
                          👑 {deck.commander.name}
                        </span>
                        <span className="text-[10px] text-stone-400 truncate block">
                          {deck.commander.type_line}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-2 bg-stone-950/50 rounded-xl border border-dashed border-stone-800 text-[11px] text-stone-500 flex items-center gap-1.5">
                      <Crown className="w-3.5 h-3.5 text-stone-600" />
                      <span>Brak wybranego dowódcy</span>
                    </div>
                  )}
                </div>

                <div className="relative z-10 pt-3 border-t border-stone-800/80 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`px-2 py-0.5 rounded font-mono font-bold text-[11px] ${
                        count === 100
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : count > 100
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      }`}
                    >
                      {count} / 100 kart
                    </span>
                  </div>

                  <span className="font-mono font-bold text-amber-300">
                    {formatCurrency(deckVal, settings.currency)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

