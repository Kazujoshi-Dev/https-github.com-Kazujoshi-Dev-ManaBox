/**
 * Grafiki JPG z ofertą „Sprzedam” do wklejania na Facebooka i grupy MTG.
 * Jedna grafika mieści do 16 kart (siatka 4×4) z cenami; w stopce nazwa użytkownika i link do oferty.
 * Przy większej liczbie kart powstaje kilka grafik spakowanych do ZIP.
 */
import { createZip } from './zip';

export interface SaleImageCard {
  imageUri: string;
  name: string;
  meta: string;
  foil: boolean;
  quantityText: string;
  priceText: string;
}

export interface SaleImageOptions {
  cards: SaleImageCard[];
  username: string;
  offerUrl: string;
  title: string;
  pageLabel: (page: number, count: number) => string;
  foilLabel: string;
  fileBase: string;
  onProgress?: (done: number, total: number) => void;
}

export const CARDS_PER_IMAGE = 16;

const W = 1600;
const PAD = 48;
const COLS = 4;
const GAP = 28;
const TILE_W = Math.floor((W - PAD * 2 - GAP * (COLS - 1)) / COLS);
const INSET = 12;
const IMG_W = TILE_W - INSET * 2;
const IMG_H = Math.round((IMG_W * 680) / 488);
const INFO_H = 104;
const TILE_H = INSET + IMG_H + INFO_H;
const HEADER_H = 104;
const FOOTER_H = 112;

const FONT = "'Geist Variable', ui-sans-serif, system-ui, sans-serif";
const C = {
  bg: '#0c0a09', // stone-950
  tile: '#1c1917', // stone-900
  border: '#292524', // stone-800
  text: '#f5f5f4', // stone-100
  muted: '#a8a29e', // stone-400
  dim: '#78716c', // stone-500
  amber: '#fbbf24', // amber-400
  price: '#6ee7b7', // emerald-300
};

const proxied = (uri: string) => `/api/scryfall/image-proxy?url=${encodeURIComponent(uri)}`;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image'));
    img.src = src;
  });
}

/** Obraz musi dać się narysować na canvasie bez blokady eksportu: najpierw Scryfall (CORS), potem nasz serwer. */
async function loadCardImage(uri: string): Promise<HTMLImageElement | null> {
  if (!uri || !uri.startsWith('http')) return null;
  try {
    return await loadImage(uri);
  } catch {
    try {
      return await loadImage(proxied(uri));
    } catch {
      return null;
    }
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxWidth) s = s.slice(0, -1);
  return s.trimEnd() + '…';
}

