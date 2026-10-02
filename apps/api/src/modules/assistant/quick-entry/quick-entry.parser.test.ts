import { describe, expect, it } from 'vitest';
import { parseQuickEntry } from './quick-entry.parser';

const TODAY = '2026-09-12';

describe('parseQuickEntry', () => {
  it('reads an expense in dollars with its category', () => {
    expect(parseQuickEntry('gasto 20$ gasoil', TODAY)).toEqual({
      kind: 'expense',
      seed: {
        amount: '20',
        currency: 'USD',
        category: 'transport',
        description: 'Gasoil',
        expense_date: TODAY,
      },
    });
  });

  it('reads bolivares written the Venezuelan way', () => {
    expect(parseQuickEntry('Gasté 1.500 bs de luz', TODAY)).toEqual({
      kind: 'expense',
      seed: {
        amount: '1500',
        currency: 'VES',
        category: 'utility',
        description: 'Luz',
        expense_date: TODAY,
      },
    });
  });

  it('understands "ayer" and a currency written before the number', () => {
    const entry = parseQuickEntry('gasto ayer bs 30 flete', TODAY);
    expect(entry?.seed).toMatchObject({
      amount: '30',
      currency: 'VES',
      category: 'transport',
      expense_date: '2026-09-11',
    });
  });

  it('opens the plain expense wizard when only the verb is typed', () => {
    expect(parseQuickEntry('gasto', TODAY)).toEqual({ kind: 'expense', seed: { expense_date: TODAY } });
  });

  it('leaves the currency to be asked when none is written', () => {
    const entry = parseQuickEntry('gasto 45 obreros', TODAY);
    expect(entry?.seed.currency).toBeUndefined();
    expect(entry?.seed.category).toBe('labor');
  });

  it('sends feed and chicks to the purchase wizard instead', () => {
    expect(parseQuickEntry('gasto 2 sacos de alimento', TODAY)).toEqual({ kind: 'entry', seed: {} });
  });

  it('reads a collection with the client after the amount', () => {
    expect(parseQuickEntry('cobré 100$ juan', TODAY)).toEqual({
      kind: 'collect',
      seed: { amount: '100', currency: 'USD', payment_date: TODAY },
      clientName: 'juan',
    });
  });

  it('reads a collection with the client before the verb', () => {
    expect(parseQuickEntry('Juan Pérez pagó 50 dólares en efectivo', TODAY)).toEqual({
      kind: 'collect',
      seed: { amount: '50', currency: 'USD', payment_date: TODAY },
      clientName: 'Juan Pérez',
    });
  });

  it('keeps decimals with a comma and ignores the payment method', () => {
    const entry = parseQuickEntry('cobre $25,50 pago movil a Pedro', TODAY);
    expect(entry?.seed.amount).toBe('25.5');
    expect(entry?.clientName).toBe('Pedro');
  });

  it('reads "mil" as thousands, with the currency after it', () => {
    expect(parseQuickEntry('gasto 20 mil bs flete', TODAY)?.seed).toMatchObject({
      amount: '20000',
      currency: 'VES',
      category: 'transport',
      description: 'Flete',
    });
    expect(parseQuickEntry('gasto 1,5mil bs luz', TODAY)?.seed.amount).toBe('1500');
  });

  it('reads sales with verb first, quantity, weight, and client', () => {
    const entry = parseQuickEntry('venta 1 pollo 2.7kg a mercedes', TODAY);
    expect(entry).toEqual({
      kind: 'sale',
      clientName: 'mercedes',
      seed: {
        quantity: '1',
        weight_kg: '2.7',
        sale_type: 'dead',
        sale_date: TODAY,
      },
    });
  });

  it('reads sales phrased with client first (e.g. "mercedez tiene un pollo de 2,7")', () => {
    const entry = parseQuickEntry('mercedez tiene un pollo de 2,7', TODAY);
    expect(entry).toEqual({
      kind: 'sale',
      clientName: 'mercedez',
      seed: {
        quantity: '1',
        weight_kg: '2.7',
        sale_type: 'dead',
        sale_date: TODAY,
      },
    });
  });

  it('handles scale 3 decimals properly (e.g. 2.700 -> 2.7 kg)', () => {
    const entry = parseQuickEntry('mercedes tiene un pollo de 2.700', TODAY);
    expect(entry?.seed.weight_kg).toBe('2.7');
  });

  it('reads multi-word cobrar variants (e.g. "cobrar 10$ a pedro")', () => {
    const entry = parseQuickEntry('cobrar 10$ a pedro', TODAY);
    expect(entry).toMatchObject({
      kind: 'collect',
      seed: {
        amount: '10',
        currency: 'USD',
      },
      clientName: 'pedro',
    });
  });

  it('reads sales with price per kg and client at the end', () => {
    const entry = parseQuickEntry('venta 2 pollos 5.4kg a 4$ juan', TODAY);
    expect(entry).toEqual({
      kind: 'sale',
      clientName: 'juan',
      seed: {
        quantity: '2',
        weight_kg: '5.4',
        price_per_kg: '4',
        sale_type: 'dead',
        sale_date: TODAY,
      },
    });
  });

  it('reads sales with "para", "el kilo", and live chickens yesterday', () => {
    const entry = parseQuickEntry('venta 5 pollos vivos ayer 12kg a 3.8$ para pedro', TODAY);
    expect(entry).toEqual({
      kind: 'sale',
      clientName: 'pedro',
      seed: {
        quantity: '5',
        weight_kg: '12',
        price_per_kg: '3.8',
        sale_type: 'live',
        sale_date: '2026-09-11',
      },
    });
  });

  it('reads sales with "se llevo"', () => {
    const entry = parseQuickEntry('carlos se llevo 3 pollos de 7.5kg', TODAY);
    expect(entry).toMatchObject({
      kind: 'sale',
      clientName: 'carlos',
      seed: {
        quantity: '3',
        weight_kg: '7.5',
      },
    });
  });

  it('does not open an expense for "pagué": it is usually a debt already on the books', () => {
    expect(parseQuickEntry('pagué 2.450 bs a Carmen', TODAY)).toBeNull();
  });

  it('ignores messages that are not an operation', () => {
    expect(parseQuickEntry('hola', TODAY)).toBeNull();
    expect(parseQuickEntry('juan pagó', TODAY)).toBeNull();
    expect(parseQuickEntry('cobrar', TODAY)).toBeNull();
  });
});
