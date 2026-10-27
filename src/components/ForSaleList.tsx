import { PageHeader } from './ui/PageHeader';
import { publicUrl, saleFolderUrl } from '../utils/publicLinks';
import { saleFoldersApi } from '../services/api';
import React, { useState, useMemo, useEffect, useCallback, Suspense } from 'react';
import { lazyWithReload } from '../utils/lazyWithReload';
import { CollectionItem, AppSettings, AuthUser, SaleFolder } from '../types';
import { formatCurrency, getCardPrice, getSaleMarketPrice, getItemSalePrice, getCardImageUri, getRarityColor, getRarityLabel, getCardEdhrecRank, handleCardImageError } from '../utils/formatters';
import { ManaSymbol } from './ManaSymbol';
import { EdhrecBadge } from './EdhrecBadge';
import { 
  CircleDollarSign, 
  Link, 
  Copy, 
  Check, 
  ExternalLink, 
  Search, 
  ArrowUpDown, 
  Sparkles, 
  Trash2, 
  Eye, 
  FileText, 
  Folder, 
  ShoppingBag,
  Share2,
  DollarSign,
  Map as MapIcon,
  Loader2,
  Plus,
  ImageDown,
  FolderPlus,
  FolderOpen,
  Pencil,
  ChevronDown,
  GripVertical,
  Inbox
} from 'lucide-react';
import { useT, plural } from '../i18n';

// Mapa (Leaflet) ładowana dopiero po otwarciu — nie spowalnia reszty aplikacji
const SellersMapModal = lazyWithReload(() => import('./SellersMapModal'));
const ForSaleAddModal = lazyWithReload(() => import('./for-sale/ForSaleAddModal'));

interface ForSaleListProps {
  collection: CollectionItem[];
  settings: AppSettings;
  currentUser: AuthUser | null;
  onToggleForSale: (item: CollectionItem, customPrice?: number | null) => Promise<void> | void;
  onUpdateCollectionItem: (id: string, updates: Partial<CollectionItem>) => Promise<CollectionItem | null> | void;
  /** Zmiana pozycji tylko w stanie aplikacji (po przeniesieniu do folderu). */
  onPatchCollectionItems?: (ids: string[], patch: Partial<CollectionItem>) => void;
  onViewCardDetails: (item: CollectionItem) => void;
  onGoToCollection: () => void;
  showToast?: (message: string) => void;
  onOpenSellerProfile?: (username: string) => void;
  onAddCardForSale?: (data: import('./for-sale/ForSaleAddModal').ForSaleAddData) => Promise<boolean>;
}

