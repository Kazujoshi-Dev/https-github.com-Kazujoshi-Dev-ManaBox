import { useState, useRef, useEffect, useCallback, FormEvent } from 'react';
import { CollectionItem, ScryfallCard, CardCondition, CardLanguage, Catalog } from '../../types';
import { CardSaveData } from './types';

interface UseCardModalFormProps {
  card: ScryfallCard;
  existingItem?: CollectionItem | null;
  catalogs?: Catalog[];
  onCreateCatalog?: (name: string, description?: string, color?: string) => Promise<Catalog | null>;
  onSaveToCollection: (itemData: CardSaveData) => void;
  onClose: () => void;
  onSelectPrint?: (newCard: ScryfallCard, oldCard: ScryfallCard) => void;
}

export function useCardModalForm({
  card,
  existingItem,
  catalogs = [],
  onCreateCatalog,
  onSaveToCollection,
  onClose,
  onSelectPrint,
}: UseCardModalFormProps) {
  // Current active card version (can be switched between prints)
  const [activeCard, setActiveCard] = useState<ScryfallCard>(card);
  const [faceIndex, setFaceIndex] = useState<number>(0);

  // Form Fields
  const [quantity, setQuantity] = useState<number>(existingItem ? existingItem.quantity : 1);
  const [quantityFoil, setQuantityFoil] = useState<number>(existingItem ? existingItem.quantityFoil : 0);
  const [condition, setCondition] = useState<CardCondition>(existingItem ? existingItem.condition : 'NM');
  const [language, setLanguage] = useState<CardLanguage>(existingItem ? existingItem.language : 'EN');
  const [purchasePrice, setPurchasePrice] = useState<string>(
    existingItem && existingItem.purchasePrice !== undefined && existingItem.purchasePrice !== null
      ? String(existingItem.purchasePrice)
      : ''
  );

  // Catalog / Binder selection
  const [selectedBinder, setSelectedBinder] = useState<string>(() => {
    if (existingItem?.binder) return existingItem.binder;
    if (catalogs.length > 0) {
      const defaultCat = catalogs.find(c => c.isDefault);
      if (defaultCat) return defaultCat.name;
      return catalogs[0].name;
    }
    return 'Klaser Główny';
  });

  // Inline new catalog creation state
  const [isCreatingCatalog, setIsCreatingCatalog] = useState<boolean>(false);
  const [newCatName, setNewCatName] = useState<string>('');
  const [newCatColor, setNewCatColor] = useState<string>('amber');
  const [isCreatingCatalogLoading, setIsCreatingCatalogLoading] = useState<boolean>(false);

  const [notes, setNotes] = useState<string>(existingItem ? existingItem.notes || '' : '');
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [printChangeNotice, setPrintChangeNotice] = useState<string | null>(null);

  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  // Sync activeCard if prop card changes
  useEffect(() => {
    setActiveCard(card);
    setFaceIndex(0);
  }, [card.id]);

  const showNotice = useCallback((message: string, durationMs: number = 3500) => {
    setPrintChangeNotice(message);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => {
      setPrintChangeNotice(null);
    }, durationMs);
  }, []);

  const handleFlipCard = useCallback(() => {
    if (activeCard.card_faces && activeCard.card_faces.length > 1) {
      setFaceIndex(prev => (prev === 0 ? 1 : 0));
    }
  }, [activeCard.card_faces]);

  const handleToggleFoil = useCallback((
    toFoil: boolean,
    updatePriceWithMarket: boolean = false,
    plnPriceNorm: number = 0,
    plnPriceFoil: number = 0
  ) => {
    let newQtyNorm = quantity;
    let newQtyFoil = quantityFoil;
    let newPrice = purchasePrice;

    if (toFoil) {
      newQtyFoil = quantityFoil > 0 ? quantityFoil : (quantity > 0 ? quantity : 1);
      newQtyNorm = 0;
      if (updatePriceWithMarket && plnPriceFoil > 0) {
        newPrice = plnPriceFoil.toFixed(2);
      }
    } else {
      newQtyNorm = quantity > 0 ? quantity : (quantityFoil > 0 ? quantityFoil : 1);
      newQtyFoil = 0;
      if (updatePriceWithMarket && plnPriceNorm > 0) {
        newPrice = plnPriceNorm.toFixed(2);
      }
    }

    setQuantity(newQtyNorm);
    setQuantityFoil(newQtyFoil);
    if (newPrice !== purchasePrice) {
      setPurchasePrice(newPrice);
    }

    if (existingItem) {
      onSaveToCollection({
        card: activeCard,
        quantity: newQtyNorm,
        quantityFoil: newQtyFoil,
        condition,
        language,
        purchasePrice: newPrice ? parseFloat(newPrice) : null,
        notes,
        binder: selectedBinder,
      });
      showNotice(
        toFoil
          ? `Zapisano wersję Foil (Błyszcząca) ✨${updatePriceWithMarket && newPrice ? ` (cena: ${newPrice} zł)` : ''}`
          : `Zapisano wersję Standard (Zwykła)${updatePriceWithMarket && newPrice ? ` (cena: ${newPrice} zł)` : ''}`
      );
    } else {
      showNotice(
        toFoil
          ? `Wybrano wersję Foil (Błyszcząca) ✨${updatePriceWithMarket && newPrice ? ` (cena: ${newPrice} zł)` : ''}`
          : `Wybrano wersję Standard (Zwykła)${updatePriceWithMarket && newPrice ? ` (cena: ${newPrice} zł)` : ''}`
      );
    }
  }, [quantity, quantityFoil, purchasePrice, existingItem, onSaveToCollection, activeCard, condition, language, notes, selectedBinder, showNotice]);

  const handleSelectPrint = useCallback((print: ScryfallCard) => {
    const oldCard = activeCard;
    setActiveCard(print);
    setFaceIndex(0);

    if (onSelectPrint) {
      onSelectPrint(print, oldCard);
    }

    if (existingItem) {
      onSaveToCollection({
        card: print,
        quantity,
        quantityFoil,
        condition,
        language,
        purchasePrice: purchasePrice ? parseFloat(purchasePrice) : null,
        notes,
        binder: selectedBinder,
      });
      showNotice(`Zapisano nową wersję printu: [${print.set.toUpperCase()}] #${print.collector_number} (${print.set_name})`);
    } else {
      showNotice(`Wybrano wersję: [${print.set.toUpperCase()}] #${print.collector_number} (${print.set_name})`);
    }
  }, [activeCard, onSelectPrint, existingItem, onSaveToCollection, quantity, quantityFoil, condition, language, purchasePrice, notes, selectedBinder, showNotice]);

  const handleSelectCurrencyPrice = useCallback((priceStr: string | undefined, currency: 'EUR' | 'USD') => {
    if (!priceStr) return;
    const formatted = parseFloat(priceStr).toFixed(2);
    setPurchasePrice(formatted);

    if (existingItem) {
      onSaveToCollection({
        card: activeCard,
        quantity,
        quantityFoil,
        condition,
        language,
        purchasePrice: parseFloat(priceStr),
        notes,
        binder: selectedBinder,
      });
      showNotice(`Ustawiono i zapisano cenę: ${priceStr} ${currency}`);
    }
  }, [existingItem, onSaveToCollection, activeCard, quantity, quantityFoil, condition, language, notes, selectedBinder, showNotice]);

  const handleCreateNewCatalog = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    if (onCreateCatalog) {
      setIsCreatingCatalogLoading(true);
      try {
        const created = await onCreateCatalog(newCatName.trim(), '', newCatColor);
        if (created) {
          setSelectedBinder(created.name);
          setNewCatName('');
          setIsCreatingCatalog(false);
        }
      } catch (err) {
        console.error('Error creating catalog:', err);
      } finally {
        setIsCreatingCatalogLoading(false);
      }
    } else {
      setSelectedBinder(newCatName.trim());
      setNewCatName('');
      setIsCreatingCatalog(false);
    }
  }, [newCatName, newCatColor, onCreateCatalog]);

  const handleSave = useCallback((e: FormEvent) => {
    e.preventDefault();
    onSaveToCollection({
      card: activeCard,
      quantity,
      quantityFoil,
      condition,
      language,
      purchasePrice: purchasePrice ? parseFloat(purchasePrice) : null,
      notes,
      binder: selectedBinder,
    });
    setIsSaved(true);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 600);
  }, [onSaveToCollection, activeCard, quantity, quantityFoil, condition, language, purchasePrice, notes, selectedBinder, onClose]);

  return {
    activeCard,
    faceIndex,
    quantity,
    setQuantity,
    quantityFoil,
    setQuantityFoil,
    condition,
    setCondition,
    language,
    setLanguage,
    purchasePrice,
    setPurchasePrice,
    selectedBinder,
    setSelectedBinder,
    notes,
    setNotes,
    isSaved,
    printChangeNotice,
    isCreatingCatalog,
    setIsCreatingCatalog,
    newCatName,
    setNewCatName,
    newCatColor,
    setNewCatColor,
    isCreatingCatalogLoading,
    handleFlipCard,
    handleToggleFoil,
    handleSelectPrint,
    handleSelectCurrencyPrice,
    handleCreateNewCatalog,
    handleSave,
  };
}
