import React from 'react';
import { FolderPlus, Folder, Plus, Sparkles, Check } from 'lucide-react';
import { CardCondition, CardLanguage } from '../../types';
import { CardCollectionFormProps } from './types';
import { useT, tk, binderName, MAIN_BINDER } from '../../i18n';

const CONDITIONS: { value: CardCondition; label: string }[] = [
  { value: 'NM', label: 'Near Mint (NM)' },
  { value: 'EX', label: 'Excellent (EX)' },
  { value: 'GD', label: 'Good (GD)' },
  { value: 'LP', label: 'Lightly Played (LP)' },
  { value: 'PL', label: 'Played (PL)' },
];

const LANGUAGES: { value: CardLanguage; label: string }[] = [
  { value: 'EN', label: tk('Angielski (EN)') },
  { value: 'PL', label: tk('Polski (PL)') },
  { value: 'DE', label: tk('Niemiecki (DE)') },
  { value: 'FR', label: tk('Francuski (FR)') },
  { value: 'JP', label: tk('Japoński (JP)') },
  { value: 'IT', label: tk('Włoski (IT)') },
  { value: 'ES', label: tk('Hiszpański (ES)') },
  { value: 'PH', label: 'Phyrexian (PH)' },
  { value: 'OTHER', label: tk('Inny') },
];

