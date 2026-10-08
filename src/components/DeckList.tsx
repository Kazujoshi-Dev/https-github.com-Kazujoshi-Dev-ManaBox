import { PageHeader } from './ui/PageHeader';
import { computeDeckValue } from './deck-builder/useDeckStats';
import React, { useEffect, useMemo, useState } from 'react';
import { DeckItem, AppSettings } from '../types';
import { formatCurrency } from '../utils/formatters';
import { exportDeckToTxt, downloadTxtFile } from '../utils/textCardList';
import { DECK_FORMATS, computeWildcardCost, getDeckFormat, type DeckFormat } from '../utils/mtgFormats';
import { WildcardCost } from './deck-builder/WildcardCost';
import { Swords, Plus, Crown, Trash2, Download, Copy, Check, Upload, FileText, Pencil, FolderInput, Loader2 } from 'lucide-react';
import { useT, MAIN_BINDER, binderName } from '../i18n';

interface DeckListProps {
  decks: DeckItem[];
  settings: AppSettings;
  onSelectDeck: (deck: DeckItem) => void;
  onCreateDeckClick: () => void;
  onDeleteDeck: (deckId: string) => void;
  onEditDeck?: (deck: DeckItem) => void;
  onOpenImportDeck?: () => void;
  showToast?: (message: string) => void;
  /** Dodaje wszystkie karty talii (te same wydania i foil) do domyślnego klasera. */
  onCopyToCollection?: (deck: DeckItem) => Promise<boolean>;
  defaultBinder?: string;
}

