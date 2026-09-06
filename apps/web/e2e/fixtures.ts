import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';
import type { E2EFixture } from './global-setup';

const HERE = dirname(fileURLToPath(import.meta.url));

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3011/api';

/** What `globalSetup` built: the throwaway company and its starting records. */
export function fixture(): E2EFixture {
  return JSON.parse(readFileSync(join(HERE, '.auth', 'fixture.json'), 'utf8'));
}

/**
 * Reads the books straight from the API.
 *
 * Only ever to **verify**, never to act — everything a user does has to go
 * through the screen, or the test stops testing the screen. But asserting "one
 * expense was recognised, not two" against a table that paginates and rounds is
 * how a test passes while the ledger is wrong.
 */
export async function readApi<T>(path: string): Promise<T> {
  const data = fixture();
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${data.accessToken}`,
      'X-Company-Id': data.companyId,
    },
  });
  if (!response.ok) {
    throw new Error(`GET ${path} respondió ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export interface ApiTransaction {
  id: string;
  code: string | null;
  type: 'income' | 'expense';
  category: string;
  amount: string;
  batchId: string | null;
  sourceType: string | null;
}

/** Every expense on the books right now, as numbers. */
export async function expenses(): Promise<Array<{ code: string | null; amount: number; category: string }>> {
  const all = await readApi<ApiTransaction[]>('/transactions');
  return all
    .filter((t) => t.type === 'expense')
    .map((t) => ({ code: t.code, amount: Number(t.amount), category: t.category }));
}

/**
 * Picks an option from a shadcn `Select` or from our `Combobox`.
 *
 * Both are Radix listboxes, not native `<select>`s, so `selectOption` does
 * nothing — the trigger has to be clicked and the option chosen by its text.
 *
 * The combobox filters on the server and only shows the first page of results,
 * so when its search box is present the label is typed in first. A `Select` has
 * no such box and skips that step, which is why every existing caller kept
 * working unchanged when the client picker became a combobox.
 */
export async function chooseOption(page: Page, testId: string, label: string | RegExp) {
  await page.getByTestId(testId).click();

  const search = page.getByTestId('combobox-search');
  if (typeof label === 'string' && (await search.isVisible().catch(() => false))) {
    await search.fill(label);
  }

  const option = page.getByRole('option', { name: label });
  await expect(option).toBeVisible();
  await option.click();
}

/**
 * Reads a bolivar or dollar figure off the screen as a number. The two
 * currencies group digits the other way round, so the last separator is the
 * decimal one.
 */
export function parseAmount(text: string): number {
  const cleaned = text.replace(/[^\d.,-]/g, '').trim();
  if (cleaned === '') return NaN;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  if (lastComma === -1 && lastDot === -1) return Number(cleaned);

  return lastComma > lastDot
    ? Number(cleaned.replace(/\./g, '').replace(',', '.'))
    : Number(cleaned.replace(/,/g, ''));
}

/**
 * Fails the test if the page shows an error instead of content.
 *
 * A screen that renders a toast saying "Error al cargar" still technically
 * loads, so a test that only checks the heading would pass on a broken page.
 */
export async function expectNoErrorState(page: Page) {
  await expect(page.getByText(/error al cargar|algo salió mal|unexpected error/i)).toHaveCount(0);
}
