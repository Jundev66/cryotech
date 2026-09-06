import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { User } from '@cryotech/shared-types';
import { usersApi } from '@/api/users.api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  setUser: () => {},
  logout: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('cryotech_access_token');
    if (!token) {
      setLoading(false);
      return;
    }
    usersApi.getProfile()
      .then(setUser)
      .catch(() => {
        localStorage.removeItem('cryotech_access_token');
        localStorage.removeItem('cryotech_refresh_token');
      })
      .finally(() => setLoading(false));
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('cryotech_access_token');
    localStorage.removeItem('cryotech_refresh_token');
    localStorage.removeItem('cryotech_company_id');
    setUser(null);
    window.location.href = '/login';
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
