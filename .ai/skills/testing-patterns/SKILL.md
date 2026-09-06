---
name: testing-patterns
description: Testing patterns for CryoTech with Vitest, React Testing Library and Playwright. TDD workflow, test organization, mocking the axios API layer. Use when writing or planning tests.
---

# Testing Patterns

> Testing strategy for CryoTech — Vitest + RTL + Playwright.

## Test Pyramid

```
        /  E2E  \        Playwright — few, critical flows
       /----------\
      / Integration \    Vitest — hooks, API modules, services
     /----------------\
    /    Unit Tests     \  Vitest — schemas, utils, pure functions
   /--------------------\
```

## Setup

### Vitest Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/types/**', 'src/components/ui/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

### Test Setup

```typescript
// tests/setup.ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
```

## Unit Test Patterns

### Schema Validation

```typescript
// tests/unit/lib/schemas/batch.test.ts
import { describe, it, expect } from 'vitest';
import { batchSchema } from '@/lib/schemas/batch';

describe('batchSchema', () => {
  it('should validate a valid batch', () => {
    const result = batchSchema.safeParse({
      breed: 'Cobb 500',
      initialQuantity: 100,
      startDate: '2026-03-01',
    });
    expect(result.success).toBe(true);
  });

  it('should reject negative quantity', () => {
    const result = batchSchema.safeParse({
      breed: 'Cobb 500',
      initialQuantity: -1,
      startDate: '2026-03-01',
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty breed', () => {
    const result = batchSchema.safeParse({
      breed: '',
      initialQuantity: 100,
      startDate: '2026-03-01',
    });
    expect(result.success).toBe(false);
  });
});
```

### Utility Functions

```typescript
// tests/unit/lib/utils/metrics.test.ts
import { describe, it, expect } from 'vitest';
import { calculateFCR, calculateMortalityRate } from '@/lib/utils/metrics';

describe('calculateFCR', () => {
  it('returns correct FCR', () => {
    expect(calculateFCR(180, 100)).toBe(1.8);
  });

  it('returns 0 for zero weight gain', () => {
    expect(calculateFCR(180, 0)).toBe(0);
  });
});

describe('calculateMortalityRate', () => {
  it('returns percentage', () => {
    expect(calculateMortalityRate(5, 100)).toBe(5);
  });
});
```

## Component Test Patterns

```typescript
// tests/unit/components/batch-card.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { BatchCard } from '@/components/batches/batch-card';

const mockBatch = {
  id: '1',
  breed: 'Cobb 500',
  initial_quantity: 100,
  status: 'breeding' as const,
  start_date: '2026-03-01',
};

describe('BatchCard', () => {
  it('displays breed name', () => {
    render(<BatchCard batch={mockBatch} />);
    expect(screen.getByText('Cobb 500')).toBeInTheDocument();
  });

  it('displays quantity', () => {
    render(<BatchCard batch={mockBatch} />);
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('shows breeding status badge', () => {
    render(<BatchCard batch={mockBatch} />);
    expect(screen.getByText(/crianza/i)).toBeInTheDocument();
  });
});
```

## E2E Test Patterns (Playwright)

```typescript
// tests/e2e/auth.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('user can log in', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/');
  });

  test('shows error on invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[name="email"]', 'wrong@example.com');
    await page.fill('[name="password"]', 'wrong');
    await page.click('button[type="submit"]');
    await expect(page.locator('.text-destructive')).toBeVisible();
  });
});
```

## Mocking the API layer

There is no Supabase and no server client to stub. The SPA reaches the API
through `src/api/*.api.ts`, so that module is the seam: mock it and the axios
client, the interceptors and the network all stay out of the test.

```typescript
// tests/mocks/api.ts
import { vi } from 'vitest';

vi.mock('@/api/sales.api', () => ({
  salesApi: {
    findAll: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 'sale-1', code: 'SALE-0001' }),
    remove: vi.fn().mockResolvedValue(undefined),
  },
}));
```

Wrap anything using TanStack Query in a fresh `QueryClient` per test, with
retries off — otherwise a failing query retries and the test waits for nothing.

```typescript
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
```

On the API side, the pure logic is the cheapest to cover and the most worth
covering: `receipt-ocr/patterns.ts` (`parseAmount`, `parseDate`,
`parseAccountRef`) and the FCR and mortality maths in `reports.service.ts`. None
of them need a database.

## Key Testing Rules

1. **Test behavior, not implementation**
2. **One assertion per concept**
3. **Descriptive test names** — the name IS documentation
4. **Arrange-Act-Assert** structure
5. **Don't mock what you don't own** excessively
6. **Test edge cases** — empty states, max values, invalid input
