import React, { useMemo, useState } from 'react';
import { publicUrl } from '../utils/publicLinks';
import { WishlistItem, AppSettings } from '../types';
import { formatCurrency, getCardPrice, getCardImageUri, getRarityColor, getRarityLabel, getCardEdhrecRank, handleCardImageError } from '../utils/formatters';
import { ManaSymbol } from './ManaSymbol';
import { EdhrecBadge } from './EdhrecBadge';
import { useBackToClose } from '../hooks/useBackButton';
import { FolderHeart, Search, ArrowUpDown, Sparkles, Check, FileText, LogIn, Share2, X, HeartHandshake } from 'lucide-react';

interface PublicWishlistViewProps {
  owner: { id: string; username: string };
  wishlist: WishlistItem[];
  settings: AppSettings;
  onOpenLogin: () => void;
  /** Zalogowany odwiedzający — wtedy zamiast „Zaloguj się” nie pokazujemy zachęty do logowania. */
  isLoggedIn?: boolean;
  showToast?: (message: string) => void;
}

/** Publiczna lista życzeń (link /szukam/nazwa) — dostępna bez logowania. */
export const PublicWishlistView: React.FC<PublicWishlistViewProps> = ({
  owner,
  wishlist,
  settings,
  onOpenLogin,
  isLoggedIn = false,
  showToast
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterFoilOnly, setFilterFoilOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'price-desc' | 'price-asc' | 'name' | 'added'>('price-desc');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [preview, setPreview] = useState<WishlistItem | null>(null);
  useBackToClose(Boolean(preview), () => setPreview(null));

  const unitPrice = (item: WishlistItem) => getCardPrice(item.card, item.isFoil, settings);
  const totalCards = useMemo(() => wishlist.reduce((n, i) => n + i.targetQuantity, 0), [wishlist]);
  const totalValue = useMemo(
    () => wishlist.reduce((sum, i) => sum + getCardPrice(i.card, i.isFoil, settings) * i.targetQuantity, 0),
    [wishlist, settings]
  );

  const shareUrl = publicUrl('wishlist', owner.username);

  const copy = async (text: string, done: () => void, okMsg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      done();
      showToast?.(okMsg);
    } catch {
      showToast?.('Nie udało się skopiować do schowka.');
    }
  };

  const handleCopyLink = () =>
    copy(shareUrl, () => { setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2500); }, 'Skopiowano link do listy życzeń!');

  const handleCopyTextList = () => {
    const lines = wishlist.map(i => `${i.targetQuantity}x ${i.card.name} (${i.card.set.toUpperCase()})${i.isFoil ? ' [FOIL]' : ''}`);
    const header = `=== SZUKA KART: ${owner.username} ===\nŁącznie: ${totalCards} szt.\nLista życzeń: ${shareUrl}\n\n`;
    copy(header + lines.join('\n'), () => { setCopiedText(true); setTimeout(() => setCopiedText(false), 2500); }, 'Skopiowano listę kart (.txt) do schowka!');
  };

  const displayed = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return wishlist
      .filter(i =>
        !q ||
        i.card.name.toLowerCase().includes(q) ||
        (i.card.type_line || '').toLowerCase().includes(q) ||
        i.card.set.toLowerCase().includes(q) ||
        (i.card.set_name || '').toLowerCase().includes(q)
      )
      .filter(i => !filterFoilOnly || i.isFoil)
      .sort((a, b) => {
        if (sortBy === 'price-desc') return unitPrice(b) - unitPrice(a);
        if (sortBy === 'price-asc') return unitPrice(a) - unitPrice(b);
        if (sortBy === 'name') return a.card.name.localeCompare(b.card.name);
        return (b.addedAt || '').localeCompare(a.addedAt || '');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wishlist, searchQuery, filterFoilOnly, sortBy, settings]);

  return (
    <div className="min-h-dvh bg-stone-950 text-stone-100 font-sans pb-16">
      {/* Pasek górny */}
      <header className="bg-stone-900 border-b border-stone-800 sticky top-0 z-30 shadow-md pt-[env(safe-area-inset-top)]">
        <div className="max-w-[1760px] w-full mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-rose-600 flex items-center justify-center shadow-lg shadow-rose-950/60 ring-1 ring-rose-400/30 shrink-0">
              <FolderHeart className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-rose-200 truncate">
                <span className="hidden sm:inline">Mana Screw • </span>Lista życzeń
              </h1>
              <p className="text-xs text-stone-400 truncate">
                Szuka: <strong className="text-rose-300">@{owner.username}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopyLink}
              className="h-10 px-3 bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
              title="Kopiuj link do tej listy"
              aria-label="Kopiuj link do tej listy"
            >
              {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4 text-rose-400" />}
              <span className="hidden sm:inline">{copiedLink ? 'Skopiowano!' : 'Udostępnij link'}</span>
            </button>
            {!isLoggedIn && (
              <button
                type="button"
                onClick={onOpenLogin}
                className="h-10 px-4 bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-950/50 flex items-center gap-1.5 cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>Zaloguj się</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-[1760px] w-full mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 pt-6 space-y-6">
        {/* Baner */}
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 sm:p-6 shadow-2xl flex flex-col md:flex-row md:items-center md:justify-between gap-5">
          <div className="space-y-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs tabular-nums font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 ">
              Szukam kart
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Lista życzeń gracza @{owner.username}</h2>
            <p className="text-xs text-stone-400 max-w-xl">
              Masz którąś z tych kart? {isLoggedIn ? 'Napisz do gracza w zakładce Wiadomości.' : 'Załóż darmowe konto lub zaloguj się, aby napisać do gracza i wystawić swoje karty.'}{' '}
              Wycena orientacyjna w <strong>{settings.currency}</strong> ({settings.pricingSource === 'CARDMARKET' ? 'Cardmarket trend' : 'TCGPlayer market'}).
            </p>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:items-center gap-3 sm:flex-wrap">
            <div className="bg-stone-950/80 px-4 py-2.5 rounded-2xl border border-stone-800">
              <span className="text-[11px] font-bold text-stone-400 block">Szukanych kart</span>
              <span className="text-lg font-bold text-stone-100 tabular-nums">{totalCards} szt.</span>
            </div>
            <div className="bg-stone-950/80 px-4 py-2.5 rounded-2xl border border-rose-500/30">
              <span className="text-[11px] font-bold text-stone-400 block">Wartość rynkowa</span>
              <span className="text-lg font-bold text-rose-200 tabular-nums">{formatCurrency(totalValue, settings.currency)}</span>
            </div>
            <button
              type="button"
              onClick={handleCopyTextList}
              disabled={wishlist.length === 0}
              className="col-span-2 justify-center h-12 px-3.5 bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 text-xs font-bold rounded-2xl flex items-center gap-2 cursor-pointer disabled:opacity-40"
            >
              {copiedText ? <Check className="w-4 h-4 text-emerald-400" /> : <FileText className="w-4 h-4 text-rose-400" />}
              <span>{copiedText ? 'Skopiowano listę!' : 'Kopiuj listę (.txt)'}</span>
            </button>
          </div>
        </div>

        {/* Filtry */}
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-3 sm:p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="relative flex-1 md:max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Szukaj karty (nazwa, set, typ)..."
              aria-label="Szukaj karty"
              className="w-full bg-stone-950 border border-stone-800 focus:border-rose-500 rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-stone-100 placeholder-stone-500 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setFilterFoilOnly(v => !v)}
              aria-pressed={filterFoilOnly}
              className={`h-10 px-3 rounded-xl text-xs font-bold border flex items-center gap-1.5 cursor-pointer ${
                filterFoilOnly ? 'bg-amber-500/15 text-amber-300 border-amber-500/40' : 'bg-stone-950 text-stone-400 border-stone-800 hover:border-stone-700'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Tylko Foil
            </button>
            <label className="h-10 flex items-center gap-1.5 bg-stone-950 border border-stone-800 rounded-xl px-2.5 text-xs text-stone-300">
              <ArrowUpDown className="w-3.5 h-3.5 text-rose-400" />
              <span className="sr-only">Sortowanie</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="bg-transparent text-xs text-stone-200 focus:outline-none cursor-pointer"
              >
                <option value="price-desc">Cena: najwyższa</option>
                <option value="price-asc">Cena: najniższa</option>
                <option value="name">Nazwa A–Z</option>
                <option value="added">Ostatnio dodane</option>
              </select>
            </label>
          </div>
        </div>

        {/* Karty */}
        {displayed.length === 0 ? (
          <div className="bg-stone-900/60 border border-dashed border-stone-800 rounded-2xl p-12 text-center space-y-3">
            <FolderHeart className="w-12 h-12 text-stone-600 mx-auto" />
            <h3 className="text-base font-bold text-white">
              {wishlist.length === 0 ? 'Lista życzeń jest pusta' : 'Brak kart spełniających kryteria'}
            </h3>
            {wishlist.length > 0 && <p className="text-xs text-stone-400">Zmień frazę wyszukiwania lub filtry.</p>}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
            {displayed.map(item => {
              const img = getCardImageUri(item.card, 'normal');
              const rank = getCardEdhrecRank(item.card);
              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setPreview(item)}
                  className="group relative text-left bg-stone-900 rounded-2xl border border-stone-800 hover:border-rose-400/70 transition-colors overflow-hidden flex flex-col shadow-lg cursor-pointer"
                >
                  {item.isFoil && (
                    <div className="absolute top-0 right-0 z-10 ms-foil-chip font-semibold text-[11px] px-2 py-0.5 rounded-bl-lg flex items-center gap-1 ">
                      <Sparkles className="w-3 h-3 fill-stone-950" />
                      Foil
                    </div>
                  )}
                  <div className="relative aspect-[2.5/3.5] w-full overflow-hidden bg-stone-950">
                    <img
                      src={img}
                      alt={item.card.name}
                      referrerPolicy="no-referrer"
                      onError={(e) => handleCardImageError(e, img)}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                    {rank != null && (
                      <div className="absolute bottom-2 left-2 z-10">
                        <EdhrecBadge rank={rank} size="xs" />
                      </div>
                    )}
                    <div className="absolute top-2 left-2 bg-rose-600 text-white text-xs font-bold px-2 py-0.5 rounded-lg shadow">
                      ×{item.targetQuantity}
                    </div>
                  </div>
                  <div className="p-3 flex-1 flex flex-col justify-between gap-2">
                    <div>
                      <div className="flex items-start justify-between gap-1">
                        <h4 className="font-bold text-xs text-stone-100 group-hover:text-rose-300 transition-colors line-clamp-1">{item.card.name}</h4>
                        <ManaSymbol cost={item.card.mana_cost} size="sm" />
                      </div>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className="tabular-nums text-[11px] font-bold bg-stone-800 text-stone-300 px-1.5 rounded border border-stone-700">
                          {item.card.set.toUpperCase()}
                        </span>
                        <span className={`text-[11px] px-1.5 rounded border font-semibold ${getRarityColor(item.card.rarity)}`}>
                          {getRarityLabel(item.card.rarity)}
                        </span>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-stone-800 flex items-center justify-between text-[11px]">
                      <span className="text-stone-400">Rynkowo</span>
                      <span className="font-bold tabular-nums text-rose-200">{formatCurrency(unitPrice(item), settings.currency)}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>

      {/* Podgląd karty */}
      {preview && (
        <div
          onClick={() => setPreview(null)}
          className="fixed inset-0 z-50 bg-stone-950/85 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={preview.card.name}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-stone-900 border border-stone-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 relative max-sm:rounded-b-none max-sm:max-h-[92dvh] max-sm:overflow-y-auto max-sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))] max-sm:animate-[slideUp_.2s_ease-out]"
          >
            <button
              type="button"
              onClick={() => setPreview(null)}
              aria-label="Zamknij"
              className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center text-stone-400 hover:text-white rounded-xl bg-stone-800/80 hover:bg-stone-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-col sm:flex-row gap-5 items-center sm:items-start">
              <div className="w-44 rounded-2xl overflow-hidden shadow-2xl border border-stone-700 shrink-0">
                <img
                  src={getCardImageUri(preview.card, 'large') || getCardImageUri(preview.card, 'normal')}
                  alt={preview.card.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-auto object-cover"
                />
              </div>
              <div className="space-y-3 flex-1 min-w-0">
                <div>
                  <h3 className="text-lg font-bold text-white pr-10">{preview.card.name}</h3>
                  <p className="text-xs text-stone-400">{preview.card.type_line}</p>
                </div>
                <div className="bg-stone-950 p-3 rounded-2xl border border-rose-500/30">
                  <span className="text-[11px] font-bold text-stone-400 block">Szuka</span>
                  <p className="text-xl font-bold text-rose-200">
                    {preview.targetQuantity} szt.{preview.isFoil && <span className="text-amber-300 text-sm"> Foil</span>}
                  </p>
                </div>
                <div className="text-xs space-y-1 text-stone-300">
                  <p>Dodatek: <strong className="text-stone-100">{preview.card.set_name} ({preview.card.set.toUpperCase()})</strong></p>
                  <p>Wycena rynkowa: <strong className="text-stone-100">{formatCurrency(unitPrice(preview), settings.currency)}</strong> / szt.</p>
                  {preview.notes && <p className="text-amber-300/90 pt-1 text-[11px]">Uwagi: {preview.notes}</p>}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-stone-800 flex items-center justify-between gap-3">
              <span className="text-xs text-stone-400 flex items-center gap-1.5 min-w-0">
                <HeartHandshake className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="truncate">Masz ją? Napisz do <strong className="text-rose-300">@{owner.username}</strong></span>
              </span>
              {!isLoggedIn ? (
                <button
                  type="button"
                  onClick={() => { setPreview(null); onOpenLogin(); }}
                  className="h-10 px-4 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold rounded-xl cursor-pointer shrink-0"
                >
                  Zaloguj się
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="h-10 px-4 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold rounded-xl cursor-pointer shrink-0"
                >
                  Zamknij
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
