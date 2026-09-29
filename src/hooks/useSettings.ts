import { useState, useEffect, useCallback } from 'react';
import { AppSettings } from '../types';
import { DEFAULT_SETTINGS } from '../utils/formatters';
import { settingsApi, nbpApi } from '../services/api';

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

  const updateSettings = useCallback(async (newSettings: AppSettings) => {
    setSettings(newSettings);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
    try {
      await settingsApi.save(newSettings, onUnauthorized);
    } catch (err) {
      console.warn('Failed to save settings remotely:', err);
    }
  }, [onUnauthorized]);

  const applyRemoteSettings = useCallback((remoteSettings: Partial<AppSettings>) => {
    if (remoteSettings && remoteSettings.currency) {
      setSettings(prev => {
        const merged = { ...prev, ...remoteSettings };
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
        return merged;
      });
    }
  }, []);

  return {
    settings,
    setSettings,
    updateSettings,
    applyRemoteSettings
  };
}
