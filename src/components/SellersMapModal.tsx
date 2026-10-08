import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { X, MapPin, Heart, Store, Loader2, ChevronRight, Info } from 'lucide-react';
import { sellersApi } from '../services/api';
import { useBackToClose } from '../hooks/useBackButton';
import type { MapCity, MapSeller } from '../types';
import { useT, plural } from '../i18n';

interface SellersMapModalProps {
  onClose: () => void;
  /** Otwiera profil sprzedawcy z jego ofertami (zakładka Użytkownicy). */
  onOpenSeller: (username: string) => void;
}

/** Granice widoku: Europa z niewielkim zapasem. */
const EUROPE_BOUNDS = L.latLngBounds([30, -32], [73, 50]);

/**
 * Mapa sprzedawców: miasta, w których są użytkownicy z kartami na sprzedaż.
 * Mapa: Leaflet + kafelki OpenStreetMap (darmowe, wymagają podpisu © OpenStreetMap).
 */
const SellersMapModal: React.FC<SellersMapModalProps> = ({ onClose, onOpenSeller }) => {
  const t = useT();
  useBackToClose(true, onClose);
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [cities, setCities] = useState<MapCity[] | null>(null);
  const [myCity, setMyCity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MapCity | null>(null);

  useEffect(() => {
    sellersApi
      .getMap()
      .then((d) => {
        setCities(d.cities);
        setMyCity(d.myCity);
      })
      .catch((e) => setError(e.message));
  }, []);

  // Inicjalizacja mapy
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const isPhone = window.matchMedia?.('(max-width: 639px)').matches;
    const map = L.map(mapEl.current, {
      center: [52, 15],
      zoom: isPhone ? 3 : 4,
      minZoom: 3,
      maxZoom: 12,
      maxBounds: EUROPE_BOUNDS.pad(0.3),
      zoomControl: !isPhone,
      worldCopyJump: false
    });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
    }).addTo(map);
    mapRef.current = map;
    // rozmiar kontenera ustala się po animacji wysunięcia okna
    const timer = setTimeout(() => map.invalidateSize(), 250);
    return () => {
      clearTimeout(timer);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Znaczniki miast (liczba = liczba sprzedawców w mieście)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !cities) return;
    const layer = L.layerGroup().addTo(map);
    for (const city of cities) {
      const n = city.sellers.length;
      const hasMatches = city.sellers.some((s) => s.wishlistMatches > 0);
      const size = n > 9 ? 44 : n > 1 ? 38 : 32;
      const icon = L.divIcon({
        className: '',
        html: `<div class="ms-pin${hasMatches ? ' ms-pin--match' : ''}" style="width:${size}px;height:${size}px">${n}</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2]
      });
      L.marker([city.lat, city.lon], { icon, title: `${city.city}: ${plural(n, ['{n} sprzedawca', '{n} sprzedawców', '{n} sprzedawców'], ['{n} seller', '{n} sellers'])}`, keyboard: true })
        .on('click', () => setSelected(city))
        .addTo(layer);
    }
    if (cities.length > 0) {
      const bounds = L.latLngBounds(cities.map((c) => [c.lat, c.lon] as [number, number]));
      map.fitBounds(bounds.pad(0.5), { maxZoom: 7 });
    }
    return () => {
      layer.remove();
    };
  }, [cities]);

  const sortedCities = useMemo(
    () => [...(cities || [])].sort((a, b) => b.sellers.length - a.sellers.length || a.city.localeCompare(b.city)),
    [cities]
  );
  const totalSellers = useMemo(() => (cities || []).reduce((n, c) => n + c.sellers.length, 0), [cities]);

  const focusCity = (city: MapCity) => {
    setSelected(city);
    mapRef.current?.setView([city.lat, city.lon], Math.max(mapRef.current.getZoom(), 7));
  };

  const SellerRow: React.FC<{ s: MapSeller }> = ({ s }) => {
  const t = useT();
  return (
    <li>
      <button
        type="button"
        onClick={() => {
          onClose();
          onOpenSeller(s.username);
        }}
        className="w-full flex items-center gap-3 px-3 py-2.5 min-h-14 rounded-xl bg-stone-950/70 border border-stone-800 hover:border-emerald-500/40 active:bg-stone-800 text-left cursor-pointer"
      >
        <div className="w-9 h-9 rounded-lg bg-stone-800 text-stone-200 font-semibold flex items-center justify-center shrink-0">
          {s.username.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-stone-100 truncate">
            @{s.username} {s.isMe && <span className="text-xs font-semibold text-amber-400">{t('(Ty)')}</span>}
          </p>
          <p className="text-xs text-stone-400">
            {plural(s.forSaleCount, ['{n} karta na sprzedaż', '{n} karty na sprzedaż', '{n} kart na sprzedaż'], ['{n} card for sale', '{n} cards for sale'])}
          </p>
          {s.wishlistMatches > 0 && (
            <p className="text-xs font-semibold text-rose-300 flex items-center gap-1 mt-0.5">
              <Heart className="w-3 h-3 fill-rose-400 text-rose-400" />
              {t('{n} z Twojej listy życzeń', { n: s.wishlistMatches })}
            </p>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-stone-500 shrink-0" />
      </button>
    </li>
  );
};

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={t('Mapa sprzedawców')}
    >
      <div className="relative w-full sm:max-w-6xl h-dvh sm:h-[88vh] bg-stone-900 sm:border border-stone-800 sm:rounded-2xl overflow-hidden flex flex-col pt-[env(safe-area-inset-top)] sm:pt-0">
        {/* Nagłówek */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-stone-800 bg-stone-950/80 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-stone-100 truncate">{t('Mapa sprzedawców')}</h2>
              <p className="text-xs text-stone-400 truncate">
                {cities
                  ? plural(totalSellers, ['{n} sprzedawca', '{n} sprzedawców', '{n} sprzedawców'], ['{n} seller', '{n} sellers']) +
                    ' ' +
                    plural(cities.length, ['w {n} mieście', 'w {n} miastach', 'w {n} miastach'], ['in {n} city', 'in {n} cities'])
                  : t('Ładowanie...')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('Zamknij mapę')}
            className="w-10 h-10 rounded-full bg-stone-800 hover:bg-stone-700 text-stone-300 flex items-center justify-center shrink-0 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!myCity && cities && (
          <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-200 flex items-start gap-2 shrink-0">
            <Info className="w-4 h-4 shrink-0 mt-px" />
            <span>{t('Chcesz być na mapie? Dodaj swoją miejscowość w')} <strong>{t('Ustawieniach')}</strong> {t('i oznacz karty na sprzedaż.')}</span>
          </div>
        )}

        <div className="flex-1 min-h-0 flex flex-col sm:flex-row">
          {/* Mapa */}
          <div className="relative h-[52dvh] sm:h-auto sm:flex-1 shrink-0 sm:shrink">
            <div ref={mapEl} className="absolute inset-0 bg-stone-800" />
            {!cities && !error && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <Loader2 className="w-7 h-7 text-emerald-400 animate-spin" />
              </div>
            )}
          </div>

          {/* Panel: sprzedawcy w wybranym mieście albo lista miast */}
          <div className="flex-1 sm:flex-none sm:w-80 min-h-0 overflow-y-auto border-t sm:border-t-0 sm:border-l border-stone-800 bg-stone-900 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] space-y-3">
            {error && <p className="text-sm text-rose-300">{error}</p>}

            {selected ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-stone-100 flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="truncate">{selected.city}</span>
                    </p>
                    <p className="text-xs text-stone-400 truncate">{selected.label}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="text-xs font-semibold text-stone-400 hover:text-stone-200 px-2 h-9 shrink-0 cursor-pointer"
                  >
                    {t('Wszystkie miasta')}
                  </button>
                </div>
                <ul className="space-y-2">
                  {selected.sellers.map((s) => (
                    <SellerRow key={s.id} s={s} />
                  ))}
                </ul>
              </>
            ) : (
              cities && (
                <>
                  <p className="text-xs font-bold text-stone-400">
                    {cities.length ? t('Kliknij miasto, aby zobaczyć sprzedawców') : t('Brak sprzedawców na mapie')}
                  </p>
                  {cities.length === 0 && (
                    <p className="text-sm text-stone-400">
                      {t('Na mapie pojawiają się użytkownicy, którzy podali miejscowość w ustawieniach i mają karty na sprzedaż.')}
                    </p>
                  )}
                  <ul className="space-y-1.5">
                    {sortedCities.map((c) => {
                      const matches = c.sellers.reduce((n, s) => n + (s.wishlistMatches > 0 ? 1 : 0), 0);
                      return (
                        <li key={c.label}>
                          <button
                            type="button"
                            onClick={() => focusCity(c)}
                            className="w-full flex items-center gap-3 px-3 py-2 min-h-12 rounded-xl hover:bg-stone-800 active:bg-stone-800 text-left cursor-pointer"
                          >
                            <span className="min-w-8 h-8 px-1.5 rounded-full bg-emerald-500/20 text-emerald-300 text-sm font-bold flex items-center justify-center">
                              {c.sellers.length}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold text-stone-100 truncate">{c.city}</span>
                              <span className="block text-xs text-stone-500 truncate">{c.label}</span>
                            </span>
                            {matches > 0 && <Heart className="w-4 h-4 fill-rose-400 text-rose-400 shrink-0" aria-label={t('Sprzedawcy z kartami z Twojej listy życzeń')} />}
                            <Store className="w-4 h-4 text-stone-500 shrink-0" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SellersMapModal;
