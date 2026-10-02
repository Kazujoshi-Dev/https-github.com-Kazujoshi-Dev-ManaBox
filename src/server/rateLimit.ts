import type { Request, Response, NextFunction } from 'express';

/**
 * Prosty limiter zapytań w pamięci (okno stałe).
 * Wystarcza dla jednej instancji serwera; przy kilku instancjach
 * trzeba by przenieść liczniki do wspólnego magazynu (np. Redis).
 */
interface Bucket {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  /** Nazwa limitu, oddziela liczniki różnych limiterów. */
  name: string;
  /** Długość okna w milisekundach. */
  windowMs: number;
  /** Maksymalna liczba zapytań w oknie. */
  max: number;
  /** Klucz licznika; domyślnie adres IP klienta. */
  key?: (req: Request) => string | null | undefined;
  /** Komunikat zwracany przy przekroczeniu limitu. */
  message?: string;
}

const buckets = new Map<string, Bucket>();

// Okresowe sprzątanie wygasłych liczników, żeby mapa nie rosła bez końca.
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}, 60_000).unref();

export function clientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/** Zwiększa licznik i zwraca liczbę sekund do odblokowania (0 = w limicie). */
export function hit(name: string, key: string, windowMs: number, max: number): number {
  const now = Date.now();
  const id = `${name}:${key}`;
  let b = buckets.get(id);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(id, b);
  }
  b.count += 1;
  return b.count > max ? Math.ceil((b.resetAt - now) / 1000) : 0;
}

export function rateLimit(opts: RateLimitOptions) {
  const message = opts.message || 'Zbyt wiele zapytań. Spróbuj ponownie za chwilę.';
  return (req: Request, res: Response, next: NextFunction) => {
    const key = (opts.key ? opts.key(req) : null) || clientIp(req);
    const retryAfter = hit(opts.name, key, opts.windowMs, opts.max);
    if (retryAfter > 0) {
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: message, retryAfter });
    }
    next();
  };
}
