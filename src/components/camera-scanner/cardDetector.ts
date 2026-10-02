/**
 * Wykrywanie karty w klatce kamery i prostowanie perspektywy.
 *
 * Moduł działa na zwykłych tablicach pikseli (bez DOM), więc da się go
 * testować poza przeglądarką. Kroki:
 *  1. Wzdłuż każdego boku ramki celownika rzucamy promienie od zewnątrz do środka
 *     i szukamy najsilniejszej zmiany jasności — to krawędź karty.
 *  2. Do znalezionych punktów dopasowujemy prostą (RANSAC — odporny na palce,
 *     odblaski i wzór blatu).
 *  3. Przecięcia czterech prostych dają rogi karty; sprawdzamy, czy kształt
 *     ma sensowne proporcje karty 63×88 mm.
 *  4. Homografia rozciąga czworokąt do prostokąta (wyprostowana karta).
 */

export interface Point {
  x: number;
  y: number;
}

export interface Quad {
  tl: Point;
  tr: Point;
  br: Point;
  bl: Point;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectedCard {
  quad: Quad;
  /** 0..1 — jaka część promieni potwierdziła krawędzie. */
  quality: number;
}

export const CARD_ASPECT = 63 / 88;

const RAYS_PER_SIDE = 28;

/** Skala szarości z RGBA. */
export function rgbaToGray(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Float32Array {
  const gray = new Float32Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
  }
  return gray;
}

/** Rozmycie pudełkowe 3×3 (dwa przejścia ≈ rozmycie gaussowskie) — tłumi szum i fakturę blatu. */
function blur(src: Float32Array, w: number, h: number): Float32Array {
  let a = src;
  for (let pass = 0; pass < 2; pass++) {
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - 1);
      const y1 = Math.min(h - 1, y + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - 1);
        const x1 = Math.min(w - 1, x + 1);
        let s = 0;
        let n = 0;
        for (let yy = y0; yy <= y1; yy++) {
          for (let xx = x0; xx <= x1; xx++) {
            s += a[yy * w + xx];
            n++;
          }
        }
        out[y * w + x] = s / n;
      }
    }
    a = out;
  }
  return a;
}

type Side = 'top' | 'bottom' | 'left' | 'right';

/**
 * Kandydaci na krawędź wzdłuż jednego promienia: lokalne maksima gradientu
 * o sile ≥ 20% najsilniejszego (najwyżej 5, od zewnątrz) — także słabe krawędzie,
 * bo czarna ramka karty na ciemnym blacie daje niewielki kontrast. Nie wybieramy tu
 * jednego punktu — o tym, która krawędź jest krawędzią karty, decyduje
 * dopiero dopasowanie całego kształtu.
 */
function edgesOnRay(img: Float32Array, w: number, h: number, side: Side, along: number, from: number, to: number): number[] {
  const horizontal = side === 'top' || side === 'bottom';
  const step = from < to ? 1 : -1;
  const sample = (t: number, a: number) => {
    // średnia z 3 sąsiednich promieni — stabilniejsza krawędź
    let s = 0;
    for (let k = -1; k <= 1; k++) {
      const aa = Math.min(Math.max(a + k, 0), (horizontal ? w : h) - 1);
      const x = horizontal ? aa : t;
      const y = horizontal ? t : aa;
      s += img[y * w + x];
    }
    return s / 3;
  };
  const limit = horizontal ? h - 2 : w - 2;
  const start = Math.min(Math.max(from, 1), limit);
  const end = Math.min(Math.max(to, 1), limit);
  const grads: number[] = [];
  const pos: number[] = [];
  for (let t = start; step > 0 ? t <= end : t >= end; t += step) {
    grads.push(Math.abs(sample(t + 1, along) - sample(t - 1, along)));
    pos.push(t);
  }
  let max = 0;
  for (const g of grads) if (g > max) max = g;
  if (max < 5) return [];
  const out: number[] = [];
  for (let i = 1; i < grads.length - 1 && out.length < 5; i++) {
    if (grads[i] >= Math.max(4, 0.2 * max) && grads[i] >= grads[i - 1] && grads[i] > grads[i + 1]) out.push(pos[i]);
  }
  return out;
}

