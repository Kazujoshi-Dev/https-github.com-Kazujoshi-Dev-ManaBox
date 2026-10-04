import React, { useEffect, useState } from 'react';
import {
  Layers,
  Swords,
  Camera,
  Search,
  Menu,
  Trophy,
  BarChart3,
  FolderHeart,
  CircleDollarSign,
  Users,
  Mail,
  Download,
  Upload,
  RefreshCw,
  Settings,
  LogOut,
  X,
  User,
  ShieldCheck,
  ScrollText
} from 'lucide-react';
import type { NavigationTab } from './TabContent';
import { useBackToClose } from '../hooks/useBackButton';
import type { AuthUser } from '../types';

interface MobileNavProps {
  activeTab: NavigationTab;
  setActiveTab: (tab: NavigationTab) => void;
  onOpenScanner: () => void;
  onOpenMailbox: () => void;
  onOpenSettings: () => void;
  onOpenImportExport: (tab: 'export' | 'import') => void;
  onRefreshPrices: () => void;
  isRefreshing: boolean;
  onLogout: () => void;
  unreadMessagesCount: number;
  user: AuthUser;
  hasNewChangelog?: boolean;
}

/** Zakładki dostępne pod „Więcej” — na telefonie nie mieszczą się w dolnym pasku. */
const MORE_TABS: Array<{ tab: NavigationTab; label: string; icon: React.ElementType }> = [
  { tab: 'set-top', label: 'Top z dodatku', icon: Trophy },
  { tab: 'analytics', label: 'Statystyki', icon: BarChart3 },
  { tab: 'wishlist', label: 'Lista życzeń', icon: FolderHeart },
  { tab: 'for-sale', label: 'Sprzedam', icon: CircleDollarSign },
  { tab: 'users', label: 'Gracze', icon: Users },
  { tab: 'changelog', label: 'Dziennik zmian', icon: ScrollText }
];

/**
 * Nawigacja na telefonie: dolny pasek w zasięgu kciuka (jak w aplikacjach mobilnych)
 * z wyróżnionym skanerem pośrodku i arkuszem „Więcej” z pozostałymi funkcjami.
 * Na tablecie i komputerze ukryta — tam działa nawigacja w nagłówku.
 */
