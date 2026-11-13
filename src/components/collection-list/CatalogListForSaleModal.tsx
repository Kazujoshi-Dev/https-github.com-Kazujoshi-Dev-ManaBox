import React, { useEffect, useMemo, useState } from 'react';
import { CircleDollarSign, Loader2, Info } from 'lucide-react';
import { AppSettings, Catalog, CollectionItem, SaleFolder } from '../../types';
import { formatCurrency, getSaleMarketPrice } from '../../utils/formatters';
import { isDigitalOnly } from '../../utils/mtgFormats';
import { saleFoldersApi } from '../../services/api';
import { useBackToClose } from '../../hooks/useBackButton';
import { useT, plural, binderName } from '../../i18n';

/** Od tylu sztuk trzeba przepisać nazwę katalogu, żeby nie wystawić dużej kolekcji przypadkiem. */
const TYPE_TO_CONFIRM_FROM = 200;

const pozycji = (n: number) => plural(n, ['{n} pozycja', '{n} pozycje', '{n} pozycji'], ['{n} entry', '{n} entries']);
const kart = (n: number) => plural(n, ['{n} karta', '{n} karty', '{n} kart'], ['{n} card', '{n} cards']);
const qtyOf = (i: CollectionItem) => (i.quantity || 0) + (i.quantityFoil || 0);

interface Props {
  catalog: Catalog;
  /** Karty katalogu, które nie są jeszcze na sprzedaż. */
  items: CollectionItem[];
  settings: AppSettings;
  onClose: () => void;
  onConfirm: (opts: { folderId: string | null; includeDeckCards: boolean }) => Promise<void>;
}

/**
 * Potwierdzenie wystawienia całego katalogu na sprzedaż: liczba kart, szacowana wartość,
 * opcjonalna podkategoria „Sprzedam” i decyzja o kartach skopiowanych z talii.
 */
export const CatalogListForSaleModal: React.FC<Props> = ({ catalog, items, settings, onClose, onConfirm }) => {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const close = () => !busy && onClose();
  useBackToClose(true, close);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const [folders, setFolders] = useState<SaleFolder[]>([]);
  const [folderId, setFolderId] = useState<string>('');
  const [includeDeckCards, setIncludeDeckCards] = useState(false);
  const [typed, setTyped] = useState('');
  useEffect(() => {
    saleFoldersApi.list().then(setFolders).catch(() => {});
  }, []);

  const name = binderName(catalog.name);
  const { physical, digitalCount, deckCount } = useMemo(() => {
    const physical = items.filter((i) => !isDigitalOnly(i.card));
    return {
      physical,
      digitalCount: items.length - physical.length,
      deckCount: physical.filter((i) => Boolean(i.sourceDeckId)).length
    };
  }, [items]);
  const toList = includeDeckCards ? physical : physical.filter((i) => !i.sourceDeckId);
  const copies = toList.reduce((s, i) => s + qtyOf(i), 0);
  const value = toList.reduce((s, i) => {
    if (i.salePrice !== undefined && i.salePrice !== null) return s + i.salePrice * qtyOf(i);
    return s + (i.quantity || 0) * getSaleMarketPrice(i.card, false, settings) + (i.quantityFoil || 0) * getSaleMarketPrice(i.card, true, settings);
  }, 0);
  const needsTyping = copies >= TYPE_TO_CONFIRM_FROM;
  const typedOk = !needsTyping || typed.trim().toLowerCase() === name.trim().toLowerCase();
  const canSubmit = toList.length > 0 && typedOk && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await onConfirm({ folderId: folderId || null, includeDeckCards });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && close()}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="catalog-list-sale-title"
    >
      <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-md w-full p-6 text-stone-100 space-y-4 shadow-2xl max-sm:max-w-none max-sm:rounded-b-none max-sm:rounded-t-3xl max-sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <h3 id="catalog-list-sale-title" className="text-base font-semibold text-stone-50 flex items-start gap-2.5">
          <CircleDollarSign className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <span>{t('Wystawić cały katalog „{name}” na sprzedaż?', { name })}</span>
        </h3>

        <div className="space-y-3 text-sm text-stone-300 leading-relaxed">
          {toList.length > 0 ? (
            <p>
              {t('Do zakładki „Sprzedam” trafi')} <strong className="text-stone-100 tabular-nums">{pozycji(toList.length)} ({kart(copies)})</strong>,{' '}
              {t('wszystkie egzemplarze każdej karty. Szacowana wartość:')}{' '}
              <strong className="text-emerald-300 tabular-nums">{formatCurrency(value, settings.currency)}</strong>.
            </p>
          ) : (
            <p>{t('W tym katalogu nie ma kart, które można wystawić.')}</p>
          )}
          <p className="text-stone-400">
            {t('Karty znikną z katalogu i od razu będą widoczne w Twojej publicznej ofercie. Wycofasz je pojedynczo albo przyciskiem „Wycofaj wszystkie” w „Sprzedam”, wtedy wrócą do „{name}”.', { name })}
          </p>
          <p className="text-stone-400">{t('Karty bez własnej ceny będą miały cenę rynkową. Ceny zmienisz później w „Sprzedam”.')}</p>

          {deckCount > 0 && (
            <label className="flex items-start gap-2.5 p-3 rounded-lg bg-stone-950 border border-stone-800 cursor-pointer">
              <input
                type="checkbox"
                checked={includeDeckCards}
                onChange={(e) => setIncludeDeckCards(e.target.checked)}
                className="mt-0.5 accent-amber-500"
              />
              <span>
                {t('Wystaw też karty skopiowane z talii ({count})', { count: pozycji(deckCount) })}
                <span className="block text-xs text-stone-500">{t('Domyślnie zostają w katalogu, bo mogą leżeć w Twoich taliach.')}</span>
              </span>
            </label>
          )}

          {digitalCount > 0 && (
            <p className="flex gap-2 text-xs text-stone-500">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {t('Karty tylko cyfrowe (MTG Arena) zostaną pominięte: {count}.', { count: pozycji(digitalCount) })}
            </p>
          )}

          {folders.length > 0 && (
            <label className="block space-y-1">
              <span className="text-xs text-stone-400">{t('Podkategoria w „Sprzedam”')}</span>
              <select
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
                className="w-full h-9 bg-stone-950 border border-stone-700 focus:border-amber-500 rounded-lg px-2.5 text-sm text-stone-100 focus:outline-none"
              >
                <option value="">{t('Lista główna')}</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </label>
          )}

          {needsTyping && toList.length > 0 && (
            <label className="block space-y-1">
              <span className="text-xs text-stone-400">{t('To dużo kart. Aby potwierdzić, wpisz nazwę katalogu: {name}', { name })}</span>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                autoComplete="off"
                aria-label={t('Nazwa katalogu')}
                className="w-full h-9 bg-stone-950 border border-stone-700 focus:border-amber-500 rounded-lg px-2.5 text-sm text-stone-100 focus:outline-none"
              />
            </label>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-3 border-t border-stone-800">
          <button type="button" onClick={close} disabled={busy} className="btn btn-secondary">
            {t('Anuluj')}
          </button>
          <button type="button" onClick={submit} disabled={!canSubmit} className="btn btn-primary disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CircleDollarSign className="w-4 h-4" />}
            {busy ? t('Wystawianie…') : t('Wystaw {count}', { count: kart(copies) })}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CatalogListForSaleModal;
