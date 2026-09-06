import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Permissions } from '@cryotech/shared-types';
import { companiesApi, type CompanyWithRole } from '@/api/companies.api';
import { rolesApi } from '@/api/roles.api';
import { membersApi } from '@/api/members.api';
import { useAuth } from './auth-provider';

interface CompanyContextType {
  company: CompanyWithRole | null;
  companies: CompanyWithRole[];
  permissions: Partial<Permissions>;
  isOwner: boolean;
  switchCompany: (companyId: string) => void;
  loading: boolean;
}

const CompanyContext = createContext<CompanyContextType>({
  company: null,
  companies: [],
  permissions: {},
  isOwner: false,
  switchCompany: () => {},
  loading: true,
});

export function useCompany() {
  return useContext(CompanyContext);
}

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [company, setCompany] = useState<CompanyWithRole | null>(null);
  const [companies, setCompanies] = useState<CompanyWithRole[]>([]);
  const [permissions, setPermissions] = useState<Partial<Permissions>>({});
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadCompanies = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    try {
      const list = await companiesApi.findAll();
      setCompanies(list);
      if (list.length === 0) { setLoading(false); return; }

      const savedId = localStorage.getItem('cryotech_company_id');
      const active = list.find(c => c.id === savedId) || list[0];
      setCompany(active);
      setIsOwner(active.isOwner ?? active.ownerId === user.id);
      localStorage.setItem('cryotech_company_id', active.id);

      // Load permissions from member's role
      try {
        const members = await membersApi.findAll(active.id);
        const me = members.find(m => m.userId === user.id);
        if (me?.roleId) {
          const roles = await rolesApi.findAll(active.id);
          const myRole = roles.find(r => r.id === me.roleId);
          if (myRole) setPermissions(myRole.permissions);
        }
      } catch { /* permissions will be empty - owner has all access */ }
    } catch { /* no companies */ }
    setLoading(false);
  }, [user]);

  useEffect(() => { loadCompanies(); }, [loadCompanies]);

  const switchCompany = useCallback(async (companyId: string) => {
    const selected = companies.find(c => c.id === companyId);
    if (!selected || !user) return;
    setCompany(selected);
    setIsOwner(selected.isOwner ?? selected.ownerId === user.id);
    localStorage.setItem('cryotech_company_id', companyId);

    // Drop the whole cache, do not invalidate it.
    //
    // Most query keys never mention the company ('sales', 'treasury/accounts'),
    // so after switching they kept resolving with the previous company's data:
    // sales, balances and clients of one company under the name of the other.
    // Logging out never had the problem because it reloads the page.
    //
    // `clear()` and not `invalidateQueries()`: invalidating leaves the stale
    // data on screen while it refetches, which is exactly what cannot happen.
    queryClient.clear();

    try {
      const members = await membersApi.findAll(companyId);
      const me = members.find(m => m.userId === user.id);
      if (me?.roleId) {
        const roles = await rolesApi.findAll(companyId);
        const myRole = roles.find(r => r.id === me.roleId);
        if (myRole) setPermissions(myRole.permissions);
      }
    } catch { /* permissions will be empty */ }
  }, [companies, user, queryClient]);

  return (
    <CompanyContext.Provider value={{ company, companies, permissions, isOwner, switchCompany, loading }}>
      {children}
    </CompanyContext.Provider>
  );
}
