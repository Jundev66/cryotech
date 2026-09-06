---
name: react-frontend
description: React 19 patterns for the CryoTech SPA (Vite + react-router). TanStack Query over the axios API layer, forms with react-hook-form and shared Zod schemas, composition and state. Use when building UI components or managing client state.
---

# React Frontend Patterns

> React 19 + Vite SPA patterns for CryoTech.

**There is no Next.js here, and no server rendering.** Everything ships to the
browser: no Server Components, no Server Actions, no `"use client"` directive,
no `next/image`. The API is a separate NestJS service the SPA talks to over
HTTP. If a pattern you remember starts with "in the App Router…", it does not
apply.

## Where things live

```
apps/web/src/
├── api/                   # One module per resource + the axios client
│   ├── client.ts          # Injects Authorization and X-Company-Id, retries on 401
│   ├── batches.api.ts
│   └── sales.api.ts
├── pages/                 # One file per route, wired in App.tsx
├── components/
│   ├── ui/                # Shadcn/UI primitives
│   └── forms/             # Dialogs and forms shared across pages
├── hooks/                 # useDebouncedValue, useListSearch, usePermission, useTheme
├── providers/             # QueryClient, auth, theme
└── lib/                   # api-error.ts (apiMessage), utils
```

## The data path

Every read goes through the same three layers. Do not skip one.

```
pages/*.tsx  →  useQuery/useMutation  →  api/*.api.ts  →  api/client.ts → NestJS
```

`client.ts` already attaches the access token and the `X-Company-Id` header, and
refreshes the token on a 401. A component that builds its own `fetch` bypasses
all of that and will break the moment a token expires.

### API module

```typescript
// src/api/sales.api.ts
import type { Sale, SaleInput } from '@cryotech/shared-types';
import api from './client';

export const salesApi = {
  findAll: (params?: { batchId?: string; paymentStatus?: string; search?: string }) =>
    api.get<Sale[]>('/sales', { params }).then(r => r.data),
  create: (data: SaleInput) => api.post<Sale>('/sales', data).then(r => r.data),
  remove: (id: string) => api.delete(`/sales/${id}`).then(r => r.data),
};
```

Type the payload with the schema's type from `@cryotech/shared-types` — never
`any`. When the schema has `.default()` on a field, the caller may omit it, so
the payload type is `z.input`, not `z.infer`: see `ProcessingPayload`.

### Query and mutation

```typescript
const { data: sales, isLoading } = useQuery({
  queryKey: ['sales', { batchId }],
  queryFn: () => salesApi.findAll({ batchId }),
});

const createMutation = useMutation({
  mutationFn: salesApi.create,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['sales'] });
    toast.success('Venta registrada');
  },
  // `unknown`, not `any` — apiMessage takes unknown and digs out the API's message.
  onError: (error: unknown) => toast.error(apiMessage(error, 'No se pudo registrar')),
});
```

Put the filters in the `queryKey`. A key that ignores them serves one batch's
rows for another.

## Forms

`react-hook-form` + `zodResolver` over the **same schema the API validates
with**. One definition, both sides; a rule added to the schema takes effect on
the client and the server at once.

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { saleSchema } from '@cryotech/shared-types';

const form = useForm({
  resolver: zodResolver(saleSchema),
  defaultValues: { quantity: 0, weightKg: 0 },
});

<form onSubmit={form.handleSubmit(values => createMutation.mutate(values))}>
```

For a dynamic field name, type it as `FieldPath<T>` rather than casting.

## Permissions

Never hide a control by hand-checking a role. `usePermission` reads the same
module/action pairs the API's `PermissionGuard` enforces, so the button and the
endpoint agree.

```typescript
const canCreate = usePermission('sales', 'create');
{canCreate && <Button onClick={openDialog}>Nueva venta</Button>}
```

Hiding a button is presentation, not authorization: the API still checks.

## Composition

```typescript
// Good: composable
<Card>
  <CardHeader><CardTitle>Lote #42</CardTitle></CardHeader>
  <CardContent><BatchMetrics batchId={batch.id} /></CardContent>
</Card>

// Bad: one component with a prop for every slot
<BatchCard title="Lote #42" metrics={...} actions={...} onEdit={...} />
```

## Anti-patterns

| Don't | Do |
|-------|-----|
| `useEffect` for data fetching | TanStack Query |
| `fetch`/axios directly in a component | An `api/*.api.ts` module |
| `any` on props, payloads or `onError` | The shared type, or `unknown` |
| Filters missing from the `queryKey` | Include every filter that changes the result |
| Index as key | Stable unique `id` |
| `useState` for derived data | Compute during render |
| Props drilling 3+ levels | Composition or context |

## State

| Need | Solution |
|------|---------|
| Server data | TanStack Query |
| Form state | react-hook-form + `zodResolver` |
| UI state (dialogs, drawers) | `useState`, local |
| Theme | `useTheme` |
| URL state | `useSearchParams` from `react-router` |

> **Remember:** the SPA owns no truth. Everything it shows came from the API and
> belongs to a company; the `queryKey` and the `X-Company-Id` header are what
> keep one company's data from showing up under another.
