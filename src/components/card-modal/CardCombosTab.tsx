import React, { useState, useEffect } from 'react';
import { Sparkles, Zap, RefreshCw, AlertCircle, HelpCircle, ExternalLink, ShieldCheck, Layers } from 'lucide-react';
import { SpellbookVariant } from '../../types';
import { spellbookApi } from '../../services/api';

interface CardCombosTabProps {
  cardName: string;
}

const parseComboSteps = (description: string): string[] => {
  if (!description) return [];

  const rawLines = description
    .split(/\r?\n+/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  let steps: string[] = [];

  if (rawLines.length > 1) {
    steps = rawLines;
  } else if (rawLines.length === 1) {
    const parts = rawLines[0].split(/(?=\d+[\.\)]\s+)/);
    if (parts.length > 1) {
      steps = parts.map(p => p.trim()).filter(Boolean);
    } else {
      steps = rawLines;
    }
  }

  return steps
    .map(step => step.replace(/^(\d+[\.\)]\s*|step\s*\d+:\s*|krok\s*\d+:\s*)/i, '').trim())
    .filter(step => step.length > 0);
};

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
          <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-stone-100 flex items-center gap-2">
              <span>Kombinacje z kartą {cardName}</span>
              <span className="text-[11px] tabular-nums px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                Commander Spellbook
              </span>
            </h3>
            <p className="text-xs text-stone-400">
              Znalezione oficjalne kombinacje i nieskończone pętle z udziałem tej karty ({combos.length}).
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
        <div className="py-14 flex flex-col items-center justify-center space-y-3">
          <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
          <p className="text-xs font-semibold text-stone-300">
            Szukanie kombinacji w bazie Commander Spellbook...
          </p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && combos.length === 0 && (
        <div className="py-14 text-center space-y-2 bg-stone-950/50 rounded-2xl border border-stone-800/60 p-6">
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
        <div className="space-y-4">
          {combos.map((variant, idx) => {
            const steps = parseComboSteps(variant.description);

            return (
              <div
                key={variant.id || idx}
                className="bg-stone-950 border border-stone-800 rounded-2xl p-5 hover:border-stone-700 transition-all space-y-4 shadow-lg"
              >
                {/* Variant outcome pills */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-stone-800">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-lg text-xs tabular-nums font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      ID: {variant.id}
                    </span>
                    {variant.produces?.map((p, pIdx) => (
                      <span
                        key={pIdx}
                        className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-200 border border-amber-500/30 flex items-center gap-1.5"
                      >
                        <Zap className="w-3.5 h-3.5 text-amber-400" />
                        <span>{p.feature?.name}</span>
                      </span>
                    ))}
                  </div>

                  {variant.manaNeeded && (
                    <div className="flex items-center gap-2 text-xs text-stone-300">
                      <span className="text-stone-400 tabular-nums">Wymagana mana:</span>
                      <span className="font-bold text-amber-300 bg-stone-900 px-2.5 py-1 rounded-lg border border-stone-700 tabular-nums text-sm">
                        {variant.manaNeeded}
                      </span>
                    </div>
                  )}
                </div>

                {/* Cards in combo with thumbnail */}
                <div>
                  <span className="text-xs font-bold text-stone-400 block mb-2 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-amber-400" />
                    <span>Wymagane karty w tym combo:</span>
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                    {variant.uses?.map((u, uIdx) => {
                      const isCurrentCard = u.card?.name?.toLowerCase() === cardName.toLowerCase();
                      const cName = u.card?.name || '';
                      const img = u.card?.imageUriFrontSmall || u.card?.imageUriFrontNormal || u.card?.imageUriFrontArtCrop || `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cName)}&format=image&version=small`;

                      return (
                        <div
                          key={uIdx}
                          className={`p-2.5 rounded-xl border flex items-center gap-2.5 ${
                            isCurrentCard
                              ? 'bg-amber-500/15 text-amber-200 border-amber-500/50 shadow-sm'
                              : 'bg-stone-900/80 text-stone-200 border-stone-800'
                          }`}
                        >
                          <div className="w-10 h-14 rounded-md overflow-hidden bg-stone-950 shrink-0 border border-stone-700/60 shadow">
                            <img
                              src={img}
                              alt={cName}
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                const target = e.currentTarget;
                                if (!target.dataset.tried) {
                                  target.dataset.tried = 'true';
                                  target.src = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cName)}&format=image&version=small`;
                                }
                              }}
                            />
                          </div>

                          <div className="min-w-0">
                            <div className="text-xs font-bold truncate flex items-center gap-1">
                              {isCurrentCard && <ShieldCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                              <span className="truncate">{cName}</span>
                            </div>
                            <span className="text-[11px] text-stone-400 block truncate">
                              Strefa: {u.zoneLocations?.join(', ') || 'Pole bitwy'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Execution Steps - Numbered 1. 2. 3. */}
                {steps.length > 0 && (
                  <div className="bg-stone-900/90 rounded-xl p-3.5 border border-stone-800 space-y-2">
                    <span className="text-xs font-bold text-amber-300 block tabular-nums">
                      Kroki wykonania (Instrukcja combo):
                    </span>
                    <div className="space-y-1.5">
                      {steps.map((step, sIdx) => (
                        <div key={sIdx} className="flex items-start gap-2.5 p-2 rounded-lg bg-stone-950/70 border border-stone-800/80">
                          <span className="w-5 h-5 rounded bg-amber-500/20 text-amber-300 tabular-nums font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 border border-amber-500/40">
                            {sIdx + 1}
                          </span>
                          <p className="text-xs text-stone-200 leading-relaxed font-medium">
                            {step}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Prerequisites */}
                {(variant.easyPrerequisites || variant.notablePrerequisites) && (
                  <div className="text-xs text-stone-400 bg-stone-900/40 p-2.5 rounded-xl border border-stone-800 flex items-start gap-2">
                    <HelpCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-stone-200">Wymagania: </span>
                      <span>{variant.easyPrerequisites || variant.notablePrerequisites}</span>
                    </div>
                  </div>
                )}

                {/* Spellbook link */}
                <div className="flex justify-end text-xs text-stone-500 pt-1">
                  <a
                    href={`https://commanderspellbook.com/combo/${variant.id}/`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-amber-400/90 hover:text-amber-300 font-medium transition-colors"
                  >
                    <span>Szczegóły w Commander Spellbook</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CardCombosTab;