export const MobileNav: React.FC<MobileNavProps> = ({
  activeTab,
  setActiveTab,
  onOpenScanner,
  onOpenMailbox,
  onOpenSettings,
  onOpenImportExport,
  onRefreshPrices,
  isRefreshing,
  onLogout,
  unreadMessagesCount,
  user,
  hasNewChangelog = false
}) => {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  useBackToClose(isMoreOpen, () => setIsMoreOpen(false));
  const moreActive = MORE_TABS.some((t) => t.tab === activeTab) || activeTab === 'admin' || activeTab === 'settings';

  // Zamknięcie arkusza klawiszem Escape i blokada przewijania strony pod spodem
  useEffect(() => {
    if (!isMoreOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setIsMoreOpen(false);
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isMoreOpen]);

  const go = (tab: NavigationTab) => {
    setActiveTab(tab);
    setIsMoreOpen(false);
    window.scrollTo({ top: 0 });
  };
  const run = (fn: () => void) => () => {
    setIsMoreOpen(false);
    fn();
  };

  const NavButton = ({ tab, label, icon: Icon }: { tab: NavigationTab; label: string; icon: React.ElementType }) => {
    const active = activeTab === tab;
    return (
      <button
        type="button"
        onClick={() => go(tab)}
        aria-current={active ? 'page' : undefined}
        className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 h-14 text-[11px] font-semibold transition-colors ${
          active ? 'text-amber-400' : 'text-stone-400 active:text-stone-200'
        }`}
      >
        <Icon className="w-5 h-5" />
        <span className="truncate">{label}</span>
      </button>
    );
  };

  return (
    <>
      <nav
        aria-label="Nawigacja główna"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-stone-900/95 backdrop-blur-md border-t border-stone-800 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="flex items-stretch px-1">
          <NavButton tab="collection" label="Kolekcja" icon={Layers} />
          <NavButton tab="decks" label="Talie" icon={Swords} />
          <div className="flex-1 flex justify-center">
            <button
              type="button"
              onClick={onOpenScanner}
              aria-label="Skanuj kartę"
              className="-mt-5 w-16 h-16 rounded-full bg-amber-400 text-stone-950 flex flex-col items-center justify-center shadow-lg shadow-black/40 ring-4 ring-stone-950 active:scale-95 transition-transform"
            >
              <Camera className="w-6 h-6 stroke-[2.5]" />
              <span className="text-[11px] font-semibold leading-none mt-0.5">Skanuj</span>
            </button>
          </div>
          <NavButton tab="search" label="Szukaj" icon={Search} />
          <button
            type="button"
            onClick={() => setIsMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={isMoreOpen}
            className={`relative flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 h-14 text-[11px] font-semibold ${
              moreActive ? 'text-amber-400' : 'text-stone-400'
            }`}
          >
            <Menu className="w-5 h-5" />
            <span>Więcej</span>
            {unreadMessagesCount === 0 && hasNewChangelog && (
              <span className="absolute top-2 right-[calc(50%-14px)] w-2 h-2 rounded-full bg-amber-400" aria-hidden="true" />
            )}
            {unreadMessagesCount > 0 && (
              <span className="absolute top-1.5 right-[calc(50%-18px)] min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-stone-950 text-[11px] font-bold flex items-center justify-center">
                {unreadMessagesCount}
              </span>
            )}
          </button>
        </div>
      </nav>

      {isMoreOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true" aria-label="Więcej opcji">
          <button type="button" aria-label="Zamknij" className="absolute inset-0 bg-black/70" onClick={() => setIsMoreOpen(false)} />
          <div className="relative w-full max-h-[85dvh] overflow-y-auto bg-stone-900 border-t border-stone-800 rounded-t-3xl pb-[calc(1rem+env(safe-area-inset-bottom))] animate-[slideUp_.2s_ease-out]">
            <div className="sticky top-0 bg-stone-900 pt-2.5 pb-3 px-5 border-b border-stone-800/70">
              <div className="mx-auto w-10 h-1.5 rounded-full bg-stone-700 mb-3" />
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
                    <User className="w-4.5 h-4.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-stone-100 truncate">{user.username}</p>
                    <p className="text-xs text-stone-400 truncate">{user.email}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMoreOpen(false)}
                  aria-label="Zamknij"
                  className="w-10 h-10 rounded-full bg-stone-800 text-stone-300 flex items-center justify-center shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="px-4 pt-4 grid grid-cols-3 gap-2.5">
              {[...MORE_TABS, ...(user.isAdmin ? [{ tab: 'admin' as NavigationTab, label: 'Admin', icon: ShieldCheck }] : [])].map(({ tab, label, icon: Icon }) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => go(tab)}
                  className={`relative h-20 rounded-2xl border flex flex-col items-center justify-center gap-1.5 text-xs font-semibold ${
                    activeTab === tab
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                      : 'bg-stone-950/60 border-stone-800 text-stone-200 active:bg-stone-800'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {label}
                  {tab === 'changelog' && hasNewChangelog && (
                    <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-amber-400" aria-label="nowe wpisy" />
                  )}
                </button>
              ))}
              <button
                type="button"
                onClick={run(onOpenMailbox)}
                className="relative h-20 rounded-2xl border bg-stone-950/60 border-stone-800 text-stone-200 active:bg-stone-800 flex flex-col items-center justify-center gap-1.5 text-xs font-semibold"
              >
                <Mail className="w-5 h-5 text-amber-400" />
                Wiadomości
                {unreadMessagesCount > 0 && (
                  <span className="absolute top-2 right-2 min-w-[20px] h-5 px-1.5 rounded-full bg-amber-500 text-stone-950 text-[11px] font-bold flex items-center justify-center">
                    {unreadMessagesCount}
                  </span>
                )}
              </button>
            </div>

            <div className="px-4 pt-4 space-y-1.5">
              {[
                { label: 'Odśwież ceny', icon: RefreshCw, onClick: onRefreshPrices, spin: isRefreshing },
                { label: 'Import kolekcji', icon: Upload, onClick: () => onOpenImportExport('import') },
                { label: 'Eksport kolekcji', icon: Download, onClick: () => onOpenImportExport('export') },
                { label: 'Ustawienia', icon: Settings, onClick: onOpenSettings }
              ].map(({ label, icon: Icon, onClick, spin }) => (
                <button
                  key={label}
                  type="button"
                  onClick={run(onClick)}
                  className="w-full h-12 px-4 rounded-xl bg-stone-950/60 border border-stone-800 text-stone-200 active:bg-stone-800 flex items-center gap-3 text-sm font-medium"
                >
                  <Icon className={`w-5 h-5 text-amber-400 ${spin ? 'animate-spin' : ''}`} />
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={run(onLogout)}
                className="w-full h-12 px-4 rounded-xl bg-rose-950/30 border border-rose-900/50 text-rose-300 active:bg-rose-950/50 flex items-center gap-3 text-sm font-semibold"
              >
                <LogOut className="w-5 h-5" />
                Wyloguj
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
