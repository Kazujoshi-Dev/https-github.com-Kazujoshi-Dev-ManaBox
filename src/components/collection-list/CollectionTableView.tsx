import React from 'react';
import { CardItem } from '../CardItem';
import { CollectionTableViewProps } from './types';

export const CollectionTableView: React.FC<CollectionTableViewProps> = ({
  items,
  settings,
  onUpdateQuantity,
  onDeleteItem,
  onEditItem,
  onViewCardDetails,
  onToggleForSale,
}) => {
  return (
    <div className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden shadow-lg overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-stone-950 text-stone-400 uppercase font-mono text-[10px] tracking-wider border-b border-stone-800">
            <th className="py-3 px-3">Karta</th>
            <th className="py-3 px-3">Koszt</th>
            <th className="py-3 px-3">Set / Rzadkość</th>
            <th className="py-3 px-3">Stan / Język</th>
            <th className="py-3 px-3">Cena (Szt)</th>
            <th className="py-3 px-3">Ilość</th>
            <th className="py-3 px-3">Wartość</th>
            <th className="py-3 px-3 text-right">Akcje</th>
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
  );
};

