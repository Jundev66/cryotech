import { create } from 'zustand';
import { storage, getNetworkStatus, haptics } from '@/lib/native';
import api from '@/api/client';
import { toast } from 'sonner';

export interface PendingAction {
  id: string;
  type: 'daily_log' | 'sale' | 'payment' | 'entry';
  title: string;
  url: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  payload: Record<string, unknown>;
  createdAt: string;
}

interface SyncState {
  queue: PendingAction[];
  isOnline: boolean;
  isSyncing: boolean;
  init: () => Promise<void>;
  enqueue: (action: Omit<PendingAction, 'id' | 'createdAt'>) => Promise<void>;
  syncNow: () => Promise<void>;
  setOnline: (online: boolean) => void;
}

export const useSyncStore = create<SyncState>((set, get) => ({
  queue: [],
  isOnline: navigator.onLine,
  isSyncing: false,

  init: async () => {
    const raw = await storage.get('cryotech_offline_queue');
    if (raw) {
      try {
        set({ queue: JSON.parse(raw) });
      } catch {}
    }

    const online = await getNetworkStatus();
    set({ isOnline: online });

    window.addEventListener('online', () => {
      set({ isOnline: true });
      get().syncNow();
    });
    window.addEventListener('offline', () => {
      set({ isOnline: false });
    });
  },

  setOnline: (online) => set({ isOnline: online }),

  enqueue: async (action) => {
    const newAction: PendingAction = {
      ...action,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
    };
    const updated = [...get().queue, newAction];
    set({ queue: updated });
    await storage.set('cryotech_offline_queue', JSON.stringify(updated));
    await haptics.medium();

    // If online, try syncing right away
    if (get().isOnline) {
      get().syncNow();
    } else {
      toast.info('Guardado localmente. Se sincronizará al tener conexión.');
    }
  },

  syncNow: async () => {
    const { queue, isSyncing, isOnline } = get();
    if (isSyncing || !isOnline || queue.length === 0) return;

    set({ isSyncing: true });
    const remaining: PendingAction[] = [];

    for (const item of queue) {
      try {
        await api.request({
          url: item.url,
          method: item.method,
          data: item.payload,
        });
        toast.success(`Sincronizado: ${item.title}`);
      } catch {
        // Keep in queue if failed
        remaining.push(item);
      }
    }

    set({ queue: remaining, isSyncing: false });
    await storage.set('cryotech_offline_queue', JSON.stringify(remaining));
    if (remaining.length === 0) {
      await haptics.success();
    }
  },
}));
