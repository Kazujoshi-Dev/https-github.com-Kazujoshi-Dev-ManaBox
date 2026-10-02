import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck, Users, UserPlus, Activity, Ban, Layers, CircleDollarSign, Database, Search, Loader2, X,
  KeyRound, LogOut, EyeOff, Eye, Trash2, Pencil, Copy, Check, ScrollText, AlertTriangle, RefreshCw, ChevronRight
} from 'lucide-react';
import { adminApi } from '../services/api';
import { useBackToClose } from '../hooks/useBackButton';
import type { AdminAuditEntry, AdminStats, AdminUser, AuthUser } from '../types';

interface AdminPanelProps {
  currentUser: AuthUser | null;
  showToast?: (message: string) => void;
}

const PAGE = 50;

const fmtDate = (iso: string | null | undefined, withTime = false) =>
  iso
    ? new Date(iso).toLocaleString('pl-PL', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' })
    : '—';

const fmtNum = (n: number) => n.toLocaleString('pl-PL');

function banLabel(u: AdminUser) {
  if (!u.banned) return null;
  return u.banPermanent ? 'Zablokowany na stałe' : `Zablokowany do ${fmtDate(u.bannedUntil, true)}`;
}

const ACTION_LABELS: Record<string, string> = {
  rename: 'Zmiana nazwy',
  reset_password: 'Reset hasła',
  ban: 'Blokada',
  unban: 'Zdjęcie blokady',
  logout_all: 'Wylogowanie ze wszystkich urządzeń',
  hide_sale: 'Ukrycie oferty',
  show_sale: 'Przywrócenie oferty',
  delete: 'Usunięcie konta'
};

function auditDetails(e: AdminAuditEntry): string {
  const d = e.details || {};
  switch (e.action) {
    case 'rename':
      return `${d.from} → ${d.to}`;
    case 'ban':
      return [d.permanent ? 'na stałe' : `do ${fmtDate(d.until, true)}`, d.reason ? `powód: ${d.reason}` : ''].filter(Boolean).join(', ');
    case 'logout_all':
      return `sesji: ${d.sessions ?? 0}`;
    case 'delete':
      return d.email ? String(d.email) : '';
    default:
      return '';
  }
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ currentUser, showToast }) => {
  const [view, setView] = useState<'users' | 'audit'>('users');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [audit, setAudit] = useState<AdminAuditEntry[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadStats = useCallback(() => {
    adminApi.stats().then(setStats).catch(() => {});
  }, []);

  const loadUsers = useCallback(async (q: string, offset = 0) => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.users(q, offset, PAGE);
      setUsers((prev) => (offset === 0 ? res.users : [...prev, ...res.users]));
      setTotal(res.total);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Wyszukiwanie z krótkim opóźnieniem po wpisaniu
  useEffect(() => {
    const t = setTimeout(() => loadUsers(query), query ? 300 : 0);
    return () => clearTimeout(t);
  }, [query, loadUsers]);

  useEffect(() => {
    if (view === 'audit') adminApi.audit().then(setAudit).catch((e) => setError(e.message));
  }, [view]);

  const refreshAll = useCallback(async () => {
    loadStats();
    await loadUsers(query);
    if (view === 'audit') adminApi.audit().then(setAudit).catch(() => {});
  }, [loadStats, loadUsers, query, view]);

  const selected = useMemo(() => users.find((u) => u.id === selectedId) || null, [users, selectedId]);

  const statTiles = stats
    ? [
        { label: 'Użytkownicy', value: fmtNum(stats.users), icon: Users, color: 'text-blue-400' },
        { label: 'Nowi (7 dni)', value: fmtNum(stats.newUsers7d), icon: UserPlus, color: 'text-emerald-400' },
        { label: 'Aktywni (7 dni)', value: fmtNum(stats.activeUsers7d), icon: Activity, color: 'text-amber-400' },
        { label: 'Zablokowani', value: fmtNum(stats.bannedUsers), icon: Ban, color: 'text-rose-400' },
        { label: 'Karty w kolekcjach', value: fmtNum(stats.totalCards), icon: Layers, color: 'text-purple-300' },
        { label: 'Karty na sprzedaż', value: fmtNum(stats.forSaleCards), icon: CircleDollarSign, color: 'text-emerald-400' }
      ]
    : [];

  return (
    <div className="space-y-5">
      {/* Nagłówek i statystyki */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-black text-stone-100">Panel administratora</h2>
              <p className="text-xs text-stone-400 truncate">Zalogowano jako {currentUser?.username} · wszystkie działania trafiają do dziennika</p>
            </div>
          </div>
          <button
            type="button"
            onClick={refreshAll}
            aria-label="Odśwież"
            title="Odśwież"
            className="w-10 h-10 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 flex items-center justify-center shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5">
          {statTiles.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-stone-950 border border-stone-800 rounded-xl p-3">
              <p className="text-[10px] uppercase font-bold text-stone-400 flex items-center gap-1.5">
                <Icon className={`w-3.5 h-3.5 ${color}`} />
                {label}
              </p>
              <p className="text-lg font-black text-stone-100 mt-0.5">{value}</p>
            </div>
          ))}
          {!stats && <p className="col-span-full text-xs text-stone-500">Ładowanie statystyk...</p>}
        </div>

        {stats && (
          <p className="text-xs text-stone-400 flex items-start gap-1.5">
            <Database className={`w-3.5 h-3.5 shrink-0 mt-px ${stats.cardDb.ready ? 'text-emerald-400' : 'text-amber-400'}`} />
            <span>
              Baza kart Scryfall:{' '}
              {stats.cardDb.ready ? (
                <>
                  <strong className="text-stone-200">{fmtNum(stats.cardDb.cards)}</strong> wydań, ostatnia synchronizacja{' '}
                  {fmtDate(stats.cardDb.lastSyncAt, true)}
                </>
              ) : (
                <strong className="text-amber-300">niedostępna</strong>
              )}
              {stats.cardDb.syncing && ' · trwa synchronizacja'}
              {stats.cardDb.lastSyncError && <span className="text-rose-300"> · błąd: {stats.cardDb.lastSyncError}</span>}
            </span>
          </p>
        )}
      </div>

      {/* Przełącznik widoku */}
      <div className="flex gap-2">
        {[
          { id: 'users' as const, label: 'Użytkownicy', icon: Users },
          { id: 'audit' as const, label: 'Dziennik działań', icon: ScrollText }
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            className={`h-10 px-4 rounded-xl text-sm font-semibold flex items-center gap-2 border cursor-pointer ${
              view === id ? 'bg-rose-500/15 border-rose-500/40 text-rose-200' : 'bg-stone-900 border-stone-800 text-stone-400 hover:text-stone-200'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3">{error}</p>}

      {view === 'users' ? (
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Szukaj po nazwie lub e-mailu..."
              aria-label="Szukaj użytkownika"
              className="w-full bg-stone-900 border border-stone-800 focus:border-rose-500 rounded-xl pl-10 pr-3 py-3 text-sm text-stone-100 placeholder-stone-500 focus:outline-none"
            />
          </div>
          <p className="text-xs text-stone-500">
            {loading && users.length === 0 ? 'Ładowanie...' : `Znaleziono: ${fmtNum(total)}`}
          </p>

          <ul className="space-y-2">
            {users.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(u.id)}
                  className="w-full text-left bg-stone-900 border border-stone-800 hover:border-rose-500/40 rounded-xl p-3 sm:p-4 flex items-center gap-3 cursor-pointer"
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-black shrink-0 ${
                      u.banned ? 'bg-rose-950 text-rose-300' : 'bg-gradient-to-tr from-amber-600 to-orange-500 text-white'
                    }`}
                  >
                    {u.username.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-bold text-stone-100 truncate max-w-[60vw] sm:max-w-none">{u.username}</span>
                      {u.isAdmin && <Badge tone="rose">Admin</Badge>}
                      {u.banned && <Badge tone="red">{u.banPermanent ? 'Ban stały' : 'Ban czasowy'}</Badge>}
                      {u.saleHidden && <Badge tone="amber">Oferta ukryta</Badge>}
                      {u.mustChangePassword && <Badge tone="stone">Hasło tymczasowe</Badge>}
                    </div>
                    <p className="text-xs text-stone-400 truncate">{u.email}</p>
                    <p className="text-[11px] text-stone-500 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>Rejestracja: {fmtDate(u.createdAt)}</span>
                      <span>Aktywność: {fmtDate(u.lastActiveAt)}</span>
                      <span>Karty: {fmtNum(u.totalCards)}</span>
                      <span>Sprzedaż: {fmtNum(u.forSaleCards)}</span>
                      <span>Lista życzeń: {fmtNum(u.wishlistCount)}</span>
                      {u.city && <span>{u.city}</span>}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-stone-500 shrink-0" />
                </button>
              </li>
            ))}
          </ul>

          {users.length < total && (
            <button
              type="button"
              onClick={() => loadUsers(query, users.length)}
              disabled={loading}
              className="w-full h-11 rounded-xl bg-stone-900 border border-stone-800 text-sm font-semibold text-stone-300 hover:text-stone-100 cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Ładowanie...' : `Pokaż więcej (${fmtNum(total - users.length)})`}
            </button>
          )}
        </div>
      ) : (
        <div className="bg-stone-900 border border-stone-800 rounded-2xl divide-y divide-stone-800">
          {audit === null ? (
            <p className="p-4 text-sm text-stone-400">Ładowanie...</p>
          ) : audit.length === 0 ? (
            <p className="p-4 text-sm text-stone-400">Brak wpisów — tu pojawią się działania administratorów.</p>
          ) : (
            audit.map((e) => (
              <div key={e.id} className="p-3 sm:p-4 text-sm flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                <span className="text-xs text-stone-500 sm:w-40 shrink-0">{fmtDate(e.createdAt, true)}</span>
                <span className="flex-1 min-w-0">
                  <strong className="text-stone-100">{ACTION_LABELS[e.action] || e.action}</strong>
                  {e.targetUsername && <span className="text-stone-300"> · {e.targetUsername}</span>}
                  {auditDetails(e) && <span className="text-stone-400"> · {auditDetails(e)}</span>}
                </span>
                <span className="text-xs text-stone-500 shrink-0">przez {e.adminUsername || '—'}</span>
              </div>
            ))
          )}
        </div>
      )}

      {selected && (
        <UserDialog
          key={selected.id}
          user={selected}
          isSelf={selected.id === currentUser?.id}
          onClose={() => setSelectedId(null)}
          onChanged={async (msg, closeDialog) => {
            if (msg) showToast?.(msg);
            if (closeDialog) setSelectedId(null);
            await refreshAll();
          }}
        />
      )}
    </div>
  );
};

