import React from 'react';
import { X, Layers, Sparkles } from 'lucide-react';
import { ManaSymbol } from '../ManaSymbol';
import { CardModalHeaderProps } from './types';

export const CardModalHeader: React.FC<CardModalHeaderProps> = ({
  cardName,
  manaCost,
  isPromo,
  activeTab,
  printsCount,
  isLoadingPrints,
  onSelectTab,
  onClose,
}) => {
  return (
    <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-stone-800 bg-stone-950/70 flex flex-wrap items-center justify-between gap-2 shrink-0">
      <div className="flex items-center gap-3 min-w-0 flex-1 basis-full sm:basis-auto order-1">
        <h2 className="text-xl sm:text-2xl font-black text-amber-100 tracking-tight flex items-center gap-2">
          <span>{cardName}</span>
          {isPromo && (
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40">
              Promo
            </span>
          )}
        </h2>
        <ManaSymbol cost={manaCost} size="md" />
      </div>

      <div className="flex items-center gap-2 order-2 ml-auto">
        {/* Combos Switcher Pill */}
        <button
          onClick={() => onSelectTab(activeTab === 'combos' ? 'details' : 'combos')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all cursor-pointer ${
            activeTab === 'combos'
              ? 'bg-purple-600 text-white border-purple-500 shadow-md'
              : 'bg-stone-900 hover:bg-stone-800 text-purple-300 border-purple-500/30'
          }`}
          title="Przeglądaj kombinacje Commander Spellbook dla tej karty"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Combo Spellbook</span>
        </button>

        {/* Prints Switcher Pill */}
        <button
          onClick={() => onSelectTab(activeTab === 'prints' ? 'details' : 'prints')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all cursor-pointer ${
            activeTab === 'prints'
              ? 'bg-amber-500 text-stone-950 border-amber-400 shadow-md'
              : 'bg-stone-900 hover:bg-stone-800 text-amber-400 border-amber-500/30'
          }`}
          title="Przełącz widok wydań karty"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Wersje ({isLoadingPrints ? '...' : printsCount})</span>
        </button>

        <button
          onClick={onClose}
          className="w-10 h-10 sm:w-auto sm:h-auto sm:p-1.5 flex items-center justify-center rounded-full bg-stone-900 hover:bg-stone-800 text-stone-400 hover:text-stone-100 border border-stone-800 transition-colors cursor-pointer"
          aria-label="Zamknij okno"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

