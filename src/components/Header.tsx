import React, { useEffect, useRef, useState } from 'react';
import {
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
  Telescope,
  LogOut,
  Swords,
  Camera,
  ExternalLink,
  CircleDollarSign,
  Users,
  Mail,
  ScrollText,
  Bug,
  ChevronDown,
  Globe
} from 'lucide-react';
import { formatCurrency } from '../utils/formatters';
import { SupportButton } from './ui/SupportButton';
import { DiscordButton } from './ui/DiscordButton';
import { LanguageSwitcher } from './ui/LanguageSwitcher';
import { useT, locale, plural, type Lang } from '../i18n';
import { AppSettings, AuthUser } from '../types';

type Tab = 'collection' | 'community-decks' | 'search' | 'set-top' | 'spoilers' | 'analytics' | 'wishlist' | 'decks' | 'for-sale' | 'users' | 'changelog' | 'admin' | 'settings';

interface HeaderProps {
  /** Nowe wpisy w dzienniku zmian, których użytkownik nie widział. */
  hasNewChangelog?: boolean;
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
  /** Otwiera wykres historii kolekcji. */
  onOpenHistory?: () => void;
  /** Okno „Zgłoś błąd”. */
  onOpenBugReport?: () => void;
  /** Zmiana języka interfejsu (zapis na profilu). */
  onChangeLanguage?: (lang: Lang) => void;
}

