import { BREED_STANDARDS } from '../constants';

/** Two decimals, which is what money and every ratio here are reported to. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculateFCR(totalFeedKg: number, totalWeightGainKg: number): number | null {
  if (totalWeightGainKg <= 0) return null;
  return round2(totalFeedKg / totalWeightGainKg);
}

export function calculateMortalityRate(deaths: number, initialQuantity: number): number {
  if (initialQuantity <= 0) return 0;
  return Math.round((deaths / initialQuantity) * 10000) / 100;
}

export function calculateCostPerKg(totalExpenses: number, totalWeightKg: number): number | null {
  if (totalWeightKg <= 0) return null;
  return round2(totalExpenses / totalWeightKg);
}

/**
 * Cost of each bird still in the corral. Once it is empty the expenses are
 * spread over what the batch still counts, never over zero.
 */
export function calculateCostPerChicken(
  totalExpenses: number,
  inCorral: number,
  remainingQuantity: number,
): number {
  if (inCorral > 0) return round2(totalExpenses / inCorral);
  if (totalExpenses <= 0) return 0;
  return round2(totalExpenses / Math.max(remainingQuantity, 1));
}

export function calculateDailyGain(currentWeightG: number, previousWeightG: number): number {
  return round2(currentWeightG - previousWeightG);
}

export function getBreedStandardWeight(breed: string, weekNumber: number): number | null {
  const standards = BREED_STANDARDS[breed];
  if (!standards) return null;
  return standards[weekNumber] ?? null;
}

export function getBatchAgeInDays(startDate: string): number {
  const start = new Date(startDate);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function getBatchWeek(startDate: string): number {
  return Math.ceil(getBatchAgeInDays(startDate) / 7) || 1;
}

export function calculateAutoFeedConsumption(
  dailyFeedPerBirdG: number,
  currentQuantity: number
): number {
  return Math.round((dailyFeedPerBirdG * currentQuantity) / 1000 * 1000) / 1000;
}

/**
 * Format amount in Bolivares: "Bs 1.000,00"
 * Venezuelan format: dot as thousands separator, comma as decimal separator
 */
export function formatCurrency(amount: number): string {
  const formatted = new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `Bs ${formatted}`;
}

/**
 * Format amount in USD: "$1,000.00"
 */
export function formatUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatNumber(num: number, decimals = 0): string {
  return new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

export function formatWeight(grams: number): string {
  if (grams >= 1000) {
    return `${formatNumber(grams / 1000, 2)} kg`;
  }
  return `${formatNumber(grams, 0)} g`;
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return '-';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('es-VE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
