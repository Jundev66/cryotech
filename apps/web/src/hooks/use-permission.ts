import { useCompany } from '@/providers/company-provider';

type Action = 'view' | 'create' | 'edit' | 'delete';

export function usePermission() {
  const { permissions, isOwner } = useCompany();

  function can(module: string, action: Action = 'view'): boolean {
    if (isOwner) return true;
    const mod = permissions[module as keyof typeof permissions];
    if (!mod) return false;
    return (mod as Record<string, boolean>)[action] === true;
  }

  function canAny(module: string): boolean {
    return can(module, 'view') || can(module, 'create') || can(module, 'edit') || can(module, 'delete');
  }

  return { can, canAny, isOwner };
}
