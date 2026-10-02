import { describe, it, expect } from 'vitest';
import { parseUserMessage } from './assistant-parser';

describe('Assistant Parser (Mobile Offline NLP)', () => {
  it('parses mortality and feed consumption', () => {
    const res = parseUserMessage('Murieron 5 hoy y comieron 65 kg de alimento');
    expect(res.intent).toBe('daily_log');
    expect(res.data.mortality).toBe(5);
    expect(res.data.feedConsumedKg).toBe(65);
  });

  it('parses zero mortality', () => {
    const res = parseUserMessage('Sin bajas hoy, comieron 50 kg');
    expect(res.intent).toBe('daily_log');
    expect(res.data.mortality).toBe(0);
    expect(res.data.feedConsumedKg).toBe(50);
  });

  it('parses weight along with mortality', () => {
    const res = parseUserMessage('Bajas 3, peso promedio 1.95');
    expect(res.intent).toBe('daily_log');
    expect(res.data.mortality).toBe(3);
    expect(res.data.averageWeightG).toBe(1950);
  });

  it('parses sale of chickens in pie', () => {
    const res = parseUserMessage('Vendí 80 pollos en pie a Carlos 190kg a 4.2 el kilo');
    expect(res.intent).toBe('sale');
    expect(res.data.saleType).toBe('live');
    expect(res.data.quantity).toBe(80);
    expect(res.data.weightKg).toBe(190);
    expect(res.data.pricePerKg).toBe(4.2);
    expect((res.data.clientName as string)?.toLowerCase()).toContain('carlos');
  });

  it('parses single chicken sale with decimal comma (e.g. un pollo de 2,7 a mercedez)', () => {
    const res = parseUserMessage('Vendí un pollo de 2,7 a mercedez');
    expect(res.intent).toBe('sale');
    expect(res.data.quantity).toBe(1);
    expect(res.data.weightKg).toBe(2.7);
    expect((res.data.clientName as string)?.toLowerCase()).toContain('mercedez');
  });

  it('parses charging a chicken as paid sale (e.g. cobrar el pollo de mercedez de 2,7)', () => {
    const res = parseUserMessage('Cobrar el pollo de mercedez de 2,7');
    expect(res.intent).toBe('sale');
    expect(res.data.quantity).toBe(1);
    expect(res.data.weightKg).toBe(2.7);
    expect(res.data.paymentStatus).toBe('paid');
  });

  it('parses sale of beneficiado chickens with credit/pending', () => {
    const res = parseUserMessage('Venta de 45 pollos beneficiados fiado a Pedro peso 105kg');
    expect(res.intent).toBe('sale');
    expect(res.data.saleType).toBe('dead');
    expect(res.data.paymentStatus).toBe('pending');
    expect(res.data.quantity).toBe(45);
    expect(res.data.weightKg).toBe(105);
  });

  it('parses payment / collections in USD and Bs', () => {
    const res1 = parseUserMessage('Cobré 250$ de Pedro');
    expect(res1.intent).toBe('payment');
    expect(res1.data.amount).toBe(250);
    expect(res1.data.currency).toBe('USD');

    const res2 = parseUserMessage('Abono de 1500 bs de Carlos');
    expect(res2.intent).toBe('payment');
    expect(res2.data.amountBs).toBe(1500);
    expect(res2.data.currency).toBe('VES');
  });

  it('parses client-first phrasing like "mercedez tiene un pollo de 2,7"', () => {
    const res = parseUserMessage('mercedez tiene un pollo de 2,7');
    expect(res.intent).toBe('sale');
    expect(res.data.quantity).toBe(1);
    expect(res.data.weightKg).toBe(2.7);
    expect((res.data.clientName as string)?.toLowerCase()).toContain('mercedez');
  });

  it('handles scale 3 decimals in mobile parser (e.g. 2.700 -> 2.7 kg)', () => {
    const res = parseUserMessage('abuela maria se llevo 1 pollo de 2.700 kg');
    expect(res.intent).toBe('sale');
    expect(res.data.quantity).toBe(1);
    expect(res.data.weightKg).toBe(2.7);
  });

  it('parses various zero mortality phrases (sin novedad, cero bajas, murieron 0)', () => {
    const r1 = parseUserMessage('sin novedad hoy en el galpon');
    expect(r1.intent).toBe('daily_log');
    expect(r1.data.mortality).toBe(0);

    const r2 = parseUserMessage('cero bajas hoy comieron 45kg');
    expect(r2.intent).toBe('daily_log');
    expect(r2.data.mortality).toBe(0);
    expect(r2.data.feedConsumedKg).toBe(45);

    const r3 = parseUserMessage('murieron 0 hoy');
    expect(r3.intent).toBe('daily_log');
    expect(r3.data.mortality).toBe(0);
  });

  it('handles unknown phrases gracefully', () => {
    const res = parseUserMessage('Hola buenos días cómo estás');
    expect(res.intent).toBe('unknown');
    expect(res.confidence).toBe(0);
  });
});
