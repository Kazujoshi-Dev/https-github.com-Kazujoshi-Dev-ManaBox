import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ScryfallCard } from '../../types';
import { getCardImageUri, handleCardImageError, scryfallNamedImageUrl } from '../../utils/formatters';

const PREVIEW_W = 240;
const PREVIEW_H = Math.round((PREVIEW_W * 680) / 488);

type HoverPreview = { name: string; img: string; x: number; y: number };

/** Pozycja podglądu obok elementu: po prawej, a gdy brak miejsca, po lewej; zawsze w granicach okna. */
function previewPosition(el: HTMLElement): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  const gap = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let x = r.right + gap;
  if (x + PREVIEW_W > vw - 8) x = Math.max(8, r.left - gap - PREVIEW_W);
  const y = Math.min(Math.max(8, r.top + r.height / 2 - PREVIEW_H / 2), vh - PREVIEW_H - 8);
  return { x, y };
}

/**
 * Podgląd grafiki karty po najechaniu myszą (lub fokusie klawiaturą) na jej nazwę.
 * `previewProps` rozkładamy na elemencie z nazwą, `previewPortal` renderujemy raz w komponencie.
 * Na telefonach podgląd się nie pokazuje: tam stuknięcie otwiera szczegóły karty.
 */
export function useCardHoverPreview() {
  const [preview, setPreview] = useState<HoverPreview | null>(null);

  useEffect(() => {
    if (!preview) return;
    const hide = () => setPreview(null);
    window.addEventListener('scroll', hide, true);
    return () => window.removeEventListener('scroll', hide, true);
  }, [preview]);

  const previewProps = (name: string, card?: ScryfallCard | null) => {
    const img = card ? getCardImageUri(card, 'normal') : scryfallNamedImageUrl(name.split('//')[0].trim(), 'normal');
    const show = (el: HTMLElement) => img && setPreview({ name, img, ...previewPosition(el) });
    return {
      onPointerEnter: (e: React.PointerEvent<HTMLElement>) => e.pointerType === 'mouse' && show(e.currentTarget),
      onPointerLeave: () => setPreview(null),
      onFocus: (e: React.FocusEvent<HTMLElement>) => e.currentTarget.matches(':focus-visible') && show(e.currentTarget),
      onBlur: () => setPreview(null),
      // Kliknięcie otwiera szczegóły karty, więc chowamy podgląd
      onClickCapture: () => setPreview(null),
    };
  };

  const previewPortal = preview
    ? createPortal(
        <div
          className="fixed z-[70] pointer-events-none hidden sm:block rounded-xl overflow-hidden ring-1 ring-stone-700 shadow-2xl bg-stone-950"
          style={{ left: preview.x, top: preview.y, width: PREVIEW_W, height: PREVIEW_H }}
          aria-hidden="true"
        >
          <img src={preview.img} alt="" referrerPolicy="no-referrer" onError={(e) => handleCardImageError(e, preview.img)} className="w-full h-full object-contain" />
        </div>,
        document.body
      )
    : null;

  return { previewProps, previewPortal };
}
