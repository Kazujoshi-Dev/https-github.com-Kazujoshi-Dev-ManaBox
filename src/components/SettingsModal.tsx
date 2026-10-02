import React, { useState } from 'react';
import { AppSettings, PricingSource, CurrencyCode } from '../types';
import { DEFAULT_SETTINGS, formatCurrency } from '../utils/formatters';
import { X, Settings, RefreshCw, Check, ArrowRightLeft, DollarSign, Euro, Coins, ShieldCheck, LogOut, Loader2 } from 'lucide-react';

interface SettingsModalProps {
  settings: AppSettings;
  onSaveSettings: (newSettings: AppSettings) => void;
  onClose: () => void;
  /** Wylogowuje ze wszystkich urządzeń; zwraca false, gdy się nie udało. */
  onLogoutAll?: () => Promise<boolean>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onSaveSettings,
  onClose,
  onLogoutAll
}) => {
  const [confirmLogoutAll, setConfirmLogoutAll] = useState(false);
  const [isLoggingOutAll, setIsLoggingOutAll] = useState(false);
  const [logoutAllError, setLogoutAllError] = useState<string | null>(null);

  const handleLogoutAll = async () => {
    if (!onLogoutAll) return;
    setIsLoggingOutAll(true);
    setLogoutAllError(null);
    const ok = await onLogoutAll();
    setIsLoggingOutAll(false);
    if (!ok) {
      setLogoutAllError('Nie udało się wylogować. Spróbuj ponownie.');
      setConfirmLogoutAll(false);
    }
  };

  const [pricingSource, setPricingSource] = useState<PricingSource>(settings.pricingSource);
  const [currency, setCurrency] = useState<CurrencyCode>(settings.currency);
  const [eurRate, setEurRate] = useState<string>(settings.eurToPlnRate.toString());
  const [usdRate, setUsdRate] = useState<string>(settings.usdToPlnRate.toString());
  const [autoNbp, setAutoNbp] = useState<boolean>(settings.autoNbpRate);
  const [isFetchingNbp, setIsFetchingNbp] = useState<boolean>(false);
  const [nbpSuccessMessage, setNbpSuccessMessage] = useState<string | null>(null);

  // Fetch NBP Rates
  const handleFetchNbpRates = async () => {
    try {
      setIsFetchingNbp(true);
      setNbpSuccessMessage(null);

      const [eurRes, usdRes] = await Promise.all([
        fetch('https://api.nbp.pl/api/exchangerates/rates/a/eur/?format=json').catch(() => null),
        fetch('https://api.nbp.pl/api/exchangerates/rates/a/usd/?format=json').catch(() => null)
      ]);

      let updatedEur = parseFloat(eurRate);
      let updatedUsd = parseFloat(usdRate);

      if (eurRes && eurRes.ok) {
        const eurData = await eurRes.json();
        if (eurData.rates && eurData.rates[0]?.mid) {
          updatedEur = eurData.rates[0].mid;
          setEurRate(updatedEur.toFixed(4));
        }
      }

      if (usdRes && usdRes.ok) {
        const usdData = await usdRes.json();
        if (usdData.rates && usdData.rates[0]?.mid) {
          updatedUsd = usdData.rates[0].mid;
          setUsdRate(updatedUsd.toFixed(4));
        }
      }

      setNbpSuccessMessage(`Pomyślnie pobrano kursy NBP: 1 EUR = ${updatedEur.toFixed(2)} PLN, 1 USD = ${updatedUsd.toFixed(2)} PLN`);
    } catch (err) {
      console.error('Failed to fetch NBP rates:', err);
    } finally {
      setIsFetchingNbp(false);
    }
  };

  const handleSave = () => {
    const numEur = parseFloat(eurRate) || 4.31;
    const numUsd = parseFloat(usdRate) || 3.96;

    onSaveSettings({
      pricingSource,
      currency,
      eurToPlnRate: numEur,
      usdToPlnRate: numUsd,
      autoNbpRate: autoNbp,
      lastNbpUpdate: new Date().toISOString()
    });
    onClose();
  };

  const handleReset = () => {
    setPricingSource(DEFAULT_SETTINGS.pricingSource);
    setCurrency(DEFAULT_SETTINGS.currency);
    setEurRate(DEFAULT_SETTINGS.eurToPlnRate.toString());
    setUsdRate(DEFAULT_SETTINGS.usdToPlnRate.toString());
    setAutoNbp(DEFAULT_SETTINGS.autoNbpRate);
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-xl bg-stone-900 border border-stone-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none max-sm:rounded-t-3xl max-sm:max-h-[92dvh] max-sm:pb-[env(safe-area-inset-bottom)] max-sm:animate-[slideUp_.2s_ease-out] max-sm:mt-auto max-sm:mb-0 max-sm:overflow-y-auto"
      >
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-stone-800 bg-stone-950/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-stone-100">Ustawienia Wyceny i Waluty</h2>
              <p className="text-xs text-stone-400">Konfiguracja wartości rynkowej i przeliczania cen</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-stone-400 hover:text-stone-100 hover:bg-stone-800 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-stone-300">
          
          {/* Pricing Method */}
          <div>
            <label className="block text-xs font-bold text-amber-400 uppercase tracking-wider mb-3">
              1. Główna Metoda Wyceny Kart
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              
              {/* Cardmarket */}
              <div
                onClick={() => setPricingSource('CARDMARKET')}
                className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between space-y-2 ${
                  pricingSource === 'CARDMARKET'
                    ? 'bg-amber-500/10 border-amber-500 text-stone-100 ring-1 ring-amber-500/30'
                    : 'bg-stone-950/60 border-stone-800 hover:border-stone-700 text-stone-400'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-stone-100 flex items-center gap-2">
                    <Euro className="w-4 h-4 text-blue-400" /> Cardmarket.com
                  </span>
                  {pricingSource === 'CARDMARKET' && (
                    <span className="w-5 h-5 rounded-full bg-amber-500 text-stone-950 flex items-center justify-center font-bold">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </span>
                  )}
                </div>
                <p className="text-[11px] leading-relaxed text-stone-400">
                  Używa **Price Trend** z Cardmarket (dane Scryfall `prices.eur`). Rekomendowane dla rynku europejskiego i Polski.
                </p>
              </div>

              {/* TCGPlayer */}
              <div
                onClick={() => setPricingSource('TCGPLAYER')}
                className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between space-y-2 ${
                  pricingSource === 'TCGPLAYER'
                    ? 'bg-amber-500/10 border-amber-500 text-stone-100 ring-1 ring-amber-500/30'
                    : 'bg-stone-950/60 border-stone-800 hover:border-stone-700 text-stone-400'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-stone-100 flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-emerald-400" /> TCGPlayer.com
                  </span>
                  {pricingSource === 'TCGPLAYER' && (
                    <span className="w-5 h-5 rounded-full bg-amber-500 text-stone-950 flex items-center justify-center font-bold">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </span>
                  )}
                </div>
                <p className="text-[11px] leading-relaxed text-stone-400">
                  Używa średniej ceny rynkowej z TCGPlayer (dane Scryfall `prices.usd`).
                </p>
              </div>

            </div>
          </div>

          <div className="h-[1px] bg-stone-800" />

          {/* Display Currency */}
          <div>
            <label className="block text-xs font-bold text-amber-400 uppercase tracking-wider mb-3">
              2. Wyświetlana Waluta W Aplikacji
            </label>
            <div className="grid grid-cols-3 gap-3">
              
              <button
                type="button"
                onClick={() => setCurrency('PLN')}
                className={`py-3 px-4 rounded-xl border text-center font-bold transition-all flex items-center justify-center gap-2 ${
                  currency === 'PLN'
                    ? 'bg-amber-500 text-stone-950 border-amber-400 font-extrabold shadow-lg shadow-amber-500/20'
                    : 'bg-stone-950/60 border-stone-800 text-stone-300 hover:border-stone-700'
                }`}
              >
                <Coins className="w-4 h-4" /> PLN (zł)
              </button>

              <button
                type="button"
                onClick={() => setCurrency('EUR')}
                className={`py-3 px-4 rounded-xl border text-center font-bold transition-all flex items-center justify-center gap-2 ${
                  currency === 'EUR'
                    ? 'bg-amber-500 text-stone-950 border-amber-400 font-extrabold shadow-lg shadow-amber-500/20'
                    : 'bg-stone-950/60 border-stone-800 text-stone-300 hover:border-stone-700'
                }`}
              >
                <Euro className="w-4 h-4" /> EUR (€)
              </button>

              <button
                type="button"
                onClick={() => setCurrency('USD')}
                className={`py-3 px-4 rounded-xl border text-center font-bold transition-all flex items-center justify-center gap-2 ${
                  currency === 'USD'
                    ? 'bg-amber-500 text-stone-950 border-amber-400 font-extrabold shadow-lg shadow-amber-500/20'
                    : 'bg-stone-950/60 border-stone-800 text-stone-300 hover:border-stone-700'
                }`}
              >
                <DollarSign className="w-4 h-4" /> USD ($)
              </button>

            </div>
          </div>

          <div className="h-[1px] bg-stone-800" />

          {/* Exchange Rates & NBP Integration */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-xs font-bold text-amber-400 uppercase tracking-wider">
                3. Kursy Walut do Przeliczania na PLN (NBP)
              </label>

              <button
                type="button"
                onClick={handleFetchNbpRates}
                disabled={isFetchingNbp}
                className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-amber-300 border border-stone-700 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isFetchingNbp ? 'animate-spin' : ''}`} />
                Pobierz z NBP
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-stone-400 mb-1">
                  Kurs 1 EUR w PLN (NBP)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.0001"
                    value={eurRate}
                    onChange={(e) => setEurRate(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-100 font-mono font-bold focus:outline-none focus:border-amber-500"
                  />
                  <span className="absolute right-3 top-2.5 text-stone-500 font-mono text-xs">PLN</span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-stone-400 mb-1">
                  Kurs 1 USD w PLN (NBP)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.0001"
                    value={usdRate}
                    onChange={(e) => setUsdRate(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-100 font-mono font-bold focus:outline-none focus:border-amber-500"
                  />
                  <span className="absolute right-3 top-2.5 text-stone-500 font-mono text-xs">PLN</span>
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <input
                type="checkbox"
                id="autoNbp"
                checked={autoNbp}
                onChange={(e) => setAutoNbp(e.target.checked)}
                className="w-4 h-4 rounded bg-stone-950 border-stone-800 text-amber-500 focus:ring-amber-500/20"
              />
              <label htmlFor="autoNbp" className="text-stone-400 text-[11px] cursor-pointer">
                Automatycznie pobieraj najnowsze kursy NBP przy uruchomieniu aplikacji
              </label>
            </div>

            {nbpSuccessMessage && (
              <div className="mt-2.5 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-medium flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0" />
                <span>{nbpSuccessMessage}</span>
              </div>
            )}
          </div>

          {/* Example Calculation Box */}
          <div className="p-3.5 rounded-xl bg-stone-950 border border-stone-800 space-y-1">
            <span className="text-[10px] uppercase font-bold text-stone-500 tracking-wider">Podgląd kalkulacji dla karty ~10 EUR / ~11 USD:</span>
            <p className="text-xs font-semibold text-stone-200">
              Przy wycenie <span className="text-amber-400 font-bold">{pricingSource === 'CARDMARKET' ? 'Cardmarket (Price Trend)' : 'TCGPlayer (Market)'}</span> w walucie <span className="text-amber-400 font-bold">{currency}</span>:
            </p>
            <p className="text-sm font-bold font-mono text-emerald-400">
              Przykładowa wartość = {formatCurrency(
                currency === 'PLN' 
                  ? (pricingSource === 'CARDMARKET' ? 10 * parseFloat(eurRate || '4.31') : 11 * parseFloat(usdRate || '3.96'))
                  : (currency === 'EUR' ? 10 : 11),
                currency
              )}
            </p>
          </div>

          {/* Account security */}
          {onLogoutAll && (
            <div>
              <div className="p-3.5 rounded-xl bg-stone-950 border border-stone-800 space-y-2.5">
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-stone-200">Bezpieczeństwo konta</p>
                    <p className="text-[11px] text-stone-400">
                      Sesja wygasa po 7 dniach bez aktywności. Jeśli logowałeś się na cudzym urządzeniu
                      lub zgubiłeś telefon, wyloguj się wszędzie.
                    </p>
                  </div>
                </div>
                {logoutAllError && <p className="text-[11px] text-rose-300">{logoutAllError}</p>}
                {!confirmLogoutAll ? (
                  <button
                    type="button"
                    onClick={() => setConfirmLogoutAll(true)}
                    className="w-full py-2 px-3 text-xs font-semibold text-rose-300 bg-rose-950/30 hover:bg-rose-950/50 border border-rose-900/50 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Wyloguj ze wszystkich urządzeń
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-stone-300 flex-1">Na pewno? Wylogujesz też to urządzenie.</span>
                    <button
                      type="button"
                      onClick={() => setConfirmLogoutAll(false)}
                      disabled={isLoggingOutAll}
                      className="px-3 py-1.5 text-xs font-semibold text-stone-400 hover:text-stone-200 rounded-lg transition-colors cursor-pointer"
                    >
                      Anuluj
                    </button>
                    <button
                      type="button"
                      onClick={handleLogoutAll}
                      disabled={isLoggingOutAll}
                      className="px-3 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
                    >
                      {isLoggingOutAll && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Tak, wyloguj
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-stone-800 bg-stone-950/80">
          <button
            type="button"
            onClick={handleReset}
            className="px-3.5 py-2 text-xs font-semibold text-stone-400 hover:text-stone-200 hover:bg-stone-800 rounded-xl transition-colors"
          >
            Przywróć domyślne
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-stone-400 hover:text-stone-200 rounded-xl transition-colors"
            >
              Anuluj
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 text-xs font-bold text-stone-950 bg-amber-500 hover:bg-amber-400 rounded-xl transition-all shadow-md shadow-amber-500/20"
            >
              Zapisz Ustawienia
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
