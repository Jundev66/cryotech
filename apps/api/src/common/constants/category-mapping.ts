import type { TransactionCategory } from '@prisma/client';

/**
 * Product category slug -> accounting category.
 *
 * This mapping was duplicated as inline literals in entries.service.ts,
 * batches.service.ts and feed.service.ts, so adding a category meant finding
 * three places and usually missing one. Anything unmapped falls to `other`
 * rather than guessing.
 */
export const CATEGORY_SLUG_TO_TRANSACTION: Record<string, TransactionCategory> = {
  feed: 'feed',
  vaccine: 'vaccine',
  // Day-old chicks. This used to map to `other` for want of an enum value, so
  // the second largest expense on the books had no line of its own.
  chicks: 'chicks',
};

export function transactionCategoryForSlug(slug: string | null | undefined): TransactionCategory {
  return CATEGORY_SLUG_TO_TRANSACTION[slug ?? ''] ?? 'other';
}

/** Slug used for the day-old chicks product, seeded per company. */
export const CHICKS_CATEGORY_SLUG = 'chicks';
export const CHICKS_PRODUCT_NAME = 'Pollos Bebé';
