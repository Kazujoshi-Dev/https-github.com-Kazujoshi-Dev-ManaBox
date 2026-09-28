import React from 'react';

interface ManaSymbolProps {
  cost?: string; // e.g. "{2}{W}{U}" or "{R}"
  size?: 'sm' | 'md' | 'lg';
}

export const ManaSymbol: React.FC<ManaSymbolProps> = ({ cost, size = 'md' }) => {
  if (!cost) return null;

  // Extract symbols inside brackets like {1}, {W}, {U/B}, {T}
  const symbolRegex = /\{([^}]+)\}/g;
  const symbols: string[] = [];
  let match;
  while ((match = symbolRegex.exec(cost)) !== null) {
    symbols.push(match[1]);
  }

  if (symbols.length === 0 && cost) {
    // If string does not use brackets, split single characters if simple
    return <span className="font-mono text-xs font-bold text-amber-300">{cost}</span>;
  }

  const sizeClasses = {
    sm: 'w-4 h-4 text-[10px]',
    md: 'w-5 h-5 text-xs',
    lg: 'w-6 h-6 text-sm',
  }[size];

  const getSymbolBg = (sym: string) => {
    switch (sym.toUpperCase()) {
      case 'W': return 'bg-amber-100 text-stone-900 border-amber-300 shadow-sm';
      case 'U': return 'bg-blue-600 text-white border-blue-400';
      case 'B': return 'bg-stone-800 text-stone-200 border-stone-600';
      case 'R': return 'bg-red-600 text-white border-red-400';
      case 'G': return 'bg-emerald-600 text-white border-emerald-400';
      case 'C': return 'bg-stone-400 text-stone-900 border-stone-300';
      case 'T': return 'bg-stone-600 text-white border-stone-400';
      case 'X': return 'bg-stone-700 text-stone-200 border-stone-500';
      default: return 'bg-stone-700 text-amber-200 border-stone-500';
    }
  };

  return (
    <div className="inline-flex items-center gap-0.5 flex-wrap">
      {symbols.map((sym, idx) => (
        <span
          key={idx}
          className={`${sizeClasses} ${getSymbolBg(
            sym
          )} inline-flex items-center justify-center rounded-full font-bold font-mono border shadow-xs select-none`}
          title={`Mana: ${sym}`}
        >
          {sym}
        </span>
      ))}
    </div>
  );
};
