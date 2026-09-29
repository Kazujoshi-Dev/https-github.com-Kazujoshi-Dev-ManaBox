import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { CardNoticeBannerProps } from './types';

export const CardNoticeBanner: React.FC<CardNoticeBannerProps> = ({ notice }) => {
  if (!notice) return null;

  return (
    <div className="bg-emerald-950/80 border-b border-emerald-600/40 px-6 py-2 text-xs font-semibold text-emerald-300 flex items-center gap-2 shrink-0 animate-fadeIn">
      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
      <span>{notice}</span>
    </div>
  );
};
