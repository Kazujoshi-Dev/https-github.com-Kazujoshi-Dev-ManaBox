import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bug, X, ImagePlus, Loader2, Trash2, Send, CheckCircle2 } from 'lucide-react';
import { bugReportsApi } from '../services/api';
import { useBackToClose } from '../hooks/useBackButton';

interface BugReportModalProps {
  /** Gdzie użytkownik był, gdy otworzył zgłoszenie (np. „Talie: Atraxa”). */
  page: string;
  onClose: () => void;
  showToast?: (message: string) => void;
}

const MAX_SIDE = 1920;
const MAX_INPUT_BYTES = 20 * 1024 * 1024;

/** Zmniejsza obraz do najwyżej 1920 px i zapisuje jako JPEG (zwykle 200–600 kB). */
async function compressImage(file: Blob): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Nie udało się odczytać obrazu.'));
      el.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Przeglądarka nie obsługuje obróbki obrazu.');
    ctx.fillStyle = '#0c0a09';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Okno „Zgłoś błąd”: opis i opcjonalny zrzut ekranu (plik, przeciągnięcie albo Ctrl+V). */
export const BugReportModal: React.FC<BugReportModalProps> = ({ page, onClose, showToast }) => {
  useBackToClose(true, onClose);
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentId, setSentId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const attach = useCallback(async (file: Blob | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Załącz obraz (PNG, JPG, WebP).');
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      setError('Ten obraz jest za duży (maks. 20 MB).');
      return;
    }
    setProcessing(true);
    setError(null);
    try {
      setScreenshot(await compressImage(file));
    } catch (e: any) {
      setError(e.message || 'Nie udało się dodać zrzutu ekranu.');
    } finally {
      setProcessing(false);
    }
  }, []);

  // Escape zamyka, Ctrl+V wkleja zrzut ekranu ze schowka
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !sending && onClose();
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
      if (item) {
        e.preventDefault();
        attach(item.getAsFile());
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('paste', onPaste);
      document.body.style.overflow = prev;
    };
  }, [attach, onClose, sending]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (description.trim().length < 10) {
      setError('Opisz błąd w kilku słowach (co najmniej 10 znaków).');
      return;
    }
    setSending(true);
    setError(null);
    try {
      const r = await bugReportsApi.send({ description: description.trim(), page, screenshot });
      setSentId(r.id);
      showToast?.('Dziękujemy! Zgłoszenie zostało wysłane.');
    } catch (err: any) {
      setError(err.message || 'Nie udało się wysłać zgłoszenia.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && !sending && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="bug-report-title"
    >
      <div className="w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto bg-stone-900 border border-stone-800 rounded-t-2xl sm:rounded-2xl shadow-2xl pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center gap-3 p-4 border-b border-stone-800">
          <Bug className="w-5 h-5 text-amber-400 shrink-0" />
          <h3 id="bug-report-title" className="text-base font-semibold text-stone-50 flex-1">
            Zgłoś błąd
          </h3>
          <button type="button" onClick={onClose} aria-label="Zamknij" className="w-9 h-9 rounded-lg text-stone-400 hover:text-stone-100 hover:bg-stone-800 flex items-center justify-center cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {sentId ? (
          <div className="p-6 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
            <p className="text-base font-medium text-stone-100">Zgłoszenie #{sentId} wysłane</p>
            <p className="text-sm text-stone-400">Dziękujemy! Jeśli będziemy potrzebować szczegółów, odezwiemy się w wiadomościach.</p>
            <button type="button" onClick={onClose} className="btn btn-secondary mt-2">
              Zamknij
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="p-4 space-y-4">
            <div>
              <label htmlFor="bug-desc" className="block text-sm text-stone-300 mb-1.5">
                Co się stało?
              </label>
              <textarea
                id="bug-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={3000}
                rows={5}
                autoFocus
                placeholder="Np. po kliknięciu „Dodaj do talii” nic się nie dzieje. Co robiłeś, czego się spodziewałeś i co się stało?"
                className="w-full rounded-lg bg-stone-950 border border-stone-800 px-3 py-2 text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500 resize-y"
              />
              <p className="text-xs text-stone-500 mt-1 text-right tabular-nums">{description.length}/3000</p>
            </div>

            <div>
              <p className="text-sm text-stone-300 mb-1.5">Zrzut ekranu (opcjonalnie)</p>
              {screenshot ? (
                <div className="relative rounded-lg overflow-hidden ring-1 ring-stone-700 bg-stone-950">
                  <img src={screenshot} alt="Załączony zrzut ekranu" className="w-full max-h-64 object-contain" />
                  <button
                    type="button"
                    onClick={() => setScreenshot(null)}
                    className="absolute top-2 right-2 h-8 px-2.5 rounded-md bg-stone-900/90 text-stone-200 text-xs flex items-center gap-1.5 hover:text-rose-300 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Usuń
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    attach(e.dataTransfer.files?.[0]);
                  }}
                  className={`w-full rounded-lg border border-dashed px-4 py-6 flex flex-col items-center gap-1.5 text-sm cursor-pointer ${
                    dragOver ? 'border-amber-400 bg-amber-400/5 text-stone-100' : 'border-stone-700 text-stone-400 hover:border-stone-500 hover:text-stone-200'
                  }`}
                >
                  {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
                  <span>{processing ? 'Przygotowuję obraz…' : 'Wybierz plik lub przeciągnij go tutaj'}</span>
                  <span className="text-xs text-stone-500 max-sm:hidden">Możesz też wkleić zrzut ekranu skrótem Ctrl+V</span>
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  attach(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </div>

            <p className="text-xs text-stone-500">
              Razem ze zgłoszeniem wyślemy nazwę Twojego konta, otwarty widok ({page}) i typ przeglądarki.
            </p>

            {error && <p className="text-sm text-rose-300">{error}</p>}

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="btn btn-ghost">
                Anuluj
              </button>
              <button type="submit" disabled={sending || processing} className="btn btn-primary">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Wyślij zgłoszenie
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default BugReportModal;
