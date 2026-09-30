import React from 'react';
import { Trophy } from 'lucide-react';

interface EdhrecBadgeProps {
  rank: number | null | undefined;
  className?: string;
  size?: 'sm' | 'md' | 'xs';
}

export const EdhrecBadge: React.FC<EdhrecBadgeProps> = ({ rank, className = '', size = 'sm' }) => {
  if (rank === null || rank === undefined) return null;
  const numRank = typeof rank === 'number' ? rank : parseInt(String(rank), 10);
  if (isNaN(numRank) || numRank <= 0) return null;

  const sizeClasses = {
    xs: 'text-[8px] px-1.5 py-0.5 gap-0.5',
    sm: 'text-[9px] px-2 py-0.5 gap-1',
    md: 'text-[10px] px-2.5 py-0.5 gap-1'
  }[size];

  const iconSizes = {
    xs: 'w-2 h-2',
    sm: 'w-2.5 h-2.5',
    md: 'w-3 h-3'
  }[size];

  return (
    <div
      title={`Pozycja w rankingu EDHREC: #${numRank.toLocaleString()} (popularność w formacie Commander)`}
      className={`bg-gradient-to-r from-amber-500 via-purple-500 to-blue-500 text-stone-950 font-extrabold rounded shadow-md flex items-center uppercase tracking-wider border border-white/20 select-none ${sizeClasses} ${className}`}
    >
      <Trophy className={`${iconSizes} fill-stone-950 stroke-[1.5] shrink-0`} />
      <span className="font-mono leading-none">EDH #{numRank.toLocaleString()}</span>
    </div>
  );
};
