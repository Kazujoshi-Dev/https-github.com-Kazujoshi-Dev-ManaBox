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

  return {
    currentUser,
    handleAuthSuccess,
    handleLogout,
    handleUnauthorized
  };
}
