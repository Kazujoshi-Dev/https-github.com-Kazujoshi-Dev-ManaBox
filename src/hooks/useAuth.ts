import { useState, useCallback } from 'react';
import { AuthUser } from '../types';
import { tokenStorage, authApi } from '../services/api';

export function useAuth(onLogoutSuccess?: (msg: string) => void) {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => tokenStorage.getUser());

  const handleUnauthorized = useCallback(() => {
    tokenStorage.clear();
    setCurrentUser(null);
  }, []);

  const handleAuthSuccess = useCallback((user: AuthUser, token: string) => {
    tokenStorage.setToken(token);
    tokenStorage.setUser(user);
    setCurrentUser(user);
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await authApi.logout(handleUnauthorized);
    } catch {
      // Ignored: network failure during logout still cleans local state
    }
    tokenStorage.clear();
    setCurrentUser(null);
    onLogoutSuccess?.('Pomyślnie wylogowano z konta.');
  }, [handleUnauthorized, onLogoutSuccess]);

  // Unieważnia sesje na wszystkich urządzeniach (łącznie z bieżącym).
  const handleLogoutAll = useCallback(async (): Promise<boolean> => {
    try {
      const res = await authApi.logoutAll(handleUnauthorized);
      if (!res.ok) return false;
    } catch {
      return false;
    }
    tokenStorage.clear();
    setCurrentUser(null);
    onLogoutSuccess?.('Wylogowano ze wszystkich urządzeń.');
    return true;
  }, [handleUnauthorized, onLogoutSuccess]);

  return {
    currentUser,
    handleAuthSuccess,
    handleLogout,
    handleLogoutAll,
    handleUnauthorized
  };
}
