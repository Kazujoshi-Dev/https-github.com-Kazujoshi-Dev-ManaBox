import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Facebook, Copy, Check, Loader2, Share, ImageDown, ExternalLink, Link2 } from 'lucide-react';
import { useBackToClose } from '../hooks/useBackButton';
import { useT } from '../i18n';

/** Najwięcej zdjęć w jednym udostępnieniu (16 kart na zdjęcie, czyli do 160 kart). */
const MAX_SHARED_IMAGES = 10;

interface FacebookPostModalProps {
  variant: 'sale' | 'wishlist';
  /** Gotowa treść posta (można ją poprawić w oknie przed skopiowaniem). */
  text: string;
  /** Publiczny link do oferty lub listy życzeń. */
  shareUrl: string;
  /** Tworzy grafiki JPG z kartami i cenami. */
  buildImages: (onProgress: (done: number, total: number) => void) => Promise<File[]>;
  onClose: () => void;
  showToast?: (message: string) => void;
}

/**
 * Udostępnianie zdjęć przez systemowe okno „Udostępnij”: tylko na telefonach i tabletach.
 * Na komputerze to okno zwykle nie ma Facebooka, więc tam zdjęcia pobieramy.
 */
function canShareFiles(files: File[]): boolean {
  try {
    const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
    return Boolean(touch) && typeof navigator.canShare === 'function' && navigator.canShare({ files });
  } catch {
    return false;
  }
}

function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Przygotowanie posta na Facebooka: treść z listą kart i cenami oraz zdjęcia kart.
 * Facebook nie pozwala aplikacjom publikować za użytkownika ani wstawiać za niego tekstu,
 * więc okno skraca to do: skopiuj treść, udostępnij (lub pobierz) zdjęcia, wklej treść.
 */
