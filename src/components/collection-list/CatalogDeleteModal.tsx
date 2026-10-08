import React, { useEffect } from 'react';
import { Trash2, AlertTriangle, Eraser } from 'lucide-react';
import { CatalogDeleteModalProps } from './types';
import { useBackToClose } from '../../hooks/useBackButton';
import { useT, plural, binderName } from '../../i18n';

const pozycji = (n: number) => plural(n, ['{n} pozycja', '{n} pozycje', '{n} pozycji'], ['{n} entry', '{n} entries']);
const kart = (n: number) => plural(n, ['{n} karta', '{n} karty', '{n} kart'], ['{n} card', '{n} cards']);

/**
 * Potwierdzenie usunięcia katalogu (karty trafiają do głównego klasera)
 * albo opróżnienia katalogu (karty są usuwane z kolekcji, katalog zostaje).
 */
export const CatalogDeleteModal: React.FC<CatalogDeleteModalProps> = ({
  mode,
  catalogToDelete,
  cardCount,
  cardQuantity,
  forSaleCount,
  mainCatalogName,
  onClose,
  onConfirmDelete,
}) => {
  const t = useT();
  useBackToClose(true, onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const name = binderName(catalogToDelete.name);
  const hasCards = cardCount > 0;
  const isEmpty = mode === 'empty';
  const Icon = isEmpty ? Eraser : Trash2;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="catalog-delete-title"
    >
      <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-md w-full p-6 text-stone-100 space-y-4 shadow-2xl max-sm:max-w-none max-sm:rounded-b-none max-sm:rounded-t-3xl max-sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <h3 id="catalog-delete-title" className="text-base font-semibold text-stone-50 flex items-start gap-2.5">
          <Icon className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <span>{isEmpty ? t('Opróżnić „{name}”?', { name }) : t('Usunąć katalog „{name}”?', { name })}</span>
        </h3>

        {isEmpty ? (
          <div className="space-y-3 text-sm text-stone-300 leading-relaxed">
            {hasCards ? (
              <p className="flex gap-2.5 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-100">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>
                  {t('Wszystkie karty z tego katalogu,')} <strong className="tabular-nums">{pozycji(cardCount)} ({kart(cardQuantity)})</strong>, {t('zostaną usunięte z kolekcji. Tego nie da się cofnąć.')}
                </span>
              </p>
            ) : (
              <p>{t('Ten katalog jest już pusty.')}</p>
            )}
            {forSaleCount > 0 && <p>{t('Karty wystawione na sprzedaż ({count}) zostaną w ofercie.', { count: pozycji(forSaleCount) })}</p>}
            <p className="text-stone-400">{t('Sam katalog zostanie.')}</p>
          </div>
        ) : (
          <div className="space-y-2 text-sm text-stone-300 leading-relaxed">
            {hasCards || forSaleCount > 0 ? (
              <p>
                {t('Karty z tego katalogu nie zostaną usunięte. Trafią do')}{' '}
                <strong className="text-stone-100">„{binderName(mainCatalogName)}”</strong>.
              </p>
            ) : (
              <p>{t('Ten katalog jest pusty.')}</p>
            )}
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-3 border-t border-stone-800">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            {t('Anuluj')}
          </button>
          <button
            type="button"
            onClick={onConfirmDelete}
            disabled={isEmpty && !hasCards}
            className="btn bg-rose-600 hover:bg-rose-500 text-white font-semibold disabled:opacity-50"
          >
            {isEmpty ? t('Usuń karty z katalogu') : t('Usuń katalog')}
          </button>
        </div>
      </div>
    </div>
  );
};