export const CardCollectionForm: React.FC<CardCollectionFormProps> = ({
  existingItem,
  catalogs,
  selectedBinder,
  quantity,
  quantityFoil,
  condition,
  language,
  notes,
  isSaved,
  isCreatingCatalog,
  newCatName,
  isCreatingCatalogLoading,
  onSelectBinder,
  onQuantityChange,
  onQuantityFoilChange,
  onConditionChange,
  onLanguageChange,
  onNotesChange,
  onStartCreateCatalog,
  onCancelCreateCatalog,
  onNewCatNameChange,
  onSubmitCreateCatalog,
  onSubmitSave,
}) => {
  const t = useT();
  return (
    <form onSubmit={onSubmitSave} className="bg-stone-950/90 p-4 rounded-xl border border-stone-800 space-y-4">
      <h3 className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
        <FolderPlus className="w-4 h-4" />
        <span>{existingItem ? t('Edytuj parametry w kolekcji') : t('Dodaj do swojej kolekcji')}</span>
      </h3>

      {/* CATALOG / BINDER SELECTOR */}
      <div className="p-3 bg-stone-900/80 rounded-xl border border-stone-800 space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-[11px] font-bold text-amber-300 flex items-center gap-1.5">
            <Folder className="w-3.5 h-3.5 text-amber-400" />
            <span>{t('Katalog dla tej karty')}</span>
          </label>

          {!isCreatingCatalog && (
            <button
              type="button"
              onClick={onStartCreateCatalog}
              className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 font-semibold cursor-pointer underline"
            >
              <Plus className="w-3 h-3" />
              <span>{t('+ Nowy katalog')}</span>
            </button>
          )}
        </div>

        {/* Inline Create Catalog Form */}
        {isCreatingCatalog ? (
          <div className="p-2.5 bg-stone-950 rounded-lg border border-amber-500/40 space-y-2 animate-fadeIn">
            <p className="text-[11px] font-bold text-stone-300">{t('Tworzenie nowego katalogu:')}</p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder={t('Nazwa katalogu (np. Talia Modern, Inwestycyjne)...')}
                value={newCatName}
                onChange={(e) => onNewCatNameChange(e.target.value)}
                className="flex-1 bg-stone-900 border border-stone-700 rounded-lg px-2.5 py-1 text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500"
                autoFocus
              />
              <button
                type="button"
                onClick={onSubmitCreateCatalog}
                disabled={!newCatName.trim() || isCreatingCatalogLoading}
                className="px-3 py-1 bg-amber-500 text-stone-950 font-bold text-xs rounded-lg hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
              >
                {isCreatingCatalogLoading ? t('Zapis...') : t('Utwórz')}
              </button>
              <button
                type="button"
                onClick={onCancelCreateCatalog}
                className="px-2 py-1 bg-stone-800 text-stone-400 text-xs rounded-lg hover:text-stone-200 cursor-pointer"
              >
                {t('Anuluj')}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select
              value={selectedBinder}
              onChange={(e) => onSelectBinder(e.target.value)}
              className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-xs font-semibold text-stone-100 focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              {catalogs.length > 0 ? (
                catalogs.map(cat => (
                  <option key={cat.id} value={cat.name}>
                    {binderName(cat.name)} {cat.isDefault ? t('(Domyślny)') : ''}
                  </option>
                ))
              ) : (
                <option value={MAIN_BINDER}>{binderName(MAIN_BINDER)}</option>
              )}
            </select>

            <div className="flex items-center text-xs text-stone-400 bg-stone-950/60 px-3 py-1.5 rounded-lg border border-stone-800">
              <span>{t('Aktualny cel:')} <strong className="text-amber-300 tabular-nums">{binderName(selectedBinder)}</strong></span>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Normal Quantity */}
        <div>
          <label className="block text-[11px] font-semibold text-stone-400 mb-1">
            {t('Ilość (Zwykłe)')}
          </label>
          <input
            type="number"
            min="0"
            value={quantity}
            onChange={(e) => onQuantityChange(Math.max(0, parseInt(e.target.value, 10) || 0))}
            className="w-full bg-stone-900 border border-stone-700 rounded-lg px-2.5 py-1.5 text-sm tabular-nums font-bold text-stone-100 focus:outline-none focus:border-amber-500"
          />
        </div>

        {/* Foil Quantity */}
        <div>
          <label className="block text-[11px] font-semibold text-amber-400 mb-1 flex items-center gap-1">
            <Sparkles className="w-2.5 h-2.5" />
            <span>{t('Ilość (Foil)')}</span>
          </label>
          <input
            type="number"
            min="0"
            value={quantityFoil}
            onChange={(e) => onQuantityFoilChange(Math.max(0, parseInt(e.target.value, 10) || 0))}
            className="w-full bg-stone-900 border border-stone-700 rounded-lg px-2.5 py-1.5 text-sm tabular-nums font-bold text-amber-300 focus:outline-none focus:border-amber-500"
          />
        </div>

        {/* Condition */}
        <div>
          <label className="block text-[11px] font-semibold text-stone-400 mb-1">
            {t('Stan karty')}
          </label>
          <select
            value={condition}
            onChange={(e) => onConditionChange(e.target.value as CardCondition)}
            className="w-full bg-stone-900 border border-stone-700 rounded-lg px-2 py-1.5 text-xs text-stone-100 focus:outline-none focus:border-amber-500 cursor-pointer"
          >
            {CONDITIONS.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        {/* Language */}
        <div>
          <label className="block text-[11px] font-semibold text-stone-400 mb-1">
            {t('Język')}
          </label>
          <select
            value={language}
            onChange={(e) => onLanguageChange(e.target.value as CardLanguage)}
            className="w-full bg-stone-900 border border-stone-700 rounded-lg px-2 py-1.5 text-xs text-stone-100 focus:outline-none focus:border-amber-500 cursor-pointer"
          >
            {LANGUAGES.map(l => (
              <option key={l.value} value={l.value}>{t(l.label)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Notes */}
      <div>
        <div>
          <label className="block text-[11px] font-semibold text-stone-400 mb-1">
            {t('Notatki / tagi')}
          </label>
          <input
            type="text"
            placeholder={t('np. Karta z pre-release, podpisana...')}
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            className="w-full bg-stone-900 border border-stone-700 rounded-lg px-2.5 py-1.5 text-xs text-stone-100 focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={quantity === 0 && quantityFoil === 0}
        className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-950/40 transition-all cursor-pointer disabled:opacity-50"
      >
        {isSaved ? (
          <>
            <Check className="w-4 h-4 stroke-[3]" />
            <span>{t('Zapisano w katalogu "{name}"!', { name: binderName(selectedBinder) })}</span>
          </>
        ) : (
          <>
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>{t('Zapisz w katalogu "{name}"', { name: binderName(selectedBinder) })}</span>
          </>
        )}
      </button>
    </form>
  );
};
