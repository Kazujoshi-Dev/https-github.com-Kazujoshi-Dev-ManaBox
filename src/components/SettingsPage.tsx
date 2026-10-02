import React, { useMemo, useState } from 'react';
import {
  Settings, User, Coins, ShieldCheck, Share2, Database, Check, RefreshCw, Euro, DollarSign, LogOut, Loader2,
  KeyRound, Eye, EyeOff, Copy, ExternalLink, Download, Upload, AlertCircle, CheckCircle2, Trash2
} from 'lucide-react';
import { AppSettings, AuthUser, CurrencyCode, PricingSource } from '../types';
import { DEFAULT_SETTINGS, formatCurrency } from '../utils/formatters';
import { authApi } from '../services/api';
import { CityPicker } from './CityPicker';

type Section = 'account' | 'pricing' | 'security' | 'sharing' | 'data';

const SECTIONS: Array<{ id: Section; label: string; hint: string; icon: React.ElementType }> = [
  { id: 'account', label: 'Konto i profil', hint: 'Dane konta, miejscowość, usunięcie', icon: User },
  { id: 'pricing', label: 'Wycena i waluta', hint: 'Źródło cen, kursy NBP', icon: Coins },
  { id: 'security', label: 'Bezpieczeństwo', hint: 'Hasło, sesje', icon: ShieldCheck },
  { id: 'sharing', label: 'Udostępnianie', hint: 'Publiczne linki', icon: Share2 },
  { id: 'data', label: 'Dane kolekcji', hint: 'Import i eksport', icon: Database }
];

interface SettingsPageProps {
  user: AuthUser;
  settings: AppSettings;
  onSaveSettings: (s: AppSettings) => Promise<void> | void;
  /** Wylogowuje ze wszystkich urządzeń; zwraca false, gdy się nie udało. */
  onLogoutAll: () => Promise<boolean>;
  /** Po zmianie hasła serwer wydaje nowy token (pozostałe sesje są wylogowane). */
  onPasswordChanged: (user: AuthUser, token: string) => void;
  onOpenImportExport: (tab: 'export' | 'import') => void;
  /** Konto zostało usunięte — wyczyść sesję i wróć do ekranu logowania. */
  onAccountDeleted: () => void;
  showToast: (msg: string) => void;
}

const card = 'bg-stone-900 border border-stone-800 rounded-2xl p-4 sm:p-6';
const inputCls =
  'w-full bg-stone-950 border border-stone-700 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-sm text-stone-100 placeholder-stone-500 focus:outline-none';
const labelCls = 'block text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-1.5';

const SectionHeader: React.FC<{ title: string; description: string }> = ({ title, description }) => (
  <div className="mb-4">
    <h3 className="text-base font-bold text-stone-100">{title}</h3>
    <p className="text-xs text-stone-400 mt-0.5">{description}</p>
  </div>
);