interface Line {
  // dla boków poziomych: y = a·x + b; dla pionowych: x = a·y + b
  a: number;
  b: number;
  /** Liczba promieni, które potwierdzają tę prostą (0..RAYS_PER_SIDE). */
  support: number;
}

interface RayPoint {
  ray: number;
  t: number; // współrzędna wzdłuż boku
  s: number; // współrzędna w poprzek (położenie krawędzi)
}

function fitBest(points: RayPoint[], tol: number): Line | null {
  const n = points.length;
  let best: RayPoint[] = [];
  let bestRays = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const p = points[i], q = points[j];
      if (p.ray === q.ray || Math.abs(q.t - p.t) < 1e-6) continue;
      const a = (q.s - p.s) / (q.t - p.t);
      if (Math.abs(a) > 0.35) continue; // krawędź karty nie może być mocno pochylona względem celownika
      const b = p.s - a * p.t;
      const inl = points.filter((r) => Math.abs(r.s - (a * r.t + b)) <= tol);
      const rays = new Set(inl.map((r) => r.ray)).size;
      if (rays > bestRays) {
        bestRays = rays;
        best = inl;
      }
    }
  }
  if (bestRays < Math.max(6, Math.ceil(0.4 * RAYS_PER_SIDE))) return null;
  let st = 0, ss = 0, stt = 0, sts = 0;
  for (const r of best) {
    st += r.t; ss += r.s; stt += r.t * r.t; sts += r.t * r.s;
  }
  const m = best.length;
  const den = m * stt - st * st;
  if (Math.abs(den) < 1e-9) return null;
  const a = (m * sts - st * ss) / den;
  return { a, b: (ss - a * st) / m, support: bestRays };
}

/** Do 4 różnych prostych na bok (sekwencyjny RANSAC: znajdź prostą, usuń jej punkty, powtórz). */
function candidateLines(points: RayPoint[], tol: number): Line[] {
  const lines: Line[] = [];
  let rest = points;
  for (let k = 0; k < 4 && rest.length >= 6; k++) {
    const line = fitBest(rest, tol);
    if (!line) break;
    lines.push(line);
    rest = rest.filter((r) => Math.abs(r.s - (line.a * r.t + line.b)) > tol * 1.5);
  }
  return lines;
}

function intersect(hLine: Line, vLine: Line): Point {
  // y = a1·x + b1, x = a2·y + b2
  const x = (vLine.a * hLine.b + vLine.b) / (1 - hLine.a * vLine.a);
  return { x, y: hLine.a * x + hLine.b };
}

const dist = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.y - q.y);

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Czy czworokąt wygląda jak karta (wypukły, proporcje ~63:88, rozmiar zbliżony do celownika). */
export function isPlausibleCard(q: Quad, guide: Rect): boolean {
  const pts = [q.tl, q.tr, q.br, q.bl];
  const signs = pts.map((p, i) => Math.sign(cross(p, pts[(i + 1) % 4], pts[(i + 2) % 4])));
  if (!signs.every((s) => s === signs[0] && s !== 0)) return false;
  const top = dist(q.tl, q.tr), bottom = dist(q.bl, q.br), left = dist(q.tl, q.bl), right = dist(q.tr, q.br);
  if (Math.max(top, bottom) / Math.min(top, bottom) > 1.35) return false;
  if (Math.max(left, right) / Math.min(left, right) > 1.35) return false;
  const aspect = (top + bottom) / (left + right);
  if (aspect < 0.6 || aspect > 0.86) return false;
  const area = ((top + bottom) / 2) * ((left + right) / 2);
  const ratio = area / (guide.width * guide.height);
  return ratio > 0.4 && ratio < 1.7;
}

