import { PageHeader } from './ui/PageHeader';
import { computeDeckValue } from './deck-builder/useDeckStats';
import React, { useState } from 'react';
import { DeckItem, AppSettings } from '../types';
import { getCardPrice, formatCurrency } from '../utils/formatters';
import { exportDeckToTxt, downloadTxtFile } from '../utils/textCardList';
import { Swords, Plus, Crown, Trash2, Download, Copy, Check, Upload, FileText, Pencil } from 'lucide-react';

interface DeckListProps {
  decks: DeckItem[];
  settings: AppSettings;
  onSelectDeck: (deck: DeckItem) => void;
  onCreateDeckClick: () => void;
  onDeleteDeck: (deckId: string) => void;
  onEditDeck?: (deck: DeckItem) => void;
  onOpenImportDeck?: () => void;
  showToast?: (message: string) => void;
}

export const DeckList: React.FC<DeckListProps> = ({
  decks,
  settings,
  onSelectDeck,
  onCreateDeckClick,
  onDeleteDeck,
  onEditDeck,
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
      <PageHeader
        title="Talie"
        description="Talie Commander budowane z Twojej kolekcji. Import i eksport w formacie list Moxfield i Archidekt."
        actions={
          <>
            {onOpenImportDeck && (
              <button type="button" onClick={onOpenImportDeck} className="btn btn-secondary" title="Importuj talię z pliku .txt">
                <Upload className="w-4 h-4" />
                Importuj
              </button>
            )}
            <button type="button" onClick={onCreateDeckClick} className="btn btn-primary">
              <Plus className="w-4 h-4" strokeWidth={2.5} />
              Nowa talia
            </button>
          </>
        }
      />

      {/* Decks Grid */}
      {decks.length === 0 ? (
        <div className="bg-stone-900/60 border border-dashed border-stone-800 rounded-2xl p-12 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-950/50 border border-amber-800/40 text-amber-400 mx-auto flex items-center justify-center">
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
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold rounded-xl shadow-md cursor-pointer transition-all inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Utwórz nową talię</span>
            </button>

            {onOpenImportDeck && (
              <button
                onClick={onOpenImportDeck}
                className="px-4 py-2 bg-stone-800 hover:bg-stone-750 text-amber-300 border border-amber-500/40 text-xs font-bold rounded-xl shadow-md cursor-pointer transition-all inline-flex items-center gap-2"
              >
                <Upload className="w-4 h-4 text-amber-400" />
                <span>Importuj z pliku .txt</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
          {decks.map(deck => {
            const count = (deck.commander ? 1 : 0) + (deck.cards?.reduce((s, c) => s + c.quantity, 0) || 0);
            const deckVal = computeDeckValue(deck, settings);

            const art = deck.commander?.image_uris?.art_crop || deck.commander?.card_faces?.[0]?.image_uris?.art_crop || '';
            const iconBtn = 'w-8 h-8 rounded-md flex items-center justify-center text-stone-400 hover:text-stone-100 hover:bg-stone-800 cursor-pointer';
            return (
              <article
                key={deck.id}
                onClick={() => onSelectDeck(deck)}
                className="group bg-stone-900 border border-stone-800 hover:border-stone-700 rounded-xl overflow-hidden cursor-pointer flex flex-col"
              >
                <div className="relative h-28 bg-stone-800 overflow-hidden">
                  {art ? (
                    <img src={art} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover object-[center_30%] group-hover:scale-[1.03] transition-transform duration-500" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-stone-600">
                      <Crown className="w-6 h-6" />
                    </div>
                  )}
                  {deck.isPublic && (
                    <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[11px] font-medium bg-stone-950/80 text-emerald-300" title="Talia dostępna pod publicznym linkiem">
                      Publiczna
                    </span>
                  )}
                </div>

                <div className="p-4 flex-1 flex flex-col gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-stone-50 truncate">{deck.name}</h3>
                    <p className="text-sm text-stone-400 truncate">
                      {deck.commander ? deck.commander.name : 'Bez dowódcy'}
                    </p>
                    {deck.description && <p className="mt-1.5 text-sm text-stone-500 line-clamp-2">{deck.description}</p>}
                  </div>

                  <div className="mt-auto flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 text-sm tabular-nums">
                      <span
                        className={count === 100 ? 'text-emerald-400' : count > 100 ? 'text-rose-400' : 'text-stone-300'}
                        title={`${deck.format || 'EDH Commander'}: ${count} ze 100 kart`}
                      >
                        {count}/100
                      </span>
                      <span className="text-stone-300">{formatCurrency(deckVal, settings.currency)}</span>
                    </div>
                    <div className="flex items-center -mr-1.5" onClick={(e) => e.stopPropagation()}>
                      <button type="button" onClick={(e) => handleExportDeckFile(e, deck)} className={iconBtn} title="Pobierz listę .txt" aria-label="Pobierz listę .txt">
                        <Download className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={(e) => handleCopyDeckList(e, deck)} className={iconBtn} title="Kopiuj listę do schowka" aria-label="Kopiuj listę do schowka">
                        {copiedDeckId === deck.id ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                      {onEditDeck && (
                        <button type="button" onClick={() => onEditDeck(deck)} className={iconBtn} title="Edytuj nazwę, opis i dowódcę" aria-label="Edytuj talię">
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onDeleteDeck(deck.id)}
                        className={`${iconBtn} hover:text-rose-400`}
                        title="Usuń talię"
                        aria-label="Usuń talię"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

