import React, { useEffect, useRef, useState } from 'react';
import { Layers, Search, Loader2, Check, Sparkles, Plus } from 'lucide-react';
import { ScryfallCard } from '../../types';
import { formatCurrency, getCardImageUri, getCardPrice, getRarityColor, getRarityLabel, handleCardImageError, langFromCard } from '../../utils/formatters';
import { CardPrintsTabProps } from './types';
import { useT, binderName, MAIN_BINDER } from '../../i18n';

export const CardPrintsTab: React.FC<CardPrintsTabProps> = ({
  cardName,
  printsFilter,
  isLoading,
  filteredPrints,
  activeCardId,
  settings,
  isExistingItem,
  onFilterChange,
  onSelectPrint,
  onSwitchToDetails,
  defaultBinderName = MAIN_BINDER,
  onQuickAddToCollection,
}) => {
  const t = useT();
  // Stan przycisku „Dodaj do kolekcji” per wydanie: w trakcie zapisu / chwilowe potwierdzenie
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedId, setAddedId] = useState<string | null>(null);
  const addedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (addedTimerRef.current) clearTimeout(addedTimerRef.current);
  }, []);

  const handleQuickAdd = async (print: ScryfallCard) => {
    if (!onQuickAddToCollection || addingId) return;
    setAddingId(print.id);
    try {
      const result = await onQuickAddToCollection(print);
      if (result !== null) {
        setAddedId(print.id);
        if (addedTimerRef.current) clearTimeout(addedTimerRef.current);
        addedTimerRef.current = setTimeout(() => setAddedId(null), 2000);
      }
    } finally {
      setAddingId(null);
    }
  };

  return (
    <div className="space-y-4 bg-stone-950/80 p-5 rounded-2xl border border-stone-800">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-amber-300 flex items-center gap-2">
            <Layers className="w-4 h-4 text-amber-400" />
            <span>{t('Wybierz wersję / rodzaj printu dla:')} {cardName}</span>
          </h3>
          <p className="text-xs text-stone-400 mt-0.5">
            {t('Kliknij wybraną wersję poniżej, aby przełączyć podgląd, zaktualizować wycenę i zapisać ten konkretny egzemplarz.')}
          </p>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-500" />
          <input
            type="text"
            placeholder={t('Filtruj wg setu lub numeru...')}
            value={printsFilter}
            onChange={(e) => onFilterChange(e.target.value)}
            className="w-full bg-stone-900 border border-stone-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-stone-200 placeholder-stone-500 focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
          <p className="text-xs text-stone-400">{t('Pobieranie wszystkich wydań ze Scryfall API...')}</p>
        </div>
      ) : filteredPrints.length === 0 ? (
        <div className="py-8 text-center text-xs text-stone-500">
          {t('Nie znaleziono wydań spełniających filtr "{filter}".', { filter: printsFilter })}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 max-h-[500px] overflow-y-auto pr-1">
          {filteredPrints.map((p) => {
            const isSelected = p.id === activeCardId;
            const pNormPln = getCardPrice(p, false, { ...settings, currency: 'PLN' });
            const pFoilPln = getCardPrice(p, true, { ...settings, currency: 'PLN' });
            const pThumb = getCardImageUri(p, 'small');

            return (
              <div
                key={p.id}
                onClick={() => onSelectPrint(p)}
                className={`relative rounded-xl p-3 border transition-all cursor-pointer flex gap-3 ${
                  isSelected
                    ? 'bg-amber-500/10 border-amber-500 ring-2 ring-amber-500/40 shadow-lg'
                    : 'bg-stone-900 hover:bg-stone-850 border-stone-800 hover:border-stone-700'
                }`}
              >
                {/* Print Thumbnail */}
                <div className="relative shrink-0 w-16 h-22 rounded overflow-hidden bg-stone-950 border border-stone-800 shadow">
                  <img
                    src={pThumb}
                    alt={p.name}
                    referrerPolicy="no-referrer"
                    onError={(e) => handleCardImageError(e, pThumb)}
                    className="w-full h-full object-contain"
                  />
                  {isSelected && (
                    <div className="absolute top-1 right-1 bg-amber-500 text-stone-950 rounded-full p-0.5">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                  )}
                </div>

                {/* Print Details */}
                <div className="flex-1 min-w-0 flex flex-col justify-between text-xs">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="tabular-nums font-bold text-[11px] bg-stone-800 text-stone-200 px-1.5 py-0.5 rounded border border-stone-700">
                        {p.set.toUpperCase()}
                      </span>
                      <span className="tabular-nums text-[11px] text-stone-400">
                        #{p.collector_number}
                      </span>
                      <span className={`text-[11px] px-1 rounded border font-semibold ${getRarityColor(p.rarity)}`}>
                        {getRarityLabel(p.rarity).slice(0, 3)}
                      </span>
                      {p.lang && p.lang !== 'en' && (
                        <span className="text-[11px] px-1 rounded bg-stone-700 text-stone-100 font-semibold" title={t('Wersja językowa')}>
                          {langFromCard(p)}
                        </span>
                      )}
                    </div>

                    <p className="font-bold text-stone-200 text-xs mt-1 truncate" title={p.set_name}>
                      {p.set_name}
                    </p>

                    <p className="text-[11px] text-stone-400">
                      {p.released_at ? p.released_at.slice(0, 4) : '—'} • {p.artist || t('Artist')}
                    </p>
                  </div>

                  {/* Prices in PLN */}
                  <div className="pt-1.5 border-t border-stone-800/80 flex items-center justify-between">
                    <span className="tabular-nums font-bold text-emerald-400 text-xs">
                      {formatCurrency(pNormPln, 'PLN')}
                    </span>
                    {pFoilPln > 0 && (
                      <span className="tabular-nums text-amber-300 text-[11px] flex items-center gap-0.5">
                        <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                        {formatCurrency(pFoilPln, 'PLN')}
                      </span>
                    )}
                  </div>

                  {/* Print Action / State Badge */}
                  <div className="pt-1.5 flex flex-wrap justify-end gap-1.5">
                    {isSelected ? (
                      <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1 bg-amber-500/20 px-2 py-0.5 rounded-md border border-amber-500/30">
                        <Check className="w-3 h-3 stroke-[3]" />
                        <span>{isExistingItem ? t('Zapisany print') : t('Wybrany print')}</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectPrint(p);
                        }}
                        className="text-[11px] font-bold text-stone-300 hover:text-stone-950 flex items-center gap-1 bg-stone-800 hover:bg-amber-400 px-2 py-0.5 rounded-md transition-colors cursor-pointer border border-stone-700 hover:border-amber-400"
                      >
                        <span>{isExistingItem ? t('Zmień i zapisz print') : t('Wybierz ten print')}</span>
                      </button>
                    )}
                    {onQuickAddToCollection && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleQuickAdd(p);
                        }}
                        disabled={addingId !== null}
                        title={t('Dodaj 1 szt. tego wydania (NM) do klasera „{name}”', { name: binderName(defaultBinderName) })}
                        className={`text-[11px] font-bold flex items-center gap-1 px-2 py-0.5 rounded-md transition-colors border disabled:cursor-wait ${
                          addedId === p.id
                            ? 'text-amber-300 bg-amber-500/20 border-amber-500/30'
                            : 'text-stone-300 hover:text-stone-950 bg-stone-800 hover:bg-amber-400 border-stone-700 hover:border-amber-400 cursor-pointer'
                        }`}
                      >
                        {addingId === p.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : addedId === p.id ? (
                          <Check className="w-3 h-3 stroke-[3]" />
                        ) : (
                          <Plus className="w-3 h-3 stroke-[3]" />
                        )}
                        <span>{addedId === p.id ? t('Dodano') : t('Dodaj do kolekcji')}</span>
                      </button>
                    )}
                  </div>
                </div>

                {isSelected && (
                  <div className="absolute -top-2 right-2 bg-amber-500 text-stone-950 text-[11px] font-bold px-2 py-0.5 rounded-full shadow flex items-center gap-1">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                    <span>{t('Aktywny')}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="pt-2 flex justify-end">
        <button
          type="button"
          onClick={onSwitchToDetails}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs rounded-xl shadow transition-colors cursor-pointer"
        >
          {t('Przejdź do zapisu karty →')}
        </button>
      </div>
    </div>
  );
};
