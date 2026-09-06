---
name: pwa-offline
description: PWA offline-first patterns for the CryoTech SPA (Vite). Service workers, TanStack Query persistence, sync queues and optimistic mutations. Not implemented yet — this is the design. Use when implementing offline support or PWA features.
---

# PWA Offline-First Patterns

> Offline-first architecture for CryoTech — registrar datos sin señal en el galpón.

## Why Offline-First

Los productores avícolas trabajan en galpones con señal de internet débil o inexistente. Deben poder:
- Registrar peso, mortalidad y consumo de alimento sin conexión
- Ver datos del lote actual sin conexión
- Sincronizar automáticamente al recuperar conexión

## Stack

| Tool | Purpose |
|------|---------|
| **vite-plugin-pwa** | Service Worker + precaching |
| **TanStack Query** | Data caching + persistence |
| **IndexedDB (idb)** | Persistent offline storage |

> **Nada de esto está implementado todavía.** Hoy la web necesita conexión: no
> hay service worker, ni manifest, ni persistencia de las queries. Este
> documento es el plan, y hay que leerlo como tal.

## Service Worker Setup

```typescript
// vite.config.ts — vite-plugin-pwa, no next-pwa: aquí no hay Next.
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,            // se sirve public/manifest.json
      workbox: {
        // La API vive en otro origen: nunca cachear /api, que devolvería
        // saldos viejos como si fueran buenos. Solo el shell de la app.
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [],
      },
    }),
  ],
});
```

## PWA Manifest

```json
// public/manifest.json
{
  "name": "CryoTech",
  "short_name": "CryoTech",
  "description": "Gestión avícola inteligente",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#16a34a",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

## TanStack Query Persistence

```typescript
// src/lib/query-client.ts
import { QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { persistQueryClient } from '@tanstack/react-query-persist-client';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,  // 5 minutes
      gcTime: 1000 * 60 * 60 * 24, // 24 hours
    },
  },
});

// Persist to localStorage
if (typeof window !== 'undefined') {
  const persister = createSyncStoragePersister({
    storage: window.localStorage,
  });

  persistQueryClient({
    queryClient,
    persister,
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
  });
}
```

## Optimistic Mutations

```typescript
// src/hooks/use-create-daily-log.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dailyLogsApi } from '@/api/daily-logs.api';
import type { DailyLogInput } from '@cryotech/shared-types';

export function useCreateDailyLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (log: DailyLogInput) => dailyLogsApi.create(log),
    // Optimistic update
    onMutate: async (newLog) => {
      await queryClient.cancelQueries({ queryKey: ['daily-logs', newLog.batch_id] });
      const previous = queryClient.getQueryData(['daily-logs', newLog.batch_id]);
      queryClient.setQueryData(['daily-logs', newLog.batch_id], (old: any) => [
        ...(old || []),
        { ...newLog, id: 'temp-' + Date.now(), created_at: new Date().toISOString() },
      ]);
      return { previous };
    },
    onError: (_err, newLog, context) => {
      // Rollback on error
      queryClient.setQueryData(['daily-logs', newLog.batch_id], context?.previous);
    },
    onSettled: (_data, _err, newLog) => {
      queryClient.invalidateQueries({ queryKey: ['daily-logs', newLog.batch_id] });
    },
  });
}
```

## Offline Sync Queue

```typescript
// src/lib/offline/sync-queue.ts
import { openDB } from 'idb';

const DB_NAME = 'cryotech-offline';
const STORE_NAME = 'pending-mutations';

async function getDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
    },
  });
}

export async function addToQueue(mutation: {
  table: string;
  operation: 'insert' | 'update' | 'delete';
  data: Record<string, unknown>;
}) {
  const db = await getDB();
  await db.add(STORE_NAME, { ...mutation, createdAt: Date.now() });
}

export async function processQueue() {
  const db = await getDB();
  const pending = await db.getAll(STORE_NAME);

  // En orden y parando al primer fallo: las operaciones dependen unas de otras
  // —un cobro necesita su venta— y reintentar salteado descuadra el libro.
  for (const mutation of pending) {
    try {
      await api.request({
        method: mutation.method,
        url: mutation.url,
        data: mutation.data,
      });
      await db.delete(STORE_NAME, mutation.id);
    } catch {
      // Will retry next time
      break;
    }
  }
}
```

## Online/Offline Indicator

```typescript
// src/components/layout/online-status.tsx
'use client';

import { useEffect, useState } from 'react';

export function OnlineStatus() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 rounded-lg bg-yellow-100 px-3 py-2 text-sm text-yellow-800 shadow-md dark:bg-yellow-900 dark:text-yellow-200">
      Sin conexion — los datos se guardaran localmente
    </div>
  );
}
```

## Key Rules

1. **Cache-first** for reads — show stale data, refresh in background
2. **Optimistic mutations** — update UI immediately, sync later
3. **Queue failed writes** — persist in IndexedDB, process when online
4. **Visual feedback** — always show online/offline status
5. **Conflict resolution** — server wins (last-write-wins for simplicity)
6. **Test offline** — Chrome DevTools > Network > Offline
