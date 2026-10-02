import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { UserMessage, RegisteredUserSummary, AuthUser } from '../../types';
import { messagesApi } from '../../services/api';
import { useBackToClose } from '../../hooks/useBackButton';
import { 
  Inbox, 
  Send, 
  Trash2, 
  CheckCheck, 
  X, 
  RefreshCw, 
  Search, 
  Mail, 
  MailOpen, 
  Reply, 
  ArrowLeft, 
  Clock, 
  User, 
  AlertCircle,
  Plus
} from 'lucide-react';

interface MailboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: AuthUser | null;
  availableUsers?: RegisteredUserSummary[];
  onUnreadCountChange?: (count: number) => void;
  showToast?: (message: string) => void;
}

export const MailboxModal: React.FC<MailboxModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  availableUsers = [],
  onUnreadCountChange,
  showToast,
}) => {
  // „Wstecz” na telefonie zamyka to okno zamiast opuszczać stronę
  useBackToClose(isOpen, onClose);

  const [activeTab, setActiveTab] = useState<'inbox' | 'sent' | 'compose'>('inbox');
  const [inbox, setInbox] = useState<UserMessage[]>([]);
  const [sent, setSent] = useState<UserMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedMessage, setSelectedMessage] = useState<UserMessage | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Compose form states
  const [composeRecipient, setComposeRecipient] = useState<string>('');
  const [composeSubject, setComposeSubject] = useState<string>('');
  const [composeBody, setComposeBody] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [composeError, setComposeError] = useState<string | null>(null);

  // Load inbox & sent
  const loadMessages = useCallback(async () => {
    setIsLoading(true);
    try {
      const [inboxData, sentData] = await Promise.all([
        messagesApi.getInbox(),
        messagesApi.getSent(),
      ]);
      setInbox(inboxData);
      setSent(sentData);

      const unread = inboxData.filter((m) => !m.isRead).length;
      onUnreadCountChange?.(unread);
    } catch (err) {
      console.error('Error loading messages:', err);
    } finally {
      setIsLoading(false);
    }
  }, [onUnreadCountChange]);

  useEffect(() => {
    if (isOpen) {
      loadMessages();
      setSelectedMessage(null);
      setSearchQuery('');
    }
  }, [isOpen, loadMessages]);

  const unreadCount = useMemo(() => {
    return inbox.filter((m) => !m.isRead).length;
  }, [inbox]);

  // Handle viewing message and marking as read
  const handleSelectMessage = async (msg: UserMessage, fromInbox: boolean) => {
    setSelectedMessage(msg);
    if (fromInbox && !msg.isRead) {
      try {
        await messagesApi.markAsRead(msg.id);
        setInbox((prev) =>
          prev.map((m) => (m.id === msg.id ? { ...m, isRead: true } : m))
        );
        const newUnread = Math.max(0, unreadCount - 1);
        onUnreadCountChange?.(newUnread);
      } catch (err) {
        console.error('Error marking as read:', err);
      }
    }
  };

  // Handle Mark all as read
  const handleMarkAllAsRead = async () => {
    try {
      await messagesApi.markAllAsRead();
      setInbox((prev) => prev.map((m) => ({ ...m, isRead: true })));
      onUnreadCountChange?.(0);
      showToast?.('Oznaczono wszystkie wiadomości jako przeczytane.');
    } catch (err) {
      console.error('Error marking all as read:', err);
    }
  };

  // Handle Delete message
  const handleDeleteMessage = async (msgId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await messagesApi.deleteMessage(msgId);
      setInbox((prev) => prev.filter((m) => m.id !== msgId));
      setSent((prev) => prev.filter((m) => m.id !== msgId));
      if (selectedMessage?.id === msgId) {
        setSelectedMessage(null);
      }
      showToast?.('Wiadomość została usunięta.');
    } catch (err) {
      console.error('Error deleting message:', err);
    }
  };

  // Handle Reply
  const handleReply = (msg: UserMessage) => {
    const isIncoming = msg.recipientUsername === currentUser?.username;
    const targetUser = isIncoming ? msg.senderUsername : msg.recipientUsername;
    const reSubject = msg.subject.startsWith('Re:') ? msg.subject : `Re: ${msg.subject}`;

    setComposeRecipient(targetUser);
    setComposeSubject(reSubject);
    setComposeBody(`\n\n--- Wiadomość oryginalna od @${msg.senderUsername} (${new Date(msg.createdAt).toLocaleString('pl-PL')}) ---\n> ${msg.body}`);
    setSelectedMessage(null);
    setActiveTab('compose');
  };

  // Handle Send Compose
  const handleSendCompose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!composeRecipient.trim()) {
      setComposeError('Wskaż odbiorcę wiadomości.');
      return;
    }
    if (!composeSubject.trim()) {
      setComposeError('Podaj temat wiadomości.');
      return;
    }
    if (!composeBody.trim()) {
      setComposeError('Wpisz treść wiadomości.');
      return;
    }

    setIsSending(true);
    setComposeError(null);

    try {
      const created = await messagesApi.sendMessage({
        recipientUsername: composeRecipient.trim(),
        subject: composeSubject.trim(),
        body: composeBody.trim(),
      });

      setSent((prev) => [created, ...prev]);
      showToast?.(`Wysłano wiadomość do @${composeRecipient.trim()}!`);
      setComposeRecipient('');
      setComposeSubject('');
      setComposeBody('');
      setActiveTab('sent');
      setSelectedMessage(created);
    } catch (err: any) {
      console.error('Error sending message:', err);
      setComposeError(err.message || 'Nie udało się wysłać wiadomości.');
    } finally {
      setIsSending(false);
    }
  };

  const filteredInbox = useMemo(() => {
    return inbox.filter((m) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        m.subject.toLowerCase().includes(q) ||
        m.senderUsername.toLowerCase().includes(q) ||
        m.body.toLowerCase().includes(q)
      );
    });
  }, [inbox, searchQuery]);

  const filteredSent = useMemo(() => {
    return sent.filter((m) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        m.subject.toLowerCase().includes(q) ||
        m.recipientUsername.toLowerCase().includes(q) ||
        m.body.toLowerCase().includes(q)
      );
    });
  }, [sent, searchQuery]);

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      const now = new Date();
      if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
      }
      return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
    } catch {
      return '';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-4xl h-[620px] max-h-[92vh] bg-stone-900 border border-stone-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none max-sm:rounded-t-3xl max-sm:max-h-[92dvh] max-sm:pb-[env(safe-area-inset-bottom)] max-sm:animate-[slideUp_.2s_ease-out] max-sm:mt-auto max-sm:mb-0 max-sm:h-[92dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800 bg-stone-950/70">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-white">Skrzynka Wiadomości</h3>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500 text-white font-mono shadow-sm">
                    {unreadCount} nowych
                  </span>
                )}
              </div>
              <p className="text-xs text-stone-400">Wewnętrzna komunikacja z innymi graczami</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadMessages}
              disabled={isLoading}
              className="p-2 text-stone-400 hover:text-stone-100 hover:bg-stone-800 rounded-xl transition-colors cursor-pointer"
              title="Odśwież skrzynkę"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-blue-400' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-stone-400 hover:text-stone-100 hover:bg-stone-800 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="flex items-center justify-between px-3 sm:px-6 py-2.5 border-b border-stone-800 bg-stone-950/40 gap-2 sm:gap-4 flex-wrap">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveTab('inbox');
                setSelectedMessage(null);
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'inbox'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-950/50'
                  : 'bg-stone-900 text-stone-400 hover:text-stone-200 border border-stone-800'
              }`}
            >
              <Inbox className="w-3.5 h-3.5" />
              <span>Odebrane</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-white text-blue-900 font-mono">
                  {unreadCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('sent');
                setSelectedMessage(null);
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'sent'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-950/50'
                  : 'bg-stone-900 text-stone-400 hover:text-stone-200 border border-stone-800'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>Wysłane</span>
              <span className="text-[10px] font-mono text-stone-400">({sent.length})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('compose');
                setSelectedMessage(null);
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'compose'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-950/50'
                  : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30'
              }`}
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Napisz wiadomość</span>
            </button>
          </div>

          {activeTab === 'inbox' && unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllAsRead}
              className="text-[11px] text-stone-400 hover:text-blue-300 transition-colors flex items-center gap-1 cursor-pointer font-medium"
            >
              <CheckCheck className="w-3.5 h-3.5 text-blue-400" />
              <span>Oznacz wszystkie jako przeczytane</span>
            </button>
          )}
        </div>

        {/* Main Body */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* TAB 1 & 2: INBOX & SENT (Split or List) */}
          {(activeTab === 'inbox' || activeTab === 'sent') && (
            <div className="flex-1 flex overflow-hidden">
              {/* Message Details Pane (if selected) */}
              {selectedMessage ? (
                <div className="flex-1 flex flex-col overflow-hidden bg-stone-950/40">
                  {/* Top bar */}
                  <div className="flex items-center justify-between px-6 py-3 border-b border-stone-800 bg-stone-900/60">
                    <button
                      type="button"
                      onClick={() => setSelectedMessage(null)}
                      className="px-3 py-1.5 text-xs font-bold text-stone-300 hover:text-white bg-stone-850 hover:bg-stone-800 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Powrót do listy</span>
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleReply(selectedMessage)}
                        className="px-3.5 py-1.5 text-xs font-bold text-blue-300 hover:text-blue-200 bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <Reply className="w-3.5 h-3.5" />
                        <span>Odpowiedz</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteMessage(selectedMessage.id)}
                        className="p-1.5 text-stone-400 hover:text-rose-400 hover:bg-stone-800 rounded-xl transition-colors cursor-pointer"
                        title="Usuń wiadomość"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Header info */}
                  <div className="p-6 border-b border-stone-800/80 bg-stone-900/40 space-y-2">
                    <h2 className="text-lg font-black text-white">{selectedMessage.subject}</h2>
                    <div className="flex items-center justify-between text-xs text-stone-400 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span>Od: <strong className="text-blue-300 font-mono">@{selectedMessage.senderUsername}</strong></span>
                        <span>→</span>
                        <span>Do: <strong className="text-stone-200 font-mono">@{selectedMessage.recipientUsername}</strong></span>
                      </div>
                      <span className="flex items-center gap-1 text-[11px] text-stone-500">
                        <Clock className="w-3 h-3" />
                        <span>{new Date(selectedMessage.createdAt).toLocaleString('pl-PL')}</span>
                      </span>
                    </div>
                  </div>

                  {/* Content body */}
                  <div className="flex-1 p-6 overflow-y-auto whitespace-pre-wrap font-sans text-sm text-stone-200 leading-relaxed">
                    {selectedMessage.body}
                  </div>
                </div>
              ) : (
                /* List of messages */
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Search inside messages */}
                  <div className="p-3 border-b border-stone-800 bg-stone-950/20">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-500" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={`Szukaj w ${activeTab === 'inbox' ? 'odebranych' : 'wysłanych'}...`}
                        className="w-full bg-stone-950 border border-stone-800 focus:border-blue-500 rounded-xl pl-8 pr-3 py-1.5 text-xs text-stone-100 placeholder-stone-500 focus:outline-none transition-colors"
                      />
                    </div>
                  </div>

                  {/* Messages list */}
                  <div className="flex-1 overflow-y-auto divide-y divide-stone-800/60">
                    {isLoading ? (
                      <div className="flex flex-col items-center justify-center py-20 space-y-3">
                        <div className="w-8 h-8 rounded-full border-3 border-blue-500/20 border-t-blue-500 animate-spin" />
                        <p className="text-xs text-stone-400">Ładowanie wiadomości...</p>
                      </div>
                    ) : (activeTab === 'inbox' ? filteredInbox : filteredSent).length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 space-y-3 text-center px-4">
                        <div className="w-12 h-12 rounded-2xl bg-stone-800/60 text-stone-500 flex items-center justify-center">
                          {activeTab === 'inbox' ? <MailOpen className="w-6 h-6" /> : <Send className="w-6 h-6" />}
                        </div>
                        <p className="text-sm font-bold text-stone-300">
                          {activeTab === 'inbox'
                            ? searchQuery
                              ? 'Brak wiadomości spełniających kryteria.'
                              : 'Twoja skrzynka odbiorcza jest pusta.'
                            : searchQuery
                            ? 'Brak wysłanych wiadomości spełniających kryteria.'
                            : 'Nie wysłałeś jeszcze żadnych wiadomości.'}
                        </p>
                      </div>
                    ) : (
                      (activeTab === 'inbox' ? filteredInbox : filteredSent).map((msg) => {
                        const isInboxItem = activeTab === 'inbox';
                        const isUnread = isInboxItem && !msg.isRead;

                        return (
                          <div
                            key={msg.id}
                            onClick={() => handleSelectMessage(msg, isInboxItem)}
                            className={`group px-6 py-3.5 hover:bg-stone-850/60 transition-colors cursor-pointer flex items-center justify-between gap-4 ${
                              isUnread ? 'bg-blue-950/20' : ''
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              {/* Indicator icon */}
                              <div className="shrink-0">
                                {isUnread ? (
                                  <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-sm shadow-blue-500/80 animate-pulse" />
                                ) : (
                                  <div className="w-2.5 h-2.5 rounded-full bg-stone-700 opacity-40" />
                                )}
                              </div>

                              <div className="min-w-0 flex-1 space-y-0.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span className={`text-xs font-mono truncate ${
                                    isUnread ? 'text-blue-300 font-extrabold' : 'text-stone-300 font-semibold'
                                  }`}>
                                    {isInboxItem ? `@${msg.senderUsername}` : `Do: @${msg.recipientUsername}`}
                                  </span>
                                  <span className="text-[10px] text-stone-500 shrink-0 font-mono">
                                    {formatDate(msg.createdAt)}
                                  </span>
                                </div>

                                <h4 className={`text-xs truncate ${
                                  isUnread ? 'text-white font-black' : 'text-stone-300 font-medium'
                                }`}>
                                  {msg.subject}
                                </h4>

                                <p className="text-[11px] text-stone-500 truncate line-clamp-1">
                                  {msg.body.replace(/\n/g, ' ')}
                                </p>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => handleDeleteMessage(msg.id, e)}
                              className="p-1.5 text-stone-500 hover:text-rose-400 rounded-lg hover:bg-stone-800 transition-colors opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 cursor-pointer shrink-0"
                              title="Usuń"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: COMPOSE NEW MESSAGE */}
          {activeTab === 'compose' && (
            <form onSubmit={handleSendCompose} className="flex-1 flex flex-col p-6 space-y-4 overflow-y-auto">
              {composeError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{composeError}</span>
                </div>
              )}

              {/* Recipient */}
              <div>
                <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-blue-400" />
                  <span>Odbiorca wiadomości</span>
                </label>
                {availableUsers.length > 0 ? (
                  <select
                    value={composeRecipient}
                    onChange={(e) => setComposeRecipient(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-800 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-sm text-stone-100 focus:outline-none cursor-pointer"
                  >
                    <option value="">-- Wybierz gracza z listy --</option>
                    {availableUsers
                      .filter((u) => u.id !== currentUser?.id)
                      .map((u) => (
                        <option key={u.id} value={u.username}>
                          @{u.username} ({u.forSaleCount} kart na sprzedaż)
                        </option>
                      ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={composeRecipient}
                    onChange={(e) => setComposeRecipient(e.target.value)}
                    placeholder="Wpisz nazwę gracza (np. DejvidLP)..."
                    className="w-full bg-stone-950 border border-stone-800 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-sm text-stone-100 placeholder-stone-500 focus:outline-none"
                  />
                )}
              </div>

              {/* Subject */}
              <div>
                <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-1.5">
                  Temat
                </label>
                <input
                  type="text"
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  placeholder="np. Zapytanie o kartę na sprzedaż, propozycja wymiany..."
                  maxLength={150}
                  className="w-full bg-stone-950 border border-stone-800 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-sm text-stone-100 placeholder-stone-500 focus:outline-none transition-colors"
                />
              </div>

              {/* Body */}
              <div className="flex-1 flex flex-col min-h-[160px]">
                <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-1.5">
                  Treść wiadomości
                </label>
                <textarea
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  rows={7}
                  placeholder="Napisz swoją wiadomość..."
                  className="w-full flex-1 bg-stone-950 border border-stone-800 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-sm text-stone-100 placeholder-stone-500 focus:outline-none transition-colors resize-none"
                />
              </div>

              {/* Bottom Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('inbox');
                    setComposeError(null);
                  }}
                  className="px-4 py-2 text-xs font-bold text-stone-400 hover:text-stone-200 hover:bg-stone-800 rounded-xl transition-colors cursor-pointer"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  disabled={isSending || !composeRecipient.trim() || !composeSubject.trim() || !composeBody.trim()}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white font-extrabold text-xs shadow-lg shadow-blue-950/60 transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Send className="w-4 h-4 stroke-[2.2]" />
                  <span>{isSending ? 'Wysyłanie...' : 'Wyślij wiadomość'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
