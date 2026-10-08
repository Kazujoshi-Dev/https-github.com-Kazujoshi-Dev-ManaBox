import React from 'react';
import { RefreshCw } from 'lucide-react';

interface UpdateBannerProps {
  onReload: () => void;
}

/** Dyskretna informacja o nowej wersji, gdy użytkownik długo nie zmienia zakładki. */
export const UpdateBanner: React.FC<UpdateBannerProps> = ({ onReload }) => (
  <div
    role="status"
    aria-live="polite"
    className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] inset-x-4 md:inset-x-auto md:bottom-6 md:left-6 z-50 bg-stone-900 border border-amber-500/40 text-stone-100 pl-4 pr-2 py-2 rounded-xl shadow-2xl flex items-center gap-3 text-xs font-semibold"
  >
    <RefreshCw className="w-4 h-4 text-amber-400 shrink-0" />
    <span className="flex-1">Dostępna nowa wersja aplikacji</span>
    <button type="button" className="btn btn-primary" onClick={onReload}>
      Odśwież
    </button>
  </div>
);
