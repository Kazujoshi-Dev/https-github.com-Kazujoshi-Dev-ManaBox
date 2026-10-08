import { useState, useEffect, useCallback, useRef } from 'react';
import { AppSettings } from '../types';
import { DEFAULT_SETTINGS } from '../utils/formatters';
import { settingsApi, nbpApi } from '../services/api';
import { getLang, setLang, isLang, type Lang } from '../i18n';

const SETTINGS_KEY = 'mtg_app_settings';

export function useSettings(onUnauthorized?: () => void) {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) return JSON.parse(saved);
    } catch (err) {
      console.error('Error loading settings from local storage:', err);
    }
    return DEFAULT_SETTINGS;
  });
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Auto-sync NBP rates if enabled
  useEffect(() => {
    if (!settings.autoNbpRate) return;

    let isMounted = true;
    nbpApi.fetchRates().then(({ eur, usd }) => {
      if (!isMounted) return;

      let hasUpdate = false;
      let newEur = settings.eurToPlnRate;
      let newUsd = settings.usdToPlnRate;

      if (eur && eur !== settings.eurToPlnRate) {
        newEur = eur;
        hasUpdate = true;
      }
      if (usd && usd !== settings.usdToPlnRate) {
        newUsd = usd;
        hasUpdate = true;
      }

      if (hasUpdate) {
        setSettings(prev => {
          const updated: AppSettings = {
            ...prev,
            eurToPlnRate: newEur,
            usdToPlnRate: newUsd,
            lastNbpUpdate: new Date().toISOString()
          };
          localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
          return updated;
        });
      }
    });

    return () => {
      isMounted = false;
    };
  }, [settings.autoNbpRate]);

  const updateSettings = useCallback(async (incoming: AppSettings) => {
    const newSettings: AppSettings = { ...incoming, language: getLang() };
    setSettings(newSettings);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
    try {
      await settingsApi.save(newSettings, onUnauthorized);
    } catch (err) {
      console.warn('Failed to save settings remotely:', err);
    }
  }, [onUnauthorized]);

  const applyRemoteSettings = useCallback((remoteSettings: Partial<AppSettings>) => {
    if (remoteSettings && isLang(remoteSettings.language)) {
      // Język zapisany na profilu ma pierwszeństwo przed wybranym na tym urządzeniu
      setLang(remoteSettings.language);
    }
    if (remoteSettings && remoteSettings.currency) {
      const merged: AppSettings = {
        ...settingsRef.current,
        ...remoteSettings,
        language: isLang(remoteSettings.language) ? remoteSettings.language : getLang()
      };
      settingsRef.current = merged;
      setSettings(merged);
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
      if (!isLang(remoteSettings.language) && getLang() !== 'pl') {
        // Profil bez zapisanego języka: zapisujemy ten wybrany przed zalogowaniem
        settingsApi.save(merged, onUnauthorized).catch(() => {});
      }
    } else if (getLang() !== 'pl') {
      // Nowe konto bez zapisanych ustawień: zapisujemy język wybrany przed zalogowaniem
      const next: AppSettings = { ...settingsRef.current, language: getLang() };
      settingsRef.current = next;
      setSettings(next);
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      settingsApi.save(next, onUnauthorized).catch(() => {});
    }
  }, [onUnauthorized]);

  /** Zmienia język interfejsu; zalogowanemu użytkownikowi zapisuje go na profilu. */
  const changeLanguage = useCallback(async (lang: Lang, saveToProfile: boolean) => {
    setLang(lang);
    if (!saveToProfile) return;
    const next: AppSettings = { ...settingsRef.current, language: lang };
    settingsRef.current = next;
    setSettings(next);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    try {
      await settingsApi.save(next, onUnauthorized);
    } catch (err) {
      console.warn('Failed to save language remotely:', err);
    }
  }, [onUnauthorized]);

  return {
    settings,
    setSettings,
    updateSettings,
    applyRemoteSettings,
    changeLanguage
  };
}
