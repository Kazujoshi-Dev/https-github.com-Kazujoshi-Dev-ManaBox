import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminBugReports } from './admin/AdminBugReports';
import { bugReportsApi } from '../services/api';
import { AdminChangelog } from './admin/AdminChangelog';
import {
  ShieldCheck, Users, UserPlus, Activity, Ban, Layers, CircleDollarSign, Database, Search, Loader2, X,
  KeyRound, LogOut, EyeOff, Eye, Trash2, Pencil, Copy, Check, ScrollText, Newspaper, Bug, AlertTriangle, RefreshCw, ChevronRight
} from 'lucide-react';
import { adminApi } from '../services/api';
import { useBackToClose } from '../hooks/useBackButton';
import type { AdminAuditEntry, AdminStats, AdminUser, AuthUser } from '../types';
import { useT, locale, tk, t as tr } from '../i18n';

interface AdminPanelProps {
  currentUser: AuthUser | null;
  showToast?: (message: string) => void;
}

const PAGE = 50;

const fmtDate = (iso: string | null | undefined, withTime = false) =>
  iso
    ? new Date(iso).toLocaleString(locale(), withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' })
    : '—';

const fmtNum = (n: number) => n.toLocaleString(locale());

function banLabel(u: AdminUser) {
  if (!u.banned) return null;
  return u.banPermanent ? tr('Zablokowany na stałe') : tr('Zablokowany do {date}', { date: fmtDate(u.bannedUntil, true) });
}

const ACTION_LABELS: Record<string, string> = {
  rename: tk('Zmiana nazwy'),
  reset_password: tk('Reset hasła'),
  ban: tk('Blokada'),
  unban: tk('Zdjęcie blokady'),
  logout_all: tk('Wylogowanie ze wszystkich urządzeń'),
  hide_sale: tk('Ukrycie oferty'),
  show_sale: tk('Przywrócenie oferty'),
  verify_email: tk('Ręczne potwierdzenie e-mail'),
  delete: tk('Usunięcie konta')
};

function auditDetails(e: AdminAuditEntry): string {
  const d = e.details || {};
  switch (e.action) {
    case 'rename':
      return `${d.from} → ${d.to}`;
    case 'ban':
      return [d.permanent ? tr('na stałe') : tr('do {date}', { date: fmtDate(d.until, true) }), d.reason ? tr('powód: {reason}', { reason: d.reason }) : ''].filter(Boolean).join(', ');
    case 'logout_all':
      return tr('sesji: {n}', { n: d.sessions ?? 0 });
    case 'delete':
      return d.email ? String(d.email) : '';
    default:
      return '';
  }
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ currentUser, showToast }) => {
  const t = useT();
  const [view, setView] = useState<'users' | 'audit' | 'changelog' | 'bugs'>('users');
  const [bugCount, setBugCount] = useState(0);
  useEffect(() => {
    bugReportsApi.list('new').then((d) => setBugCount(d.newCount)).catch(() => {});
  }, []);
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
    const timer = setTimeout(() => loadUsers(query), query ? 300 : 0);
    return () => clearTimeout(timer);
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
        { label: t('Użytkownicy'), value: fmtNum(stats.users), icon: Users, color: 'text-amber-400' },
        { label: t('Nowi (7 dni)'), value: fmtNum(stats.newUsers7d), icon: UserPlus, color: 'text-emerald-400' },
        { label: t('Aktywni (7 dni)'), value: fmtNum(stats.activeUsers7d), icon: Activity, color: 'text-amber-400' },
        { label: t('Zablokowani'), value: fmtNum(stats.bannedUsers), icon: Ban, color: 'text-rose-400' },
        { label: t('Karty w kolekcjach'), value: fmtNum(stats.totalCards), icon: Layers, color: 'text-amber-300' },
        { label: t('Karty na sprzedaż'), value: fmtNum(stats.forSaleCards), icon: CircleDollarSign, color: 'text-emerald-400' }
      ]
    : [];

  return (
    <div className="space-y-5">
      {/* Nagłówek i statystyki */}
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="min-w-0">
              <h2 className="text-2xl font-semibold tracking-tight text-stone-50">{t('Panel administratora')}</h2>
              <p className="text-xs text-stone-400 truncate">{t('Zalogowano jako {name} · wszystkie działania trafiają do dziennika', { name: currentUser?.username })}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={refreshAll}
            aria-label={t('Odśwież')}
            title={t('Odśwież')}
            className="w-10 h-10 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 flex items-center justify-center shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-px rounded-xl overflow-hidden border border-stone-800 bg-stone-800">
          {statTiles.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-stone-900 p-3.5">
              <p className="text-sm text-stone-400 flex items-center gap-1.5">
                {label}
              </p>
              <p className="text-xl font-semibold text-stone-50 mt-0.5 tabular-nums">{value}</p>
            </div>
          ))}
          {!stats && <p className="col-span-full text-xs text-stone-500">{t('Ładowanie statystyk...')}</p>}
        </div>

        {stats && (
          <p className="text-xs text-stone-400 flex items-start gap-1.5">
            <Database className={`w-3.5 h-3.5 shrink-0 mt-px ${stats.cardDb.ready ? 'text-emerald-400' : 'text-amber-400'}`} />
            <span>
              {t('Baza kart Scryfall:')}{' '}
              {stats.cardDb.ready ? (
                <>
                  <strong className="text-stone-200">{fmtNum(stats.cardDb.cards)}</strong> {t('wydań, ostatnia synchronizacja')}{' '}
                  {fmtDate(stats.cardDb.lastSyncAt, true)}
                </>
              ) : (
                <strong className="text-amber-300">{t('niedostępna')}</strong>
              )}
              {stats.cardDb.syncing && t(' · trwa synchronizacja')}
              {stats.cardDb.lastSyncError && <span className="text-rose-300"> · {t('błąd:')} {stats.cardDb.lastSyncError}</span>}
            </span>
          </p>
        )}
      </div>

      {/* Przełącznik widoku */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'users' as const, label: t('Użytkownicy'), icon: Users },
          { id: 'audit' as const, label: t('Dziennik działań'), icon: ScrollText },
          { id: 'bugs' as const, label: bugCount ? `${t('Zgłoszenia')} (${bugCount})` : t('Zgłoszenia'), icon: Bug },
          { id: 'changelog' as const, label: t('Dziennik zmian'), icon: Newspaper }
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            className={`h-9 px-3 rounded-lg text-sm font-medium flex items-center gap-2 border cursor-pointer ${
              view === id ? 'bg-stone-800 border-stone-700 text-stone-50' : 'bg-transparent border-transparent text-stone-400 hover:text-stone-200 hover:bg-stone-900'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3">{error}</p>}

      {view === 'bugs' ? (
        <AdminBugReports showToast={showToast} onCountChange={setBugCount} />
      ) : view === 'changelog' ? (
        <AdminChangelog showToast={showToast} />
      ) : view === 'users' ? (
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('Szukaj po nazwie lub e-mailu...')}
              aria-label={t('Szukaj użytkownika')}
              className="w-full bg-stone-900 border border-stone-800 focus:border-rose-500 rounded-xl pl-10 pr-3 py-3 text-sm text-stone-100 placeholder-stone-500 focus:outline-none"
            />
          </div>
          <p className="text-xs text-stone-500">
            {loading && users.length === 0 ? t('Ładowanie...') : t('Znaleziono: {n}', { n: fmtNum(total) })}
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
                    className={`w-10 h-10 rounded-lg flex items-center justify-center font-semibold shrink-0 ${
                      u.banned ? 'bg-rose-950 text-rose-300' : 'bg-stone-800 text-stone-200'
                    }`}
                  >
                    {u.username.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-bold text-stone-100 truncate max-w-[60vw] sm:max-w-none">{u.username}</span>
                      {u.isAdmin && <Badge tone="rose">{t('Admin')}</Badge>}
                      {u.banned && <Badge tone="red">{u.banPermanent ? t('Ban stały') : t('Ban czasowy')}</Badge>}
                      {u.saleHidden && <Badge tone="amber">{t('Oferta ukryta')}</Badge>}
                      {u.mustChangePassword && <Badge tone="stone">{t('Hasło tymczasowe')}</Badge>}
                      {!u.emailVerified && <Badge tone="amber">{t('E-mail niepotwierdzony')}</Badge>}
                    </div>
                    <p className="text-xs text-stone-400 truncate">{u.email}</p>
                    <p className="text-[11px] text-stone-500 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>{t('Rejestracja:')} {fmtDate(u.createdAt)}</span>
                      <span>{t('Aktywność:')} {fmtDate(u.lastActiveAt)}</span>
                      <span>{t('Karty:')} {fmtNum(u.totalCards)}</span>
                      <span>{t('Sprzedaż:')} {fmtNum(u.forSaleCards)}</span>
                      <span>{t('Lista życzeń:')} {fmtNum(u.wishlistCount)}</span>
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
              {loading ? t('Ładowanie...') : t('Pokaż więcej ({v1})', { v1: fmtNum(total - users.length) })}
            </button>
          )}
        </div>
      ) : (
        <div className="bg-stone-900 border border-stone-800 rounded-2xl divide-y divide-stone-800">
          {audit === null ? (
            <p className="p-4 text-sm text-stone-400">{t('Ładowanie...')}</p>
          ) : audit.length === 0 ? (
            <p className="p-4 text-sm text-stone-400">{t('Brak wpisów. Tu pojawią się działania administratorów.')}</p>
          ) : (
            audit.map((e) => (
              <div key={e.id} className="p-3 sm:p-4 text-sm flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                <span className="text-xs text-stone-500 sm:w-40 shrink-0">{fmtDate(e.createdAt, true)}</span>
                <span className="flex-1 min-w-0">
                  <strong className="text-stone-100">{ACTION_LABELS[e.action] ? t(ACTION_LABELS[e.action]) : e.action}</strong>
                  {e.targetUsername && <span className="text-stone-300"> · {e.targetUsername}</span>}
                  {auditDetails(e) && <span className="text-stone-400"> · {auditDetails(e)}</span>}
                </span>
                <span className="text-xs text-stone-500 shrink-0">{t('przez')} {e.adminUsername || '—'}</span>
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
  return <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded border ${cls}`}>{children}</span>;
};

