import React from 'react';
import { User, Layers, ShieldCheck } from 'lucide-react';
import { ScryfallCard } from '../../types';
import { getRarityColor, getRarityLabel, getCardEdhrecRank } from '../../utils/formatters';
import { EdhrecBadge } from '../EdhrecBadge';
import { CardInfoSummaryProps } from './types';
import { useT } from '../../i18n';
import { gameOfCard, isMtgCard } from '../../utils/cardSource';

const RECOGNIZED_FORMATS = ['commander', 'modern', 'standard', 'pioneer', 'legacy', 'pauper', 'vintage'];
/** Disney Lorcana: format Core Constructed; Pokémon: Standard i Expanded. */
const LORCANA_FORMATS = ['core'];
const POKEMON_FORMATS = ['standard', 'expanded'];

export const CardInfoSummary: React.FC<CardInfoSummaryProps> = ({
  activeCard,
  typeLine,
  oracleText,
  printsCount,
  onOpenPrintsTab,
}) => {
  const t = useT();
  const isMtg = isMtgCard(activeCard);
  const game = gameOfCard(activeCard);
  // Disney Lorcana: koszt, atrament i statystyki postaci; Pokémon: HP i etap
  const lorcanaStats = game === 'pokemon'
    ? [
        { label: 'HP', value: activeCard.hp },
        { label: t('Etap'), value: activeCard.stage }
      ].filter((s) => s.value !== null && s.value !== undefined && s.value !== '')
    : isMtg
    ? []
    : [
        { label: t('Koszt'), value: activeCard.cmc },
        { label: t('Atrament'), value: activeCard.ink || null },
        { label: t('Siła'), value: activeCard.strength },
        { label: t('Wytrzymałość'), value: activeCard.willpower },
        { label: 'Lore', value: activeCard.lore },
        { label: t('Ruch'), value: activeCard.move_cost }
      ].filter((s) => s.value !== null && s.value !== undefined && s.value !== '');
  return (
    <div>
      {/* Active Set, Rarity & Artist */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="tabular-nums text-xs font-bold bg-amber-500/10 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30">
          {activeCard.set_name} ({activeCard.set.toUpperCase()}) #{activeCard.collector_number}
        </span>
        {activeCard.rarity && (
          <span className={`text-xs px-2 py-0.5 rounded border font-semibold ${getRarityColor(activeCard.rarity)}`}>
            {getRarityLabel(activeCard.rarity)}
          </span>
        )}
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

      {lorcanaStats.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {lorcanaStats.map((s) => (
            <span key={s.label} className="text-[11px] px-2 py-0.5 rounded border border-stone-800 bg-stone-950 text-stone-300 tabular-nums">
              <span className="text-stone-500">{s.label}:</span> <span className="font-semibold text-stone-100">{s.value}</span>
            </span>
          ))}
          {activeCard.inkwell && (
            <span className="text-[11px] px-2 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-300">{t('Można włożyć do inkwell')}</span>
          )}
        </div>
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
              {t('Wydanie:')} <span className="text-amber-300">[{activeCard.set.toUpperCase()}] #{activeCard.collector_number}</span>
            </p>
            <p className="text-[11px] text-stone-400">
              {t('Dostępnych {n} różnych wydań i grafik', { n: printsCount })}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenPrintsTab}
          className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-amber-300 rounded-lg text-xs font-bold border border-amber-500/30 transition-colors cursor-pointer shrink-0"
        >
          {t('Zmień wersję printu')}
        </button>
      </div>

      {/* Format Legalities */}
      {activeCard.legalities && (
        <div className="mt-4">
          <p className="text-[11px] font-semibold text-stone-400 tabular-nums mb-1.5 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-stone-400" />
            <span>{t('Formaty i Legalność')}</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(isMtg ? RECOGNIZED_FORMATS : game === 'pokemon' ? POKEMON_FORMATS : LORCANA_FORMATS).map((format) => {
              const legality = activeCard.legalities?.[format];
              if (!legality) return null;
              const isLegal = legality === 'legal';
              return (
                <span
                  key={format}
                  className={`text-[11px] px-2 py-0.5 rounded-full capitalize tabular-nums border ${
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