/**
 * Szuka karty w okolicy celownika. `gray` to obraz w skali szarości (najlepiej
 * pomniejszony do ~250–400 px szerokości celownika), `guide` — celownik w tych samych współrzędnych.
 */
export function detectCardQuad(gray: Float32Array, w: number, h: number, guide: Rect): DetectedCard | null {
  const img = blur(gray, w, h);
  const bandOut = 0.25; // jak daleko poza celownik szukamy krawędzi
  const bandIn = 0.3; // jak głęboko do środka celownika
  const collect = (side: Side): RayPoint[] => {
    const pts: RayPoint[] = [];
    for (let k = 0; k < RAYS_PER_SIDE; k++) {
      const f = 0.12 + (0.76 * k) / (RAYS_PER_SIDE - 1);
      let along: number, from: number, to: number;
      if (side === 'top') {
        along = Math.round(guide.x + guide.width * f);
        from = Math.round(guide.y - guide.height * bandOut);
        to = Math.round(guide.y + guide.height * bandIn);
      } else if (side === 'bottom') {
        along = Math.round(guide.x + guide.width * f);
        from = Math.round(guide.y + guide.height * (1 + bandOut));
        to = Math.round(guide.y + guide.height * (1 - bandIn));
      } else if (side === 'left') {
        along = Math.round(guide.y + guide.height * f);
        from = Math.round(guide.x - guide.width * bandOut);
        to = Math.round(guide.x + guide.width * bandIn);
      } else {
        along = Math.round(guide.y + guide.height * f);
        from = Math.round(guide.x + guide.width * (1 + bandOut));
        to = Math.round(guide.x + guide.width * (1 - bandIn));
      }
      for (const t of edgesOnRay(img, w, h, side, along, from, to)) pts.push({ ray: k, t: along, s: t });
    }
    return pts;
  };

  const tolH = Math.max(1.5, guide.height * 0.01);
  const tolW = Math.max(1.5, guide.width * 0.012);
  const tops = candidateLines(collect('top'), tolH);
  const bottoms = candidateLines(collect('bottom'), tolH);
  const lefts = candidateLines(collect('left'), tolW);
  const rights = candidateLines(collect('right'), tolW);
  if (!tops.length || !bottoms.length || !lefts.length || !rights.length) return null;

  // Wybór kombinacji czterech prostych, która najbardziej przypomina kartę:
  // proporcje 63:88, równoległe przeciwległe boki, rozmiar zbliżony do celownika,
  // dobrze potwierdzone krawędzie, a przy remisie — prostokąt bardziej zewnętrzny.
  let best: { quad: Quad; score: number; support: number } | null = null;
  for (const top of tops) for (const bottom of bottoms) for (const left of lefts) for (const right of rights) {
    const quad: Quad = {
      tl: intersect(top, left),
      tr: intersect(top, right),
      br: intersect(bottom, right),
      bl: intersect(bottom, left)
    };
    if (!isPlausibleCard(quad, guide)) continue;
    const wTop = dist(quad.tl, quad.tr), wBot = dist(quad.bl, quad.br);
    const hL = dist(quad.tl, quad.bl), hR = dist(quad.tr, quad.br);
    const aspect = (wTop + wBot) / (hL + hR);
    const areaRatio = (((wTop + wBot) / 2) * ((hL + hR) / 2)) / (guide.width * guide.height);
    const support = (top.support + bottom.support + left.support + right.support) / (4 * RAYS_PER_SIDE);
    // Wewnętrzne prostokąty (ramka ilustracji, pole tekstu) też mają „kartowe” proporcje,
    // dlatego mocno premiujemy prostokąt zewnętrzny — karta wypełnia celownik.
    const score =
      support * 0.5 -
      (Math.abs(aspect - CARD_ASPECT) / CARD_ASPECT) * 6 -
      Math.abs(Math.log(wTop / wBot)) * 2 -
      Math.abs(Math.log(hL / hR)) * 2 +
      areaRatio * 1.2;
    if (!best || score > best.score) best = { quad, score, support };
  }
  if (!best) return null;
  return { quad: best.quad, quality: best.support };
}