const Section: React.FC<{ title: string; icon: React.ElementType; danger?: boolean; children: React.ReactNode }> = ({ title, icon: Icon, danger, children }) => (
  <section className={`rounded-xl border p-3.5 space-y-2.5 ${danger ? 'border-rose-900/60 bg-rose-950/20' : 'border-stone-800 bg-stone-950/60'}`}>
    <h4 className={`text-xs font-bold flex items-center gap-1.5 ${danger ? 'text-rose-300' : 'text-stone-300'}`}>
      <Icon className="w-4 h-4" />
      {title}
    </h4>
    {children}
  </section>
);

const BAN_PRESETS = [
  { label: tk('1 dzień'), days: 1 },
  { label: tk('7 dni'), days: 7 },
  { label: tk('30 dni'), days: 30 }
];

interface UserDialogProps {
  user: AdminUser;
  isSelf: boolean;
  onClose: () => void;
  onChanged: (message: string | null, closeDialog?: boolean) => Promise<void>;
}

const UserDialog: React.FC<UserDialogProps> = ({ user, isSelf, onClose, onChanged }) => {
  const t = useT();
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
      aria-label={t('Zarządzanie kontem {username}', { username: user.username })}
    >
      <div className="w-full sm:max-w-xl max-h-[92dvh] overflow-y-auto bg-stone-900 border border-stone-800 rounded-t-3xl sm:rounded-2xl shadow-2xl pb-[env(safe-area-inset-bottom)] max-sm:animate-[slideUp_.2s_ease-out]">
        <div className="sticky top-0 z-10 bg-stone-900 border-b border-stone-800 px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-stone-100 truncate">{user.username}</h3>
            <p className="text-xs text-stone-400 truncate">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('Zamknij')}
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
              {t('To konto administratora: blokada, reset hasła, ukrycie oferty i usunięcie są niedostępne.')}
            </p>
          )}

          <div className="text-xs text-stone-400 grid grid-cols-2 gap-x-3 gap-y-1">
            <span>{t('Rejestracja:')} <strong className="text-stone-200">{fmtDate(user.createdAt)}</strong></span>
            <span>{t('Aktywność:')} <strong className="text-stone-200">{fmtDate(user.lastActiveAt, true)}</strong></span>
            <span>{t('Karty:')} <strong className="text-stone-200">{fmtNum(user.totalCards)}</strong></span>
            <span>{t('Na sprzedaż:')} <strong className="text-stone-200">{fmtNum(user.forSaleCards)}</strong></span>
            <span>{t('Lista życzeń:')} <strong className="text-stone-200">{fmtNum(user.wishlistCount)}</strong></span>
            <span>{t('Miejscowość:')} <strong className="text-stone-200">{user.city || '—'}</strong></span>
          </div>

          {/* Blokada */}
          <Section title={t('Blokada konta')} icon={Ban}>
            {user.banned ? (
              <div className="space-y-2.5">
                <p className="text-sm text-red-200">
                  {banLabel(user)}
                  {user.banReason && <span className="block text-xs text-stone-400 mt-0.5">{t('Powód:')} {user.banReason}</span>}
                </p>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => run('unban', async () => { await adminApi.unban(user.id); return t('Zdjęto blokadę z konta {name}.', { name: user.username }); })}
                  className={`${btn} bg-emerald-600 hover:bg-emerald-500 text-white`}
                >
                  {spin('unban')}{t('Zdejmij blokadę')}
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
                      {t(p.label)}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setBanMode('custom')}
                    className={`h-9 px-3 rounded-lg text-xs font-semibold border cursor-pointer ${banMode === 'custom' ? 'bg-rose-500/20 border-rose-500/50 text-rose-100' : 'bg-stone-900 border-stone-700 text-stone-300'}`}
                  >
                    {t('Do daty')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBanMode('permanent')}
                    className={`h-9 px-3 rounded-lg text-xs font-semibold border cursor-pointer ${banMode === 'permanent' ? 'bg-red-600/30 border-red-500/60 text-red-100' : 'bg-stone-900 border-stone-700 text-stone-300'}`}
                  >
                    {t('Na stałe')}
                  </button>
                </div>
                {banMode === 'custom' && (
                  <input
                    type="datetime-local"
                    value={banUntil}
                    onChange={(e) => setBanUntil(e.target.value)}
                    aria-label={t('Blokada do')}
                    className={input}
                  />
                )}
                <input
                  type="text"
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  maxLength={500}
                  placeholder={t('Powód (zobaczy go użytkownik przy logowaniu)')}
                  aria-label={t('Powód blokady')}
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
                      return t('Zablokowano konto {name}.', { name: user.username });
                    })
                  }
                  className={`${btn} bg-rose-600 hover:bg-rose-500 text-white`}
                >
                  {spin('ban')}{t('Zablokuj')}
                </button>
                <p className="text-[11px] text-stone-500">{t('Blokada od razu wylogowuje użytkownika i ukrywa jego ofertę, listę życzeń i miejsce na mapie.')}</p>
              </div>
            )}
          </Section>

          {/* Nazwa */}
          <Section title={t('Nazwa użytkownika')} icon={Pencil}>
            <div className="flex gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={32}
                aria-label={t('Nowa nazwa')}
                className={input}
              />
              <button
                type="button"
                disabled={!!busy || newName.trim() === user.username || newName.trim().length < 2}
                onClick={() => run('rename', async () => { await adminApi.rename(user.id, newName.trim()); return t('Zmieniono nazwę na {name}.', { name: newName.trim() }); })}
                className={`${btn} bg-stone-700 hover:bg-stone-600 text-stone-100 shrink-0`}
              >
                {spin('rename')}{t('Zapisz')}
              </button>
            </div>
            <p className="text-[11px] text-stone-500">{t('Publiczne linki ze starą nazwą (oferta, lista życzeń) przestaną działać.')}</p>
          </Section>

          {/* Hasło */}
          <Section title={t('Reset hasła')} icon={KeyRound}>
            {tempPassword ? (
              <div className="space-y-2">
                <p className="text-xs text-stone-300">{t('Hasło tymczasowe. Przekaż je użytkownikowi.')} <strong>{t('Pokazujemy je tylko raz.')}</strong></p>
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
                    {copied ? t('Skopiowano') : t('Kopiuj')}
                  </button>
                </div>
                <p className="text-[11px] text-stone-500">{t('Po zalogowaniu użytkownik musi ustawić własne hasło.')}</p>
              </div>
            ) : confirmReset ? (
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs text-stone-300">{t('Na pewno? Obecne hasło przestanie działać, a użytkownik zostanie wylogowany.')}</span>
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
                  {spin('reset')}{t('Tak, resetuj')}
                </button>
                <button type="button" onClick={() => setConfirmReset(false)} className={`${btn} text-stone-300 hover:bg-stone-800`}>
                  {t('Anuluj')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={!!busy || protectedAccount}
                onClick={() => setConfirmReset(true)}
                className={`${btn} bg-stone-700 hover:bg-stone-600 text-stone-100`}
              >
                {t('Wygeneruj hasło tymczasowe')}
              </button>
            )}
          </Section>

          {/* Sesje i oferta */}
          <Section title={t('Sesje i oferta')} icon={LogOut}>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!!busy}
                onClick={() =>
                  run('logout', async () => {
                    const r = await adminApi.logoutAll(user.id);
                    return t('Wylogowano {name} z {n} sesji.', { name: user.username, n: r.revoked ?? 0 });
                  })
                }
                className={`${btn} bg-stone-700 hover:bg-stone-600 text-stone-100`}
              >
                {spin('logout')}
                <LogOut className="w-4 h-4" />
                {t('Wyloguj ze wszystkich urządzeń')}
              </button>
              <button
                type="button"
                disabled={!!busy || protectedAccount}
                onClick={() =>
                  run('sale', async () => {
                    await adminApi.setSaleHidden(user.id, !user.saleHidden);
                    return user.saleHidden ? t('Oferta znów jest widoczna.') : t('Ukryto ofertę sprzedaży.');
                  })
                }
                className={`${btn} ${user.saleHidden ? 'bg-emerald-700 hover:bg-emerald-600' : 'bg-amber-500 hover:bg-amber-400'} text-stone-950`}
              >
                {spin('sale')}
                {user.saleHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                {user.saleHidden ? t('Pokaż ofertę') : t('Ukryj ofertę sprzedaży')}
              </button>
            </div>
            {user.saleHidden && <p className="text-[11px] text-amber-300/90">{t('Oferta jest ukryta: nie ma jej w publicznym linku, na mapie ani na liście graczy.')}</p>}
          </Section>

          {!user.emailVerified && (
            <Section title={t('Adres e-mail')} icon={Check}>
              <p className="text-xs text-stone-300">{t('Użytkownik nie kliknął jeszcze linku z maila i nie może się zalogować.')}</p>
              <button
                type="button"
                disabled={!!busy}
                onClick={() =>
                  run('verify', async () => {
                    await adminApi.verifyEmail(user.id);
                    return t('Potwierdzono adres e-mail {name}.', { name: user.username });
                  })
                }
                className={`${btn} bg-stone-700 hover:bg-stone-600 text-stone-100`}
              >
                {spin('verify')}
                <Check className="w-4 h-4" />
                {t('Potwierdź e-mail ręcznie')}
              </button>
            </Section>
          )}

          {/* Usunięcie */}
          {!protectedAccount && !isSelf && (
            <Section title={t('Usuń konto')} icon={Trash2} danger>
              <p className="text-xs text-stone-300">
                {t('Usuwa konto i wszystkie dane: kolekcję, talie, listę życzeń i wiadomości. Tego nie da się cofnąć. Wpisz')}{' '}
                <strong className="text-rose-200 select-all">{user.username}</strong>{t(', aby potwierdzić.')}
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={confirmDelete}
                  onChange={(e) => setConfirmDelete(e.target.value)}
                  placeholder={user.username}
                  aria-label={t('Potwierdź nazwę')}
                  className={input}
                />
                <button
                  type="button"
                  disabled={!!busy || confirmDelete !== user.username}
                  onClick={() =>
                    run('delete', async () => {
                      await adminApi.remove(user.id, confirmDelete);
                      return t('Usunięto konto {name}.', { name: user.username });
                    }, true)
                  }
                  className={`${btn} bg-red-700 hover:bg-red-600 text-white shrink-0`}
                >
                  {spin('delete')}{t('Usuń')}
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
