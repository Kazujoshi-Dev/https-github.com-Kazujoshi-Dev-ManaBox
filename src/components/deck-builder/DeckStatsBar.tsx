import React from 'react';
import { DeckStatsBarProps } from './types';
import { COLOR_IDENTITY_STYLE_MAP } from './constants';

export const DeckStatsBar: React.FC<DeckStatsBarProps> = ({
  manaCurve,
  colorIdentity,
}) => {
  const maxVal = Math.max(...manaCurve, 1);

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 shadow-lg flex flex-col md:flex-row items-center justify-between gap-4 text-xs">
      {/* Mana Curve Bars */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-bold text-stone-400 tabular-nums mr-2">
          Krzywa Many (CMC):
        </span>
        {manaCurve.map((count, cmc) => {
          const heightPercent = Math.min(100, Math.max(15, (count / maxVal) * 100));
          return (
            <div key={cmc} className="flex flex-col items-center gap-1">
              <div className="w-6 h-10 bg-stone-950 rounded flex items-end justify-center p-0.5 border border-stone-800">
                <div
                  style={{ height: `${heightPercent}%` }}
                  className="w-full bg-amber-600 rounded-sm transition-all"
                />
              </div>
              <span className="text-[11px] tabular-nums text-stone-400">
                {cmc === 6 ? '6+' : cmc} ({count})
              </span>
            </div>
          );
        })}
      </div>

      {/* Color Identity Dots */}
      {colorIdentity.length > 0 && (
        <div className="flex items-center gap-2 bg-stone-950 px-3 py-1.5 rounded-xl border border-stone-800">
          <span className="text-stone-400 font-bold">Tożsamość kolorów:</span>
          <div className="flex items-center gap-1.5">
            {colorIdentity.map(col => (
              <span
                key={col}
                className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[11px] border shadow-sm ${
                  COLOR_IDENTITY_STYLE_MAP[col] || 'bg-stone-700 text-white'
                }`}
              >
                {col}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
