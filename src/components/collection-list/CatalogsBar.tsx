import React from 'react';
import { 
  Folder, 
  FolderPlus, 
  FolderOpen, 
  Star, 
  Edit2, 
  Trash2 
} from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';
import { CatalogsBarProps } from './types';
import { COLOR_MAP } from './constants';

export const CatalogsBar: React.FC<CatalogsBarProps> = ({
  catalogs,
  activeBinder,
  catalogStats,
  totalCollectionCount,
  currency,
  onSelectBinder,
  onOpenCreateCatalog,
  onOpenEditCatalog,
  onRequestDeleteCatalog,
  onSetDefaultCatalog,
}) => {
  const activeCatalogObj = catalogs.find(c => c.name === activeBinder);

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 shadow-xl space-y-3">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-800/80 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <Folder className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-wider text-stone-100 flex items-center gap-2">
              <span>Katalogi i Klasery Kolekcji</span>
              <span className="text-[10px] bg-stone-800 text-stone-400 px-2 py-0.5 rounded-full font-mono font-normal">
                {catalogs.length} katalogów
              </span>
            </h2>
            <p className="text-[11px] text-stone-400">
              Wybierz katalog, aby filtrować karty lub utwórz nowy do organizacji swoich klaserów.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            onClick={onOpenCreateCatalog}
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-amber-950/40 transition-all cursor-pointer shrink-0"
          >
            <FolderPlus className="w-4 h-4 stroke-[2.5]" />
            <span>+ Utwórz nowy katalog</span>
          </button>
        </div>
      </div>

      {/* Catalog Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 scrollbar-thin">
        {/* All Cards Tab */}
        <button
          onClick={() => onSelectBinder('ALL')}
          className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center gap-2 border ${
            activeBinder === 'ALL'
              ? 'bg-amber-500 text-stone-950 border-amber-400 shadow-md font-extrabold'
              : 'bg-stone-950 text-stone-300 border-stone-800 hover:border-stone-700 hover:bg-stone-850'
          }`}
        >
          <FolderOpen className="w-3.5 h-3.5" />
          <span>Wszystkie karty</span>
          <span className={`px-1.5 py-0.2 rounded-full font-mono text-[10px] ${
            activeBinder === 'ALL' ? 'bg-stone-950 text-amber-300' : 'bg-stone-800 text-stone-400'
          }`}>
            {totalCollectionCount}
          </span>
        </button>

        {/* Individual Catalog Tabs */}
        {catalogs.map(cat => {
          const isSelected = activeBinder === cat.name;
          const stats = catalogStats.get(cat.name) || { count: 0, totalCards: 0, totalValue: 0 };
          const colorStyle = COLOR_MAP[cat.color || 'amber'] || COLOR_MAP.amber;

          return (
            <div
              key={cat.id}
              onClick={() => onSelectBinder(cat.name)}
              className={`group px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center gap-2 border ${
                isSelected
                  ? `${colorStyle.bg} ${colorStyle.border} ${colorStyle.text} ring-1 ring-amber-500/40 shadow-md`
                  : 'bg-stone-950 text-stone-300 border-stone-800 hover:border-stone-700 hover:bg-stone-850'
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full ${colorStyle.dot}`} />
              <span className="truncate max-w-[140px]">{cat.name}</span>

              {cat.isDefault && (
                <span title="Domyślny katalog">
                  <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />
                </span>
              )}

              <span className={`px-1.5 py-0.2 rounded-full font-mono text-[10px] ${
                isSelected ? 'bg-stone-950/80 text-stone-200' : 'bg-stone-800 text-stone-400'
              }`}>
                {stats.count}
              </span>

              {/* Quick Action Buttons for Catalog */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                {!cat.isDefault && onSetDefaultCatalog && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSetDefaultCatalog(cat.id);
                    }}
                    title="Oznacz ten katalog jako domyślny"
                    className="p-1 hover:text-amber-400 text-stone-500 rounded transition-colors"
                  >
                    <Star className="w-3 h-3" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={(e) => onOpenEditCatalog(cat, e)}
                  title={`Edytuj katalog ${cat.name}`}
                  className="p-1 hover:text-amber-300 text-stone-500 rounded transition-colors"
                >
                  <Edit2 className="w-3 h-3" />
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRequestDeleteCatalog(cat);
                  }}
                  title={`Usuń katalog ${cat.name}`}
                  className="p-1 hover:text-rose-400 text-stone-500 rounded transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Catalog Detailed Banner (when a specific catalog is active) */}
      {activeCatalogObj && (
        <div className="mt-2 p-3 bg-stone-950/70 border border-stone-800/80 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl border ${COLOR_MAP[activeCatalogObj.color || 'amber']?.bg || 'bg-amber-500/10'} ${COLOR_MAP[activeCatalogObj.color || 'amber']?.border || 'border-amber-500/30'} ${COLOR_MAP[activeCatalogObj.color || 'amber']?.text || 'text-amber-400'}`}>
              <Folder className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-extrabold text-stone-100">{activeCatalogObj.name}</h3>
                {activeCatalogObj.isDefault && (
                  <span className="text-[10px] font-mono uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.2 rounded-full flex items-center gap-1 font-bold">
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    Domyślny
                  </span>
                )}
              </div>
              <p className="text-[11px] text-stone-400 mt-0.5">
                {activeCatalogObj.description || 'Katalog kart kolekcji'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <p className="text-[10px] uppercase font-mono text-stone-400">Wartość katalogu</p>
              <p className="font-mono font-black text-emerald-400 text-sm">
                {formatCurrency(catalogStats.get(activeCatalogObj.name)?.totalValue || 0, currency)}
              </p>
            </div>

            <div className="flex items-center gap-1.5 border-l border-stone-800 pl-3">
              {activeCatalogObj.isDefault ? (
                <span className="px-2.5 py-1.5 bg-amber-500/10 text-amber-300 rounded-lg border border-amber-500/30 font-bold text-xs flex items-center gap-1.5">
                  <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                  <span>Domyślny katalog</span>
                </span>
              ) : onSetDefaultCatalog ? (
                <button
                  onClick={() => onSetDefaultCatalog(activeCatalogObj.id)}
                  className="px-2.5 py-1.5 bg-stone-900 hover:bg-amber-500/20 text-stone-300 hover:text-amber-300 rounded-lg border border-stone-800 hover:border-amber-500/40 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Ustaw ten katalog jako domyślny (nowo dodawane karty będą trafiać do niego)"
                >
                  <Star className="w-3.5 h-3.5 text-amber-400" />
                  <span>Ustaw jako domyślny</span>
                </button>
              ) : null}

              <button
                onClick={(e) => onOpenEditCatalog(activeCatalogObj, e)}
                className="px-2.5 py-1.5 bg-stone-900 hover:bg-stone-800 text-stone-300 hover:text-amber-300 rounded-lg border border-stone-800 font-semibold text-xs flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Edytuj</span>
              </button>

              <button
                onClick={() => onRequestDeleteCatalog(activeCatalogObj)}
                className="px-2.5 py-1.5 bg-stone-900 hover:bg-rose-950/60 text-stone-400 hover:text-rose-400 rounded-lg border border-stone-800 font-semibold text-xs flex items-center gap-1 transition-colors cursor-pointer"
                title="Usuń ten katalog"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Usuń katalog</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