function drawTile(ctx: CanvasRenderingContext2D, card: SaleImageCard, img: HTMLImageElement | null, x: number, y: number, foilLabel: string) {
  roundRect(ctx, x, y, TILE_W, TILE_H, 18);
  ctx.fillStyle = C.tile;
  ctx.fill();
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 2;
  ctx.stroke();

  const ix = x + INSET;
  const iy = y + INSET;
  ctx.save();
  roundRect(ctx, ix, iy, IMG_W, IMG_H, IMG_W * 0.045);
  ctx.clip();
  if (img) {
    ctx.drawImage(img, ix, iy, IMG_W, IMG_H);
  } else {
    ctx.fillStyle = C.bg;
    ctx.fillRect(ix, iy, IMG_W, IMG_H);
    ctx.fillStyle = C.muted;
    ctx.font = `600 22px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(fitText(ctx, card.name, IMG_W - 32), ix + IMG_W / 2, iy + IMG_H / 2);
    ctx.textAlign = 'left';
  }
  ctx.restore();

  if (card.foil) {
    ctx.font = `700 18px ${FONT}`;
    const label = foilLabel.toUpperCase();
    const w = ctx.measureText(label).width + 24;
    roundRect(ctx, ix + IMG_W - w - 10, iy + 10, w, 32, 16);
    ctx.fillStyle = C.amber;
    ctx.fill();
    ctx.fillStyle = C.bg;
    ctx.textBaseline = 'middle';
    ctx.fillText(label, ix + IMG_W - w - 10 + 12, iy + 27);
    ctx.textBaseline = 'alphabetic';
  }

  const tx = x + INSET + 4;
  const tw = IMG_W - 8;
  let ty = iy + IMG_H + 32;
  ctx.fillStyle = C.text;
  ctx.font = `600 22px ${FONT}`;
  ctx.fillText(fitText(ctx, card.name, tw), tx, ty);

  ty += 26;
  ctx.fillStyle = C.muted;
  ctx.font = `400 17px ${FONT}`;
  ctx.fillText(fitText(ctx, card.meta, tw), tx, ty);

  ty += 36;
  ctx.font = `500 18px ${FONT}`;
  ctx.fillStyle = C.dim;
  const qtyW = ctx.measureText(card.quantityText).width;
  ctx.textAlign = 'right';
  ctx.fillText(card.quantityText, tx + tw, ty);
  ctx.textAlign = 'left';
  ctx.fillStyle = C.price;
  ctx.font = `700 30px ${FONT}`;
  ctx.fillText(fitText(ctx, card.priceText, tw - qtyW - 12), tx, ty);
}

function drawPage(
  cards: SaleImageCard[],
  images: (HTMLImageElement | null)[],
  page: number,
  pageCount: number,
  opts: SaleImageOptions,
): HTMLCanvasElement {
  const rows = Math.ceil(cards.length / COLS);
  const gridH = rows * TILE_H + (rows - 1) * GAP;
  const H = PAD + HEADER_H + gridH + FOOTER_H + PAD;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // Nagłówek
  ctx.fillStyle = C.amber;
  ctx.font = `700 44px ${FONT}`;
  ctx.fillText(opts.title, PAD, PAD + 48);
  if (pageCount > 1) {
    ctx.fillStyle = C.muted;
    ctx.font = `500 22px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(opts.pageLabel(page, pageCount), W - PAD, PAD + 44);
    ctx.textAlign = 'left';
  }

  // Siatka kart (niepełny ostatni wiersz wyśrodkowany)
  const gridTop = PAD + HEADER_H;
  cards.forEach((card, i) => {
    const row = Math.floor(i / COLS);
    const inRow = Math.min(COLS, cards.length - row * COLS);
    const rowLeft = (W - (inRow * TILE_W + (inRow - 1) * GAP)) / 2;
    const x = rowLeft + (i % COLS) * (TILE_W + GAP);
    const y = gridTop + row * (TILE_H + GAP);
    drawTile(ctx, card, images[i], x, y, opts.foilLabel);
  });

  // Stopka: nazwa użytkownika i link do oferty
  const footerTop = gridTop + gridH + 36;
  ctx.fillStyle = C.border;
  ctx.fillRect(PAD, footerTop, W - PAD * 2, 2);
  ctx.fillStyle = C.text;
  ctx.font = `700 34px ${FONT}`;
  const user = fitText(ctx, opts.username, (W - PAD * 2) * 0.45);
  ctx.fillText(user, PAD, footerTop + 58);
  ctx.fillStyle = C.muted;
  ctx.font = `400 22px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(fitText(ctx, opts.offerUrl, (W - PAD * 2) * 0.5), W - PAD, footerTop + 56);
  ctx.textAlign = 'left';

  return canvas;
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/jpeg', 0.9);
  });
}

async function loadAll(uris: string[], onDone: () => void): Promise<(HTMLImageElement | null)[]> {
  const out: (HTMLImageElement | null)[] = new Array(uris.length).fill(null);
  let next = 0;
  const worker = async () => {
    while (next < uris.length) {
      const i = next++;
      out[i] = await loadCardImage(uris[i]);
      onDone();
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, uris.length) }, worker));
  return out;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Tworzy grafiki i pobiera je: jedną jako .jpg, kilka jako .zip. Zwraca liczbę grafik. */
export async function downloadSaleImages(opts: SaleImageOptions): Promise<number> {
  const { cards } = opts;
  if (cards.length === 0) return 0;
  try {
    await document.fonts.load(`700 44px ${FONT}`);
    await document.fonts.load(`400 22px ${FONT}`);
  } catch {
    /* zostaje czcionka systemowa */
  }

  let done = 0;
  opts.onProgress?.(0, cards.length);
  const images = await loadAll(
    cards.map((c) => c.imageUri),
    () => opts.onProgress?.(++done, cards.length),
  );

  const pageCount = Math.ceil(cards.length / CARDS_PER_IMAGE);
  const blobs: Blob[] = [];
  for (let p = 0; p < pageCount; p++) {
    const from = p * CARDS_PER_IMAGE;
    const canvas = drawPage(cards.slice(from, from + CARDS_PER_IMAGE), images.slice(from, from + CARDS_PER_IMAGE), p + 1, pageCount, opts);
    blobs.push(await canvasToJpeg(canvas));
  }

  if (blobs.length === 1) {
    downloadBlob(blobs[0], `${opts.fileBase}.jpg`);
  } else {
    const pad = String(blobs.length).length;
    const entries = await Promise.all(
      blobs.map(async (b, i) => ({
        name: `${opts.fileBase}-${String(i + 1).padStart(pad, '0')}.jpg`,
        data: new Uint8Array(await b.arrayBuffer()),
      })),
    );
    downloadBlob(createZip(entries), `${opts.fileBase}.zip`);
  }
  return blobs.length;
}