export const FacebookPostModal: React.FC<FacebookPostModalProps> = ({
  variant,
  text: initialText,
  shareUrl,
  buildImages,
  onClose,
  showToast,
}) => {
  const t = useT();
  useBackToClose(true, onClose);
  const isWishlist = variant === 'wishlist';

  const [text, setText] = useState(initialText);
  const [copied, setCopied] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>({ done: 0, total: 0 });
  const [files, setFiles] = useState<File[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const buildRef = useRef(buildImages);

  // Grafiki powstają od razu po otwarciu okna, żeby kliknięcie „Udostępnij” zadziałało natychmiast
  // (przeglądarka pozwala otworzyć okno udostępniania tylko zaraz po kliknięciu).
  useEffect(() => {
    let cancelled = false;
    buildRef
      .current((done, total) => !cancelled && setProgress({ done, total }))
      .then((result) => {
        if (cancelled) return;
        setFiles(result);
        setProgress(null);
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
        setProgress(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const thumbs = useMemo(() => (files || []).slice(0, 4).map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => thumbs.forEach((u) => URL.revokeObjectURL(u)), [thumbs]);

  const sharedFiles = useMemo(() => (files || []).slice(0, MAX_SHARED_IMAGES), [files]);
  const shareSupported = useMemo(() => sharedFiles.length > 0 && canShareFiles(sharedFiles), [sharedFiles]);

  const copyText = async (silent = false): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      if (!silent) showToast?.(t('Skopiowano treść posta. Wklej ją na Facebooku.'));
      return true;
    } catch {
      showToast?.(t('Nie udało się skopiować. Zaznacz treść i skopiuj ręcznie.'));
      return false;
    }
  };

  // Zdjęcia osobno, nie w .zip: Facebook przyjmuje tylko pliki graficzne
  const downloadAll = async (list: File[]) => {
    for (let i = 0; i < list.length; i++) {
      downloadFile(list[i]);
      if (i < list.length - 1) await new Promise((r) => setTimeout(r, 350));
    }
  };

  const handleShareImages = async () => {
    if (!files || busy) return;
    setBusy(true);
    const copiedOk = await copyText(true);
    try {
      if (shareSupported) {
        await navigator.share({ files: sharedFiles, title: isWishlist ? t('Szukam kart') : t('Sprzedam') });
        showToast?.(copiedOk ? t('Treść posta jest w schowku: wklej ją w poście.') : t('Zdjęcia udostępnione. Dodaj jeszcze treść posta.'));
      } else {
        await downloadAll(files);
        showToast?.(
          copiedOk
            ? t('Pobrano zdjęcia, a treść posta jest w schowku. Otwórz Facebooka, wklej treść i dodaj zdjęcia.')
            : t('Pobrano zdjęcia. Otwórz Facebooka i dodaj je do posta.')
        );
      }
    } catch (err: any) {
      // Zamknięte okno udostępniania to nie błąd
      if (err?.name !== 'AbortError') {
        // Udostępnianie zawiodło: zdjęcia trafiają do pobranych, żeby dało się je dodać ręcznie
        await downloadAll(files);
        showToast?.(t('Nie udało się udostępnić zdjęć, więc je pobraliśmy. Dodaj je do posta z galerii.'));
      }
    } finally {
      setBusy(false);
    }
  };

  const fbShareLink = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
  const title = t('Post na Facebooka');

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full sm:max-w-lg max-h-[92dvh] flex flex-col bg-stone-900 border border-stone-800 rounded-t-3xl sm:rounded-2xl shadow-2xl text-stone-100 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-stone-800 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Facebook className="w-4 h-4 text-amber-400 shrink-0" />
            <h2 className="text-sm font-semibold truncate">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost" aria-label={t('Zamknij')}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          <p className="text-xs text-stone-400 leading-relaxed">
            {t('Facebook nie pozwala aplikacjom publikować za Ciebie, więc przygotowaliśmy gotową treść i zdjęcia z cenami. Udostępnij zdjęcia na Facebooku i wklej treść ze schowka.')}
          </p>

          {/* 1. Treść */}
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-stone-300">
                <span className="text-amber-400 tabular-nums">1.</span> {t('Treść posta')}
              </h3>
              <button type="button" onClick={() => copyText()} className="btn btn-ghost">
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                {copied ? t('Skopiowano') : t('Kopiuj treść')}
              </button>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              aria-label={t('Treść posta')}
              className="w-full bg-stone-950 border border-stone-800 rounded-lg px-3 py-2 text-xs leading-relaxed text-stone-300 font-mono focus:outline-none focus:border-stone-600 resize-y"
            />
          </section>

          {/* 2. Zdjęcia */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-stone-300">
              <span className="text-amber-400 tabular-nums">2.</span> {t('Zdjęcia kart z cenami')}
            </h3>
            {progress ? (
              <div className="flex items-center gap-2 text-xs text-stone-400 h-16">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="tabular-nums">
                  {progress.total ? t('Przygotowuję zdjęcia {done}/{total}', progress) : t('Przygotowuję zdjęcia…')}
                </span>
              </div>
            ) : failed || !files || files.length === 0 ? (
              <p className="text-xs text-rose-400">{t('Nie udało się utworzyć grafik. Spróbuj ponownie.')}</p>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  {thumbs.map((u, i) => (
                    <img key={u} src={u} alt={t('Zdjęcie {n}', { n: i + 1 })} className="h-16 w-auto rounded-md border border-stone-800" />
                  ))}
                  <span className="text-xs text-stone-400 tabular-nums">
                    {t('{n} zdj.', { n: files.length })}
                  </span>
                </div>
                {shareSupported && files.length > MAX_SHARED_IMAGES && (
                  <p className="text-[11px] text-stone-500">
                    {t('Udostępnisz pierwsze {max} zdjęć. Resztę kart zobaczą kupujący pod linkiem w treści.', { max: MAX_SHARED_IMAGES })}
                  </p>
                )}
                <button type="button" onClick={handleShareImages} disabled={busy} className="btn btn-primary w-full justify-center disabled:opacity-50">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : shareSupported ? <Share className="w-4 h-4" /> : <ImageDown className="w-4 h-4" />}
                  {shareSupported ? t('Kopiuj treść i udostępnij zdjęcia') : t('Kopiuj treść i pobierz zdjęcia')}
                </button>
                <p className="text-[11px] text-stone-500 leading-relaxed">
                  {shareSupported
                    ? t('W oknie udostępniania wybierz Facebooka, a w poście przytrzymaj pole tekstu i wybierz „Wklej”.')
                    : t('Otwórz Facebooka, utwórz post, wklej treść (Ctrl+V) i dodaj pobrane zdjęcia.')}
                </p>
              </>
            )}
          </section>

          {/* 3. Facebook */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-stone-300">
              <span className="text-amber-400 tabular-nums">3.</span> {t('Facebook')}
            </h3>
            <div className="flex flex-wrap gap-2">
              <a href="https://www.facebook.com/" target="_blank" rel="noreferrer" className="btn btn-secondary">
                <ExternalLink className="w-4 h-4" />
                {t('Otwórz Facebooka')}
              </a>
              <a
                href={fbShareLink}
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost"
                title={isWishlist ? t('Udostępnij sam link do listy: Facebook pokaże podgląd z kartami') : t('Udostępnij sam link do oferty: Facebook pokaże podgląd z kartami')}
              >
                <Link2 className="w-4 h-4" />
                {t('Udostępnij sam link')}
              </a>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default FacebookPostModal;
