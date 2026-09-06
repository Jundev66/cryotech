---
name: tailwind-shadcn-patterns
description: Tailwind CSS v4 + Shadcn/UI patterns. CSS-first configuration, design tokens, component usage, dark mode, responsive design. Use when styling components or configuring the design system.
---

# Tailwind CSS v4 + Shadcn/UI Patterns

> Design system for CryoTech.

## Tailwind v4 Architecture

| v3 (Legacy) | v4 (Current) |
|-------------|--------------|
| `tailwind.config.js` | CSS-based `@theme` directive |
| PostCSS plugin | Oxide engine (10x faster) |
| JIT mode | Native, always-on |
| `@apply` directive | Still works, discouraged |

## Theme Configuration

```css
/* src/styles/globals.css */
@import "tailwindcss";

@theme {
  /* Colors — semantic */
  --color-primary: oklch(0.55 0.15 145);       /* Green — avícola */
  --color-primary-foreground: oklch(0.98 0 0);
  --color-surface: oklch(0.98 0 0);
  --color-surface-dark: oklch(0.12 0 0);

  /* Spacing */
  --spacing-xs: 0.25rem;
  --spacing-sm: 0.5rem;
  --spacing-md: 1rem;
  --spacing-lg: 2rem;
  --spacing-xl: 3rem;

  /* Typography */
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  /* Border radius */
  --radius-sm: 0.375rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;
}
```

## Shadcn/UI Usage

### Installation

```bash
npx shadcn@latest init
npx shadcn@latest add button input card table form select
```

### Component Usage

```typescript
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
```

### Customization

Customize Shadcn components through:
1. **CSS variables** in `globals.css` — colors, radius, spacing
2. **`cn()` utility** — merge class names conditionally
3. **Variants** — extend with `cva()` for custom variants

```typescript
import { cn } from '@/lib/utils';

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2 py-1 text-xs font-medium',
      status === 'breeding' && 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
      status === 'for_sale' && 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
      status === 'finished' && 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
    )}>
      {status}
    </span>
  );
}
```

## Responsive Design

| Prefix | Min Width | Target |
|--------|-----------|--------|
| (none) | 0px | Mobile-first base |
| `sm:` | 640px | Large phone |
| `md:` | 768px | Tablet |
| `lg:` | 1024px | Laptop |
| `xl:` | 1280px | Desktop |

### Mobile-First Pattern

```html
<!-- Mobile: stack, Tablet: 2 cols, Desktop: 3 cols -->
<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
  ...
</div>
```

## Dark Mode

Strategy: `class` (toggle via Shadcn theme switcher)

```typescript
// src/components/layout/theme-toggle.tsx
'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const { setTheme, theme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 dark:rotate-0 dark:scale-100" />
    </Button>
  );
}
```

## Layout Patterns

### Dashboard Layout

```html
<!-- Sidebar + Main content -->
<div class="flex min-h-screen">
  <aside class="hidden w-64 border-r lg:block">...</aside>
  <main class="flex-1 p-6">...</main>
</div>
```

### Card Grid

```html
<!-- Auto-fit responsive grid -->
<div class="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
  <Card>...</Card>
</div>
```

### Metric Cards

```html
<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
  <Card>
    <CardHeader class="pb-2">
      <CardTitle class="text-sm font-medium text-muted-foreground">FCR</CardTitle>
    </CardHeader>
    <CardContent>
      <div class="text-2xl font-bold">1.72</div>
      <p class="text-xs text-muted-foreground">-0.05 vs semana anterior</p>
    </CardContent>
  </Card>
</div>
```

## Animation & Transitions

| Pattern | Classes |
|---------|---------|
| Hover effect | `transition-colors hover:bg-accent` |
| Scale on hover | `transition-transform hover:scale-105` |
| Fade in | `animate-in fade-in` |
| Slide in | `animate-in slide-in-from-bottom-4` |

## Anti-Patterns

| Don't | Do |
|-------|-----|
| Arbitrary values everywhere | Use design system scale |
| `!important` | Fix specificity |
| Inline `style=` | Use utilities |
| Heavy `@apply` | Prefer React components |
| Mix v3 config with v4 | Full CSS-first |
| Multiple accent colors | One primary, use semantics |

> **Remember:** Tailwind v4 is CSS-first. Embrace `@theme`, CSS variables, and Shadcn/UI for consistency.