/** Przeskalowanie czworokąta (np. z obrazu do wykrywania na pełną rozdzielczość). */
export function scaleQuad(q: Quad, sx: number, sy: number, dx = 0, dy = 0): Quad {
  const f = (p: Point) => ({ x: p.x * sx + dx, y: p.y * sy + dy });
  return { tl: f(q.tl), tr: f(q.tr), br: f(q.br), bl: f(q.bl) };
}

/** Największe przesunięcie rogu między dwiema detekcjami (do oceny stabilności). */
export function quadMovement(a: Quad, b: Quad): number {
  return Math.max(dist(a.tl, b.tl), dist(a.tr, b.tr), dist(a.br, b.br), dist(a.bl, b.bl));
}

/** Homografia z kwadratu jednostkowego (u,v) na czworokąt (Heckbert). */
function squareToQuad(q: Quad) {
  const { tl, tr, br, bl } = q;
  const sx = tl.x - tr.x + br.x - bl.x;
  const sy = tl.y - tr.y + br.y - bl.y;
  const dx1 = tr.x - br.x, dx2 = bl.x - br.x, dy1 = tr.y - br.y, dy2 = bl.y - br.y;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = Math.abs(den) < 1e-12 ? 0 : (sx * dy2 - dx2 * sy) / den;
  const hh = Math.abs(den) < 1e-12 ? 0 : (dx1 * sy - sx * dy1) / den;
  const a = tr.x - tl.x + g * tr.x;
  const b = bl.x - tl.x + hh * bl.x;
  const c = tl.x;
  const d = tr.y - tl.y + g * tr.y;
  const e = bl.y - tl.y + hh * bl.y;
  const f = tl.y;
  return (u: number, v: number): Point => {
    const z = g * u + hh * v + 1;
    return { x: (a * u + b * v + c) / z, y: (d * u + e * v + f) / z };
  };
}

/** Fragment karty we współrzędnych względnych (0..1), np. pasek nazwy. */
export interface CardRegion {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export const FULL_CARD: CardRegion = { u0: 0, v0: 0, u1: 1, v1: 1 };

/**
 * Wycina i prostuje fragment karty z obrazu źródłowego (RGBA) do prostokąta outW × outH.
 * Próbkowanie dwuliniowe; poza obrazem — czerń.
 */
export function warpCardRegion(
  src: Uint8ClampedArray | Uint8Array,
  srcW: number,
  srcH: number,
  quad: Quad,
  outW: number,
  outH: number,
  region: CardRegion = FULL_CARD
): Uint8ClampedArray {
  const map = squareToQuad(quad);
  const out = new Uint8ClampedArray(outW * outH * 4);
  for (let j = 0; j < outH; j++) {
    const v = region.v0 + ((j + 0.5) / outH) * (region.v1 - region.v0);
    for (let i = 0; i < outW; i++) {
      const u = region.u0 + ((i + 0.5) / outW) * (region.u1 - region.u0);
      const p = map(u, v);
      const x = p.x - 0.5;
      const y = p.y - 0.5;
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const o = (j * outW + i) * 4;
      if (x0 < 0 || y0 < 0 || x0 + 1 >= srcW || y0 + 1 >= srcH) {
        out[o + 3] = 255;
        continue;
      }
      const fx = x - x0;
      const fy = y - y0;
      const p00 = (y0 * srcW + x0) * 4;
      const p10 = p00 + 4;
      const p01 = p00 + srcW * 4;
      const p11 = p01 + 4;
      for (let ch = 0; ch < 3; ch++) {
        const top = src[p00 + ch] * (1 - fx) + src[p10 + ch] * fx;
        const bot = src[p01 + ch] * (1 - fx) + src[p11 + ch] * fx;
        out[o + ch] = top * (1 - fy) + bot * fy;
      }
      out[o + 3] = 255;
    }
  }
  return out;
}
