import { create } from 'zustand';
import type { User, Company } from '@cryotech/shared-types';
import { storage } from '@/lib/native';
import api from '@/api/client';

interface AuthState {
  user: User | null;
  companies: Company[];
  activeCompanyId: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  init: () => Promise<void>;
  login: (accessToken: string, refreshToken: string, user?: User) => Promise<void>;
  selectCompany: (companyId: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  companies: [],
  activeCompanyId: null,
  isLoading: true,
  isAuthenticated: false,

  init: async () => {
    try {
      const token = (await storage.get('cryotech_access_token')) || localStorage.getItem('cryotech_access_token');
      if (!token) {
        set({ isLoading: false, isAuthenticated: false });
        return;
      }

      // Check cached profile for immediate startup
      const cachedUser = (await storage.get('cryotech_user_profile')) || localStorage.getItem('cryotech_user_profile');
      const cachedCompanies = (await storage.get('cryotech_companies')) || localStorage.getItem('cryotech_companies');
      const savedCompanyId = (await storage.get('cryotech_company_id')) || localStorage.getItem('cryotech_company_id');

      if (cachedUser) {
        try {
          const parsedUser = JSON.parse(cachedUser);
          const parsedCompanies = cachedCompanies ? JSON.parse(cachedCompanies) : [];
          const compList = Array.isArray(parsedCompanies) ? parsedCompanies : [];
          set({
            user: parsedUser,
            companies: compList,
            activeCompanyId: savedCompanyId || (compList[0]?.id ?? null),
            isAuthenticated: true,
            isLoading: false,
          });
        } catch {}
      }

      // Refresh profile and companies from API
      try {
        const [userRes, companiesRes] = await Promise.all([
          api.get<User>('/users/me'),
          api.get<Company[]>('/companies'),
        ]);

        const compList: Company[] = Array.isArray(companiesRes.data)
          ? companiesRes.data
          : Array.isArray((companiesRes.data as unknown as { data?: Company[] })?.data)
            ? (companiesRes.data as unknown as { data: Company[] }).data
            : [];

        const activeId =
          savedCompanyId && compList.some((c) => c.id === savedCompanyId)
            ? savedCompanyId
            : compList[0]?.id || null;

        if (activeId) {
          await storage.set('cryotech_company_id', activeId);
        }
        await storage.set('cryotech_user_profile', JSON.stringify(userRes.data));
        await storage.set('cryotech_companies', JSON.stringify(compList));

        set({
          user: userRes.data,
          companies: compList,
          activeCompanyId: activeId,
          isAuthenticated: true,
          isLoading: false,
        });
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 401) {
          await storage.remove('cryotech_access_token');
          await storage.remove('cryotech_refresh_token');
          await storage.remove('cryotech_company_id');
          await storage.remove('cryotech_user_profile');
          await storage.remove('cryotech_companies');
          set({ user: null, isAuthenticated: false, isLoading: false });
        } else {
          // Keep whatever cached state we have and proceed
          set({
            isAuthenticated: true,
            isLoading: false,
          });
        }
      }
    } catch {
      set({ isLoading: false });
    }
  },

  login: async (accessToken: string, refreshToken: string, initialUser?: User) => {
    await storage.set('cryotech_access_token', accessToken);
    await storage.set('cryotech_refresh_token', refreshToken);
    if (initialUser) {
      await storage.set('cryotech_user_profile', JSON.stringify(initialUser));
    }

    // Set authenticated state immediately so UI updates
    set({
      user: initialUser || null,
      isAuthenticated: true,
      isLoading: false,
    });

    // Fetch companies immediately using this token
    try {
      const companiesRes = await api.get<Company[]>('/companies', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const compList: Company[] = Array.isArray(companiesRes.data)
        ? companiesRes.data
        : Array.isArray((companiesRes.data as unknown as { data?: Company[] })?.data)
          ? (companiesRes.data as unknown as { data: Company[] }).data
          : [];

      const activeId = compList[0]?.id || null;
      if (activeId) {
        await storage.set('cryotech_company_id', activeId);
      }
      await storage.set('cryotech_companies', JSON.stringify(compList));

      set({
        companies: compList,
        activeCompanyId: activeId,
      });
    } catch (e) {
      console.warn('Could not fetch companies during login:', e);
    }
  },

  selectCompany: async (companyId: string) => {
    await storage.set('cryotech_company_id', companyId);
    set({ activeCompanyId: companyId });
  },

  logout: async () => {
    try {
      const refreshToken =
        (await storage.get('cryotech_refresh_token')) ||
        localStorage.getItem('cryotech_refresh_token');
      if (refreshToken) {
        await api.post('/auth/logout', { refreshToken });
      }
    } catch {}
    await storage.remove('cryotech_access_token');
    await storage.remove('cryotech_refresh_token');
    await storage.remove('cryotech_company_id');
    await storage.remove('cryotech_user_profile');
    await storage.remove('cryotech_companies');
    set({
      user: null,
      companies: [],
      activeCompanyId: null,
      isAuthenticated: false,
    });
    window.location.hash = '#/login';
  },
}));
