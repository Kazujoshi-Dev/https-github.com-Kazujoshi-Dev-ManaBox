import React from 'react';
import { CardItem } from '../CardItem';
import { CollectionGridViewProps } from './types';

export const CollectionGridView: React.FC<CollectionGridViewProps> = ({
  items,
  settings,
  onUpdateQuantity,
  onDeleteItem,
  onEditItem,
  onViewCardDetails,
  onToggleForSale,
}) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {items.map(item => (
        <CardItem
          key={item.id}
          item={item}
          viewMode="grid"
          settings={settings}
          onUpdateQuantity={onUpdateQuantity}
          onDeleteItem={onDeleteItem}
          onEditItem={onEditItem}
          onViewCardDetails={onViewCardDetails}
          onToggleForSale={onToggleForSale}
        />
      ))}
    </div>
  );
};