export const DeckList: React.FC<DeckListProps> = ({
  decks,
  settings,
  onSelectDeck,
  onCreateDeckClick,
  onDeleteDeck,
  onEditDeck,
  onOpenImportDeck,
  showToast,
  onCopyToCollection,
  defaultBinder = MAIN_BINDER,
}) => {
  const t = useT();
  const [copiedDeckId, setCopiedDeckId] = useState<string | null>(null);
  const [confirmCopyId, setConfirmCopyId] = useState<string | null>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  // Podzakładki formatów: pojawiają się, gdy w danym formacie jest choć jedna talia
  const [formatTab, setFormatTab] = useState<string>('all');

  const formatTabs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of decks) {
      const id = getDeckFormat(d.format).id;
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    return DECK_FORMATS.filter((f) => counts.has(f.id)).map((f) => ({ format: f, count: counts.get(f.id)! }));
  }, [decks]);

  // Ostatnia talia formatu usunięta lub przeniesiona: wracamy do „Wszystkie”
  useEffect(() => {
    if (formatTab !== 'all' && !formatTabs.some((ft) => ft.format.id === formatTab)) setFormatTab('all');
  }, [formatTab, formatTabs]);

  const visibleDecks = formatTab === 'all' ? decks : decks.filter((d) => getDeckFormat(d.format).id === formatTab);
  const tabLabel = (f: DeckFormat) => (f.id === 'commander' ? 'Commander' : f.platform === 'arena' ? `${f.name} (MTGA)` : f.name);

  const handleExportDeckFile = (e: React.MouseEvent, deck: DeckItem) => {
    e.stopPropagation();
    const content = exportDeckToTxt(deck);
    const safeName = (deck.name || 'talia-edh')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const filename = `${safeName}-${new Date().toISOString().slice(0, 10)}.txt`;
    downloadTxtFile(filename, content);
    showToast?.(t('Pobrano plik: {name}', { name: filename }));
  };

  const handleCopyDeckList = (e: React.MouseEvent, deck: DeckItem) => {
    e.stopPropagation();
    const content = exportDeckToTxt(deck);
    navigator.clipboard.writeText(content);
    setCopiedDeckId(deck.id);
    showToast?.(t('Skopiowano listę talii „{name}” w formacie .txt!', { name: deck.name }));
    setTimeout(() => setCopiedDeckId(null), 2500);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Talie')}
        description={t('Talie papierowe i MTG Arena w różnych formatach. Import i eksport w formacie list Moxfield i Archidekt.')}
        actions={
          <>
            {onOpenImportDeck && (
              <button type="button" onClick={onOpenImportDeck} className="btn btn-secondary" title={t('Importuj talię z pliku .txt')}>
                <Upload className="w-4 h-4" />
                {t('Importuj')}
              </button>
            )}
            <button type="button" onClick={onCreateDeckClick} className="btn btn-primary">
              <Plus className="w-4 h-4" strokeWidth={2.5} />
              {t('Nowa talia')}
            </button>
          </>
        }
      />

      {/* Decks Grid */}
      {decks.length === 0 ? (
        <div className="bg-stone-900/60 border border-dashed border-stone-800 rounded-2xl p-12 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-950/50 border border-amber-800/40 text-amber-400 mx-auto flex items-center justify-center">
            <Swords className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">{t('Nie masz jeszcze żadnych talii')}</h3>
            <p className="text-xs text-stone-400 max-w-sm mx-auto mt-1">
              {t('Utwórz swoją pierwszą talię EDH Commander lub zaimportuj gotową listę z pliku .txt (Moxfield, Archidekt).')}
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button
              onClick={onCreateDeckClick}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold rounded-xl shadow-md cursor-pointer transition-all inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>{t('Utwórz nową talię')}</span>
            </button>

            {onOpenImportDeck && (
              <button
                onClick={onOpenImportDeck}
                className="px-4 py-2 bg-stone-800 hover:bg-stone-750 text-amber-300 border border-amber-500/40 text-xs font-bold rounded-xl shadow-md cursor-pointer transition-all inline-flex items-center gap-2"
              >
                <Upload className="w-4 h-4 text-amber-400" />
                <span>{t('Importuj z pliku .txt')}</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
        <div
          className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0"
          role="tablist"
          aria-label={t('Talie według formatu')}
        >
          {[{ id: 'all', label: t('Wszystkie'), count: decks.length }, ...formatTabs.map((ft) => ({ id: ft.format.id, label: tabLabel(ft.format), count: ft.count }))].map((ft) => {
            const active = formatTab === ft.id;
            return (
              <button
                key={ft.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFormatTab(ft.id)}
                className={`shrink-0 h-9 px-3.5 rounded-lg text-sm flex items-center gap-2 cursor-pointer border ${
                  active
                    ? 'bg-stone-800 border-stone-700 text-stone-50 font-medium'
                    : 'bg-stone-900 border-stone-800 text-stone-400 hover:text-stone-200 hover:border-stone-700'
                }`}
              >
                {ft.label}
                <span className={`text-xs tabular-nums ${active ? 'text-amber-300' : 'text-stone-500'}`}>{ft.count}</span>
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
          {visibleDecks.map(deck => {
            const fmt = getDeckFormat(deck.format);
            const count = (deck.commander && fmt.commander ? 1 : 0) + (deck.cards?.filter((c) => !c.isSideboard).reduce((s, c) => s + c.quantity, 0) || 0);
            const sizeOk = fmt.exactSize ? count === fmt.deckSize : count >= fmt.deckSize;
            const sizeOver = fmt.exactSize && count > fmt.deckSize;
            const firstArt = deck.cards?.find((c) => c.card.image_uris?.art_crop || c.card.card_faces?.[0]?.image_uris?.art_crop)?.card;
            const isArena = fmt.platform === 'arena';
            const deckVal = isArena ? 0 : computeDeckValue(deck, settings);

            const art =
              (fmt.commander && (deck.commander?.image_uris?.art_crop || deck.commander?.card_faces?.[0]?.image_uris?.art_crop)) ||
              (!fmt.commander && (firstArt?.image_uris?.art_crop || firstArt?.card_faces?.[0]?.image_uris?.art_crop)) ||
              '';
            const iconBtn = 'w-8 h-8 rounded-md flex items-center justify-center text-stone-400 hover:text-stone-100 hover:bg-stone-800 cursor-pointer';
            return (
              <article
                key={deck.id}
                onClick={() => onSelectDeck(deck)}
                className="group bg-stone-900 border border-stone-800 hover:border-stone-700 rounded-xl overflow-hidden cursor-pointer flex flex-col"
              >
                <div className="relative h-28 bg-stone-800 overflow-hidden">
                  {art ? (
                    <img src={art} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover object-[center_30%] group-hover:scale-[1.03] transition-transform duration-500" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-stone-600">
                      <Crown className="w-6 h-6" />
                    </div>
                  )}
                  <span className="absolute top-2 right-2 px-2 py-0.5 rounded-md text-[11px] font-medium bg-stone-950/80 text-amber-300">
                    {fmt.label.replace(/^EDH /, '')}
                  </span>
                  {deck.isPublic && (
                    <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[11px] font-medium bg-stone-950/80 text-emerald-300" title={t('Talia dostępna pod publicznym linkiem')}>
                      {t('Publiczna')}
                    </span>
                  )}
                </div>

                <div className="p-4 flex-1 flex flex-col gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-stone-50 truncate">{deck.name}</h3>
                    <p className="text-sm text-stone-400 truncate">
                      {fmt.commander ? (deck.commander ? deck.commander.name : t('Bez dowódcy')) : t(fmt.description)}
                    </p>
                    {deck.description && <p className="mt-1.5 text-sm text-stone-500 line-clamp-2">{deck.description}</p>}
                  </div>

                  <div className="mt-auto flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 text-sm tabular-nums">
                      <span
                        className={sizeOk ? 'text-emerald-400' : sizeOver ? 'text-rose-400' : 'text-stone-300'}
                        title={`${fmt.label}: ${fmt.exactSize ? t('{n} z {total}', { n: count, total: fmt.deckSize }) : t('{n} kart, minimum {total}', { n: count, total: fmt.deckSize })}`}
                      >
                        {count}/{fmt.deckSize}
                      </span>
                      {isArena ? (
                        <WildcardCost cost={computeWildcardCost(deck)} compact />
                      ) : (
                        <span className="text-stone-300">{formatCurrency(deckVal, settings.currency)}</span>
                      )}
                    </div>
                    <div className="flex items-center -mr-1.5" onClick={(e) => e.stopPropagation()}>
                      <button type="button" onClick={(e) => handleExportDeckFile(e, deck)} className={iconBtn} title={t('Pobierz listę .txt')} aria-label={t('Pobierz listę .txt')}>
                        <Download className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={(e) => handleCopyDeckList(e, deck)} className={iconBtn} title={t('Kopiuj listę do schowka')} aria-label={t('Kopiuj listę do schowka')}>
                        {copiedDeckId === deck.id ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                      {onCopyToCollection && count > 0 && fmt.platform === 'paper' && (
                        <button
                          type="button"
                          onClick={() => setConfirmCopyId(confirmCopyId === deck.id ? null : deck.id)}
                          className={iconBtn}
                          title={t('Dodaj karty talii do klasera „{name}”', { name: binderName(defaultBinder) })}
                          aria-label={t('Dodaj karty talii do kolekcji')}
                          aria-expanded={confirmCopyId === deck.id}
                        >
                          <FolderInput className="w-4 h-4" />
                        </button>
                      )}
                      {onEditDeck && (
                        <button type="button" onClick={() => onEditDeck(deck)} className={iconBtn} title={t('Edytuj nazwę, opis i dowódcę')} aria-label={t('Edytuj talię')}>
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onDeleteDeck(deck.id)}
                        className={`${iconBtn} hover:text-rose-400`}
                        title={t('Usuń talię')}
                        aria-label={t('Usuń talię')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {confirmCopyId === deck.id && onCopyToCollection && (
                    <div className="rounded-lg bg-stone-950 ring-1 ring-stone-700 p-3 space-y-2.5" onClick={(e) => e.stopPropagation()}>
                      <p className="text-sm text-stone-300">
                        {t('Dodać {n} kart do klasera „{name}”? Te same wydania i wersje foil co w talii.', { n: count, name: binderName(defaultBinder) })}
                      </p>
                      <div className="flex justify-end gap-1.5">
                        <button type="button" onClick={() => setConfirmCopyId(null)} className="btn btn-ghost h-8 px-3">
                          {t('Anuluj')}
                        </button>
                        <button
                          type="button"
                          disabled={copyingId === deck.id}
                          onClick={async () => {
                            setCopyingId(deck.id);
                            const ok = await onCopyToCollection(deck);
                            setCopyingId(null);
                            if (ok) setConfirmCopyId(null);
                          }}
                          className="btn btn-primary h-8 px-3"
                        >
                          {copyingId === deck.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderInput className="w-4 h-4" />}
                          {t('Dodaj do kolekcji')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        </>
      )}
    </div>
  );
};

