import React, { useState, useEffect, useMemo } from 'react';
import { CollectionItem, ScryfallCard, CardCondition, CardLanguage, AppSettings, Catalog } from '../types';
import { 
  formatCurrency, 
  getCardImageUri, 
  getCardPrice, 
  getRarityColor, 
  getRarityLabel,
  handleCardImageError,
  DEFAULT_SETTINGS
} from '../utils/formatters';
import { ManaSymbol } from './ManaSymbol';
import { 
  X, 
  ExternalLink, 
  Sparkles, 
  RotateCw, 
  Plus, 
  Check, 
  Coins, 
  ShieldCheck, 
  User, 
  FolderPlus,
  FolderHeart,
  Layers,
  Search,
  CheckCircle2,
  Folder,
  Loader2,
  Tag
} from 'lucide-react';

interface CardModalProps {
  card: ScryfallCard | null;
  existingItem?: CollectionItem | null;
  settings?: AppSettings;
  catalogs?: Catalog[];
  onCreateCatalog?: (name: string, description?: string, color?: string) => Promise<Catalog | null>;
  onClose: () => void;
  onSaveToCollection: (itemData: {
    card: ScryfallCard;
    quantity: number;
    quantityFoil: number;
    condition: CardCondition;
    language: CardLanguage;
    purchasePrice?: number | null;
    notes?: string;
    binder?: string;
  }) => void;
  onAddToWishlist?: (card: ScryfallCard) => void;
}