export const SettingsPage: React.FC<SettingsPageProps> = (props) => {
  const [section, setSection] = useState<Section>('account');
  const active = SECTIONS.find((s) => s.id === section)!;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-400 flex items-center justify-center">
          <Settings className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-black text-stone-100">Ustawienia</h2>
          <p className="text-xs text-stone-400">Zarządzaj kontem, wyceną kolekcji i bezpieczeństwem</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4 md:gap-6 items-start">
        {/* Kategorie: na telefonie przewijany pasek, na komputerze menu boczne */}
        <nav aria-label="Kategorie ustawień" className="md:sticky md:top-28">
          <ul className="flex md:flex-col gap-1.5 overflow-x-auto no-scrollbar -mx-3 px-3 md:mx-0 md:px-0 pb-1 md:pb-0">
            {SECTIONS.map(({ id, label, hint, icon: Icon }) => (
              <li key={id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setSection(id)}
                  aria-current={section === id ? 'page' : undefined}
                  className={`w-full flex items-center gap-3 rounded-xl border px-3.5 py-2.5 md:py-3 text-left cursor-pointer transition-colors ${
                    section === id
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-200'
                      : 'bg-stone-900 md:bg-transparent border-stone-800 md:border-transparent text-stone-300 hover:bg-stone-900 hover:text-stone-100'
                  }`}
                >
                  <Icon className={`w-4.5 h-4.5 shrink-0 ${section === id ? 'text-amber-400' : 'text-stone-500'}`} />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold whitespace-nowrap">{label}</span>
                    <span className="hidden md:block text-[11px] text-stone-500 truncate">{hint}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0" aria-label={active.label}>
          {section === 'account' && (
            <AccountSection user={props.user} onOpenImportExport={props.onOpenImportExport} onAccountDeleted={props.onAccountDeleted} />
          )}
          {section === 'pricing' && <PricingSection settings={props.settings} onSave={props.onSaveSettings} />}
          {section === 'security' && (
            <SecuritySection onLogoutAll={props.onLogoutAll} onPasswordChanged={props.onPasswordChanged} showToast={props.showToast} />
          )}
          {section === 'sharing' && <SharingSection user={props.user} showToast={props.showToast} />}
          {section === 'data' && <DataSection onOpenImportExport={props.onOpenImportExport} />}
        </div>
      </div>
    </div>
  );
};

/* ---------- Konto i profil ---------- */

const AccountSection: React.FC<{
  user: AuthUser;
  onOpenImportExport: (tab: 'export' | 'import') => void;
  onAccountDeleted: () => void;
}> = ({ user, onOpenImportExport, onAccountDeleted }) => (
  <div className="space-y-4">
    <div className={card}>
      <SectionHeader title="Dane konta" description="Nazwę gracza może zmienić administrator — napisz do niego, jeśli potrzebujesz." />
      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: 'Nazwa gracza', value: user.username },
          { label: 'Adres e-mail', value: user.email },
          { label: 'Konto od', value: user.createdAt ? new Date(user.createdAt).toLocaleDateString('pl-PL', { dateStyle: 'long' }) : '—' }
        ].map((r) => (
          <div key={r.label} className="bg-stone-950 border border-stone-800 rounded-xl p-3 min-w-0">
            <dt className="text-[10px] uppercase font-bold text-stone-500">{r.label}</dt>
            <dd className="text-sm font-semibold text-stone-100 truncate mt-0.5" title={r.value}>{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
    <div className={card}>
      <SectionHeader title="Profil publiczny" description="Opcjonalne dane widoczne dla innych graczy." />
      <CityPicker />
    </div>
    <DeleteAccountCard user={user} onOpenImportExport={onOpenImportExport} onAccountDeleted={onAccountDeleted} />
  </div>
);

const DeleteAccountCard: React.FC<{
  user: AuthUser;
  onOpenImportExport: (tab: 'export' | 'import') => void;
  onAccountDeleted: () => void;
}> = ({ user, onOpenImportExport, onAccountDeleted }) => {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = password.length > 0 && confirm.trim().toUpperCase() === 'USUŃ';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await authApi.deleteAccount(password);
      onAccountDeleted();
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="bg-rose-950/20 border border-rose-900/60 rounded-2xl p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center justify-center shrink-0">
          <Trash2 className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-bold text-rose-100">Usuń konto</h3>
          <p className="text-xs text-stone-400 mt-0.5">
            Trwale usuwa konto i wszystkie dane: kolekcję, klasery, talie, listę życzeń, ofertę sprzedaży, wiadomości
            i miejscowość. Tej operacji nie można cofnąć.
          </p>
        </div>
      </div>

      {user.isAdmin ? (
        <p className="mt-4 text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5">
          To konto administratora — nie można go usunąć z ustawień.
        </p>
      ) : !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 h-11 px-4 rounded-xl text-sm font-semibold text-rose-200 bg-rose-950/50 hover:bg-rose-900/50 border border-rose-800/60 flex items-center gap-2 cursor-pointer"
        >
          <Trash2 className="w-4 h-4" />
          Chcę usunąć konto
        </button>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-3 max-w-md">
          <p className="text-xs text-stone-300 bg-stone-950/60 border border-stone-800 rounded-lg p-2.5">
            Chcesz zachować kolekcję?{' '}
            <button type="button" onClick={() => onOpenImportExport('export')} className="font-semibold text-amber-300 underline cursor-pointer">
              Najpierw ją wyeksportuj
            </button>
            .
          </p>
          <PasswordInput label="Twoje hasło" value={password} onChange={setPassword} autoComplete="current-password" />
          <label className="block">
            <span className={labelCls}>Wpisz USUŃ, aby potwierdzić</span>
            <input
              type="text"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="off"
              placeholder="USUŃ"
              className={inputCls}
            />
          </label>
          {error && (
            <p className="p-2.5 rounded-lg text-xs flex items-start gap-2 border bg-rose-500/10 border-rose-500/30 text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={!ready || busy}
              className="h-11 px-5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-default"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Usuń konto na zawsze
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setPassword(''); setConfirm(''); setError(null); }}
              className="h-11 px-4 rounded-xl text-sm font-semibold text-stone-300 hover:bg-stone-800 cursor-pointer"
            >
              Anuluj
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

/* ---------- Wycena i waluta ---------- */

const PricingSection: React.FC<{ settings: AppSettings; onSave: (s: AppSettings) => Promise<void> | void }> = ({ settings, onSave }) => {
  const [pricingSource, setPricingSource] = useState<PricingSource>(settings.pricingSource);
  const [currency, setCurrency] = useState<CurrencyCode>(settings.currency);
  const [eurRate, setEurRate] = useState(settings.eurToPlnRate.toString());
  const [usdRate, setUsdRate] = useState(settings.usdToPlnRate.toString());
  const [autoNbp, setAutoNbp] = useState(settings.autoNbpRate);
  const [isFetchingNbp, setIsFetchingNbp] = useState(false);
  const [nbpMessage, setNbpMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const dirty = useMemo(
    () =>
      pricingSource !== settings.pricingSource ||
      currency !== settings.currency ||
      parseFloat(eurRate) !== settings.eurToPlnRate ||
      parseFloat(usdRate) !== settings.usdToPlnRate ||
      autoNbp !== settings.autoNbpRate,
    [pricingSource, currency, eurRate, usdRate, autoNbp, settings]
  );

  const fetchNbp = async () => {
    setIsFetchingNbp(true);
    setNbpMessage(null);
    try {
      const [eurRes, usdRes] = await Promise.all([
        fetch('https://api.nbp.pl/api/exchangerates/rates/a/eur/?format=json').catch(() => null),
        fetch('https://api.nbp.pl/api/exchangerates/rates/a/usd/?format=json').catch(() => null)
      ]);
      let eur = parseFloat(eurRate);
      let usd = parseFloat(usdRate);
      let got = 0;
      if (eurRes?.ok) {
        const mid = (await eurRes.json())?.rates?.[0]?.mid;
        if (mid) { eur = mid; setEurRate(mid.toFixed(4)); got++; }
      }
      if (usdRes?.ok) {
        const mid = (await usdRes.json())?.rates?.[0]?.mid;
        if (mid) { usd = mid; setUsdRate(mid.toFixed(4)); got++; }
      }
      setNbpMessage(
        got
          ? { ok: true, text: `Pobrano kursy NBP: 1 EUR = ${eur.toFixed(2)} zł, 1 USD = ${usd.toFixed(2)} zł. Zapisz, aby zastosować.` }
          : { ok: false, text: 'Nie udało się pobrać kursów z NBP. Spróbuj później.' }
      );
    } finally {
      setIsFetchingNbp(false);
    }
  };

  const reset = () => {
    setPricingSource(DEFAULT_SETTINGS.pricingSource);
    setCurrency(DEFAULT_SETTINGS.currency);
    setEurRate(DEFAULT_SETTINGS.eurToPlnRate.toString());
    setUsdRate(DEFAULT_SETTINGS.usdToPlnRate.toString());
    setAutoNbp(DEFAULT_SETTINGS.autoNbpRate);
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave({
        pricingSource,
        currency,
        eurToPlnRate: parseFloat(eurRate) || DEFAULT_SETTINGS.eurToPlnRate,
        usdToPlnRate: parseFloat(usdRate) || DEFAULT_SETTINGS.usdToPlnRate,
        autoNbpRate: autoNbp,
        lastNbpUpdate: new Date().toISOString()
      });
    } finally {
      setSaving(false);
    }
  };

  const sources: Array<{ id: PricingSource; name: string; desc: string; icon: React.ElementType; color: string }> = [
    { id: 'CARDMARKET', name: 'Cardmarket', desc: 'Price Trend z Cardmarket (EUR). Polecane dla Polski i Europy.', icon: Euro, color: 'text-blue-400' },
    { id: 'TCGPLAYER', name: 'TCGPlayer', desc: 'Średnia cena rynkowa z TCGPlayer (USD). Rynek amerykański.', icon: DollarSign, color: 'text-emerald-400' }
  ];
  const currencies: Array<{ id: CurrencyCode; label: string }> = [
    { id: 'PLN', label: 'PLN (zł)' },
    { id: 'EUR', label: 'EUR (€)' },
    { id: 'USD', label: 'USD ($)' }
  ];
  const example =
    currency === 'PLN'
      ? pricingSource === 'CARDMARKET'
        ? 10 * (parseFloat(eurRate) || 0)
        : 11 * (parseFloat(usdRate) || 0)
      : currency === 'EUR'
        ? 10
        : 11;

  return (
    <div className="space-y-4">
      <div className={card}>
        <SectionHeader title="Źródło cen" description="Z którego rynku liczymy wartość Twoich kart (dane Scryfall, aktualizowane raz na dobę)." />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {sources.map(({ id, name, desc, icon: Icon, color }) => (
            <button
              key={id}
              type="button"
              onClick={() => setPricingSource(id)}
              aria-pressed={pricingSource === id}
              className={`text-left p-4 rounded-xl border cursor-pointer transition-colors space-y-1.5 ${
                pricingSource === id ? 'bg-amber-500/10 border-amber-500 ring-1 ring-amber-500/30' : 'bg-stone-950/60 border-stone-800 hover:border-stone-700'
              }`}
            >
              <span className="flex items-center justify-between">
                <span className="font-bold text-sm text-stone-100 flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${color}`} /> {name}
                </span>
                {pricingSource === id && (
                  <span className="w-5 h-5 rounded-full bg-amber-500 text-stone-950 flex items-center justify-center">
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </span>
                )}
              </span>
              <span className="block text-xs text-stone-400 leading-relaxed">{desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={card}>
        <SectionHeader title="Waluta" description="W jakiej walucie pokazujemy ceny w całej aplikacji." />
        <div className="grid grid-cols-3 gap-2.5 max-w-md">
          {currencies.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setCurrency(id)}
              aria-pressed={currency === id}
              className={`h-11 rounded-xl border text-sm font-bold cursor-pointer transition-colors ${
                currency === id ? 'bg-amber-500 text-stone-950 border-amber-400' : 'bg-stone-950/60 border-stone-800 text-stone-300 hover:border-stone-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-bold text-stone-100">Kursy walut</h3>
            <p className="text-xs text-stone-400 mt-0.5">Do przeliczania cen EUR i USD na złotówki (średni kurs NBP).</p>
          </div>
          <button
            type="button"
            onClick={fetchNbp}
            disabled={isFetchingNbp}
            className="h-10 px-3.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-amber-300 border border-stone-700 text-sm font-semibold flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isFetchingNbp ? 'animate-spin' : ''}`} />
            Pobierz z NBP
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
          {[
            { label: '1 EUR w PLN', value: eurRate, set: setEurRate },
            { label: '1 USD w PLN', value: usdRate, set: setUsdRate }
          ].map((r) => (
            <label key={r.label} className="block">
              <span className={labelCls}>{r.label}</span>
              <span className="relative block">
                <input type="number" step="0.0001" min="0" value={r.value} onChange={(e) => r.set(e.target.value)} className={`${inputCls} font-mono font-bold pr-12`} />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-500 font-mono text-xs">PLN</span>
              </span>
            </label>
          ))}
        </div>
        <label className="mt-4 flex items-center gap-2.5 text-sm text-stone-300 cursor-pointer">
          <input type="checkbox" checked={autoNbp} onChange={(e) => setAutoNbp(e.target.checked)} className="w-4 h-4 accent-amber-500" />
          Automatycznie pobieraj kursy NBP przy uruchomieniu aplikacji
        </label>
        {nbpMessage && (
          <p className={`mt-3 p-2.5 rounded-lg text-xs flex items-start gap-2 border ${nbpMessage.ok ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'}`}>
            {nbpMessage.ok ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            {nbpMessage.text}
          </p>
        )}
        <p className="mt-4 text-xs text-stone-400">
          Przykład: karta za ~10 EUR / ~11 USD będzie warta{' '}
          <strong className="text-emerald-400 font-mono">{formatCurrency(example, currency)}</strong>.
        </p>
      </div>

      {/* Pasek zapisu */}
      <div className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] md:bottom-4 z-10 flex items-center justify-between gap-3 bg-stone-900/95 backdrop-blur border border-stone-800 rounded-2xl p-3 shadow-xl">
        <button type="button" onClick={reset} className="h-10 px-3 text-sm font-semibold text-stone-400 hover:text-stone-200 rounded-xl cursor-pointer">
          Przywróć domyślne
        </button>
        <div className="flex items-center gap-3">
          {dirty && <span className="hidden sm:inline text-xs text-amber-300">Niezapisane zmiany</span>}
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            className="h-10 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-sm font-bold flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-default"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Zapisz zmiany
          </button>
        </div>
      </div>
    </div>
  );
};

/* ---------- Bezpieczeństwo ---------- */

const PasswordInput: React.FC<{ label: string; value: string; onChange: (v: string) => void; autoComplete: string; hint?: string }> = ({
  label, value, onChange, autoComplete, hint
}) => {
  const [show, setShow] = useState(false);
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      <span className="relative block">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          placeholder={hint}
          className={`${inputCls} pr-11`}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? 'Ukryj hasło' : 'Pokaż hasło'}
          className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-stone-500 hover:text-stone-300 cursor-pointer"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </span>
    </label>
  );
};

const SecuritySection: React.FC<{
  onLogoutAll: () => Promise<boolean>;
  onPasswordChanged: (user: AuthUser, token: string) => void;
  showToast: (msg: string) => void;
}> = ({ onLogoutAll, onPasswordChanged, showToast }) => {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmLogoutAll, setConfirmLogoutAll] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const strength = next.length === 0 ? 0 : next.length < 8 ? 1 : next.length < 12 || !/[^a-zA-Z]/.test(next) ? 2 : 3;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (!current) return setMsg({ ok: false, text: 'Podaj obecne hasło.' });
    if (next.length < 8) return setMsg({ ok: false, text: 'Nowe hasło musi mieć co najmniej 8 znaków.' });
    if (next !== repeat) return setMsg({ ok: false, text: 'Nowe hasła nie są takie same.' });
    setSaving(true);
    try {
      const res = await authApi.changePassword(next, current);
      onPasswordChanged(res.user, res.token);
      setCurrent('');
      setNext('');
      setRepeat('');
      setMsg({ ok: true, text: 'Hasło zostało zmienione. Inne urządzenia zostały wylogowane.' });
      showToast('Hasło zostało zmienione.');
    } catch (err: any) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className={card}>
        <SectionHeader title="Zmiana hasła" description="Po zmianie hasła wylogujemy Cię ze wszystkich innych urządzeń." />
        <div className="space-y-3 max-w-md">
          <PasswordInput label="Obecne hasło" value={current} onChange={setCurrent} autoComplete="current-password" />
          <PasswordInput label="Nowe hasło" value={next} onChange={setNext} autoComplete="new-password" hint="Co najmniej 8 znaków" />
          {next && (
            <div className="flex items-center gap-2" aria-live="polite">
              <div className="flex gap-1 flex-1">
                {[1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className={`h-1.5 flex-1 rounded-full ${
                      strength >= i ? (strength === 1 ? 'bg-rose-500' : strength === 2 ? 'bg-amber-500' : 'bg-emerald-500') : 'bg-stone-800'
                    }`}
                  />
                ))}
              </div>
              <span className="text-[11px] text-stone-400 w-24 text-right">
                {strength === 1 ? 'Za krótkie' : strength === 2 ? 'Przeciętne' : 'Silne'}
              </span>
            </div>
          )}
          <PasswordInput label="Powtórz nowe hasło" value={repeat} onChange={setRepeat} autoComplete="new-password" />
          {msg && (
            <p className={`p-2.5 rounded-lg text-xs flex items-start gap-2 border ${msg.ok ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'}`}>
              {msg.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              {msg.text}
            </p>
          )}
          <button
            type="submit"
            disabled={saving}
            className="h-11 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-sm font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            Zmień hasło
          </button>
        </div>
      </form>

      <div className={card}>
        <SectionHeader
          title="Sesje"
          description="Sesja wygasa po 7 dniach bez aktywności (najpóźniej po 30 dniach). Jeśli logowałeś się na cudzym urządzeniu lub zgubiłeś telefon, wyloguj się wszędzie."
        />
        {!confirmLogoutAll ? (
          <button
            type="button"
            onClick={() => setConfirmLogoutAll(true)}
            className="h-11 px-4 rounded-xl text-sm font-semibold text-rose-300 bg-rose-950/30 hover:bg-rose-950/50 border border-rose-900/50 flex items-center gap-2 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Wyloguj ze wszystkich urządzeń
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-stone-300">Na pewno? Wylogujesz też to urządzenie.</span>
            <button type="button" onClick={() => setConfirmLogoutAll(false)} disabled={loggingOut} className="h-10 px-3 text-sm font-semibold text-stone-400 hover:text-stone-200 rounded-xl cursor-pointer">
              Anuluj
            </button>
            <button
              type="button"
              disabled={loggingOut}
              onClick={async () => {
                setLoggingOut(true);
                const ok = await onLogoutAll();
                setLoggingOut(false);
                if (!ok) {
                  setConfirmLogoutAll(false);
                  showToast('Nie udało się wylogować. Spróbuj ponownie.');
                }
              }}
              className="h-10 px-4 rounded-xl text-sm font-bold text-white bg-rose-600 hover:bg-rose-500 flex items-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {loggingOut && <Loader2 className="w-4 h-4 animate-spin" />}
              Tak, wyloguj wszędzie
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

/* ---------- Udostępnianie ---------- */

const SharingSection: React.FC<{ user: AuthUser; showToast: (msg: string) => void }> = ({ user, showToast }) => {
  const [copied, setCopied] = useState<string | null>(null);
  const slug = encodeURIComponent(user.username);
  const links = [
    { id: 'sale', title: 'Oferta sprzedaży', desc: 'Karty oznaczone „na sprzedaż”, z cenami.', url: `${window.location.origin}/?sprzedam=${slug}` },
    { id: 'wish', title: 'Lista życzeń', desc: 'Karty, których szukasz.', url: `${window.location.origin}/?szukam=${slug}` }
  ];
  const copy = async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
      showToast('Skopiowano link do schowka.');
      setTimeout(() => setCopied(null), 2000);
    } catch {
      showToast('Nie udało się skopiować — zaznacz link i skopiuj ręcznie.');
    }
  };
  return (
    <div className={card}>
      <SectionHeader title="Publiczne linki" description="Każdy, kto ma link, zobaczy te strony bez zakładania konta." />
      <div className="space-y-3">
        {links.map((l) => (
          <div key={l.id} className="bg-stone-950 border border-stone-800 rounded-xl p-3.5 space-y-2">
            <div>
              <p className="text-sm font-bold text-stone-100">{l.title}</p>
              <p className="text-xs text-stone-400">{l.desc}</p>
            </div>
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
              <input
                readOnly
                value={l.url}
                onFocus={(e) => e.currentTarget.select()}
                aria-label={`Link: ${l.title}`}
                className="basis-full sm:basis-auto flex-1 min-w-0 bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-xs font-mono text-stone-300 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => copy(l.id, l.url)}
                className="h-9 px-3 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-100 text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                {copied === l.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied === l.id ? 'Skopiowano' : 'Kopiuj'}
              </button>
              <a
                href={l.url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Otwórz: ${l.title}`}
                className="h-9 w-9 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 flex items-center justify-center shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ---------- Dane kolekcji ---------- */

const DataSection: React.FC<{ onOpenImportExport: (tab: 'export' | 'import') => void }> = ({ onOpenImportExport }) => (
  <div className={card}>
    <SectionHeader title="Import i eksport" description="Przenieś kolekcję z innej aplikacji albo zrób kopię zapasową." />
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <button
        type="button"
        onClick={() => onOpenImportExport('import')}
        className="text-left p-4 rounded-xl bg-stone-950 border border-stone-800 hover:border-amber-500/40 cursor-pointer space-y-1"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-stone-100">
          <Upload className="w-4 h-4 text-amber-400" /> Importuj karty
        </span>
        <span className="block text-xs text-stone-400">Lista tekstowa w formacie „1x Nazwa (dodatek) nr” lub plik .json z kopii.</span>
      </button>
      <button
        type="button"
        onClick={() => onOpenImportExport('export')}
        className="text-left p-4 rounded-xl bg-stone-950 border border-stone-800 hover:border-amber-500/40 cursor-pointer space-y-1"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-stone-100">
          <Download className="w-4 h-4 text-amber-400" /> Eksportuj kolekcję
        </span>
        <span className="block text-xs text-stone-400">Plik .txt do innych serwisów albo pełna kopia .json.</span>
      </button>
    </div>
  </div>
);

export default SettingsPage;