export const ForSaleList: React.FC<ForSaleListProps> = ({
  collection,
  settings,
  currentUser,
  onToggleForSale,
  onUpdateCollectionItem,
  onPatchCollectionItems,
  onViewCardDetails,
  onGoToCollection,
  showToast,
  onOpenSellerProfile,
  onAddCardForSale,
}) => {
  const t = useT();
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCondition, setFilterCondition] = useState<string>('all');
  const [filterFoilOnly, setFilterFoilOnly] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<'price-desc' | 'price-asc' | 'name' | 'edhrec'>('price-desc');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [tempPrice, setTempPrice] = useState<string>('');
  const [imagesProgress, setImagesProgress] = useState<{ done: number; total: number } | null>(null);

  // 1. Filter only cards marked for sale
  const allForSaleCards = useMemo(() => {
    return collection.filter(item => Boolean(item.isForSale));
  }, [collection]);

  // Metrics
  const totalCardsCount = useMemo(() => {
    return allForSaleCards.reduce((sum, item) => sum + item.quantity + item.quantityFoil, 0);
  }, [allForSaleCards]);

  const totalValue = useMemo(() => {
    return allForSaleCards.reduce((sum, item) => {
      if (item.salePrice !== undefined && item.salePrice !== null) {
        return sum + (item.salePrice * (item.quantity + item.quantityFoil));
      }
      const priceNorm = getSaleMarketPrice(item.card, false, settings);
      const priceFoil = getSaleMarketPrice(item.card, true, settings);
      return sum + (item.quantity * priceNorm) + (item.quantityFoil * priceFoil);
    }, 0);
  }, [allForSaleCards, settings]);

  // Public link generation
  const publicShareSlug = currentUser?.username || currentUser?.id || 'oferta';
  const publicShareUrl = publicUrl('sale', publicShareSlug);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicShareUrl);
    setCopiedLink(true);
    showToast?.(t('Skopiowano publiczny link do schowka! Każdy bez konta może go otworzyć.'));
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleCopyTextList = () => {
    if (allForSaleCards.length === 0) return;
    const textList = allForSaleCards
      .map(item => {
        const totalQty = item.quantity + item.quantityFoil;
        const foilTag = item.quantityFoil > 0 ? ' [FOIL]' : '';
        const price = item.salePrice !== undefined && item.salePrice !== null
          ? formatCurrency(item.salePrice, settings.currency)
          : formatCurrency(getSaleMarketPrice(item.card, Boolean(item.quantityFoil > 0), settings), settings.currency);
        return `${totalQty}x ${item.card.name} (${item.card.set.toUpperCase()}) #${item.card.collector_number}${foilTag} [${item.condition}, ${item.language}] - ${price}`;
      })
      .join('\n');

    const header = `=== ${t('KARTY NA SPRZEDAŻ')} (${currentUser?.username || t('Gracz MTG')}) ===\n${t('Łącznie: {n} szt.', { n: totalCardsCount })} | ${t('Wartość:')} ${formatCurrency(totalValue, settings.currency)}\n${t('Publiczna oferta:')} ${publicShareUrl}\n\n`;
    navigator.clipboard.writeText(header + textList);
    setCopiedText(true);
    showToast?.(t('Skopiowano listę kart (.txt) gotową do wklejenia na grupach MTG / Discord!'));
    setTimeout(() => setCopiedText(false), 2500);
  };

  // Grafiki JPG (lub ZIP) z kartami widocznymi po filtrach, do wklejenia na Facebooka
  const handleDownloadImages = async () => {
    if (imagesProgress || displayedCards.length === 0) return;
    const username = currentUser?.username || t('Gracz MTG');
    setImagesProgress({ done: 0, total: displayedCards.length });
    try {
      const { downloadSaleImages } = await import('../utils/saleImages');
      const count = await downloadSaleImages({
        cards: displayedCards.map(item => {
          const foil = item.quantityFoil > 0;
          const qty = item.quantity + item.quantityFoil;
          const price = getItemSalePrice(item, foil, settings);
          return {
            imageUri: getCardImageUri(item.card, 'normal'),
            name: item.card.name,
            meta: `${item.card.set.toUpperCase()} #${item.card.collector_number} • ${item.condition} • ${item.language}`,
            foil,
            quantityText: `${qty} ${t('szt.')}`,
            priceText: formatCurrency(price, settings.currency),
          };
        }),
        username,
        offerUrl: publicShareUrl.replace(/^https?:\/\//, ''),
        title: t('Sprzedam'),
        pageLabel: (page, count) => t('Strona {page} z {count}', { page, count }),
        foilLabel: t('Foil'),
        fileBase: `sprzedam-${username}`.replace(/[^\p{L}\p{N}_-]+/gu, '-'),
        onProgress: (done, total) => setImagesProgress({ done, total }),
      });
      showToast?.(count > 1 ? t('Pobrano paczkę .zip z {n} grafikami.', { n: count }) : t('Pobrano grafikę .jpg z ofertą.'));
    } catch {
      showToast?.(t('Nie udało się utworzyć grafik. Spróbuj ponownie.'));
    } finally {
      setImagesProgress(null);
    }
  };

  const handleSaveCustomPrice = async (item: CollectionItem) => {
    const val = parseFloat(tempPrice.replace(',', '.'));
    const finalPrice = isNaN(val) || val <= 0 ? null : val;
    await onUpdateCollectionItem(item.id, { salePrice: finalPrice });
    setEditingPriceId(null);
    setTempPrice('');
    showToast?.(finalPrice !== null ? t('Zapisano własną cenę {price} dla "{name}"', { price: formatCurrency(finalPrice, settings.currency), name: item.card.name }) : t('Przywrócono domyślną cenę rynkową dla "{name}"', { name: item.card.name }));
  };

  // Filtered & sorted cards
  const displayedCards = useMemo(() => {
    return allForSaleCards
      .filter(item => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase().trim();
        return (
          item.card.name.toLowerCase().includes(q) ||
          (item.card.type_line && item.card.type_line.toLowerCase().includes(q)) ||
          item.card.set.toLowerCase().includes(q) ||
          item.card.set_name.toLowerCase().includes(q) ||
          (item.notes && item.notes.toLowerCase().includes(q))
        );
      })
      .filter(item => {
        if (filterCondition === 'all') return true;
        return item.condition === filterCondition;
      })
      .filter(item => {
        if (!filterFoilOnly) return true;
        return item.quantityFoil > 0;
      })
      .sort((a, b) => {
        if (sortBy === 'price-desc') {
          const valA = getItemSalePrice(a, Boolean(a.quantityFoil > 0), settings);
          const valB = getItemSalePrice(b, Boolean(b.quantityFoil > 0), settings);
          return valB - valA;
        }
        if (sortBy === 'price-asc') {
          const valA = getItemSalePrice(a, Boolean(a.quantityFoil > 0), settings);
          const valB = getItemSalePrice(b, Boolean(b.quantityFoil > 0), settings);
          return valA - valB;
        }
        if (sortBy === 'name') {
          return a.card.name.localeCompare(b.card.name);
        }
        if (sortBy === 'edhrec') {
          const rankA = a.card.edhrec_rank ?? 999999;
          const rankB = b.card.edhrec_rank ?? 999999;
          return rankA - rankB;
        }
        return 0;
      });
  }, [allForSaleCards, searchQuery, filterCondition, filterFoilOnly, sortBy, settings]);

  // ---------- Foldery oferty ----------
  const [folders, setFolders] = useState<SaleFolder[]>([]);
  const [newFolderName, setNewFolderName] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [copiedFolderId, setCopiedFolderId] = useState<string | null>(null);
  const [dragItemId, setDragItemId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [folderBusy, setFolderBusy] = useState(false);
  const canOrganize = folders.length > 0 && Boolean(currentUser);

  useEffect(() => {
    if (!currentUser) return;
    saleFoldersApi.list().then(setFolders).catch(() => {});
  }, [currentUser?.id]);

  const folderIds = useMemo(() => new Set(folders.map((f) => f.id)), [folders]);
  /** Folder karty (null = lista główna; karty z usuniętego folderu też trafiają na listę główną). */
  const folderOf = useCallback(
    (item: CollectionItem) => (item.saleFolderId && folderIds.has(item.saleFolderId) ? item.saleFolderId : null),
    [folderIds]
  );

  const moveItems = useCallback(
    async (ids: string[], folderId: string | null) => {
      const items = allForSaleCards.filter((i) => ids.includes(i.id) && folderOf(i) !== folderId);
      if (!items.length) return;
      const previous = new Map(items.map((i) => [i.id, i.saleFolderId ?? null]));
      onPatchCollectionItems?.(items.map((i) => i.id), { saleFolderId: folderId });
      try {
        await saleFoldersApi.move(items.map((i) => i.id), folderId);
        const target = folderId ? folders.find((f) => f.id === folderId)?.name : t('Lista główna');
        showToast?.(
          items.length === 1
            ? t('Przeniesiono "{name}" do: {target}', { name: items[0].card.name, target: target || '' })
            : t('Przeniesiono karty ({n}) do: {target}', { n: items.length, target: target || '' })
        );
      } catch (err: any) {
        for (const [id, prev] of previous) onPatchCollectionItems?.([id], { saleFolderId: prev });
        showToast?.(err?.message || t('Nie udało się przenieść karty.'));
      }
    },
    [allForSaleCards, folderOf, folders, onPatchCollectionItems, showToast, t]
  );

  const createFolder = async () => {
    const name = (newFolderName || '').trim();
    if (!name || folderBusy) return;
    setFolderBusy(true);
    try {
      const folder = await saleFoldersApi.create(name);
      setFolders((prev) => [...prev, folder]);
      setNewFolderName(null);
      showToast?.(t('Utworzono folder „{name}”. Przeciągnij do niego karty z listy.', { name: folder.name }));
    } catch (err: any) {
      showToast?.(err?.message || t('Nie udało się utworzyć folderu.'));
    } finally {
      setFolderBusy(false);
    }
  };

  const saveRename = async () => {
    if (!renaming || folderBusy) return;
    const name = renaming.name.trim();
    const current = folders.find((f) => f.id === renaming.id);
    if (!name || name === current?.name) {
      setRenaming(null);
      return;
    }
    setFolderBusy(true);
    try {
      const updated = await saleFoldersApi.rename(renaming.id, name);
      setFolders((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      setRenaming(null);
    } catch (err: any) {
      showToast?.(err?.message || t('Nie udało się zmienić nazwy folderu.'));
    } finally {
      setFolderBusy(false);
    }
  };

  const deleteFolder = async (folder: SaleFolder) => {
    const inside = allForSaleCards.filter((i) => i.saleFolderId === folder.id);
    const question = inside.length
      ? t('Usunąć folder „{name}”? Karty z folderu ({n}) wrócą na listę główną i nadal będą na sprzedaż, a link do folderu przestanie działać.', { name: folder.name, n: inside.length })
      : t('Usunąć folder „{name}”? Link do folderu przestanie działać.', { name: folder.name });
    if (!window.confirm(question)) return;
    try {
      await saleFoldersApi.remove(folder.id);
      setFolders((prev) => prev.filter((f) => f.id !== folder.id));
      if (inside.length) onPatchCollectionItems?.(inside.map((i) => i.id), { saleFolderId: null });
      showToast?.(t('Usunięto folder „{name}”.', { name: folder.name }));
    } catch (err: any) {
      showToast?.(err?.message || t('Nie udało się usunąć folderu.'));
    }
  };

  const copyFolderLink = (folder: SaleFolder) => {
    navigator.clipboard.writeText(saleFolderUrl(publicShareSlug, folder.slug));
    setCopiedFolderId(folder.id);
    showToast?.(t('Skopiowano link do folderu „{name}”.', { name: folder.name }));
    setTimeout(() => setCopiedFolderId((id) => (id === folder.id ? null : id)), 2500);
  };

  // Karty po filtrach, podzielone na listę główną i foldery
  const cardsBySection = useMemo(() => {
    const map = new Map<string, CollectionItem[]>();
    for (const item of displayedCards) {
      const key = folderOf(item) ?? 'main';
      const list = map.get(key);
      if (list) list.push(item);
      else map.set(key, [item]);
    }
    return map;
  }, [displayedCards, folderOf]);

  const sectionTotals = useCallback(
    (folderId: string | null) => {
      let qty = 0;
      let value = 0;
      for (const item of allForSaleCards) {
        if (folderOf(item) !== folderId) continue;
        const n = item.quantity + item.quantityFoil;
        qty += n;
        value += n * getItemSalePrice(item, item.quantityFoil > 0, settings);
      }
      return { qty, value };
    },
    [allForSaleCards, folderOf, settings]
  );

  /** Właściwości strefy upuszczania (sekcja albo przycisk na pasku podczas przeciągania). */
  const dropProps = (folderId: string | null) => {
    const key = folderId ?? 'main';
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!dragItemId) return;
        // własna sekcja przeciąganej karty nie jest celem
        const dragged = allForSaleCards.find((i) => i.id === dragItemId);
        if (dragged && (folderOf(dragged) ?? 'main') === key) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dropTarget !== key) setDropTarget(key);
      },
      onDragLeave: (e: React.DragEvent) => {
        if (!(e.currentTarget as Node).contains(e.relatedTarget as Node | null)) setDropTarget((cur) => (cur === key ? null : cur));
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        const id = e.dataTransfer.getData('text/plain') || dragItemId;
        setDragItemId(null);
        setDropTarget(null);
        if (id) moveItems([id], folderId);
      }
    };
  };

  const renderSection = (folder: SaleFolder | null) => {
    const key = folder?.id ?? 'main';
    const items = cardsBySection.get(key) || [];
    const totals = sectionTotals(folder?.id ?? null);
    const isCollapsed = folder ? collapsed.has(folder.id) : false;
    const isOver = dropTarget === key && Boolean(dragItemId);
    const filtered = items.length !== allForSaleCards.filter((i) => (folderOf(i) ?? 'main') === key).length;
    const toggleCollapsed = () =>
      folder &&
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(folder.id)) next.delete(folder.id);
        else next.add(folder.id);
        return next;
      });

    return (
      <section
        {...dropProps(folder?.id ?? null)}
        aria-label={folder ? folder.name : t('Lista główna')}
        className={`rounded-2xl border transition-colors ${
          folders.length ? 'p-3 sm:p-4 space-y-3' : 'space-y-3'
        } ${isOver ? 'border-amber-400/70 bg-amber-500/5' : folders.length ? 'border-stone-800 bg-stone-900/40' : 'border-transparent'}`}
      >
        {(folder || folders.length > 0 || allForSaleCards.length > 0) && (
          <header className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {folder ? (
                <button
                  type="button"
                  onClick={toggleCollapsed}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-stone-400 hover:text-stone-100 hover:bg-stone-800 cursor-pointer shrink-0"
                  aria-expanded={!isCollapsed}
                  aria-label={isCollapsed ? t('Rozwiń folder') : t('Zwiń folder')}
                >
                  <ChevronDown className={`w-4 h-4 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                </button>
              ) : (
                <Inbox className="w-4 h-4 text-stone-400 shrink-0" />
              )}
              {folder && <FolderOpen className="w-4 h-4 text-amber-400 shrink-0" />}
              {folder && renaming?.id === folder.id ? (
                <form
                  className="flex items-center gap-1 min-w-0 flex-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveRename();
                  }}
                >
                  <input
                    value={renaming.name}
                    onChange={(e) => setRenaming({ id: folder.id, name: e.target.value })}
                    onKeyDown={(e) => e.key === 'Escape' && setRenaming(null)}
                    maxLength={60}
                    autoFocus
                    aria-label={t('Nazwa folderu')}
                    className="min-w-0 flex-1 h-8 bg-stone-950 border border-stone-700 focus:border-amber-500 rounded-lg px-2.5 text-sm text-stone-100 focus:outline-none"
                  />
                  <button type="submit" disabled={folderBusy} className="btn btn-primary">{t('Zapisz')}</button>
                  <button type="button" onClick={() => setRenaming(null)} className="btn btn-ghost">{t('Anuluj')}</button>
                </form>
              ) : (
                <h3 className="text-sm font-semibold text-stone-100 truncate">{folder ? folder.name : t('Lista główna')}</h3>
              )}
              {!(folder && renaming?.id === folder.id) && (
                <span className="text-xs text-stone-500 tabular-nums shrink-0">
                  {totals.qty} {t('szt.')} · <span className="text-emerald-300/90">{formatCurrency(totals.value, settings.currency)}</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {folder ? (
                <>
                  <button type="button" onClick={() => copyFolderLink(folder)} className="btn btn-secondary" title={saleFolderUrl(publicShareSlug, folder.slug)}>
                    {copiedFolderId === folder.id ? <Check className="w-4 h-4" /> : <Link className="w-4 h-4" />}
                    {copiedFolderId === folder.id ? t('Skopiowano') : t('Kopiuj link')}
                  </button>
                  <a href={saleFolderUrl(publicShareSlug, folder.slug)} target="_blank" rel="noreferrer" className="btn btn-ghost" title={t('Zobacz, jak widzą folder kupujący')}>
                    <ExternalLink className="w-4 h-4" />
                    <span className="hidden lg:inline">{t('Podgląd')}</span>
                  </a>
                  <button type="button" onClick={() => setRenaming({ id: folder.id, name: folder.name })} className="btn btn-ghost" title={t('Zmień nazwę folderu')} aria-label={t('Zmień nazwę folderu')}>
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteFolder(folder)}
                    className="btn btn-ghost text-rose-400 hover:text-rose-300"
                    title={t('Usuń folder')}
                    aria-label={t('Usuń folder')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              ) : newFolderName !== null ? (
                <form
                  className="flex items-center gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    createFolder();
                  }}
                >
                  <input
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Escape' && setNewFolderName(null)}
                    maxLength={60}
                    autoFocus
                    placeholder={t('Nazwa folderu, np. Commander')}
                    aria-label={t('Nazwa folderu')}
                    className="w-48 sm:w-56 h-9 bg-stone-950 border border-stone-700 focus:border-amber-500 rounded-lg px-2.5 text-sm text-stone-100 placeholder-stone-500 focus:outline-none"
                  />
                  <button type="submit" disabled={folderBusy || !newFolderName.trim()} className="btn btn-primary disabled:opacity-50">
                    {folderBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {t('Utwórz')}
                  </button>
                  <button type="button" onClick={() => setNewFolderName(null)} className="btn btn-ghost">{t('Anuluj')}</button>
                </form>
              ) : (
                <button type="button" onClick={() => setNewFolderName('')} className="btn btn-secondary" title={t('Folder ma własny publiczny link, a karty przenosisz do niego przeciągając')}>
                  <FolderPlus className="w-4 h-4" />
                  {t('Nowy folder')}
                </button>
              )}
            </div>
          </header>
        )}

        {!isCollapsed &&
          (items.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">{items.map(renderCard)}</div>
          ) : (
            <div
              className={`rounded-xl border border-dashed px-4 py-6 text-center text-xs ${
                isOver ? 'border-amber-400/70 text-amber-200' : 'border-stone-800 text-stone-500'
              }`}
            >
              {filtered
                ? t('Żadna karta w tej części nie pasuje do wyszukiwania i filtrów.')
                : !folder && allForSaleCards.length === 0
                  ? t('Nie masz jeszcze żadnych kart na sprzedaż')
                  : folder
                  ? t('Folder jest pusty. Przeciągnij tu karty albo wybierz folder na dole kafelka karty.')
                  : t('Wszystkie karty są w folderach. Przeciągnij tu kartę, aby wróciła na listę główną.')}
            </div>
          ))}
      </section>
    );
  };

  const renderCard = (item: CollectionItem) => {
    const imageUri = getCardImageUri(item.card, 'normal');
    const edhrecRank = getCardEdhrecRank(item.card);
    const marketPriceNormal = getSaleMarketPrice(item.card, false, settings);
    const marketPriceFoil = getSaleMarketPrice(item.card, true, settings);
    const activeMarketPrice = item.quantityFoil > 0 ? marketPriceFoil : marketPriceNormal;
    const effectivePrice = item.salePrice ?? activeMarketPrice;
    const isEditingPrice = editingPriceId === item.id;

    return (
      <div
        key={item.id}
        draggable={canOrganize && !isEditingPrice}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', item.id);
          e.dataTransfer.effectAllowed = 'move';
          setDragItemId(item.id);
        }}
        onDragEnd={() => {
          setDragItemId(null);
          setDropTarget(null);
        }}
        className={`group relative bg-stone-900 rounded-2xl border border-emerald-500/30 hover:border-emerald-400/70 transition-all duration-300 overflow-hidden flex flex-col shadow-lg hover:shadow-2xl hover:shadow-emerald-950/30 ${
          canOrganize ? 'cursor-grab active:cursor-grabbing' : ''
        } ${dragItemId === item.id ? 'opacity-40' : ''}`}
      >
        {/* Top Badges */}
        <div className="absolute top-2 left-2 z-10 bg-emerald-950/95 text-emerald-300 border border-emerald-500/50 text-[11px] font-bold px-2.5 py-0.5 rounded-full shadow-lg flex items-center gap-1 backdrop-blur-md">
          <CircleDollarSign className="w-3 h-3 text-emerald-400 stroke-[2.5]" />
          <span>{t('Na sprzedaż')}</span>
        </div>

        {item.quantityFoil > 0 && (
          <div className="absolute top-0 right-0 z-10 ms-foil-chip font-semibold text-[11px] px-2 py-0.5 rounded-bl-lg shadow-sm flex items-center gap-1 ">
            <Sparkles className="w-3 h-3 fill-stone-950" />
            <span>{t('Foil')}</span>
          </div>
        )}

        {/* Card Image Area */}
        <div
          onClick={() => onViewCardDetails(item)}
          className="relative aspect-[488/680] w-full overflow-hidden bg-stone-950 cursor-pointer group-hover:brightness-105 transition-all"
        >
          <img
            src={imageUri}
            alt={item.card.name}
            referrerPolicy="no-referrer"
            onError={(e) => handleCardImageError(e, imageUri)}
            className="w-full h-full object-contain transition-transform duration-500"
            loading="lazy"
            draggable={false}
          />

          {/* EDHREC Rank */}
          {edhrecRank != null && (
            <div className="absolute bottom-[8%] left-2 z-10">
              <EdhrecBadge rank={edhrecRank} size="xs" />
            </div>
          )}

          {/* Asking Price Tag on image */}
          <div className="absolute bottom-[8%] right-2 bg-stone-950/95 backdrop-blur-md px-2.5 py-1 rounded-xl border border-emerald-500/40 shadow-xl">
            <p className="text-[11px] font-bold text-stone-400 leading-none">{t('Cena')}</p>
            <p className="text-xs font-bold tabular-nums text-emerald-300 leading-tight">
              {formatCurrency(effectivePrice, settings.currency)}
            </p>
          </div>
        </div>

        {/* Card Content & Action Area */}
        <div className="p-3 flex-1 flex flex-col justify-between space-y-2.5">
          <div>
            <div className="flex items-start justify-between gap-1">
              <h4
                onClick={() => onViewCardDetails(item)}
                className="font-bold text-xs text-stone-100 hover:text-emerald-300 transition-colors line-clamp-1 cursor-pointer"
                title={item.card.name}
              >
                {item.card.name}
              </h4>
              <ManaSymbol cost={item.card.mana_cost} size="sm" />
            </div>

            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <span className="tabular-nums text-[11px] font-bold bg-stone-800 text-stone-300 px-1.5 py-0.2 rounded border border-stone-700">
                {item.card.set.toUpperCase()}
              </span>
              <span className={`text-[11px] px-1.5 py-0.2 rounded border font-semibold ${getRarityColor(item.card.rarity)}`}>
                {getRarityLabel(item.card.rarity)}
              </span>
              <span className="text-[11px] text-stone-400 bg-stone-800 px-1.5 py-0.2 rounded">
                {item.condition} • {item.language}
              </span>
            </div>
          </div>

          {/* Price customizer */}
          <div className="pt-2 border-t border-stone-800/80 space-y-1.5">
            {isEditingPrice ? (
              <div className="space-y-1 bg-stone-950 p-2 rounded-xl border border-emerald-500/40">
                <label className="text-[11px] text-stone-400 block font-medium">{t('Własna cena')} ({settings.currency}):</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="0.5"
                    value={tempPrice}
                    onChange={(e) => setTempPrice(e.target.value)}
                    placeholder={activeMarketPrice ? activeMarketPrice.toString() : '0.00'}
                    className="w-full bg-stone-900 border border-stone-700 rounded-lg px-2 py-1 text-xs text-emerald-300 tabular-nums font-bold focus:outline-none focus:border-emerald-500"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveCustomPrice(item)}
                    className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded-lg cursor-pointer"
                  >
                    {t('OK')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingPriceId(null)}
                    className="px-2 py-1 bg-stone-800 text-stone-400 text-[11px] rounded-lg cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-1 text-[11px]">
                <button
                  type="button"
                  onClick={() => {
                    setEditingPriceId(item.id);
                    setTempPrice(item.salePrice !== undefined && item.salePrice !== null ? item.salePrice.toString() : '');
                  }}
                  className="text-stone-400 hover:text-emerald-300 transition-colors text-[11px] font-medium underline cursor-pointer"
                  title={t('Zmień cenę sprzedaży na własną')}
                >
                  {item.salePrice ? t('Własna cena: Zmień') : t('Ustaw własną cenę')}
                </button>

                <span className="tabular-nums text-[11px] text-stone-500">
                  {item.quantity + item.quantityFoil} {t('szt.')}
                </span>
              </div>
            )}

            {/* Bottom action bar */}
            <div className="flex items-center justify-between pt-1">
              {canOrganize ? (
                <label className="flex items-center gap-1 min-w-0 text-stone-500" title={t('Przenieś do folderu')}>
                  <GripVertical className="w-3 h-3 shrink-0 hidden md:block" aria-hidden />
                  <FolderOpen className="w-3 h-3 shrink-0 md:hidden" aria-hidden />
                  <select
                    value={folderOf(item) ?? ''}
                    onChange={(e) => moveItems([item.id], e.target.value || null)}
                    aria-label={t('Przenieś do folderu')}
                    className="min-w-0 max-w-[110px] truncate bg-transparent text-[11px] text-stone-400 hover:text-stone-200 focus:outline-none cursor-pointer"
                  >
                    <option value="">{t('Lista główna')}</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <span className="text-[11px] text-stone-500 truncate max-w-[100px]" title={item.binder || t('Klaser Główny')}>
                  {item.binder || t('Klaser')}
                </span>
              )}

              <button
                type="button"
                onClick={() => onToggleForSale(item)}
                className="text-[11px] text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 px-2 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1 font-semibold"
                title={t('Wycofaj kartę ze sprzedaży')}
              >
                <Trash2 className="w-3 h-3" />
                <span>{t('Wycofaj')}</span>
              </button>
            </div>
          </div>

        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      
      <PageHeader
        title={t('Sprzedam')}
        description={t('Karty oznaczone na sprzedaż. Kupujący widzą je pod Twoim publicznym linkiem, bez zakładania konta.')}
        meta={
          <>
            <span><span className="text-stone-100 font-medium tabular-nums">{totalCardsCount}</span> {plural(totalCardsCount, ['karta', 'karty', 'kart'], ['card', 'cards'])}</span>
            <span>{t('Wartość oferty')} <span className="text-stone-100 font-medium tabular-nums">{formatCurrency(totalValue, settings.currency)}</span></span>
          </>
        }
        actions={
          <>
            <button type="button" onClick={() => setIsMapOpen(true)} className="btn btn-secondary">
              <MapIcon className="w-4 h-4" />
              {t('Mapa sprzedawców')}
            </button>
            {onAddCardForSale && (
              <button type="button" onClick={() => setIsAddOpen(true)} className="btn btn-primary">
                <Plus className="w-4 h-4" strokeWidth={2.5} />
                {t('Dodaj kartę na sprzedaż')}
              </button>
            )}
          </>
        }
      />
      {isAddOpen && onAddCardForSale && (
        <Suspense fallback={null}>
          <ForSaleAddModal collection={collection} settings={settings} onAdd={onAddCardForSale} onClose={() => setIsAddOpen(false)} />
        </Suspense>
      )}

      {/* Publiczny link do oferty */}
      <div className="rounded-xl border border-stone-800 bg-stone-900 p-3 flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-stone-300 shrink-0">
          <Share2 className="w-4 h-4 text-stone-400" />
          {t('Twój link do oferty')}
        </div>
        <input
          type="text"
          readOnly
          value={publicShareUrl}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={t('Publiczny link do oferty')}
          className="flex-1 min-w-0 h-9 bg-stone-950 border border-stone-800 rounded-lg px-3 text-sm text-stone-300 focus:outline-none focus:border-stone-600"
        />
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={handleCopyLink} className="btn btn-primary">
            {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copiedLink ? t('Skopiowano') : t('Kopiuj link')}
          </button>
          <a href={publicShareUrl} target="_blank" rel="noreferrer" className="btn btn-ghost" title={t('Zobacz, jak widzą ofertę kupujący')}>
            <ExternalLink className="w-4 h-4" />
            <span className="hidden lg:inline">{t('Podgląd')}</span>
          </a>
          <button type="button" onClick={handleCopyTextList} className="btn btn-ghost" title={t('Kopiuj listę kart jako tekst')}>
            {copiedText ? <Check className="w-4 h-4 text-emerald-400" /> : <FileText className="w-4 h-4" />}
            <span className="hidden lg:inline">{copiedText ? t('Skopiowano') : t('Lista .txt')}</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadImages}
            disabled={Boolean(imagesProgress) || displayedCards.length === 0}
            className="btn btn-ghost disabled:opacity-50"
            title={t('Pobierz grafiki z kartami i cenami do wklejenia np. na Facebooka (uwzględnia wyszukiwanie i filtry)')}
          >
            {imagesProgress ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageDown className="w-4 h-4" />}
            <span className="hidden lg:inline tabular-nums">
              {imagesProgress ? t('Grafiki {done}/{total}', imagesProgress) : t('Grafiki .jpg')}
            </span>
          </button>
        </div>
      </div>

      {/* 2. Empty State or Cards Board */}
      {allForSaleCards.length === 0 && folders.length === 0 ? (
        <div className="bg-stone-900/70 border border-dashed border-stone-800 rounded-2xl p-12 text-center space-y-5 shadow-inner">
          <div className="w-20 h-20 rounded-2xl bg-emerald-950/50 border border-emerald-500/30 text-emerald-400 mx-auto flex items-center justify-center shadow-lg">
            <CircleDollarSign className="w-10 h-10" />
          </div>

          <div className="max-w-md mx-auto space-y-2">
            <h3 className="text-lg font-bold text-white">
              {t('Nie masz jeszcze żadnych kart na sprzedaż')}
            </h3>
            <p className="text-xs text-stone-400 leading-relaxed">
              {t('Przejdź do zakładki')} <strong className="text-stone-200">{t('„Kolekcja”')}</strong> {t('i kliknij zieloną ikonkę dolara')} (<span className="text-emerald-400 font-bold">$</span>) {t('na kafelku dowolnej karty w klaserze obok opcji')} <strong className="text-stone-200">{t('„Edytuj pozycję”')}</strong>.
            </p>
          </div>

          <button
            type="button"
            onClick={onGoToCollection}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-950/60 transition-all cursor-pointer inline-flex items-center gap-2"
          >
            <Folder className="w-4 h-4" />
            <span>{t('Przejdź do kolekcji')}</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          
          {/* Controls & Filter Bar */}
          <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 shadow-md flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('Szukaj w ofercie (nazwa, set, typ)...')}
                className="w-full bg-stone-950 border border-stone-800 focus:border-emerald-500 rounded-xl pl-9 pr-3.5 py-2 text-xs text-stone-100 placeholder-stone-500 focus:outline-none transition-colors"
              />
            </div>

            {/* Quick Filters */}
            <div className="flex items-center gap-2.5 flex-wrap">
              
              {/* Foil toggle */}
              <button
                type="button"
                onClick={() => setFilterFoilOnly(prev => !prev)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
                  filterFoilOnly
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow'
                    : 'bg-stone-950 text-stone-400 border-stone-800 hover:border-stone-700'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>{t('Tylko foil')}</span>
              </button>

              {/* Condition */}
              <select
                value={filterCondition}
                onChange={(e) => setFilterCondition(e.target.value)}
                className="bg-stone-950 border border-stone-800 rounded-xl px-3 py-1.5 text-xs text-stone-300 focus:outline-none focus:border-emerald-500"
              >
                <option value="all">{t('Wszystkie stany')}</option>
                <option value="NM">{t('Stan NM (Near Mint)')}</option>
                <option value="EX">{t('Stan EX (Excellent)')}</option>
                <option value="GD">{t('Stan GD (Good)')}</option>
                <option value="LP">{t('Stan LP (Light Played)')}</option>
                <option value="PL">{t('Stan PL (Played)')}</option>
              </select>

              {/* Sort by */}
              <div className="flex items-center gap-1.5 bg-stone-950 border border-stone-800 rounded-xl px-2.5 py-1.5 text-xs text-stone-300">
                <ArrowUpDown className="w-3.5 h-3.5 text-emerald-400" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-transparent text-xs text-stone-200 focus:outline-none cursor-pointer"
                >
                  <option value="price-desc">{t('Cena: Najwyższa')}</option>
                  <option value="price-asc">{t('Cena: Najniższa')}</option>
                  <option value="name">{t('Nazwa A-Z')}</option>
                  <option value="edhrec">{t('Popularność EDHREC')}</option>
                </select>
              </div>

            </div>
          </div>

          {/* Lista główna, a pod nią foldery */}
          {renderSection(null)}
          {folders.map((f) => (
            <React.Fragment key={f.id}>{renderSection(f)}</React.Fragment>
          ))}
        </div>
      )}

      {/* Podczas przeciągania: cele na dole ekranu, bez przewijania do folderu */}
      {dragItemId && folders.length > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 pointer-events-none">
          <div className="pointer-events-auto max-w-full overflow-x-auto rounded-2xl border border-stone-700 bg-stone-900/95 backdrop-blur shadow-2xl p-2 flex items-center gap-2">
            <span className="text-[11px] text-stone-400 px-1 shrink-0">{t('Upuść w:')}</span>
            {[null, ...folders].map((f) => {
              const key = f?.id ?? 'main';
              const current = allForSaleCards.find((i) => i.id === dragItemId);
              if (current && (folderOf(current) ?? 'main') === key) return null;
              return (
                <div
                  key={key}
                  {...dropProps(f?.id ?? null)}
                  className={`h-10 px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 shrink-0 transition-colors ${
                    dropTarget === key ? 'border-amber-400 bg-amber-500/15 text-amber-100' : 'border-stone-700 bg-stone-950 text-stone-200'
                  }`}
                >
                  {f ? <FolderOpen className="w-3.5 h-3.5 text-amber-400" /> : <Inbox className="w-3.5 h-3.5 text-stone-400" />}
                  <span className="truncate max-w-[160px]">{f ? f.name : t('Lista główna')}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isMapOpen && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
              <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
            </div>
          }
        >
          <SellersMapModal onClose={() => setIsMapOpen(false)} onOpenSeller={(u) => onOpenSellerProfile?.(u)} />
        </Suspense>
      )}
    </div>
  );
};
