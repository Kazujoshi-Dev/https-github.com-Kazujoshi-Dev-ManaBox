import React from 'react';
import { 
  Sparkles, 
  Search, 
  Layers, 
  BarChart3, 
  RefreshCw, 
  Plus, 
  Download, 
  Upload,
  Coins,
  TrendingUp,
  FolderHeart,
  Settings,
  SlidersHorizontal,
  Trophy,
  LogOut,
  User,
  Swords,
  Camera,
  ExternalLink
} from 'lucide-react';
import { formatCurrency } from '../utils/formatters';
import { AppSettings, AuthUser } from '../types';

interface HeaderProps {
  activeTab: 'collection' | 'search' | 'set-top' | 'analytics' | 'wishlist' | 'decks';
  setActiveTab: (tab: 'collection' | 'search' | 'set-top' | 'analytics' | 'wishlist' | 'decks') => void;
  totalCards: number;
  totalValue: number;
  totalPurchaseCost: number;
  settings: AppSettings;
  decksCount?: number;
  onOpenSettings: () => void;
  onRefreshPrices: () => void;
  isRefreshing: boolean;
  onOpenAddModal: () => void;
  onOpenScannerModal?: () => void;
  onExportCollection: () => void;
  onImportCollection: (e: React.ChangeEvent<HTMLInputElement>) => void;
  user?: AuthUser | null;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  totalCards,
  totalValue,
  totalPurchaseCost,
  settings,
  decksCount = 0,
  onOpenSettings,
  onRefreshPrices,
  isRefreshing,
  onOpenAddModal,
  onOpenScannerModal,
  onExportCollection,
  onImportCollection,
  user,
  onLogout
}) => {
  const profit = totalValue - totalPurchaseCost;
  const isProfitPositive = profit >= 0;

  return (
    <header className="bg-stone-900 border-b border-stone-800 text-stone-100 sticky top-0 z-30 shadow-md">
      {/* Top Banner & Stats */}
      <div className="max-w-[1760px] w-full mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 via-red-600 to-purple-700 flex items-center justify-center shadow-lg shadow-amber-900/30 ring-1 ring-amber-400/30">
              <Sparkles className="w-5 h-5 text-amber-100" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-amber-200 via-amber-100 to-stone-200 bg-clip-text text-transparent">
                  Mana Screw
                </h1>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold">
                  {settings.pricingSource === 'CARDMARKET' ? 'Cardmarket Trend' : 'TCGPlayer Market'}
                </span>
              </div>
              <p className="text-xs text-stone-400">
                Magic: The Gathering • Wycena w walucie: <strong className="text-stone-200">{settings.currency}</strong>
              </p>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="flex items-center gap-3 sm:gap-6 flex-wrap bg-stone-950/70 p-2.5 rounded-xl border border-stone-800/80">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-amber-400" />
              <div>
                <p className="text-[10px] uppercase font-semibold text-stone-400">Karty</p>
                <p className="text-sm font-bold text-stone-100">{totalCards} szt.</p>
              </div>
            </div>

            <div className="h-7 w-[1px] bg-stone-800" />

            <div className="flex items-center gap-2">
              <Coins className="w-4 h-4 text-emerald-400" />
              <div>
                <p className="text-[10px] uppercase font-semibold text-stone-400">
                  Wartość ({settings.currency})
                </p>
                <p className="text-sm font-bold text-emerald-400">
                  {formatCurrency(totalValue, settings.currency)}
                </p>
              </div>
            </div>

            {totalPurchaseCost > 0 && (
              <>
                <div className="h-7 w-[1px] bg-stone-800 hidden sm:block" />
                <div className="hidden sm:flex items-center gap-2">
                  <TrendingUp className={`w-4 h-4 ${isProfitPositive ? 'text-emerald-400' : 'text-rose-400'}`} />
                  <div>
                    <p className="text-[10px] uppercase font-semibold text-stone-400">Zysk/Strata</p>
                    <p className={`text-sm font-bold ${isProfitPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isProfitPositive ? '+' : ''}{formatCurrency(profit, settings.currency)}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenSettings}
              title="Otwórz Ustawienia Wyceny & Waluty"
              className="px-3 py-2 text-xs font-semibold rounded-lg bg-stone-800 hover:bg-stone-700 text-amber-400 border border-stone-700 flex items-center gap-1.5 transition-colors"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Ustawienia</span>
            </button>

            <button
              onClick={onRefreshPrices}
              disabled={isRefreshing}
              title="Pobierz najświeższe ceny z Scryfall API"
              className="px-3 py-2 text-xs font-medium rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-amber-400' : ''}`} />
              <span className="hidden sm:inline">Odśwież ceny</span>
            </button>

            {onOpenScannerModal && (
              <button
                onClick={onOpenScannerModal}
                title="Skanuj karty kamerą (darmowy OCR w przeglądarce)"
                className="px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
              >
                <Camera className="w-4 h-4 text-emerald-400" />
                <span className="hidden sm:inline">Skanuj kamerą</span>
                <span className="sm:hidden">Skaner</span>
              </button>
            )}

            <a
              href={`${typeof window !== 'undefined' ? window.location.origin + window.location.pathname : ''}?scanner=open`}
              target="_blank"
              rel="noopener noreferrer"
              title="Otwórz aplikację w osobnym oknie przeglądarki (pełny dostęp do OBS Virtual Camera)"
              className="px-2.5 py-2 text-xs font-semibold rounded-lg bg-stone-800 hover:bg-stone-750 text-stone-300 hover:text-stone-100 border border-stone-700 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5 text-stone-400" />
              <span className="hidden md:inline">Otwórz poza ramką (OBS)</span>
            </a>

            <button
              onClick={onOpenAddModal}
              className="px-3 py-2 text-xs font-semibold rounded-lg bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-stone-900 flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Dodaj kartę</span>
            </button>
          </div>

        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-between border-t border-stone-800/80 mt-3 pt-2 gap-y-2 gap-x-4 no-scrollbar">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setActiveTab('collection')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all whitespace-nowrap ${
                activeTab === 'collection'
                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                  : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/60'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Moja Kolekcja</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-stone-800 text-stone-300 font-mono">
                {totalCards}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('decks')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all whitespace-nowrap ${
                activeTab === 'decks'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold'
                  : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/60'
              }`}
            >
              <Swords className="w-4 h-4 text-purple-300" />
              <span>Talie (EDH)</span>
              {decksCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-purple-950 text-purple-300 font-mono font-bold border border-purple-800/50">
                  {decksCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('search')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all whitespace-nowrap ${
                activeTab === 'search'
                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                  : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/60'
              }`}
            >
              <Search className="w-4 h-4" />
              <span>Szukaj na Scryfall</span>
            </button>

            <button
              onClick={() => setActiveTab('set-top')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all whitespace-nowrap ${
                activeTab === 'set-top'
                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                  : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/60'
              }`}
            >
              <Trophy className="w-4 h-4 text-amber-400" />
              <span>Top z dodatku</span>
              <span className="text-[9px] uppercase px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30 font-mono">
                TOP 5
              </span>
            </button>

            <button
              onClick={() => setActiveTab('analytics')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all whitespace-nowrap ${
                activeTab === 'analytics'
                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                  : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/60'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Statystyki & Wykresy</span>
            </button>

            <button
              onClick={() => setActiveTab('wishlist')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all whitespace-nowrap ${
                activeTab === 'wishlist'
                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                  : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/60'
              }`}
            >
              <FolderHeart className="w-4 h-4 text-rose-400" />
              <span>Lista Życzeń</span>
            </button>
          </div>

          {/* Backup / Export Actions */}
          <div className="flex items-center gap-2 text-stone-400 shrink-0 ml-auto">
            <button
              onClick={onExportCollection}
              title="Pobierz kopię zapasową kolekcji (JSON)"
              className="p-1.5 text-stone-400 hover:text-stone-200 hover:bg-stone-800 rounded-lg transition-colors text-xs flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Eksport</span>
            </button>

            <label
              title="Wczytaj kopię zapasową kolekcji (JSON)"
              className="p-1.5 text-stone-400 hover:text-stone-200 hover:bg-stone-800 rounded-lg transition-colors text-xs flex items-center gap-1 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Import</span>
              <input
                type="file"
                accept=".json"
                onChange={onImportCollection}
                className="hidden"
              />
            </label>

            {/* Logged in User Profile & Logout */}
            {user && (
              <div className="flex items-center gap-2 pl-3 ml-1 border-l border-stone-800">
                <div className="hidden lg:flex flex-col text-right">
                  <span className="text-xs font-bold text-stone-200 flex items-center justify-end gap-1">
                    <User className="w-3 h-3 text-amber-400" />
                    <span>{user.username}</span>
                  </span>
                  <span className="text-[10px] text-stone-400 truncate max-w-[130px] font-mono">
                    {user.email}
                  </span>
                </div>
                {onLogout && (
                  <button
                    type="button"
                    onClick={onLogout}
                    title={`Wyloguj użytkownika (${user.email})`}
                    className="py-1 px-2.5 bg-stone-800/80 hover:bg-rose-950/40 text-stone-300 hover:text-rose-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-stone-700 hover:border-rose-800/50 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Wyloguj</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

      </div>
    </header>
  );
};
