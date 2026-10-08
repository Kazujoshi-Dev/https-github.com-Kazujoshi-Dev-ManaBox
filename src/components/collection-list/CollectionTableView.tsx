import React from 'react';
import { Minus, Plus, Sparkles, CircleDollarSign } from 'lucide-react';
import { CardItem } from '../CardItem';
import { CollectionTableViewProps } from './types';
import { formatCurrency, getCardImageUri, getCardPrice, handleCardImageError } from '../../utils/formatters';
import { useT } from '../../i18n';

export const CollectionTableView: React.FC<CollectionTableViewProps> = ({
  items,
  settings,
  onUpdateQuantity,
  onDeleteItem,
  onEditItem,
  onViewCardDetails,
  onToggleForSale,
}) => {
  const t = useT();
  return (
    <>
      {/* Telefon: lista kart z miniaturami zamiast 8-kolumnowej tabeli */}
      <ul className="md:hidden bg-stone-900 border border-stone-800 rounded-2xl divide-y divide-stone-800 overflow-hidden">
        {items.map((item) => {
          const card = item.card;
          const img = getCardImageUri(card, 'small');
          const unit = getCardPrice(card, false, settings);
          const unitFoil = getCardPrice(card, true, settings);
          const total = unit * (item.quantity || 0) + unitFoil * (item.quantityFoil || 0);
          const qty = (item.quantity || 0) + (item.quantityFoil || 0);
          return (
            <li key={item.id} className="flex items-center gap-3 px-3 py-2.5 active:bg-stone-800/60">
              <button
                type="button"
                onClick={() => onViewCardDetails(item)}
                className="flex items-center gap-3 flex-1 min-w-0 text-left"
              >
                <img
                  src={img}
                  alt=""
                  loading="lazy"
                  onError={(e) => handleCardImageError(e, img)}
                  className="w-11 h-[61px] rounded-md object-cover bg-stone-800 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-stone-100 truncate">{card.name}</p>
                  <p className="text-xs text-stone-400 truncate">
                    <span className="tabular-nums">{card.set.toUpperCase()}</span>
                    {card.collector_number ? ` #${card.collector_number}` : ''} · {item.condition} · {item.language}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-1.5 mt-0.5">
                    <span className="text-sm font-bold text-emerald-400 tabular-nums">{formatCurrency(total, settings.currency)}</span>
                    {qty > 1 && (
                      <span className="text-[11px] text-stone-400 tabular-nums">
                        ({[
                          (item.quantity || 0) > 0 ? formatCurrency(unit, settings.currency) : null,
                          (item.quantityFoil || 0) > 0 ? `${formatCurrency(unitFoil, settings.currency)} foil` : null,
                        ].filter(Boolean).join(' · ')} {t('/ szt.')})
                      </span>
                    )}
                    {item.quantityFoil > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-xs text-amber-300">
                        <Sparkles className="w-3 h-3" />
                        {item.quantityFoil}
                      </span>
                    )}
                    {item.isForSale && <CircleDollarSign className="w-3.5 h-3.5 text-emerald-400" aria-label={t('Na sprzedaż')} />}
                  </div>
                </div>
              </button>
              <div className="flex items-center shrink-0 bg-stone-950 border border-stone-800 rounded-full">
                <button
                  type="button"
                  aria-label={t('Zmniejsz ilość: {name}', { name: card.name })}
                  onClick={() => {
                    // ostatni egzemplarz = usunięcie pozycji — pytamy, żeby przypadkowe stuknięcie nic nie skasowało
                    if (qty <= 1 && !window.confirm(t('Usunąć „{name}” z kolekcji?', { name: card.name }))) return;
                    if (item.quantity > 0) onUpdateQuantity(item.id, -1, 0);
                    else onUpdateQuantity(item.id, 0, -1);
                  }}
                  className="w-10 h-10 flex items-center justify-center text-stone-300 active:text-rose-300"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="min-w-[1.5rem] text-center text-sm font-bold text-stone-100 tabular-nums">{qty}</span>
                <button
                  type="button"
                  aria-label={t('Zwiększ ilość: {name}', { name: card.name })}
                  onClick={() => onUpdateQuantity(item.id, 1, 0)}
                  className="w-10 h-10 flex items-center justify-center text-stone-300 active:text-emerald-300"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Tablet i komputer: pełna tabela */}
      <div className="hidden md:block bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden shadow-lg overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-stone-950 text-stone-400 tabular-nums text-[11px] border-b border-stone-800">
              <th className="py-3 px-3">{t('Karta')}</th>
              <th className="py-3 px-3">{t('Koszt')}</th>
              <th className="py-3 px-3">{t('Set / Rzadkość')}</th>
              <th className="py-3 px-3">{t('Stan / Język')}</th>
              <th className="py-3 px-3">{t('Cena (Szt)')}</th>
              <th className="py-3 px-3">{t('Ilość')}</th>
              <th className="py-3 px-3">{t('Wartość')}</th>
              <th className="py-3 px-3 text-right">{t('Akcje')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <CardItem
                key={item.id}
                item={item}
                viewMode="table"
                settings={settings}
                onUpdateQuantity={onUpdateQuantity}
                onDeleteItem={onDeleteItem}
                onEditItem={onEditItem}
                onViewCardDetails={onViewCardDetails}
                onToggleForSale={onToggleForSale}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};
