import React from 'react';
import { User, Layers, ShieldCheck } from 'lucide-react';
import { ScryfallCard } from '../../types';
import { getRarityColor, getRarityLabel, getCardEdhrecRank } from '../../utils/formatters';
import { EdhrecBadge } from '../EdhrecBadge';
import { CardInfoSummaryProps } from './types';

const RECOGNIZED_FORMATS = ['commander', 'modern', 'standard', 'pioneer', 'legacy', 'pauper', 'vintage'];

export const CardInfoSummary: React.FC<CardInfoSummaryProps> = ({
  activeCard,
  typeLine,
  oracleText,
  printsCount,
  onOpenPrintsTab,
}) => {
  return (
    <div>
      {/* Active Set, Rarity & Artist */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="uppercase font-mono text-xs font-bold bg-amber-500/10 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30">
          {activeCard.set_name} ({activeCard.set.toUpperCase()}) #{activeCard.collector_number}
        </span>
        <span className={`text-xs px-2 py-0.5 rounded border font-semibold ${getRarityColor(activeCard.rarity)}`}>
          {getRarityLabel(activeCard.rarity)}
        </span>
        {getCardEdhrecRank(activeCard) != null && (
          <EdhrecBadge rank={getCardEdhrecRank(activeCard)} size="md" />
        )}
        {activeCard.artist && (
          <span className="text-xs text-stone-400 flex items-center gap-1 bg-stone-950 px-2 py-0.5 rounded border border-stone-800">
            <User className="w-3 h-3 text-stone-500" />
            <span>{activeCard.artist}</span>
          </span>
        )}
      </div>

      {typeLine && (
        <p className="text-xs text-stone-400 mt-2">{typeLine}</p>
      )}

      {/* Oracle Text */}
      {oracleText && (
        <div className="mt-3 p-3.5 bg-stone-950/90 rounded-xl border border-stone-800/90 text-stone-300 text-xs leading-relaxed whitespace-pre-wrap font-serif">
          {oracleText}
        </div>
      )}

      {/* Print Quick Switch bar */}
      <div className="mt-4 p-3 bg-stone-950/60 rounded-xl border border-stone-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs">
          <Layers className="w-4 h-4 text-amber-400 shrink-0" />
          <div>
            <p className="font-bold text-stone-200">
              Wydanie: <span className="text-amber-300">[{activeCard.set.toUpperCase()}] #{activeCard.collector_number}</span>
            </p>
            <p className="text-[11px] text-stone-400">
              Dostępnych {printsCount} różnych wydań i grafik
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenPrintsTab}
          className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-amber-300 rounded-lg text-xs font-bold border border-amber-500/30 transition-colors cursor-pointer shrink-0"
        >
          Zmień wersję printu
        </button>
      </div>

      {/* Format Legalities */}
      {activeCard.legalities && (
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase text-stone-400 font-mono mb-1.5 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-stone-400" />
            <span>Formaty i Legalność</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {RECOGNIZED_FORMATS.map((format) => {
              const legality = activeCard.legalities?.[format];
              if (!legality) return null;
              const isLegal = legality === 'legal';
              return (
                <span
                  key={format}
                  className={`text-[10px] px-2 py-0.5 rounded-full capitalize font-mono border ${
                    isLegal
                      ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60'
                      : 'bg-stone-900 text-stone-500 border-stone-800 line-through'
                  }`}
                >
                  {format}: {isLegal ? 'legalna' : legality}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