/** Menu konta: rzadziej używane akcje (ustawienia, import/eksport, okno OBS, wylogowanie). */
const AccountMenu: React.FC<{
  user: AuthUser;
  settingsActive: boolean;
  onOpenSettings: () => void;
  onOpenImportExport?: (tab: 'export' | 'import') => void;
  onExportCollection?: () => void;
  onLogout?: () => void;
  onOpenBugReport?: () => void;
}> = ({ user, settingsActive, onOpenSettings, onOpenImportExport, onExportCollection, onLogout, onOpenBugReport }) => {
  const t = useT();
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
            <Settings className="w-4 h-4 text-stone-400" /> {t('Ustawienia')}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={run(() => (onOpenImportExport ? onOpenImportExport('import') : undefined))}
            className={item}
          >
            <Upload className="w-4 h-4 text-stone-400" /> {t('Import kolekcji')}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={run(() => (onOpenImportExport ? onOpenImportExport('export') : onExportCollection?.()))}
            className={item}
          >
            <Download className="w-4 h-4 text-stone-400" /> {t('Eksport kolekcji')}
          </button>
          <a href={obsHref} target="_blank" rel="noopener noreferrer" role="menuitem" onClick={() => setOpen(false)} className={item}>
            <ExternalLink className="w-4 h-4 text-stone-400" /> {t('Skaner w osobnym oknie (OBS)')}
          </a>
          {onOpenBugReport && (
            <button type="button" role="menuitem" onClick={run(onOpenBugReport)} className={item}>
              <Bug className="w-4 h-4 text-stone-400" /> {t('Zgłoś błąd')}
            </button>
          )}
          {onLogout && (
            <>
              <div className="my-1 border-t border-stone-800" />
              <button type="button" role="menuitem" onClick={run(onLogout)} className={`${item} hover:text-rose-300`}>
                <LogOut className="w-4 h-4 text-stone-400" /> {t('Wyloguj')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export const Header: React.FC<HeaderProps> = ({
  hasNewChangelog = false,
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
  onOpenMailbox,
  onOpenHistory,
  onOpenBugReport,
  onChangeLanguage
}) => {
  const t = useT();
  const hasChange = valueChange !== null;
  const changeSign = !hasChange || Math.abs(valueChange!) < 0.005 ? 0 : valueChange! > 0 ? 1 : -1;
  const changeColor = changeSign > 0 ? 'text-emerald-400' : changeSign < 0 ? 'text-rose-400' : 'text-stone-400';
  const changeText = hasChange ? `${changeSign > 0 ? '+' : ''}${formatCurrency(valueChange!, settings.currency)}` : null;
  const percentText =
    valueChangePercent !== null && changeSign !== 0
      ? `${valueChangePercent > 0 ? '+' : ''}${valueChangePercent.toFixed(Math.abs(valueChangePercent) < 10 ? 1 : 0).replace('.', locale() === 'pl-PL' ? ',' : '.')}%`
      : null;
  const changeTitle = hasChange
    ? t('Zmiana wartości kolekcji względem cen sprzed ostatniej aktualizacji') +
      (lastPriceChangeAt
        ? ' ' + t('(ceny zmienione {date})', { date: new Date(lastPriceChangeAt).toLocaleDateString(locale()) })
        : '')
    : t('Kliknij „Odśwież ceny”, aby zobaczyć zmianę wartości kolekcji');
  const sourceLabel = settings.pricingSource === 'CARDMARKET' ? 'Cardmarket Trend' : 'TCGPlayer Market';

  const tabs: Array<{ id: Tab; label: string; icon: React.ElementType; count?: number; dot?: boolean }> = [
    { id: 'collection', label: t('Kolekcja'), icon: Layers, count: totalCards },
    { id: 'decks', label: t('Talie'), icon: Swords, count: decksCount || undefined },
    { id: 'community-decks', label: t('Talie społeczności'), icon: Globe },
    { id: 'search', label: t('Szukaj kart'), icon: Search },
    { id: 'set-top', label: t('Top z dodatku'), icon: Trophy },
    { id: 'spoilers', label: t('Spoilery'), icon: Telescope },
    { id: 'analytics', label: t('Statystyki'), icon: BarChart3 },
    { id: 'wishlist', label: t('Lista życzeń'), icon: FolderHeart },
    { id: 'for-sale', label: t('Sprzedam'), icon: CircleDollarSign, count: forSaleCount || undefined },
    { id: 'users', label: t('Gracze'), icon: Users },
    { id: 'changelog', label: t('Dziennik zmian'), icon: ScrollText, dot: hasNewChangelog },
    ...(user?.isAdmin ? [{ id: 'admin' as Tab, label: t('Admin'), icon: ShieldCheck }] : [])
  ];

  const logo = (
    <img src="/logo.webp" alt="" width={36} height={36} className="w-9 h-9 shrink-0" />
  );

  return (
    <header className="bg-stone-950/95 supports-[backdrop-filter]:bg-stone-950/80 backdrop-blur border-b border-stone-800/80 text-stone-100 sticky top-0 z-30 pt-[env(safe-area-inset-top)]">
      {/* Telefon: jeden kompaktowy rząd, reszta funkcji jest w dolnym pasku nawigacji */}
      <div className="md:hidden flex items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          {logo}
          <h1 className="text-base font-semibold tracking-tight text-stone-100 truncate">Mana Screw</h1>
          <SupportButton variant="icon" className="-ml-1 shrink-0" />
          <DiscordButton className="-ml-2 shrink-0" />
          <LanguageSwitcher onChange={onChangeLanguage} className="-ml-1 shrink-0" />
          {user && onOpenMailbox && unreadMessagesCount > 0 && (
            <button
              type="button"
              onClick={onOpenMailbox}
              aria-label={t('Wiadomości, nieprzeczytane: {n}', { n: unreadMessagesCount })}
              className="relative -ml-1 w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-amber-300 bg-amber-400/10 ring-1 ring-amber-400/30"
            >
              <Mail className="w-[18px] h-[18px]" />
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-400 text-stone-950 text-[11px] font-semibold flex items-center justify-center tabular-nums">
                {unreadMessagesCount}
              </span>
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onOpenHistory}
          aria-label={t('Historia wartości i liczby kart kolekcji')}
          className="text-right leading-tight shrink-0 rounded-lg -mr-1.5 px-1.5 py-0.5 active:bg-stone-800 cursor-pointer"
        >
          <p className="text-sm font-semibold text-stone-100 tabular-nums">{formatCurrency(totalValue, settings.currency)}</p>
          <p className="text-xs text-stone-400 tabular-nums">
            {plural(totalCards, ['{n} karta', '{n} karty', '{n} kart'], ['{n} card', '{n} cards'])}
            {changeSign !== 0 && (
              <span className={`ml-1.5 font-medium ${changeColor}`} title={changeTitle}>
                {percentText || changeText}
              </span>
            )}
          </p>
        </button>
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
            <button
              type="button"
              onClick={onOpenHistory}
              title={t('Historia kolekcji (wycena: {source}, {currency})', { source: sourceLabel, currency: settings.currency })}
              className="flex items-center gap-4 rounded-lg -mx-2 px-2 py-1 hover:bg-stone-800/70 cursor-pointer"
            >
              <span>
                <span className="text-stone-400">{t('Wartość')} </span>
                <span className="font-semibold text-stone-100">{formatCurrency(totalValue, settings.currency)}</span>
              </span>
              <span title={changeTitle} className={changeColor}>
                {changeText ?? <span className="text-stone-500">{t('brak zmiany')}</span>}
                {percentText && <span className="ml-1 opacity-80">({percentText})</span>}
              </span>
            </button>
            <button
              type="button"
              onClick={onRefreshPrices}
              disabled={isRefreshing}
              title={t('Odśwież ceny kart')}
              aria-label={t('Odśwież ceny kart')}
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
              title={t('Odśwież ceny kart')}
              aria-label={t('Odśwież ceny kart')}
              className="lg:hidden w-9 h-9 rounded-lg flex items-center justify-center text-stone-300 hover:bg-stone-800 disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-amber-400' : ''}`} />
            </button>
            <SupportButton />
            <DiscordButton className="-ml-1" />
            <LanguageSwitcher onChange={onChangeLanguage} className="-ml-1" />
            {user && onOpenMailbox && (
              <button
                type="button"
                onClick={onOpenMailbox}
                title={t('Wiadomości')}
                aria-label={unreadMessagesCount ? t('Wiadomości, nieprzeczytane: {n}', { n: unreadMessagesCount }) : t('Wiadomości')}
                className={`relative w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer ${
                  unreadMessagesCount > 0
                    ? 'text-amber-300 bg-amber-400/10 ring-1 ring-amber-400/30 hover:bg-amber-400/20'
                    : 'text-stone-300 hover:text-stone-100 hover:bg-stone-800'
                }`}
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
                title={t('Skanuj karty kamerą')}
                className="h-9 px-3 rounded-lg border border-stone-700 hover:border-stone-600 hover:bg-stone-800 text-sm text-stone-200 flex items-center gap-2 cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                <span className="hidden xl:inline">{t('Skanuj')}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onOpenAddModal}
              className="h-9 px-3.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-stone-950 text-sm font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} />
              {t('Dodaj kartę')}
            </button>
            {user && (
              <AccountMenu
                user={user}
                settingsActive={activeTab === 'settings'}
                onOpenSettings={onOpenSettings}
                onOpenImportExport={onOpenImportExport}
                onExportCollection={onExportCollection}
                onLogout={onLogout}
                onOpenBugReport={onOpenBugReport}
              />
            )}
          </div>
        </div>

        {/* Zakładki: jedna linia, aktywna podkreślona */}
        <nav aria-label={t('Zakładki')} className="-mb-px flex items-center gap-1 overflow-x-auto no-scrollbar">
          {tabs.map(({ id, label, icon: Icon, count, dot }) => {
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
                {dot && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" aria-label={t('nowe wpisy')} />}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
