import React, { useEffect, useState } from 'react';
import { X, Download, Copy, Check, QrCode, Loader2 } from 'lucide-react';
import { useBackToClose } from '../hooks/useBackButton';
import { useT } from '../i18n';

interface SaleQrModalProps {
  /** Publiczny adres oferty, który otworzy się po zeskanowaniu kodu. */
  url: string;
  /** Nazwa sprzedawcy pokazywana pod kodem i na pobranej grafice. */
  username: string;
  onClose: () => void;
  showToast?: (message: string) => void;
}

const QR_OPTIONS = { errorCorrectionLevel: 'M' as const, margin: 2, color: { dark: '#0c0a09', light: '#ffffff' } };

/**
 * Okno z kodem QR oferty „Sprzedam”: zeskanowanie telefonem otwiera publiczną ofertę gracza.
 * Kod można pobrać jako grafikę PNG (np. do wydruku na stoisko lub do wklejenia w ogłoszeniu).
 */
export const SaleQrModal: React.FC<SaleQrModalProps> = ({ url, username, onClose, showToast }) => {
  const t = useT();
  useBackToClose(true, onClose);

  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import('qrcode')
      .then((QR) => QR.toDataURL(url, { ...QR_OPTIONS, width: 512 }))
      .then((d) => !cancelled && setDataUrl(d))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [url]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      showToast?.(t('Skopiowano publiczny link do schowka! Każdy bez konta może go otworzyć.'));
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* brak dostępu do schowka */
    }
  };

  // Grafika do druku: biała karta z tytułem, kodem, nazwą sprzedawcy i adresem
  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const QR = await import('qrcode');
      const qrCanvas = document.createElement('canvas');
      await QR.toCanvas(qrCanvas, url, { ...QR_OPTIONS, width: 900 });

      const W = 1080;
      const H = 1380;
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas');

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#0c0a09';
      ctx.font = '700 72px system-ui, -apple-system, Segoe UI, sans-serif';
      ctx.fillText(t('Sprzedam'), W / 2, 120);
      ctx.fillStyle = '#b45309';
      ctx.font = '600 44px system-ui, -apple-system, Segoe UI, sans-serif';
      ctx.fillText(`@${username}`, W / 2, 190);

      ctx.drawImage(qrCanvas, (W - 900) / 2, 230, 900, 900);

      ctx.fillStyle = '#44403c';
      ctx.font = '500 34px system-ui, -apple-system, Segoe UI, sans-serif';
      ctx.fillText(t('Zeskanuj, aby zobaczyć karty na sprzedaż'), W / 2, 1210);
      ctx.fillStyle = '#78716c';
      ctx.font = '400 28px system-ui, -apple-system, Segoe UI, sans-serif';
      const shortUrl = url.replace(/^https?:\/\//, '');
      ctx.fillText(shortUrl.length > 60 ? shortUrl.slice(0, 57) + '...' : shortUrl, W / 2, 1270);

      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `sprzedam-qr-${username}`.replace(/[^\p{L}\p{N}_-]+/gu, '-') + '.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      showToast?.(t('Nie udało się przygotować grafiki z kodem QR.'));
    } finally {
      setDownloading(false);
    }
  };

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
        aria-label={t('Kod QR oferty')}
        className="w-full sm:max-w-sm bg-stone-900 border border-stone-800 rounded-t-3xl sm:rounded-2xl shadow-2xl text-stone-100 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-stone-800">
          <div className="flex items-center gap-2 min-w-0">
            <QrCode className="w-4 h-4 text-amber-400 shrink-0" />
            <h2 className="text-sm font-semibold truncate">{t('Kod QR oferty')}</h2>
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost" aria-label={t('Zamknij')}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex flex-col items-center gap-3 text-center">
          <div className="w-60 h-60 rounded-xl bg-white p-2 flex items-center justify-center">
            {dataUrl ? (
              <img src={dataUrl} alt={t('Kod QR oferty użytkownika @{name}', { name: username })} className="w-full h-full" />
            ) : error ? (
              <span className="text-xs text-stone-600 px-4">{t('Nie udało się wygenerować kodu QR.')}</span>
            ) : (
              <Loader2 className="w-6 h-6 text-stone-400 animate-spin" />
            )}
          </div>
          <div className="space-y-1 min-w-0 max-w-full">
            <p className="text-sm font-semibold text-amber-300 truncate">@{username}</p>
            <p className="text-xs text-stone-400">{t('Zeskanuj aparatem telefonu, aby otworzyć ofertę z kartami.')}</p>
            <p className="text-[11px] text-stone-500 break-all">{url.replace(/^https?:\/\//, '')}</p>
          </div>
        </div>

        <div className="px-4 pb-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={handleDownload} disabled={!dataUrl || downloading} className="btn btn-primary justify-center disabled:opacity-50">
            {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {t('Pobierz PNG')}
          </button>
          <button type="button" onClick={handleCopy} className="btn btn-secondary justify-center">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? t('Skopiowano') : t('Kopiuj link')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SaleQrModal;
