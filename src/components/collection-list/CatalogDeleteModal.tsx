import React from 'react';
import { Trash2 } from 'lucide-react';
import { CatalogDeleteModalProps } from './types';

import { useBackToClose } from '../../hooks/useBackButton';
export const CatalogDeleteModal: React.FC<CatalogDeleteModalProps> = ({
  catalogToDelete,
  cardCount,
  nextDefaultCatalogName,
  onClose,
  onConfirmDelete,
}) => {
  // „Wstecz” na telefonie zamyka to okno zamiast opuszczać stronę
  useBackToClose(true, onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-md w-full p-6 text-stone-100 space-y-4 shadow-2xl max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none max-sm:rounded-t-3xl max-sm:max-h-[92dvh] max-sm:pb-[env(safe-area-inset-bottom)] max-sm:animate-[slideUp_.2s_ease-out] max-sm:mt-auto max-sm:mb-0 max-sm:overflow-y-auto">
        <h3 className="text-base font-bold text-rose-400 flex items-center gap-2">
          <Trash2 className="w-5 h-5" />
          <span>Usunąć katalog "{catalogToDelete.name}"?</span>
        </h3>

        <div className="space-y-2 text-xs text-stone-300 leading-relaxed">
          <p>
            Karty przypisane do tego katalogu (<strong>{cardCount} pozycji</strong>){' '}
            <strong>NIE zostaną usunięte</strong>. Zostaną automatycznie przeniesione do katalogu:{' '}
            <span className="text-amber-300 font-bold ml-1">"{nextDefaultCatalogName}"</span>.
          </p>
          {catalogToDelete.isDefault && (
            <p className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200">
              ⭐ Ten katalog jest obecnie <strong>domyślny</strong>. Po jego usunięciu katalog{' '}
              <strong>"{nextDefaultCatalogName}"</strong> zostanie automatycznie nowym katalogiem domyślnym.
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-800">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 bg-stone-800 text-stone-300 rounded-xl text-xs font-semibold hover:bg-stone-700 cursor-pointer"
          >
            Anuluj
          </button>
          <button
            type="button"
            onClick={onConfirmDelete}
            className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow cursor-pointer transition-colors"
          >
            Tak, usuń katalog
          </button>
        </div>
      </div>
    </div>
  );
};
