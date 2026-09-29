import React from 'react';
import { FolderPlus, X, Star, Trash2 } from 'lucide-react';
import { CatalogFormModalProps } from './types';
import { COLOR_MAP } from './constants';

export const CatalogFormModal: React.FC<CatalogFormModalProps> = ({
  isOpen,
  editingCatalog,
  name,
  description,
  color,
  isDefault,
  error,
  isSaving,
  canDelete,
  onNameChange,
  onDescriptionChange,
  onColorChange,
  onIsDefaultChange,
  onClose,
  onSubmit,
  onRequestDelete,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl p-6 text-stone-100 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-800 pb-3">
          <h3 className="text-base font-bold text-amber-300 flex items-center gap-2">
            <FolderPlus className="w-5 h-5 text-amber-400" />
            <span>{editingCatalog ? 'Edytuj katalog' : 'Utwórz nowy katalog'}</span>
          </h3>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-200 cursor-pointer"
            aria-label="Zamknij"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs font-semibold">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-xs uppercase font-bold text-stone-300 mb-1">
              Nazwa katalogu *
            </label>
            <input
              type="text"
              placeholder="np. Talia Commander Urza, Na Wymianę..."
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs uppercase font-bold text-stone-300 mb-1">
              Opis (opcjonalnie)
            </label>
            <input
              type="text"
              placeholder="np. Główne karty formatu Modern..."
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs uppercase font-bold text-stone-300 mb-1.5">
              Kolor etykiety
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {Object.keys(COLOR_MAP).map(col => {
                const isSelected = color === col;
                const style = COLOR_MAP[col];
                return (
                  <button
                    key={col}
                    type="button"
                    onClick={() => onColorChange(col)}
                    className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all cursor-pointer border ${style.bg} ${style.border} ${
                      isSelected ? 'ring-2 ring-amber-400 scale-110 shadow-md' : 'opacity-70 hover:opacity-100'
                    }`}
                  >
                    <span className={`w-3.5 h-3.5 rounded-full ${style.dot}`} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Default Catalog Checkbox */}
          <label className="flex items-start gap-3 p-3 rounded-xl bg-stone-950 border border-stone-800 cursor-pointer hover:border-stone-700 transition-colors">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => onIsDefaultChange(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded text-amber-500 focus:ring-amber-500 bg-stone-900 border-stone-700 cursor-pointer"
            />
            <div className="flex-1 text-xs">
              <span className="font-bold text-stone-200 flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                <span>Oznacz jako domyślny katalog</span>
              </span>
              <p className="text-[11px] text-stone-400 mt-0.5">
                Nowe karty dodawane do kolekcji będą automatycznie przypisywane do tego katalogu.
              </p>
            </div>
          </label>

          <div className="pt-3 border-t border-stone-800 flex items-center justify-between gap-2">
            {editingCatalog && canDelete ? (
              <button
                type="button"
                onClick={onRequestDelete}
                className="px-3 py-2 bg-stone-900 hover:bg-rose-950/60 text-rose-400 border border-stone-800 hover:border-rose-800/60 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Usuń katalog</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Anuluj
              </button>
              <button
                type="submit"
                disabled={isSaving || !name.trim()}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs rounded-xl shadow transition-colors cursor-pointer disabled:opacity-50"
              >
                {isSaving ? 'Zapisywanie...' : editingCatalog ? 'Zapisz zmiany' : 'Utwórz katalog'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
