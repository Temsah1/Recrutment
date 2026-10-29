import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthMeDTO, Role } from '@esme/shared';
import { hasPermission, type Permission } from '@esme/shared';
import { api, ApiError, setCsrfToken } from '../lib/api';
import { useToast } from '../components/ui/Toast';

interface AuthContextValue {
  session: AuthMeDTO | null;
  isLoading: boolean;
  error: Error | null;
  role: Role | null;
  can: (permission: Permission) => boolean;
  login: (email: string, password: string) => Promise<AuthMeDTO>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const query = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async ({ signal }): Promise<AuthMeDTO | null> => {
      try {
        return await api.me(signal);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    retry: false,
    staleTime: 4 * 60_000,
  });

  useEffect(() => {
    setCsrfToken(query.data?.csrfToken ?? null);
  }, [query.data]);

  const clearSession = useCallback(() => {
    setCsrfToken(null);
    queryClient.setQueryData<AuthMeDTO | null>(['auth', 'me'], null);
    queryClient.removeQueries({ queryKey: ['admin'] });
  }, [queryClient]);

  useEffect(() => {
    function onUnauthorized() {
      const hadSession = queryClient.getQueryData<AuthMeDTO | null>(['auth', 'me']);
      clearSession();
      if (hadSession?.administrator) {
        toast.info('Session expired', 'Sign in again to continue where you left off.');
      }
    }
    window.addEventListener('esme:unauthorized', onUnauthorized);
    return () => window.removeEventListener('esme:unauthorized', onUnauthorized);
  }, [clearSession, queryClient, toast]);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await api.login(email, password);
      queryClient.setQueryData(['auth', 'me'], result);
      return result;
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // The local session is cleared even if the server call fails.
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(() => {
    const session = query.data ?? null;
    const role = session?.administrator.role ?? null;
    return {
      session,
      isLoading: query.isLoading,
      error: query.error instanceof Error ? query.error : null,
      role,
      can: (permission) => hasPermission(role, permission),
      login,
      logout,
      refresh,
    };
  }, [query.data, query.isLoading, query.error, login, logout, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
