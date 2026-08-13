import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';

import { platformLogin } from './authApi';
import {
  AUTH_STATE_KEY,
  AUTH_TOKEN_KEY,
  AUTH_UNAUTHORIZED_EVENT,
} from './auth.types';
import type { AuthState } from './auth.types';

const emptyState: AuthState = {
  accessToken: null,
  scope: null,
  platformUser: null,
  expiresAt: null,
};

function readStoredState(): AuthState {
  try {
    const raw = localStorage.getItem(AUTH_STATE_KEY);
    if (!raw) return emptyState;

    const state = JSON.parse(raw) as AuthState;

    if (
      state.expiresAt &&
      new Date(state.expiresAt).getTime() <= Date.now()
    ) {
      localStorage.removeItem(AUTH_STATE_KEY);
      localStorage.removeItem(AUTH_TOKEN_KEY);
      return emptyState;
    }

    return state;
  } catch {
    localStorage.removeItem(AUTH_STATE_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    return emptyState;
  }
}

type AuthContextValue = AuthState & {
  isAuthenticated: boolean;
  loginAsPlatform: (
    username: string,
    password: string,
  ) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(readStoredState);

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_STATE_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    setState(emptyState);
  }, []);

  const loginAsPlatform = useCallback(
    async (username: string, password: string) => {
      const result = await platformLogin({ username, password });

      const next: AuthState = {
        accessToken: result.accessToken,
        scope: result.scope,
        platformUser: result.platformUser,
        expiresAt: result.expiresAt,
      };

      localStorage.setItem(AUTH_TOKEN_KEY, result.accessToken);
      localStorage.setItem(AUTH_STATE_KEY, JSON.stringify(next));
      setState(next);
    },
    [],
  );

  useEffect(() => {
    const handleUnauthorized = () => logout();

    window.addEventListener(
      AUTH_UNAUTHORIZED_EVENT,
      handleUnauthorized,
    );

    return () => {
      window.removeEventListener(
        AUTH_UNAUTHORIZED_EVENT,
        handleUnauthorized,
      );
    };
  }, [logout]);

  useEffect(() => {
    if (!state.expiresAt) return;

    const expiresIn = new Date(state.expiresAt).getTime() - Date.now();

    if (expiresIn <= 0) {
      logout();
      return;
    }

    const timer = window.setTimeout(logout, expiresIn);

    return () => window.clearTimeout(timer);
  }, [state.expiresAt, logout]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      isAuthenticated: Boolean(
        state.accessToken && state.scope === 'PLATFORM',
      ),
      loginAsPlatform,
      logout,
    }),
    [state, loginAsPlatform, logout],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return value;
}
