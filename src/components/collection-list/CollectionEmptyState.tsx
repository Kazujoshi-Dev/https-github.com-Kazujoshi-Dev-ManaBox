import React from 'react';
import { FolderOpen, Plus, Camera, Upload } from 'lucide-react';
import { CollectionEmptyStateProps } from './types';

export const CollectionEmptyState: React.FC<CollectionEmptyStateProps> = ({
  activeBinder,
  onOpenAddModal,
  onOpenScannerModal,
  onOpenImportExport,
}) => {
  const isCatalogFiltered = activeBinder !== 'ALL';

  return (
    <div className="bg-stone-900/60 border border-stone-800/80 rounded-2xl p-12 text-center space-y-4">
      <div className="w-16 h-16 rounded-2xl bg-stone-800/80 mx-auto flex items-center justify-center text-stone-500">
        <FolderOpen className="w-8 h-8 text-stone-400" />
      </div>
      <div>
        <h3 className="text-lg font-bold text-stone-200">
          {isCatalogFiltered ? `Brak kart w katalogu "${activeBinder}"` : 'Brak kart w kolekcji'}
        </h3>
        <p className="text-xs text-stone-400 mt-1 max-w-md mx-auto">
          {isCatalogFiltered 
            ? 'W tym katalogu nie ma jeszcze kart spełniających filtry. Możesz dodać do niego kartę z wyszukiwarki lub zaimportować listę z pliku .txt.'
            : 'Nie znaleziono kart spełniających kryteria wyszukiwania. Dodaj nową kartę ze Scryfall, zeskanuj kamerą lub zaimportuj listę kart z pliku .txt.'}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {onOpenImportExport && (
          <button
            onClick={() => onOpenImportExport('import')}
            className="px-4 py-2.5 rounded-xl bg-stone-800 hover:bg-stone-750 text-amber-300 border border-amber-500/30 font-bold text-xs inline-flex items-center gap-2 shadow-lg transition-colors cursor-pointer"
          >
            <Upload className="w-4 h-4 text-amber-400" />
            <span>Importuj listę z pliku .txt</span>
          </button>
        )}
        {onOpenScannerModal && (
          <button
            onClick={onOpenScannerModal}
            className="px-4 py-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold text-xs inline-flex items-center gap-2 shadow-lg transition-colors cursor-pointer"
          >
            <Camera className="w-4 h-4 text-emerald-400" />
            <span>Skanuj karty kamerą (OCR)</span>
          </button>
        )}
        <button
          onClick={onOpenAddModal}
          className="px-4 py-2.5 rounded-xl bg-amber-500 text-stone-950 font-bold text-xs inline-flex items-center gap-2 shadow-lg hover:bg-amber-400 transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>Szukaj i dodaj kartę do katalogu</span>
        </button>
      </div>
    </div>
  );
};

