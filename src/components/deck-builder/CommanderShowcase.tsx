import React from 'react';
import { Crown, X } from 'lucide-react';
import { CommanderShowcaseProps } from './types';

export const CommanderShowcase: React.FC<CommanderShowcaseProps> = ({
  commander,
  commanderIsFoil,
  onViewDetails,
  onRemoveCommander,
  onOpenSearch,
}) => {
  if (commander) {
    return (
      <div className={`mt-5 p-4 rounded-xl bg-gradient-to-r from-amber-950/30 via-stone-950 to-purple-950/20 border flex flex-col sm:flex-row items-center justify-between gap-4 ${
        commanderIsFoil ? 'border-amber-400/60 shadow-lg shadow-amber-500/10' : 'border-amber-500/30'
      }`}>
        <div className="flex items-center gap-3.5">
          <div className={`relative w-16 h-20 rounded-lg overflow-hidden border-2 shadow-md shrink-0 ${
            commanderIsFoil ? 'border-amber-300 ring-2 ring-amber-400/40' : 'border-amber-400'
          }`}>
            <img
              src={commander.image_uris?.art_crop || commander.image_uris?.normal}
              alt={commander.name}
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500 text-stone-950">
                👑 Dowódca Talii
              </span>
              {commanderIsFoil && (
                <span className="text-[9px] uppercase font-mono font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500/30 to-purple-500/30 text-amber-300 border border-amber-400/50">
                  ✨ FOIL
                </span>
              )}
              <span className="text-xs font-mono text-amber-300 font-bold">
                {commander.mana_cost}
              </span>
            </div>
            <h3 className="text-base font-bold text-white mt-0.5">
              {commander.name}
            </h3>
            <p className="text-xs text-stone-400">
              {commander.type_line}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onViewDetails(commander)}
            className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Szczegóły karty
          </button>
          <button
            onClick={onRemoveCommander}
            className="p-1.5 text-stone-400 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition-colors cursor-pointer"
            title="Usuń dowódcę"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-5 p-4 rounded-xl bg-stone-950/60 border border-dashed border-amber-500/30 flex flex-col sm:flex-row items-center justify-between gap-4">
      <div className="flex items-center gap-3.5">
        <div className="w-12 h-16 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-xl shrink-0">
          👑
        </div>
        <div>
          <span className="text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded-full bg-stone-800 text-stone-400">
            Brak wybranego dowódcy
          </span>
          <h3 className="text-sm font-bold text-stone-200 mt-1">
            Wybierz dowódcę dla tej talii EDH
          </h3>
          <p className="text-xs text-stone-400">
            Wybierz legendarnego stwora, który poprowadzi Twoją talię i wyznaczy tożsamość kolorów.
          </p>
        </div>
      </div>
      <button
        onClick={onOpenSearch}
        className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-bold text-xs rounded-xl shadow-md flex items-center gap-2 transition-all cursor-pointer shrink-0"
      >
        <Crown className="w-4 h-4" />
        <span>Wybierz Dowódcę</span>
      </button>
    </div>
  );
};
