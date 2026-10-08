import { FOR_SALE_BINDER } from './constants';
import React, { useState } from 'react';
import { Search, X, Sparkles, LayoutGrid, List, SlidersHorizontal, Library } from 'lucide-react';
import { CollectionFiltersBarProps } from './types';
import { COLOR_PILLS, CARD_TYPES, CARD_RARITIES, SORT_OPTIONS } from './constants';

export const CollectionFiltersBar: React.FC<CollectionFiltersBarProps> = ({
  filters,
  sets,
  catalogs,
  viewMode,
  onFilterChange,
  onViewModeChange,
}) => {
  // Na telefonie zaawansowane filtry są schowane pod przyciskiem, żeby karty były widoczne od razu.
  const [showAdvanced, setShowAdvanced] = useState(false);
  const activeAdvanced = [
    filters.type !== 'ALL',
    filters.rarity !== 'ALL',
    filters.binder !== 'ALL',
    filters.set !== 'ALL',
    filters.onlyFoil
  ].filter(Boolean).length;

  return (
    <div className="space-y-3">
      {/* Top Controls Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Main Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            type="text"
            placeholder="Szukaj w kolekcji (nazwa, typ, set, notatka)..."
            value={filters.searchQuery}
            onChange={(e) => onFilterChange({ searchQuery: e.target.value })}
            className="w-full h-10 bg-stone-900 border border-stone-800 rounded-lg pl-10 pr-4 text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500 transition-colors"
          />
          {filters.searchQuery && (
            <button
              onClick={() => onFilterChange({ searchQuery: '' })}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Color Filter Pills */}
        <div className="flex items-center gap-1 bg-stone-900 p-1 rounded-lg border border-stone-800 max-w-full overflow-x-auto no-scrollbar md:shrink-0">
          {COLOR_PILLS.map(col => (
            <button
              key={col.id}
              onClick={() => onFilterChange({ color: col.id })}
              className={`shrink-0 px-2.5 py-1.5 md:py-1 rounded-lg text-xs transition-all cursor-pointer ${
                filters.color === col.id
                  ? 'bg-stone-800 text-stone-50 font-medium'
                  : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800'
              }`}
            >
              {col.bg ? <span className={`px-1.5 py-0.2 rounded text-[11px] ${col.bg}`}>{col.label}</span> : col.label}
            </button>
          ))}
        </div>
      </div>

      {/* Telefon: przełącznik filtrów i widoku */}
      <div className="md:hidden flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          aria-expanded={showAdvanced}
          className={`flex-1 h-11 px-3 rounded-xl border text-sm font-semibold flex items-center justify-center gap-2 ${
            showAdvanced || activeAdvanced ? 'bg-amber-500/15 border-amber-500/40 text-amber-300' : 'bg-stone-950 border-stone-800 text-stone-300'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span>Filtry i sortowanie{activeAdvanced ? ` (${activeAdvanced})` : ''}</span>
        </button>
        <div className="flex items-center gap-1 bg-stone-950 p-1 rounded-xl border border-stone-800 shrink-0">
          <button
            type="button"
            onClick={() => onViewModeChange('table')}
            aria-label="Widok listy"
            className={`w-10 h-9 rounded-lg flex items-center justify-center ${viewMode === 'table' ? 'bg-stone-800 text-amber-400' : 'text-stone-500'}`}
          >
            <List className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('grid')}
            aria-label="Widok kafelków"
            className={`w-10 h-9 rounded-lg flex items-center justify-center ${viewMode === 'grid' ? 'bg-stone-800 text-amber-400' : 'text-stone-500'}`}
          >
            <LayoutGrid className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('sets')}
            aria-label="Widok dodatków"
            className={`w-10 h-9 rounded-lg flex items-center justify-center ${viewMode === 'sets' ? 'bg-stone-800 text-amber-400' : 'text-stone-500'}`}
          >
            <Library className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Secondary Filter Dropdowns */}
      <div className={`${showAdvanced ? 'grid' : 'hidden'} md:grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs`}>
        {/* Type Filter */}
        <div>
          <label className="block text-[11px] font-semibold text-stone-400 mb-1">Typ karty</label>
          <select
            value={filters.type}
            onChange={(e) => onFilterChange({ type: e.target.value })}
            className="w-full h-9 bg-stone-900 border border-stone-800 rounded-lg px-2.5 text-stone-200 focus:outline-none focus:border-amber-500 cursor-pointer"
          >
            {CARD_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Rarity Filter */}
        <div>
          <label className="block text-[11px] font-semibold text-stone-400 mb-1">Rzadkość</label>
          <select
            value={filters.rarity}
            onChange={(e) => onFilterChange({ rarity: e.target.value })}
            className="w-full h-9 bg-stone-900 border border-stone-800 rounded-lg px-2.5 text-stone-200 focus:outline-none focus:border-amber-500 cursor-pointer"
          >
            {CARD_RARITIES.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        {/* Binder / Catalog Filter */}
        <div>
          <label className="block text-[11px] font-semibold text-stone-400 mb-1">Katalog / Klaser</label>
          <select
            value={filters.binder}
            onChange={(e) => onFilterChange({ binder: e.target.value })}
            className="w-full h-9 bg-stone-900 border border-stone-800 rounded-lg px-2.5 text-stone-200 focus:outline-none focus:border-amber-500 cursor-pointer"
          >
            <option value="ALL">Wszystkie katalogi</option>
            <option value={FOR_SALE_BINDER}>Sprzedam (na sprzedaż)</option>
            {catalogs.map(b => (
              <option key={b.id} value={b.name}>{b.name}</option>
            ))}
          </select>
        </div>

        {/* Set Filter */}
        <div>
          <label className="block text-[11px] font-semibold text-stone-400 mb-1">Dodatek (Set)</label>
          <select
            value={filters.set}
            onChange={(e) => onFilterChange({ set: e.target.value })}
            className="w-full h-9 bg-stone-900 border border-stone-800 rounded-lg px-2.5 text-stone-200 focus:outline-none focus:border-amber-500 truncate cursor-pointer"
          >
            <option value="ALL">Wszystkie dodatki</option>
            {sets.map(({ code, name, owned, total }) => {
              // Zaokrąglenie w dół, żeby niekompletny dodatek nie pokazywał 100%
              const pct = total ? (owned / total) * 100 : null;
              const pctText = pct === null ? '' : pct > 0 && pct < 1 ? ' (<1%)' : ` (${Math.floor(pct)}%)`;
              return (
                <option key={code} value={code}>
                  [{code.toUpperCase()}] {name} {total ? `${owned}/${total}${pctText}` : `(${owned === 1 ? '1 karta' : `${owned} ${owned % 10 >= 2 && owned % 10 <= 4 && (owned % 100 < 12 || owned % 100 > 14) ? 'karty' : 'kart'}`})`}
                </option>
              );
            })}
          </select>
        </div>

        {/* Sort By */}
        <div>
          <label className="block text-[11px] font-semibold text-stone-400 mb-1">Sortowanie</label>
          <select
            value={filters.sortBy}
            onChange={(e) => onFilterChange({ sortBy: e.target.value as any })}
            className="w-full h-9 bg-stone-900 border border-stone-800 rounded-lg px-2.5 text-stone-200 focus:outline-none focus:border-amber-500 cursor-pointer"
          >
            {SORT_OPTIONS.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        {/* View Mode Toggle & Only Foil */}
        <div className="flex items-end justify-between gap-2">
          <button
            onClick={() => onFilterChange({ onlyFoil: !filters.onlyFoil })}
            className={`h-9 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 border cursor-pointer ${
              filters.onlyFoil
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                : 'bg-stone-900 text-stone-400 border-stone-800 hover:text-stone-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Tylko foil</span>
          </button>

          <div className="hidden md:flex items-center gap-1 bg-stone-900 p-1 rounded-lg border border-stone-800 h-9">
            <button
              onClick={() => onViewModeChange('grid')}
              className={`p-1 rounded transition-colors cursor-pointer ${viewMode === 'grid' ? 'bg-stone-800 text-amber-400' : 'text-stone-500 hover:text-stone-300'}`}
              title="Widok kafelkowy (Binder)"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => onViewModeChange('table')}
              className={`p-1 rounded transition-colors cursor-pointer ${viewMode === 'table' ? 'bg-stone-800 text-amber-400' : 'text-stone-500 hover:text-stone-300'}`}
              title="Widok tabeli"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => onViewModeChange('sets')}
              className={`p-1 rounded transition-colors cursor-pointer ${viewMode === 'sets' ? 'bg-stone-800 text-amber-400' : 'text-stone-500 hover:text-stone-300'}`}
              title="Widok dodatków"
            >
              <Library className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