const Badge: React.FC<{ tone: 'rose' | 'red' | 'amber' | 'stone'; children: React.ReactNode }> = ({ tone, children }) => {
  const cls = {
    rose: 'bg-rose-500/15 text-rose-200 border-rose-500/40',
    red: 'bg-red-600/20 text-red-200 border-red-500/50',
    amber: 'bg-amber-500/15 text-amber-200 border-amber-500/40',
    stone: 'bg-stone-800 text-stone-300 border-stone-700'
  }[tone];
  return <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${cls}`}>{children}</span>;
};

const Section: React.FC<{ title: string; icon: React.ElementType; danger?: boolean; children: React.ReactNode }> = ({ title, icon: Icon, danger, children }) => (
  <section className={`rounded-xl border p-3.5 space-y-2.5 ${danger ? 'border-rose-900/60 bg-rose-950/20' : 'border-stone-800 bg-stone-950/60'}`}>
    <h4 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${danger ? 'text-rose-300' : 'text-stone-300'}`}>
      <Icon className="w-4 h-4" />
      {title}
    </h4>
    {children}
  </section>
);

const BAN_PRESETS = [
  { label: '1 dzień', days: 1 },
  { label: '7 dni', days: 7 },
  { label: '30 dni', days: 30 }
];

interface UserDialogProps {
  user: AdminUser;
  isSelf: boolean;
  onClose: () => void;
  onChanged: (message: string | null, closeDialog?: boolean) => Promise<void>;
}

