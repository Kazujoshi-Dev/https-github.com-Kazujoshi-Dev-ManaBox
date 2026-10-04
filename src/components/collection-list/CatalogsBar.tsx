import { PageHeader } from '../ui/PageHeader';
import { FOR_SALE_BINDER } from './constants';
import React from 'react';
import { 
  Folder, 
  FolderPlus, 
  FolderOpen, 
  Star, 
  Edit2, 
  Trash2,
  FileText,
  CircleDollarSign
} from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';
import { CatalogsBarProps } from './types';
import { COLOR_MAP } from './constants';

export const CatalogsBar: React.FC<CatalogsBarProps> = ({
  catalogs,
  activeBinder,
  catalogStats,
  totalCollectionCount,
  forSaleCount = 0,
  currency,
  onSelectBinder,
  onOpenCreateCatalog,
  onOpenEditCatalog,
  onRequestDeleteCatalog,
  onSetDefaultCatalog,
  onOpenImportExport,
}) => {
  const activeCatalogObj = catalogs.find(c => c.name === activeBinder);

  const chip = (selected: boolean) =>
    `h-9 px-3 rounded-lg text-sm shrink-0 flex items-center gap-2 cursor-pointer whitespace-nowrap ${
      selected ? 'bg-stone-800 text-stone-50 ring-1 ring-stone-700' : 'text-stone-400 hover:text-stone-100 hover:bg-stone-900'
    }`;
  const count = (n: number) => <span className="text-xs text-stone-500 tabular-nums">{n}</span>;
  const activeStats = activeCatalogObj ? catalogStats.get(activeCatalogObj.name) : undefined;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Kolekcja"
        actions={
          <>
            {onOpenImportExport && (
              <button type="button" onClick={() => onOpenImportExport('export')} className="btn btn-secondary" title="Import i eksport kolekcji (.txt)">
                <FileText className="w-4 h-4" />
                Import / eksport
              </button>
            )}
            <button type="button" onClick={onOpenCreateCatalog} className="btn btn-secondary">
              <FolderPlus className="w-4 h-4" />
              Nowy katalog
            </button>
          </>
        }
      />

      {/* Katalogi */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar -mx-1 px-1 py-0.5">
        <button type="button" onClick={() => onSelectBinder('ALL')} className={chip(activeBinder === 'ALL')}>
          Wszystkie {count(totalCollectionCount)}
        </button>
        <button
          type="button"
          onClick={() => onSelectBinder(FOR_SALE_BINDER)}
          className={chip(activeBinder === FOR_SALE_BINDER)}
          title="Karty oznaczone na sprzedaż. Nie ma ich w klaserach, dopóki ich nie wycofasz"
        >
          <CircleDollarSign className="w-4 h-4 text-emerald-400" />
          Sprzedam {count(forSaleCount)}
        </button>
        <span className="w-px h-5 bg-stone-800 mx-1 shrink-0" aria-hidden="true" />
        {catalogs.map((cat) => {
          const stats = catalogStats.get(cat.name) || { count: 0, totalCards: 0, totalValue: 0 };
          const colorStyle = COLOR_MAP[cat.color || 'amber'] || COLOR_MAP.amber;
          return (
            <button key={cat.id} type="button" onClick={() => onSelectBinder(cat.name)} className={chip(activeBinder === cat.name)}>
              <span className={`w-2 h-2 rounded-full ${colorStyle.dot}`} aria-hidden="true" />
              <span className="truncate max-w-[160px]">{cat.name}</span>
              {cat.isDefault && <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" aria-label="Domyślny katalog" />}
              {count(stats.count)}
            </button>
          );
        })}
      </div>

      {/* Szczegóły wybranego katalogu */}
      {activeCatalogObj && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm">
          <p className="text-stone-400 min-w-0">
            {activeCatalogObj.description || 'Katalog kart kolekcji'}
            <span className="text-stone-600 mx-2">/</span>
            Wartość <span className="text-stone-100 font-medium tabular-nums">{formatCurrency(activeStats?.totalValue || 0, currency)}</span>
          </p>
          <div className="flex items-center gap-1 shrink-0 -ml-2 sm:ml-0">
            {!activeCatalogObj.isDefault && onSetDefaultCatalog && (
              <button
                type="button"
                onClick={() => onSetDefaultCatalog(activeCatalogObj.id)}
                className="btn btn-ghost h-8 px-2.5"
                title="Nowo dodawane karty będą trafiać do tego katalogu"
              >
                <Star className="w-4 h-4" />
                Ustaw jako domyślny
              </button>
            )}
            <button type="button" onClick={(e) => onOpenEditCatalog(activeCatalogObj, e)} className="btn btn-ghost h-8 px-2.5">
              <Edit2 className="w-4 h-4" />
              Edytuj
            </button>
            <button type="button" onClick={() => onRequestDeleteCatalog(activeCatalogObj)} className="btn btn-ghost h-8 px-2.5 hover:text-rose-300">
              <Trash2 className="w-4 h-4" />
              Usuń
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