export const CardModal: React.FC<CardModalProps> = ({
  card,
  existingItem,
  settings,
  catalogs = [],
  onCreateCatalog,
  onClose,
  onSaveToCollection,
  onAddToWishlist
}) => {
  if (!card) return null;

  // Selected print card version (defaults to provided card, can be switched by user)
  const [activeCard, setActiveCard] = useState<ScryfallCard>(card);
  const [activeTab, setActiveTab] = useState<'details' | 'prints'>('details');

  // Prints state
  const [prints, setPrints] = useState<ScryfallCard[]>([]);
  const [isLoadingPrints, setIsLoadingPrints] = useState<boolean>(false);
  const [printsFilter, setPrintsFilter] = useState<string>('');

  const activeSettings = settings || DEFAULT_SETTINGS;
  const plnPriceNorm = getCardPrice(activeCard, false, { ...activeSettings, currency: 'PLN' });
  const plnPriceFoil = getCardPrice(activeCard, true, { ...activeSettings, currency: 'PLN' });

  const [faceIndex, setFaceIndex] = useState<number>(0);
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

  // Sync activeCard if prop card changes
  useEffect(() => {
    setActiveCard(card);
    setFaceIndex(0);
  }, [card.id]);

  // Fetch available prints for this card
  useEffect(() => {
    let isMounted = true;
    async function fetchPrints() {
      setIsLoadingPrints(true);
      try {
        const queryParams = new URLSearchParams();
        if (card?.id) queryParams.set('cardId', card.id);
        if (card?.oracle_id) queryParams.set('oracle_id', card.oracle_id);
        if (card?.name) queryParams.set('name', card.name);

        const res = await fetch(`/api/scryfall/prints?${queryParams.toString()}`);
        if (res.ok) {
          const json = await res.json();
          if (isMounted && Array.isArray(json.data)) {
            setPrints(json.data);
          }
        }
      } catch (err) {
        console.error('Failed to load card prints:', err);
      } finally {
        if (isMounted) setIsLoadingPrints(false);
      }
    }

    fetchPrints();
    return () => {
      isMounted = false;
    };
  }, [card?.id, card?.oracle_id, card?.name]);

  // Filtered prints list
  const filteredPrints = useMemo(() => {
    if (!printsFilter.trim()) return prints;
    const q = printsFilter.toLowerCase().trim();
    return prints.filter(p => 
      p.set_name.toLowerCase().includes(q) ||
      p.set.toLowerCase().includes(q) ||
      p.collector_number.toLowerCase().includes(q) ||
      (p.released_at && p.released_at.includes(q))
    );
  }, [prints, printsFilter]);

  // Handle double-faced transform cards
  const hasMultipleFaces = activeCard.card_faces && activeCard.card_faces.length > 1;
  const currentFace = hasMultipleFaces ? activeCard.card_faces![faceIndex] : null;

  const imageUri = currentFace && currentFace.image_uris
    ? (currentFace.image_uris.large || currentFace.image_uris.normal || '')
    : getCardImageUri(activeCard, 'large');

  const oracleText = currentFace ? currentFace.oracle_text : activeCard.oracle_text;
  const manaCost = currentFace ? currentFace.mana_cost : activeCard.mana_cost;
  const typeLine = currentFace ? currentFace.type_line : activeCard.type_line;

  const handleFlipCard = () => {
    if (hasMultipleFaces) {
      setFaceIndex((prev) => (prev === 0 ? 1 : 0));
    }
  };

  const isFoil = quantityFoil > 0;

  const handleToggleFoil = (toFoil: boolean, updatePriceWithMarket: boolean = false) => {
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
        binder: selectedBinder
      });
      setPrintChangeNotice(
        toFoil
          ? `Zapisano wersję Foil (Błyszcząca) ✨${updatePriceWithMarket && newPrice ? ` (cena: ${newPrice} zł)` : ''}`
          : `Zapisano wersję Standard (Zwykła)${updatePriceWithMarket && newPrice ? ` (cena: ${newPrice} zł)` : ''}`
      );
    } else {
      setPrintChangeNotice(
        toFoil
          ? `Wybrano wersję Foil (Błyszcząca) ✨${updatePriceWithMarket && newPrice ? ` (cena: ${newPrice} zł)` : ''}`
          : `Wybrano wersję Standard (Zwykła)${updatePriceWithMarket && newPrice ? ` (cena: ${newPrice} zł)` : ''}`
      );
    }
    setTimeout(() => setPrintChangeNotice(null), 3500);
  };

  const handleSelectPrint = (print: ScryfallCard) => {
    setActiveCard(print);
    setFaceIndex(0);

    if (existingItem) {
      onSaveToCollection({
        card: print,
        quantity,
        quantityFoil,
        condition,
        language,
        purchasePrice: purchasePrice ? parseFloat(purchasePrice) : null,
        notes,
        binder: selectedBinder
      });
      setPrintChangeNotice(`Zapisano nową wersję printu w kolekcji: [${print.set.toUpperCase()}] #${print.collector_number} (${print.set_name})`);
    } else {
      setPrintChangeNotice(`Wybrano wersję: [${print.set.toUpperCase()}] #${print.collector_number} (${print.set_name})`);
    }
    setTimeout(() => setPrintChangeNotice(null), 3500);
  };

  const handleCreateNewCatalog = async (e: React.FormEvent) => {
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
      // Fallback if no callback provided
      setSelectedBinder(newCatName.trim());
      setNewCatName('');
      setIsCreatingCatalog(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveToCollection({
      card: activeCard,
      quantity,
      quantityFoil,
      condition,
      language,
      purchasePrice: purchasePrice ? parseFloat(purchasePrice) : null,
      notes,
      binder: selectedBinder
    });
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto animate-fade-in">
      <div className="relative bg-stone-900 border border-stone-800 rounded-2xl max-w-5xl w-full overflow-hidden shadow-2xl my-6 text-stone-100 max-h-[92vh] flex flex-col">
        
        {/* Top Header Bar */}
        <div className="px-6 py-4 border-b border-stone-800 bg-stone-950/70 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-xl sm:text-2xl font-black text-amber-100 tracking-tight flex items-center gap-2">
              <span>{activeCard.name}</span>
              {activeCard.promo && (
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40">
                  Promo
                </span>
              )}
            </h2>
            <ManaSymbol cost={manaCost} size="md" />
          </div>

          <div className="flex items-center gap-2">
            {/* Prints Switcher Pill in Top Bar */}
            <button
              onClick={() => setActiveTab(prev => prev === 'prints' ? 'details' : 'prints')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all cursor-pointer ${
                activeTab === 'prints'
                  ? 'bg-amber-500 text-stone-950 border-amber-400 shadow-md'
                  : 'bg-stone-900 hover:bg-stone-800 text-amber-400 border-amber-500/30'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Wersje / Printy ({prints.length || '...'})</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-full bg-stone-900 hover:bg-stone-800 text-stone-400 hover:text-stone-100 border border-stone-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Print Change Notice Banner */}
        {printChangeNotice && (
          <div className="bg-emerald-950/80 border-b border-emerald-600/40 px-6 py-2 text-xs font-semibold text-emerald-300 flex items-center gap-2 shrink-0 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{printChangeNotice}</span>
          </div>
        )}

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">

          {/* If Active Tab is PRINTS selection */}
          {activeTab === 'prints' && (
            <div className="space-y-4 bg-stone-950/80 p-5 rounded-2xl border border-stone-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-extrabold text-amber-300 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-amber-400" />
                    <span>Wybierz wersję / rodzaj printu dla: {activeCard.name}</span>
                  </h3>
                  <p className="text-xs text-stone-400 mt-0.5">
                    Kliknij wybraną wersję poniżej, aby przełączyć podgląd, zaktualizować wycenę i zapisać ten konkretny egzemplarz.
                  </p>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-500" />
                  <input
                    type="text"
                    placeholder="Filtruj wg setu lub numeru..."
                    value={printsFilter}
                    onChange={(e) => setPrintsFilter(e.target.value)}
                    className="w-full bg-stone-900 border border-stone-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-stone-200 placeholder-stone-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {isLoadingPrints ? (
                <div className="py-12 flex flex-col items-center justify-center space-y-3">
                  <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
                  <p className="text-xs text-stone-400">Pobieranie wszystkich wydań ze Scryfall API...</p>
                </div>
              ) : filteredPrints.length === 0 ? (
                <div className="py-8 text-center text-xs text-stone-500">
                  Nie znaleziono wydań spełniających filtr "{printsFilter}".
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 max-h-[500px] overflow-y-auto pr-1">
                  {filteredPrints.map((p) => {
                    const isSelected = p.id === activeCard.id;
                    const pNormPln = getCardPrice(p, false, { ...activeSettings, currency: 'PLN' });
                    const pFoilPln = getCardPrice(p, true, { ...activeSettings, currency: 'PLN' });
                    const pThumb = getCardImageUri(p, 'small');

                    return (
                      <div
                        key={p.id}
                        onClick={() => handleSelectPrint(p)}
                        className={`relative rounded-xl p-3 border transition-all cursor-pointer flex gap-3 ${
                          isSelected
                            ? 'bg-amber-500/10 border-amber-500 ring-2 ring-amber-500/40 shadow-lg'
                            : 'bg-stone-900 hover:bg-stone-850 border-stone-800 hover:border-stone-700'
                        }`}
                      >
                        {/* Print Thumbnail */}
                        <div className="relative shrink-0 w-16 h-22 rounded overflow-hidden bg-stone-950 border border-stone-800 shadow">
                          <img
                            src={pThumb}
                            alt={p.name}
                            referrerPolicy="no-referrer"
                            onError={(e) => handleCardImageError(e, pThumb)}
                            className="w-full h-full object-cover"
                          />
                          {isSelected && (
                            <div className="absolute top-1 right-1 bg-amber-500 text-stone-950 rounded-full p-0.5">
                              <Check className="w-3 h-3 stroke-[3]" />
                            </div>
                          )}
                        </div>

                        {/* Print Details */}
                        <div className="flex-1 min-w-0 flex flex-col justify-between text-xs">
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="uppercase font-mono font-bold text-[10px] bg-stone-800 text-stone-200 px-1.5 py-0.5 rounded border border-stone-700">
                                {p.set.toUpperCase()}
                              </span>
                              <span className="font-mono text-[10px] text-stone-400">
                                #{p.collector_number}
                              </span>
                              <span className={`text-[9px] px-1 rounded border font-semibold ${getRarityColor(p.rarity)}`}>
                                {getRarityLabel(p.rarity).slice(0, 3)}
                              </span>
                            </div>

                            <p className="font-bold text-stone-200 text-xs mt-1 truncate" title={p.set_name}>
                              {p.set_name}
                            </p>

                            <p className="text-[10px] text-stone-400">
                              {p.released_at ? p.released_at.slice(0, 4) : '—'} • {p.artist || 'Artist'}
                            </p>
                          </div>

                          {/* Prices in PLN */}
                          <div className="pt-1.5 border-t border-stone-800/80 flex items-center justify-between">
                            <span className="font-mono font-bold text-emerald-400 text-xs">
                              {formatCurrency(pNormPln, 'PLN')}
                            </span>
                            {pFoilPln > 0 && (
                              <span className="font-mono text-amber-300 text-[10px] flex items-center gap-0.5">
                                <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                                {formatCurrency(pFoilPln, 'PLN')}
                              </span>
                            )}
                          </div>

                          {/* Print Action / State Badge */}
                          <div className="pt-1.5 flex justify-end">
                            {isSelected ? (
                              <span className="text-[10px] font-bold text-amber-300 flex items-center gap-1 bg-amber-500/20 px-2 py-0.5 rounded-md border border-amber-500/30">
                                <Check className="w-3 h-3 stroke-[3]" />
                                <span>{existingItem ? 'Zapisany print' : 'Wybrany print'}</span>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectPrint(p);
                                }}
                                className="text-[10px] font-bold text-stone-300 hover:text-stone-950 flex items-center gap-1 bg-stone-800 hover:bg-amber-400 px-2 py-0.5 rounded-md transition-colors cursor-pointer border border-stone-700 hover:border-amber-400"
                              >
                                <span>{existingItem ? 'Zmień i zapisz print' : 'Wybierz ten print'}</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {isSelected && (
                          <div className="absolute -top-2 right-2 bg-amber-500 text-stone-950 text-[9px] font-black uppercase px-2 py-0.5 rounded-full shadow flex items-center gap-1">
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                            <span>Aktywny</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setActiveTab('details')}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs rounded-xl shadow transition-colors cursor-pointer"
                >
                  Przejdź do zapisu karty &rarr;
                </button>
              </div>
            </div>
          )}

          {/* Standard Details & Collection Form View */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            
            {/* Left Column: Image & Scryfall Quick Links */}
            <div className="md:col-span-5 flex flex-col items-center space-y-4">
              <div className="relative group max-w-[280px] w-full rounded-2xl overflow-hidden shadow-2xl border border-stone-800 bg-stone-950">
                <img
                  src={imageUri}
                  alt={activeCard.name}
                  referrerPolicy="no-referrer"
                  onError={(e) => handleCardImageError(e, imageUri)}
                  className="w-full h-auto object-cover rounded-2xl shadow-inner"
                />

                {/* Flip Button for transform cards */}
                {hasMultipleFaces && (
                  <button
                    type="button"
                    onClick={handleFlipCard}
                    className="absolute bottom-3 right-3 bg-stone-950/90 hover:bg-amber-600 text-amber-300 hover:text-stone-950 p-2.5 rounded-full border border-amber-500/40 shadow-xl transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold"
                  >
                    <RotateCw className="w-4 h-4 animate-spin-once" />
                    <span>Obróć kartę</span>
                  </button>
                )}

                {/* Set & collector badge over image */}
                <div className="absolute top-2 left-2 bg-stone-950/85 backdrop-blur-md px-2 py-1 rounded-lg border border-stone-800 text-[10px] font-mono text-amber-300">
                  [{activeCard.set.toUpperCase()}] #{activeCard.collector_number}
                </div>

                {/* Foil Badge over image */}
                {isFoil && (
                  <div className="absolute top-2 right-2 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 text-stone-950 font-black text-[10px] px-2 py-0.5 rounded-lg shadow-xl flex items-center gap-1 border border-amber-200 animate-pulse">
                    <Sparkles className="w-3 h-3 fill-stone-950" />
                    <span>FOIL</span>
                  </div>
                )}
              </div>

              {/* Price Table from Scryfall (Interactive Foil / Standard selector) */}
              <div className="w-full bg-stone-950/80 p-3.5 rounded-xl border border-stone-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-stone-400 flex items-center gap-1.5 uppercase font-mono">
                    <Coins className="w-3.5 h-3.5 text-amber-400" />
                    <span>Aktualne Ceny Rynkowe (Scryfall)</span>
                  </p>
                  <span className="text-[10px] text-amber-400/80 font-mono">
                    Kliknij, aby wybrać
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {/* PLN Polska (Standard) Cell */}
                  <button
                    type="button"
                    onClick={() => handleToggleFoil(false, true)}
                    title="Kliknij, aby wybrać wersję Standard (Non-Foil) i przestawić cenę"
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer relative group flex flex-col justify-between ${
                      !isFoil
                        ? 'bg-amber-500/15 border-amber-500 ring-2 ring-amber-500/40 shadow-lg'
                        : 'bg-stone-900 hover:bg-stone-850 border-stone-800 hover:border-amber-500/30'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 w-full">
                      <p className={`text-[10px] font-bold ${!isFoil ? 'text-amber-400' : 'text-stone-400'}`}>
                        PLN Polska (Standard)
                      </p>
                      {!isFoil && (
                        <span className="text-[9px] font-black uppercase text-amber-300 bg-amber-500/20 px-1 py-0.2 rounded flex items-center gap-0.5">
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                          Wybrana
                        </span>
                      )}
                    </div>
                    <p className="font-mono font-black text-emerald-400 text-sm mt-1">
                      {formatCurrency(plnPriceNorm, 'PLN')}
                    </p>
                    <span className="text-[9px] text-stone-500 group-hover:text-amber-300/90 mt-1 transition-colors">
                      {!isFoil ? '✓ Aktywna wersja zwykła' : 'Kliknij: wybierz Standard'}
                    </span>
                  </button>

                  {/* PLN Foil Cell */}
                  <button
                    type="button"
                    onClick={() => handleToggleFoil(true, true)}
                    title="Kliknij, aby wybrać wersję Foil (Błyszcząca) i przestawić cenę"
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer relative group flex flex-col justify-between ${
                      isFoil
                        ? 'bg-amber-500/20 border-amber-400 ring-2 ring-amber-500/50 shadow-lg'
                        : 'bg-stone-900 hover:bg-stone-850 border-stone-800 hover:border-amber-500/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 w-full">
                      <p className="text-[10px] text-amber-400 font-bold flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-amber-400" />
                        <span>PLN Foil</span>
                      </p>
                      {isFoil && (
                        <span className="text-[9px] font-black uppercase text-amber-300 bg-amber-500/30 px-1 py-0.2 rounded flex items-center gap-0.5">
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                          Wybrana
                        </span>
                      )}
                    </div>
                    <p className="font-mono font-black text-amber-300 text-sm mt-1">
                      {formatCurrency(plnPriceFoil, 'PLN')}
                    </p>
                    <span className="text-[9px] text-stone-500 group-hover:text-amber-300/90 mt-1 transition-colors">
                      {isFoil ? '✓ Aktywna wersja błyszcząca ✨' : 'Kliknij: wybierz Foil ✨'}
                    </span>
                  </button>

                  {/* EUR Standard */}
                  <button
                    type="button"
                    onClick={() => {
                      if (activeCard.prices?.eur) {
                        setPurchasePrice(parseFloat(activeCard.prices.eur).toFixed(2));
                        if (existingItem) {
                          onSaveToCollection({
                            card: activeCard,
                            quantity,
                            quantityFoil,
                            condition,
                            language,
                            purchasePrice: parseFloat(activeCard.prices.eur),
                            notes,
                            binder: selectedBinder
                          });
                          setPrintChangeNotice(`Ustawiono i zapisano cenę: ${activeCard.prices.eur} EUR`);
                          setTimeout(() => setPrintChangeNotice(null), 3500);
                        }
                      }
                    }}
                    title="Kliknij, aby przypisać tę cenę EUR jako cenę karty"
                    className="bg-stone-900 hover:bg-stone-850 p-2 rounded-lg border border-stone-800 hover:border-stone-700 text-left transition-colors cursor-pointer"
                  >
                    <p className="text-[10px] text-stone-400">EUR Standard</p>
                    <p className="font-mono font-bold text-blue-300 text-sm mt-0.5">
                      {formatCurrency(activeCard.prices?.eur, 'EUR')}
                    </p>
                  </button>

                  {/* USD Standard */}
                  <button
                    type="button"
                    onClick={() => {
                      if (activeCard.prices?.usd) {
                        setPurchasePrice(parseFloat(activeCard.prices.usd).toFixed(2));
                        if (existingItem) {
                          onSaveToCollection({
                            card: activeCard,
                            quantity,
                            quantityFoil,
                            condition,
                            language,
                            purchasePrice: parseFloat(activeCard.prices.usd),
                            notes,
                            binder: selectedBinder
                          });
                          setPrintChangeNotice(`Ustawiono i zapisano cenę: ${activeCard.prices.usd} USD`);
                          setTimeout(() => setPrintChangeNotice(null), 3500);
                        }
                      }
                    }}
                    title="Kliknij, aby przypisać tę cenę USD jako cenę karty"
                    className="bg-stone-900 hover:bg-stone-850 p-2 rounded-lg border border-stone-800 hover:border-stone-700 text-left transition-colors cursor-pointer"
                  >
                    <p className="text-[10px] text-stone-400">USD Standard</p>
                    <p className="font-mono font-bold text-stone-300 text-sm mt-0.5">
                      {formatCurrency(activeCard.prices?.usd, 'USD')}
                    </p>
                  </button>
                </div>

                {activeCard.scryfall_uri && (
                  <a
                    href={activeCard.scryfall_uri}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full mt-2 py-2 px-3 bg-stone-900 hover:bg-stone-800 text-stone-300 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border border-stone-800 transition-colors"
                  >
                    <span>Zobacz ten print na Scryfall.com</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>

              {onAddToWishlist && (
                <button
                  type="button"
                  onClick={() => onAddToWishlist(activeCard)}
                  className="w-full py-2 px-3 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 border border-rose-800/50 transition-colors cursor-pointer"
                >
                  <FolderHeart className="w-4 h-4 text-rose-400" />
                  <span>Dodaj do Listy Życzeń</span>
                </button>
              )}

            </div>

            {/* Right Column: Metadata & Collection Form */}
            <div className="md:col-span-7 flex flex-col justify-between space-y-5">
              <div>
                {/* Active Set & Rarity */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="uppercase font-mono text-xs font-bold bg-amber-500/10 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30">
                    {activeCard.set_name} ({activeCard.set.toUpperCase()}) #{activeCard.collector_number}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded border font-semibold ${getRarityColor(activeCard.rarity)}`}>
                    {getRarityLabel(activeCard.rarity)}
                  </span>
                  {activeCard.artist && (
                    <span className="text-xs text-stone-400 flex items-center gap-1 bg-stone-950 px-2 py-0.5 rounded border border-stone-800">
                      <User className="w-3 h-3 text-stone-500" />
                      <span>{activeCard.artist}</span>
                    </span>
                  )}
                </div>

                <p className="text-xs text-stone-400 mt-2">{typeLine}</p>

                {/* Oracle Text */}
                {oracleText && (
                  <div className="mt-3 p-3.5 bg-stone-950/90 rounded-xl border border-stone-800/90 text-stone-300 text-xs leading-relaxed whitespace-pre-wrap font-serif">
                    {oracleText}
                  </div>
                )}

                {/* Print Quick Switch bar */}
                <div className="mt-4 p-3 bg-stone-950/60 rounded-xl border border-stone-800 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs">
                    <Layers className="w-4 h-4 text-amber-400 shrink-0" />
                    <div>
                      <p className="font-bold text-stone-200">
                        Wydanie: <span className="text-amber-300">[{activeCard.set.toUpperCase()}] #{activeCard.collector_number}</span>
                      </p>
                      <p className="text-[11px] text-stone-400">
                        Dostępnych {prints.length} różnych wydań i grafik
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveTab('prints')}
                    className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-amber-300 rounded-lg text-xs font-bold border border-amber-500/30 transition-colors cursor-pointer shrink-0"
                  >
                    Zmień wersję printu
                  </button>
                </div>

                {/* Format Legalities */}
                {activeCard.legalities && (
                  <div className="mt-4">
                    <p className="text-[11px] font-semibold uppercase text-stone-400 font-mono mb-1.5 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-stone-400" />
                      <span>Formaty i Legalność</span>
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {['commander', 'modern', 'standard', 'pioneer', 'legacy', 'pauper', 'vintage'].map((format) => {
                        const legality = activeCard.legalities?.[format];
                        if (!legality) return null;
                        const isLegal = legality === 'legal';
                        return (
                          <span
                            key={format}
                            className={`text-[10px] px-2 py-0.5 rounded-full capitalize font-mono border ${
                              isLegal
                                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60'
                                : 'bg-stone-900 text-stone-500 border-stone-800 line-through'
                            }`}
                          >
                            {format}: {isLegal ? 'legalna' : legality}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Collection Form / Parameters */}
              <form onSubmit={handleSave} className="bg-stone-950/90 p-4 rounded-xl border border-stone-800 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <FolderPlus className="w-4 h-4" />
                  <span>{existingItem ? 'Edytuj parametry w kolekcji' : 'Dodaj do swojej kolekcji'}</span>
                </h3>

                {/* CATALOG / BINDER SELECTOR */}
                <div className="p-3 bg-stone-900/80 rounded-xl border border-stone-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] uppercase font-bold text-amber-300 flex items-center gap-1.5">
                      <Folder className="w-3.5 h-3.5 text-amber-400" />
                      <span>Wybierz Katalog dla tej karty:</span>
                    </label>

                    {!isCreatingCatalog && (
                      <button
                        type="button"
                        onClick={() => setIsCreatingCatalog(true)}
                        className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 font-semibold cursor-pointer underline"
                      >
                        <Plus className="w-3 h-3" />
                        <span>+ Nowy katalog</span>
                      </button>
                    )}
                  </div>

                  {/* Inline Create Catalog Form */}
                  {isCreatingCatalog ? (
                    <div className="p-2.5 bg-stone-950 rounded-lg border border-amber-500/40 space-y-2 animate-fadeIn">
                      <p className="text-[10px] uppercase font-bold text-stone-300">Tworzenie nowego katalogu:</p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Nazwa katalogu (np. Talia Modern, Inwestycyjne)..."
                          value={newCatName}
                          onChange={(e) => setNewCatName(e.target.value)}
                          className="flex-1 bg-stone-900 border border-stone-700 rounded-lg px-2.5 py-1 text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={handleCreateNewCatalog}
                          disabled={!newCatName.trim() || isCreatingCatalogLoading}
                          className="px-3 py-1 bg-amber-500 text-stone-950 font-bold text-xs rounded-lg hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
                        >
                          {isCreatingCatalogLoading ? 'Zapis...' : 'Utwórz'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsCreatingCatalog(false);
                            setNewCatName('');
                          }}
                          className="px-2 py-1 bg-stone-800 text-stone-400 text-xs rounded-lg hover:text-stone-200 cursor-pointer"
                        >
                          Anuluj
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <select
                        value={selectedBinder}
                        onChange={(e) => setSelectedBinder(e.target.value)}
                        className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-xs font-semibold text-stone-100 focus:outline-none focus:border-amber-500 cursor-pointer"
                      >
                        {catalogs.length > 0 ? (
                          catalogs.map(cat => (
                            <option key={cat.id} value={cat.name}>
                              📁 {cat.name} {cat.isDefault ? '(Domyślny)' : ''}
                            </option>
                          ))
                        ) : (
                          <option value="Klaser Główny">📁 Klaser Główny</option>
                        )}
                      </select>

                      <div className="flex items-center text-xs text-stone-400 bg-stone-950/60 px-3 py-1.5 rounded-lg border border-stone-800">
                        <span>Aktualny cel: <strong className="text-amber-300 font-mono">{selectedBinder}</strong></span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {/* Normal Quantity */}
                  <div>
                    <label className="block text-[10px] uppercase font-semibold text-stone-400 mb-1">
                      Ilość (Zwykłe)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full bg-stone-900 border border-stone-700 rounded-lg px-2.5 py-1.5 text-sm font-mono font-bold text-stone-100 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  {/* Foil Quantity */}
                  <div>
                    <label className="block text-[10px] uppercase font-semibold text-amber-400 mb-1 flex items-center gap-1">
                      <Sparkles className="w-2.5 h-2.5" />
                      <span>Ilość (Foil)</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={quantityFoil}
                      onChange={(e) => setQuantityFoil(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full bg-stone-900 border border-stone-700 rounded-lg px-2.5 py-1.5 text-sm font-mono font-bold text-amber-300 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  {/* Condition */}
                  <div>
                    <label className="block text-[10px] uppercase font-semibold text-stone-400 mb-1">
                      Stan karty
                    </label>
                    <select
                      value={condition}
                      onChange={(e) => setCondition(e.target.value as CardCondition)}
                      className="w-full bg-stone-900 border border-stone-700 rounded-lg px-2 py-1.5 text-xs text-stone-100 focus:outline-none focus:border-amber-500 cursor-pointer"
                    >
                      <option value="NM">Near Mint (NM)</option>
                      <option value="EX">Excellent (EX)</option>
                      <option value="GD">Good (GD)</option>
                      <option value="LP">Lightly Played (LP)</option>
                      <option value="PL">Played (PL)</option>
                    </select>
                  </div>

                  {/* Language */}
                  <div>
                    <label className="block text-[10px] uppercase font-semibold text-stone-400 mb-1">
                      Język
                    </label>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value as CardLanguage)}
                      className="w-full bg-stone-900 border border-stone-700 rounded-lg px-2 py-1.5 text-xs text-stone-100 focus:outline-none focus:border-amber-500 cursor-pointer"
                    >
                      <option value="EN">Angielski (EN)</option>
                      <option value="PL">Polski (PL)</option>
                      <option value="DE">Niemiecki (DE)</option>
                      <option value="FR">Francuski (FR)</option>
                      <option value="JP">Japoński (JP)</option>
                      <option value="IT">Włoski (IT)</option>
                      <option value="ES">Hiszpański (ES)</option>
                      <option value="OTHER">Inny</option>
                    </select>
                  </div>
                </div>

                {/* Purchase Price & Notes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] uppercase font-semibold text-stone-400 mb-1">
                      Cena zakupu (opcjonalnie)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="np. 15.50"
                      value={purchasePrice}
                      onChange={(e) => setPurchasePrice(e.target.value)}
                      className="w-full bg-stone-900 border border-stone-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-stone-100 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-semibold text-stone-400 mb-1">
                      Notatki / tagi
                    </label>
                    <input
                      type="text"
                      placeholder="np. Karta z pre-release, podpisana..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full bg-stone-900 border border-stone-700 rounded-lg px-2.5 py-1.5 text-xs text-stone-100 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={quantity === 0 && quantityFoil === 0}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-extrabold text-xs tracking-wider uppercase flex items-center justify-center gap-2 shadow-lg shadow-amber-950/40 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSaved ? (
                    <>
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>Zapisano w katalogu "{selectedBinder}"!</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 stroke-[3]" />
                      <span>Zapisz w katalogu "{selectedBinder}"</span>
                    </>
                  )}
                </button>
              </form>

            </div>

          </div>

        </div>

      </div>
    </div>
  );
};