const UserDialog: React.FC<UserDialogProps> = ({ user, isSelf, onClose, onChanged }) => {
  useBackToClose(true, onClose);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState(user.username);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [banMode, setBanMode] = useState<number | 'custom' | 'permanent'>(7);
  const [banUntil, setBanUntil] = useState('');
  const [banReason, setBanReason] = useState('');
  const [confirmDelete, setConfirmDelete] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const protectedAccount = user.isAdmin;

  const run = async (key: string, fn: () => Promise<string | null | void>, closeAfter = false) => {
    setBusy(key);
    setError(null);
    try {
      const msg = await fn();
      await onChanged(msg || null, closeAfter);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const btn = 'h-10 px-3.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-default';
  const input = 'w-full bg-stone-900 border border-stone-700 focus:border-rose-500 rounded-lg px-3 py-2 text-sm text-stone-100 placeholder-stone-500 focus:outline-none';
  const spin = (key: string) => (busy === key ? <Loader2 className="w-4 h-4 animate-spin" /> : null);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={`Zarządzanie kontem ${user.username}`}
    >
      <div className="w-full sm:max-w-xl max-h-[92dvh] overflow-y-auto bg-stone-900 border border-stone-800 rounded-t-3xl sm:rounded-2xl shadow-2xl pb-[env(safe-area-inset-bottom)] max-sm:animate-[slideUp_.2s_ease-out]">
        <div className="sticky top-0 z-10 bg-stone-900 border-b border-stone-800 px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-black text-stone-100 truncate">{user.username}</h3>
            <p className="text-xs text-stone-400 truncate">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij"
            className="w-10 h-10 rounded-full bg-stone-800 hover:bg-stone-700 text-stone-300 flex items-center justify-center shrink-0 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {error && (
            <p className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg p-2.5 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
              {error}
            </p>
          )}
          {protectedAccount && (
            <p className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5">
              To konto administratora — blokada, reset hasła, ukrycie oferty i usunięcie są niedostępne.
            </p>
          )}

          <div className="text-xs text-stone-400 grid grid-cols-2 gap-x-3 gap-y-1">
            <span>Rejestracja: <strong className="text-stone-200">{fmtDate(user.createdAt)}</strong></span>
            <span>Aktywność: <strong className="text-stone-200">{fmtDate(user.lastActiveAt, true)}</strong></span>
            <span>Karty: <strong className="text-stone-200">{fmtNum(user.totalCards)}</strong></span>
            <span>Na sprzedaż: <strong className="text-stone-200">{fmtNum(user.forSaleCards)}</strong></span>
            <span>Lista życzeń: <strong className="text-stone-200">{fmtNum(user.wishlistCount)}</strong></span>
            <span>Miejscowość: <strong className="text-stone-200">{user.city || '—'}</strong></span>
          </div>

          {/* Blokada */}
          <Section title="Blokada konta" icon={Ban}>
            {user.banned ? (
              <div className="space-y-2.5">
                <p className="text-sm text-red-200">
                  {banLabel(user)}
                  {user.banReason && <span className="block text-xs text-stone-400 mt-0.5">Powód: {user.banReason}</span>}
                </p>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => run('unban', async () => { await adminApi.unban(user.id); return `Zdjęto blokadę z konta ${user.username}.`; })}
                  className={`${btn} bg-emerald-600 hover:bg-emerald-500 text-white`}
                >
                  {spin('unban')}Zdejmij blokadę
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex flex-wrap gap-1.5">
                  {BAN_PRESETS.map((p) => (
                    <button
                      key={p.days}
                      type="button"
                      onClick={() => setBanMode(p.days)}
                      className={`h-9 px-3 rounded-lg text-xs font-semibold border cursor-pointer ${banMode === p.days ? 'bg-rose-500/20 border-rose-500/50 text-rose-100' : 'bg-stone-900 border-stone-700 text-stone-300'}`}
                    >
                      {p.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setBanMode('custom')}
                    className={`h-9 px-3 rounded-lg text-xs font-semibold border cursor-pointer ${banMode === 'custom' ? 'bg-rose-500/20 border-rose-500/50 text-rose-100' : 'bg-stone-900 border-stone-700 text-stone-300'}`}
                  >
                    Do daty
                  </button>
                  <button
                    type="button"
                    onClick={() => setBanMode('permanent')}
                    className={`h-9 px-3 rounded-lg text-xs font-semibold border cursor-pointer ${banMode === 'permanent' ? 'bg-red-600/30 border-red-500/60 text-red-100' : 'bg-stone-900 border-stone-700 text-stone-300'}`}
                  >
                    Na stałe
                  </button>
                </div>
                {banMode === 'custom' && (
                  <input
                    type="datetime-local"
                    value={banUntil}
                    onChange={(e) => setBanUntil(e.target.value)}
                    aria-label="Blokada do"
                    className={input}
                  />
                )}
                <input
                  type="text"
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  maxLength={500}
                  placeholder="Powód (zobaczy go użytkownik przy logowaniu)"
                  aria-label="Powód blokady"
                  className={input}
                />
                <button
                  type="button"
                  disabled={!!busy || protectedAccount || isSelf || (banMode === 'custom' && !banUntil)}
                  onClick={() =>
                    run('ban', async () => {
                      await adminApi.ban(user.id, {
                        permanent: banMode === 'permanent',
                        days: typeof banMode === 'number' ? banMode : undefined,
                        until: banMode === 'custom' ? new Date(banUntil).toISOString() : undefined,
                        reason: banReason.trim() || undefined
                      });
                      return `Zablokowano konto ${user.username}.`;
                    })
                  }
                  className={`${btn} bg-rose-600 hover:bg-rose-500 text-white`}
                >
                  {spin('ban')}Zablokuj
                </button>
                <p className="text-[11px] text-stone-500">Blokada od razu wylogowuje użytkownika i ukrywa jego ofertę, listę życzeń i miejsce na mapie.</p>
              </div>
            )}
          </Section>

          {/* Nazwa */}
          <Section title="Nazwa użytkownika" icon={Pencil}>
            <div className="flex gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={32}
                aria-label="Nowa nazwa"
                className={input}
              />
              <button
                type="button"
                disabled={!!busy || newName.trim() === user.username || newName.trim().length < 2}
                onClick={() => run('rename', async () => { await adminApi.rename(user.id, newName.trim()); return `Zmieniono nazwę na ${newName.trim()}.`; })}
                className={`${btn} bg-stone-700 hover:bg-stone-600 text-stone-100 shrink-0`}
              >
                {spin('rename')}Zapisz
              </button>
            </div>
            <p className="text-[11px] text-stone-500">Publiczne linki ze starą nazwą (oferta, lista życzeń) przestaną działać.</p>
          </Section>

          {/* Hasło */}
          <Section title="Reset hasła" icon={KeyRound}>
            {tempPassword ? (
              <div className="space-y-2">
                <p className="text-xs text-stone-300">Hasło tymczasowe — przekaż je użytkownikowi. <strong>Pokazujemy je tylko raz.</strong></p>
                <div className="flex gap-2">
                  <code className="flex-1 min-w-0 bg-stone-900 border border-amber-500/40 rounded-lg px-3 py-2 text-base font-mono text-amber-200 select-all break-all">
                    {tempPassword}
                  </code>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(tempPassword);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      } catch {
                        // użytkownik może skopiować ręcznie
                      }
                    }}
                    className={`${btn} bg-stone-700 hover:bg-stone-600 text-stone-100 shrink-0`}
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Skopiowano' : 'Kopiuj'}
                  </button>
                </div>
                <p className="text-[11px] text-stone-500">Po zalogowaniu użytkownik musi ustawić własne hasło.</p>
              </div>
            ) : confirmReset ? (
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs text-stone-300">Na pewno? Obecne hasło przestanie działać, a użytkownik zostanie wylogowany.</span>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() =>
                    run('reset', async () => {
                      const r = await adminApi.resetPassword(user.id);
                      setTempPassword(r.tempPassword);
                      setConfirmReset(false);
                      return null;
                    })
                  }
                  className={`${btn} bg-amber-500 hover:bg-amber-400 text-stone-950`}
                >
                  {spin('reset')}Tak, resetuj
                </button>
                <button type="button" onClick={() => setConfirmReset(false)} className={`${btn} text-stone-300 hover:bg-stone-800`}>
                  Anuluj
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={!!busy || protectedAccount}
                onClick={() => setConfirmReset(true)}
                className={`${btn} bg-stone-700 hover:bg-stone-600 text-stone-100`}
              >
                Wygeneruj hasło tymczasowe
              </button>
            )}
          </Section>

          {/* Sesje i oferta */}
          <Section title="Sesje i oferta" icon={LogOut}>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!!busy}
                onClick={() =>
                  run('logout', async () => {
                    const r = await adminApi.logoutAll(user.id);
                    return `Wylogowano ${user.username} z ${r.revoked ?? 0} sesji.`;
                  })
                }
                className={`${btn} bg-stone-700 hover:bg-stone-600 text-stone-100`}
              >
                {spin('logout')}
                <LogOut className="w-4 h-4" />
                Wyloguj ze wszystkich urządzeń
              </button>
              <button
                type="button"
                disabled={!!busy || protectedAccount}
                onClick={() =>
                  run('sale', async () => {
                    await adminApi.setSaleHidden(user.id, !user.saleHidden);
                    return user.saleHidden ? 'Oferta znów jest widoczna.' : 'Ukryto ofertę sprzedaży.';
                  })
                }
                className={`${btn} ${user.saleHidden ? 'bg-emerald-700 hover:bg-emerald-600' : 'bg-amber-700 hover:bg-amber-600'} text-white`}
              >
                {spin('sale')}
                {user.saleHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                {user.saleHidden ? 'Pokaż ofertę' : 'Ukryj ofertę sprzedaży'}
              </button>
            </div>
            {user.saleHidden && <p className="text-[11px] text-amber-300/90">Oferta jest ukryta: nie ma jej w publicznym linku, na mapie ani na liście graczy.</p>}
          </Section>

          {/* Usunięcie */}
          {!protectedAccount && !isSelf && (
            <Section title="Usuń konto" icon={Trash2} danger>
              <p className="text-xs text-stone-300">
                Usuwa konto i wszystkie dane: kolekcję, talie, listę życzeń i wiadomości. Tego nie da się cofnąć. Wpisz{' '}
                <strong className="text-rose-200 select-all">{user.username}</strong>, aby potwierdzić.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={confirmDelete}
                  onChange={(e) => setConfirmDelete(e.target.value)}
                  placeholder={user.username}
                  aria-label="Potwierdź nazwę"
                  className={input}
                />
                <button
                  type="button"
                  disabled={!!busy || confirmDelete !== user.username}
                  onClick={() =>
                    run('delete', async () => {
                      await adminApi.remove(user.id, confirmDelete);
                      return `Usunięto konto ${user.username}.`;
                    }, true)
                  }
                  className={`${btn} bg-red-700 hover:bg-red-600 text-white shrink-0`}
                >
                  {spin('delete')}Usuń
                </button>
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
