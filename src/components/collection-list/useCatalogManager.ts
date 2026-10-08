import { useState, useMemo, useCallback } from 'react';
import type { FormEvent, MouseEvent } from 'react';
import { CollectionItem, Catalog, AppSettings } from '../../types';
import { getCardPrice } from '../../utils/formatters';
import { CatalogStatItem } from './types';

interface UseCatalogManagerProps {
  collection: CollectionItem[];
  settings: AppSettings;
  catalogs?: Catalog[];
  activeBinder: string;
  onSelectBinder: (binder: string) => void;
  onCreateCatalog?: (name: string, description?: string, color?: string, isDefault?: boolean) => Promise<Catalog | null>;
  onUpdateCatalog?: (id: string, updates: Partial<Catalog>) => Promise<void>;
  onDeleteCatalog?: (id: string) => Promise<void>;
  onEmptyCatalog?: (id: string) => Promise<void>;
}

export function useCatalogManager({
  collection,
  settings,
  catalogs = [],
  activeBinder,
  onSelectBinder,
  onCreateCatalog,
  onUpdateCatalog,
  onDeleteCatalog,
  onEmptyCatalog,
}: UseCatalogManagerProps) {
  // Catalog modal state (create or edit)
  const [isCatalogModalOpen, setIsCatalogModalOpen] = useState<boolean>(false);
  const [editingCatalog, setEditingCatalog] = useState<Catalog | null>(null);
  const [modalCatName, setModalCatName] = useState<string>('');
  const [modalCatDesc, setModalCatDesc] = useState<string>('');
  const [modalCatColor, setModalCatColor] = useState<string>('amber');
  const [modalCatIsDefault, setModalCatIsDefault] = useState<boolean>(false);
  const [catalogModalError, setCatalogModalError] = useState<string | null>(null);
  const [isCatalogSaving, setIsCatalogSaving] = useState<boolean>(false);

  // Delete catalog confirmation
  const [catalogToDelete, setCatalogToDelete] = useState<Catalog | null>(null);
  // Opróżnienie katalogu (usunięcie jego kart)
  const [catalogToEmpty, setCatalogToEmpty] = useState<Catalog | null>(null);

  // Compute catalog stats (counts and total values)
  const catalogStats = useMemo(() => {
    const stats = new Map<string, CatalogStatItem>();

    collection.forEach(item => {
      const card = item.card;
      if (!card || item.isForSale) return; // karty na sprzedaż są w kategorii „Sprzedam”
      const b = item.binder || 'Klaser Główny';
      const existing = stats.get(b) || { count: 0, totalCards: 0, totalValue: 0 };

      const qty = item.quantity + item.quantityFoil;
      const normPrice = getCardPrice(card, false, settings);
      const foilPrice = getCardPrice(card, true, settings);
      const val = (item.quantity * normPrice) + (item.quantityFoil * foilPrice);

      existing.count += 1;
      existing.totalCards += qty;
      existing.totalValue += val;
      stats.set(b, existing);
    });

    return stats;
  }, [collection, settings]);

  const openCreateCatalogModal = useCallback(() => {
    setEditingCatalog(null);
    setModalCatName('');
    setModalCatDesc('');
    setModalCatColor('amber');
    setModalCatIsDefault(catalogs.length === 0);
    setCatalogModalError(null);
    setIsCatalogModalOpen(true);
  }, [catalogs.length]);

  const openEditCatalogModal = useCallback((cat: Catalog, e?: MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingCatalog(cat);
    setModalCatName(cat.name);
    setModalCatDesc(cat.description || '');
    setModalCatColor(cat.color || 'amber');
    setModalCatIsDefault(Boolean(cat.isDefault));
    setCatalogModalError(null);
    setIsCatalogModalOpen(true);
  }, []);

  const closeCatalogModal = useCallback(() => {
    setIsCatalogModalOpen(false);
  }, []);

  const handleSaveCatalogModal = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!modalCatName.trim()) {
      setCatalogModalError('Nazwa katalogu jest wymagana');
      return;
    }

    setIsCatalogSaving(true);
    setCatalogModalError(null);

    try {
      if (editingCatalog && onUpdateCatalog) {
        await onUpdateCatalog(editingCatalog.id, {
          // nazwy głównego klasera nie zmieniamy
          name: editingCatalog.isMain ? editingCatalog.name : modalCatName.trim(),
          description: modalCatDesc.trim(),
          color: modalCatColor,
          isDefault: modalCatIsDefault,
        });
        if (!editingCatalog.isMain && activeBinder === editingCatalog.name) {
          onSelectBinder(modalCatName.trim());
        }
      } else if (onCreateCatalog) {
        const created = await onCreateCatalog(
          modalCatName.trim(),
          modalCatDesc.trim(),
          modalCatColor,
          modalCatIsDefault
        );
        if (created) {
          onSelectBinder(created.name);
        }
      }
      setIsCatalogModalOpen(false);
    } catch (err: any) {
      setCatalogModalError(err.message || 'Wystąpił błąd podczas zapisywania katalogu');
    } finally {
      setIsCatalogSaving(false);
    }
  }, [modalCatName, modalCatDesc, modalCatColor, modalCatIsDefault, editingCatalog, onUpdateCatalog, activeBinder, onSelectBinder, onCreateCatalog]);

  const handleDeleteCatalogConfirm = useCallback(async () => {
    if (!catalogToDelete || !onDeleteCatalog) return;
    try {
      const deletedName = catalogToDelete.name;
      await onDeleteCatalog(catalogToDelete.id);
      if (activeBinder === deletedName) {
        onSelectBinder('ALL');
      }
      setCatalogToDelete(null);
    } catch (err: any) {
      console.error('Failed to delete catalog:', err);
      alert(err.message || 'Nie udało się usunąć katalogu');
    }
  }, [catalogToDelete, onDeleteCatalog, activeBinder, onSelectBinder]);

  const handleEmptyCatalogConfirm = useCallback(async () => {
    if (!catalogToEmpty || !onEmptyCatalog) return;
    await onEmptyCatalog(catalogToEmpty.id);
    setCatalogToEmpty(null);
  }, [catalogToEmpty, onEmptyCatalog]);

  return {
    catalogStats,
    catalogToEmpty,
    setCatalogToEmpty,
    handleEmptyCatalogConfirm,
    isCatalogModalOpen,
    editingCatalog,
    modalCatName,
    modalCatDesc,
    modalCatColor,
    modalCatIsDefault,
    catalogModalError,
    isCatalogSaving,
    catalogToDelete,
    setModalCatName,
    setModalCatDesc,
    setModalCatColor,
    setModalCatIsDefault,
    setCatalogToDelete,
    openCreateCatalogModal,
    openEditCatalogModal,
    closeCatalogModal,
    handleSaveCatalogModal,
    handleDeleteCatalogConfirm,
  };
}
