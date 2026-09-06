---
name: testing-patterns
description: Testing patterns for CryoTech — Vitest for pure logic, the check-* scripts for integration, Playwright for the browser. Use when writing or planning tests.
---

# Testing Patterns

> What this project actually runs, not what a generic checklist would ask for.

There is **no React Testing Library, no MSW and no `tests/` directory** here.
Tests live next to the code they cover, and the integration layer is a set of
hand-written scripts rather than a runner. If a pattern you remember starts with
"render the component and…", check first whether the tooling for it exists.

## The three layers

| Layer | Where | Runs |
|---|---|---|
| **Unit** — pure functions | `*.test.ts` next to the source | `pnpm test` (Vitest), on every PR |
| **Integration** — real API, real database | `apps/api/scripts/check-*.ts` | `scripts/check-api.sh`, in CI |
| **E2E** — real browser | `apps/web/e2e/*.spec.ts` | `pnpm e2e` (Playwright), in CI |

The suffix matters: **`.test.ts` is Vitest, `.spec.ts` is Playwright**. The root
`vitest.config.ts` only matches `.test.ts`, and its environment is `node` — there
is no jsdom, so a `.tsx` component test would need config changes first.

## Unit: what belongs here

Anything that needs no database and no browser. Today that is the receipt
parsers, the batch metrics, the date helpers, the fuzzy client search and the
enum narrowing — see `apps/api/src/modules/receipt-ocr/patterns.test.ts` and
`packages/shared-types/src/utils/metrics.test.ts` for the house style.

```typescript
import { describe, expect, it } from 'vitest';
import { calculateFCR } from './metrics';

describe('calculateFCR', () => {
  it('is feed over weight gained, to two decimals', () => {
    expect(calculateFCR(180, 100)).toBe(1.8);
  });

  it('returns null instead of dividing by zero', () => {
    // A batch with no weight recorded has no FCR. Reporting 0 would read as a
    // perfect conversion, which is the opposite of "we do not know".
    expect(calculateFCR(100, 0)).toBeNull();
  });
});
```

Note the signature: `calculateFCR(totalFeedKg, totalWeightGainKg)` is positional
and returns `number | null`, not an object and not `0`.

**The cheapest untested ground is the Zod schemas** in `packages/shared-types` —
33 objects, two `.refine()` cross-field rules and nine `.default()`s, none
exercised. They are pure, they are the contract between the API and the SPA, and
they already fall inside the Vitest include glob.

## Integration: the `check-*` scripts

Fourteen scripts under `apps/api/scripts/` that boot the real Nest context and
talk to the real Postgres. They are not a test-runner suite; each declares its
own `check(label, ok, detail)` helper, prints `  ok` / `  FAIL` lines, and
`scripts/check-api.sh` counts them by grepping stdout.

Two rules that were expensive to learn and are not negotiable:

1. **Never against the real company.** Every suite resolves or creates
   `ZZ Empresa de Pruebas` through `scripts/lib/test-company.ts`. Running them
   against the real books once advanced the sale numbering fifty numbers and
   threw the processed-bird inventory out.
2. **Clean up in a `finally`.** Each script tracks the ids it created and deletes
   them. `pnpm e2e:clean` is the garbage collector for whatever a crash leaves.

Ordering inside `check-api.sh` is deliberate — `check-tenancy` runs first,
because if isolation between companies is broken, everything measured afterwards
may be reading contaminated data. Do not reorder the array to parallelise.

## E2E: Playwright

Read `apps/web/e2e/README.md` first; it is the real specification. The three
rules that shape every spec:

- **Act through the screen, verify through the API.** Everything the user does
  goes through the browser; the result is checked with `readApi()`. Asserting
  "one expense was recognised, not two" against a table that paginates and rounds
  is how a test passes while the ledger is wrong.
- **`data-testid` for what you touch, visible text or role for what you verify.**
  A copy change that breaks a user breaks the test; a layout change does not.
- **Wait for something to disappear, not to appear.** Several strings are already
  on the filter tabs, so waiting for them goes green before the server does
  anything.

Radix `Select` is a listbox, not a native `<select>`: `selectOption` is a no-op
on it. Use `chooseOption()` from `e2e/fixtures.ts`.

The suite is serial and shares one company per run (`workers: 1`), so a spec that
asserts a global count will break the day another spec writes a similar row.
Scope assertions to the record under test — look one up by its code, as
`sales.spec.ts` does with `saleCode()`.

## Key rules

1. Test behaviour, not implementation
2. The test name is the documentation — write it as a sentence
3. Test the edges: empty, zero, the maximum, the invalid input
4. Do not add a conditional `test.skip()` to dodge a missing precondition — if
   the precondition should hold, assert it; a skip turns a regression green
