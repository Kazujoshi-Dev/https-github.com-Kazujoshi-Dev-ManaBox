import React, { useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  Search,
  Layers,
  BarChart3,
  RefreshCw,
  Plus,
  Download,
  Upload,
  ShieldCheck,
  FolderHeart,
  Settings,
  Trophy,
  LogOut,
  Swords,
  Camera,
  ExternalLink,
  CircleDollarSign,
  Users,
  Mail,
  ChevronDown
} from 'lucide-react';
import { formatCurrency } from '../utils/formatters';
import { AppSettings, AuthUser } from '../types';

type Tab = 'collection' | 'search' | 'set-top' | 'analytics' | 'wishlist' | 'decks' | 'for-sale' | 'users' | 'admin' | 'settings';

interface HeaderProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  totalCards: number;
  totalValue: number;
  valueChange?: number | null;
  valueChangePercent?: number | null;
  lastPriceChangeAt?: string | null;
  settings: AppSettings;
  decksCount?: number;
  forSaleCount?: number;
  onOpenSettings: () => void;
  onRefreshPrices: () => void;
  isRefreshing: boolean;
  onOpenAddModal: () => void;
  onOpenScannerModal?: () => void;
  onExportCollection?: () => void;
  onImportCollection?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenImportExport?: (tab: 'export' | 'import') => void;
  user?: AuthUser | null;
  onLogout?: () => void;
  unreadMessagesCount?: number;
  onOpenMailbox?: () => void;
}

