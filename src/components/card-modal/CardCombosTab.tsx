import React, { useState, useEffect } from 'react';
import { Sparkles, Zap, RefreshCw, AlertCircle, HelpCircle, ExternalLink, ShieldCheck } from 'lucide-react';
import { SpellbookVariant } from '../../types';
import { spellbookApi } from '../../services/api';

interface CardCombosTabProps {
  cardName: string;
}

export const CardCombosTab: React.FC<CardCombosTabProps> = ({ cardName }) => {
  const [combos, setCombos] = useState<SpellbookVariant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCombos = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await spellbookApi.getCardCombos(cardName);
      setCombos(res.results || []);
    } catch (err: any) {
      console.error('Błąd pobierania kombinacji karty:', err);
      setError(err.message || 'Nie udało się pobrać kombinacji dla tej karty.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCombos();
  }, [cardName]);

  return (
    <div className="space-y-4">
      {/* Top Bar info */}
      <div className="flex items-center justify-between bg-stone-950 p-4 rounded-xl border border-stone-800">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-stone-100 flex items-center gap-2">
              <span>Kombinacje z kartą {cardName}</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase">
                Commander Spellbook
              </span>
            </h3>
            <p className="text-xs text-stone-400">
              Znalezione oficjalne kombinacje i nieskończone pętle z udziałem tej karty.
            </p>
          </div>
        </div>

        <button
          onClick={fetchCombos}
          disabled={isLoading}
          className="p-2 bg-stone-900 hover:bg-stone-800 text-stone-300 rounded-xl border border-stone-700 transition-colors cursor-pointer disabled:opacity-50"
          title="Odśwież listę kombinacji"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-amber-400' : ''}`} />
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-3 text-rose-300 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="py-12 flex flex-col items-center justify-center space-y-3">
          <RefreshCw className="w-7 h-7 text-amber-400 animate-spin" />
          <p className="text-xs font-semibold text-stone-300">
            Szukanie kombinacji w bazie Commander Spellbook...
          </p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && combos.length === 0 && (
        <div className="py-12 text-center space-y-2 bg-stone-950/50 rounded-2xl border border-stone-800/60 p-6">
          <Sparkles className="w-8 h-8 text-stone-500 mx-auto" />
          <h4 className="text-sm font-bold text-stone-200">
            Brak znanych kombinacji dla {cardName}
          </h4>
          <p className="text-xs text-stone-400 max-w-md mx-auto">
            W bazie Commander Spellbook nie znaleziono jeszcze zarejestrowanego combo z tą konkretną kartą.
          </p>
        </div>
      )}

      {/* Combos list */}
      {!isLoading && (
        <div className="space-y-3">
          {combos.map((variant, idx) => (
            <div
              key={variant.id || idx}
              className="bg-stone-950 border border-stone-800 rounded-xl p-4 hover:border-stone-700 transition-all space-y-3"
            >
              {/* Variant outcome pills */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-stone-800/80">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    ID: {variant.id}
                  </span>
                  {variant.produces?.map((p, pIdx) => (
                    <span
                      key={pIdx}
                      className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-500/20 text-purple-200 border border-purple-500/30 flex items-center gap-1"
                    >
                      <Zap className="w-3 h-3 text-amber-400" />
                      <span>{p.feature?.name}</span>
                    </span>
                  ))}
                </div>

                {variant.manaNeeded && (
                  <div className="flex items-center gap-1.5 text-xs text-stone-300">
                    <span className="text-stone-400 font-mono text-[11px]">Wymagana mana:</span>
                    <span className="font-bold text-amber-300 bg-stone-900 px-2 py-0.5 rounded border border-stone-700">
                      {variant.manaNeeded}
                    </span>
                  </div>
                )}
              </div>

              {/* Cards in combo */}
              <div>
                <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block mb-1.5">
                  Pozostałe karty w combo:
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  {variant.uses?.map((u, uIdx) => {
                    const isCurrentCard = u.card?.name?.toLowerCase() === cardName.toLowerCase();
                    return (
                      <div
                        key={uIdx}
                        className={`px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1.5 ${
                          isCurrentCard
                            ? 'bg-amber-500/20 text-amber-200 border-amber-500/50 font-bold'
                            : 'bg-stone-900 text-stone-200 border-stone-800'
                        }`}
                      >
                        <ShieldCheck className={`w-3.5 h-3.5 ${isCurrentCard ? 'text-amber-400' : 'text-stone-400'}`} />
                        <span>{u.card?.name}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Description */}
              {variant.description && (
                <div className="bg-stone-900/60 rounded-lg p-2.5 border border-stone-800/80 text-xs text-stone-300">
                  <p className="whitespace-pre-line leading-relaxed font-sans">
                    {variant.description}
                  </p>
                </div>
              )}

              {/* Prerequisites */}
              {(variant.easyPrerequisites || variant.notablePrerequisites) && (
                <div className="text-[11px] text-stone-400 bg-stone-900/30 p-2 rounded-lg border border-stone-800 flex items-start gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-stone-300">Wymagania: </span>
                    <span>{variant.easyPrerequisites || variant.notablePrerequisites}</span>
                  </div>
                </div>
              )}

              {/* Spellbook link */}
              <div className="flex justify-end text-[11px] text-stone-500 pt-1">
                <a
                  href={`https://commanderspellbook.com/combo/${variant.id}/`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-amber-400/80 hover:text-amber-300 transition-colors"
                >
                  <span>Szczegóły w Commander Spellbook</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CardCombosTab;
