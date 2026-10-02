import React from 'react';
import { Sparkles } from 'lucide-react';

interface ToastProps {
  message: string | null;
}

export const Toast: React.FC<ToastProps> = ({ message }) => {
  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] inset-x-4 md:inset-x-auto md:bottom-6 md:right-6 z-50 bg-stone-900 border border-amber-500/50 text-stone-100 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 text-xs font-semibold animate-bounce"
    >
      <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
      <span>{message}</span>
    </div>
  );
};