/** Menu konta: rzadziej używane akcje (ustawienia, import/eksport, okno OBS, wylogowanie). */
const AccountMenu: React.FC<{
  user: AuthUser;
  settingsActive: boolean;
  onOpenSettings: () => void;
  onOpenImportExport?: (tab: 'export' | 'import') => void;
  onExportCollection?: () => void;
  onLogout?: () => void;
}> = ({ user, settingsActive, onOpenSettings, onOpenImportExport, onExportCollection, onLogout }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const run = (fn?: () => void) => () => {
    setOpen(false);
    fn?.();
  };
  const obsHref = `${typeof window !== 'undefined' ? window.location.origin + window.location.pathname : ''}?scanner=open`;
  const item = 'w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-stone-200 hover:bg-stone-800 cursor-pointer text-left';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`h-9 pl-1 pr-2 rounded-lg flex items-center gap-2 cursor-pointer border ${
          open || settingsActive ? 'bg-stone-800 border-stone-700' : 'border-transparent hover:bg-stone-800'
        }`}
      >
        <span className="w-7 h-7 rounded-md bg-stone-700 text-stone-100 text-xs font-semibold flex items-center justify-center">
          {user.username.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden lg:block text-sm text-stone-200 max-w-[120px] truncate">{user.username}</span>
        <ChevronDown className={`w-4 h-4 text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-72 rounded-xl bg-stone-900 border border-stone-800 shadow-2xl shadow-black/40 p-1.5 z-40 ms-menu-in"
        >
          <div className="px-3 py-2 mb-1 border-b border-stone-800">
            <p className="text-sm font-medium text-stone-100 truncate">{user.username}</p>
            <p className="text-xs text-stone-400 truncate">{user.email}</p>
          </div>
          <button type="button" role="menuitem" onClick={run(onOpenSettings)} className={item}>
            <Settings className="w-4 h-4 text-stone-400" /> Ustawienia
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={run(() => (onOpenImportExport ? onOpenImportExport('import') : undefined))}
            className={item}
          >
            <Upload className="w-4 h-4 text-stone-400" /> Import kolekcji
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={run(() => (onOpenImportExport ? onOpenImportExport('export') : onExportCollection?.()))}
            className={item}
          >
            <Download className="w-4 h-4 text-stone-400" /> Eksport kolekcji
          </button>
          <a href={obsHref} target="_blank" rel="noopener noreferrer" role="menuitem" onClick={() => setOpen(false)} className={item}>
            <ExternalLink className="w-4 h-4 text-stone-400" /> Skaner w osobnym oknie (OBS)
          </a>
          {onLogout && (
            <>
              <div className="my-1 border-t border-stone-800" />
              <button type="button" role="menuitem" onClick={run(onLogout)} className={`${item} hover:text-rose-300`}>
                <LogOut className="w-4 h-4 text-stone-400" /> Wyloguj
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  totalCards,
  totalValue,
  valueChange = null,
  valueChangePercent = null,
  lastPriceChangeAt = null,
  settings,
  decksCount = 0,
  forSaleCount = 0,
  onOpenSettings,
  onRefreshPrices,
  isRefreshing,
  onOpenAddModal,
  onOpenScannerModal,
  onExportCollection,
  onOpenImportExport,
  user,
  onLogout,
  unreadMessagesCount = 0,
  onOpenMailbox
}) => {
  const hasChange = valueChange !== null;
  const changeSign = !hasChange || Math.abs(valueChange!) < 0.005 ? 0 : valueChange! > 0 ? 1 : -1;
  const changeColor = changeSign > 0 ? 'text-emerald-400' : changeSign < 0 ? 'text-rose-400' : 'text-stone-400';
  const changeText = hasChange ? `${changeSign > 0 ? '+' : ''}${formatCurrency(valueChange!, settings.currency)}` : null;
  const percentText =
    valueChangePercent !== null && changeSign !== 0
      ? `${valueChangePercent > 0 ? '+' : ''}${valueChangePercent.toFixed(Math.abs(valueChangePercent) < 10 ? 1 : 0).replace('.', ',')}%`
      : null;
  const changeTitle = hasChange
    ? `Zmiana wartości kolekcji względem cen sprzed ostatniej aktualizacji${
        lastPriceChangeAt ? ` (ceny zmienione ${new Date(lastPriceChangeAt).toLocaleDateString('pl-PL')})` : ''
      }`
    : 'Kliknij „Odśwież ceny”, aby zobaczyć zmianę wartości kolekcji';
  const sourceLabel = settings.pricingSource === 'CARDMARKET' ? 'Cardmarket Trend' : 'TCGPlayer Market';

  const tabs: Array<{ id: Tab; label: string; icon: React.ElementType; count?: number }> = [
    { id: 'collection', label: 'Kolekcja', icon: Layers, count: totalCards },
    { id: 'decks', label: 'Talie', icon: Swords, count: decksCount || undefined },
    { id: 'search', label: 'Szukaj kart', icon: Search },
    { id: 'set-top', label: 'Top z dodatku', icon: Trophy },
    { id: 'analytics', label: 'Statystyki', icon: BarChart3 },
    { id: 'wishlist', label: 'Lista życzeń', icon: FolderHeart },
    { id: 'for-sale', label: 'Sprzedam', icon: CircleDollarSign, count: forSaleCount || undefined },
    { id: 'users', label: 'Gracze', icon: Users },
    ...(user?.isAdmin ? [{ id: 'admin' as Tab, label: 'Admin', icon: ShieldCheck }] : [])
  ];

  const logo = (
    <span className="w-8 h-8 rounded-lg bg-amber-400 text-stone-950 flex items-center justify-center shrink-0">
      <Sparkles className="w-4 h-4" strokeWidth={2.25} />
    </span>
  );

  return (
    <header className="bg-stone-950/95 supports-[backdrop-filter]:bg-stone-950/80 backdrop-blur border-b border-stone-800/80 text-stone-100 sticky top-0 z-30 pt-[env(safe-area-inset-top)]">
      {/* Telefon: jeden kompaktowy rząd, reszta funkcji jest w dolnym pasku nawigacji */}
      <div className="md:hidden flex items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          {logo}
          <h1 className="text-base font-semibold tracking-tight text-stone-100 truncate">Mana Screw</h1>
        </div>
        <div className="text-right leading-tight shrink-0">
          <p className="text-sm font-semibold text-stone-100 tabular-nums">{formatCurrency(totalValue, settings.currency)}</p>
          <p className="text-xs text-stone-400 tabular-nums">
            {totalCards} kart
            {changeSign !== 0 && (
              <span className={`ml-1.5 font-medium ${changeColor}`} title={changeTitle}>
                {percentText || changeText}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Tablet i komputer */}
      <div className="hidden md:block max-w-[1760px] w-full mx-auto px-4 sm:px-6 lg:px-8 xl:px-10">
        <div className="h-16 flex items-center gap-4">
          <button type="button" onClick={() => setActiveTab('collection')} className="flex items-center gap-2.5 shrink-0 cursor-pointer">
            {logo}
            <span className="text-base font-semibold tracking-tight text-stone-100">Mana Screw</span>
          </button>

          {/* Wartość kolekcji */}
          <div className="hidden lg:flex items-center gap-4 ml-4 pl-4 border-l border-stone-800 text-sm tabular-nums">
            <div title={`Wycena: ${sourceLabel}, waluta ${settings.currency}`}>
              <span className="text-stone-400">Wartość </span>
              <span className="font-semibold text-stone-100">{formatCurrency(totalValue, settings.currency)}</span>
            </div>
            <div title={changeTitle} className={changeColor}>
              {changeText ?? <span className="text-stone-500">brak zmiany</span>}
              {percentText && <span className="ml-1 opacity-80">({percentText})</span>}
            </div>
            <button
              type="button"
              onClick={onRefreshPrices}
              disabled={isRefreshing}
              title="Odśwież ceny kart"
              aria-label="Odśwież ceny kart"
              className="w-8 h-8 -ml-1 rounded-md flex items-center justify-center text-stone-400 hover:text-stone-100 hover:bg-stone-800 disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-amber-400' : ''}`} />
            </button>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onRefreshPrices}
              disabled={isRefreshing}
              title="Odśwież ceny kart"
              aria-label="Odśwież ceny kart"
              className="lg:hidden w-9 h-9 rounded-lg flex items-center justify-center text-stone-300 hover:bg-stone-800 disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-amber-400' : ''}`} />
            </button>
            {user && onOpenMailbox && (
              <button
                type="button"
                onClick={onOpenMailbox}
                title="Wiadomości"
                aria-label={unreadMessagesCount ? `Wiadomości, nieprzeczytane: ${unreadMessagesCount}` : 'Wiadomości'}
                className="relative w-9 h-9 rounded-lg flex items-center justify-center text-stone-300 hover:text-stone-100 hover:bg-stone-800 cursor-pointer"
              >
                <Mail className="w-[18px] h-[18px]" />
                {unreadMessagesCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-400 text-stone-950 text-[11px] font-semibold flex items-center justify-center tabular-nums">
                    {unreadMessagesCount}
                  </span>
                )}
              </button>
            )}
            {onOpenScannerModal && (
              <button
                type="button"
                onClick={onOpenScannerModal}
                title="Skanuj karty kamerą"
                className="h-9 px-3 rounded-lg border border-stone-700 hover:border-stone-600 hover:bg-stone-800 text-sm text-stone-200 flex items-center gap-2 cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                <span className="hidden xl:inline">Skanuj</span>
              </button>
            )}
            <button
              type="button"
              onClick={onOpenAddModal}
              className="h-9 px-3.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-stone-950 text-sm font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} />
              Dodaj kartę
            </button>
            {user && (
              <AccountMenu
                user={user}
                settingsActive={activeTab === 'settings'}
                onOpenSettings={onOpenSettings}
                onOpenImportExport={onOpenImportExport}
                onExportCollection={onExportCollection}
                onLogout={onLogout}
              />
            )}
          </div>
        </div>

        {/* Zakładki: jedna linia, aktywna podkreślona */}
        <nav aria-label="Zakładki" className="-mb-px flex items-center gap-1 overflow-x-auto no-scrollbar">
          {tabs.map(({ id, label, icon: Icon, count }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                aria-current={active ? 'page' : undefined}
                className={`relative h-11 px-3 flex items-center gap-2 text-sm whitespace-nowrap cursor-pointer border-b-2 ${
                  active
                    ? 'border-amber-400 text-stone-50 font-medium'
                    : 'border-transparent text-stone-400 hover:text-stone-200 hover:border-stone-700'
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? 'text-amber-400' : 'text-stone-500'}`} />
                {label}
                {count !== undefined && <span className="text-xs text-stone-500 tabular-nums">{count}</span>}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
