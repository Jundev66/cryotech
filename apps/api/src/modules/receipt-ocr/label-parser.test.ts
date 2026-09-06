import { describe, expect, it } from 'vitest';
import { missingCriticalFields, parseReceiptText } from './label-parser';

const TODAY = new Date(2026, 4, 22);

// A BDV transfer as Tesseract hands it over: one line per printed row, the
// headline amount sitting alone above the labelled ones.
const BDV_RECEIPT = `
Banco de Venezuela
Bs. 2.450,00
Operación: 058712349065
Fecha: 20/05/2026
Origen: 0102 **** 1234
Destino: 0102 **** 5678
Beneficiario: Ana Perez Gomez
Concepto: Pago de pollos
`;

describe('parseReceiptText', () => {
  const fields = parseReceiptText(BDV_RECEIPT, TODAY);

  it('reads the headline amount even though it carries no caption', () => {
    expect(fields.amount).toBe(2450);
    expect(fields.currency).toBe('VES');
  });

  it('reads the labelled fields', () => {
    expect(fields.date).toBe('2026-05-20');
    expect(fields.reference).toBe('058712349065');
    expect(fields.counterparty).toBe('Ana Perez Gomez');
    expect(fields.concept).toBe('Pago de pollos');
  });

  it('keeps origin and destination apart — that is what decides the direction', () => {
    expect(fields.originAccount).toMatchObject({ bankCode: '0102', last4: '1234' });
    expect(fields.destinationAccount).toMatchObject({ bankCode: '0102', last4: '5678' });
  });

  it('names the bank from the account code', () => {
    expect(fields.bankName).toBe('Banco de Venezuela');
  });

  it('takes the value from the next line when the caption stands alone', () => {
    const split = parseReceiptText('Referencia:\n058712349065\nFecha:\n20/05/2026', TODAY);
    expect(split.reference).toBe('058712349065');
    expect(split.date).toBe('2026-05-20');
  });

  it('leaves a field empty rather than guessing at an unknown caption', () => {
    // An empty field gets asked about; a wrong one gets confirmed without
    // looking. That asymmetry is the whole design of this parser.
    const unknown = parseReceiptText('Clave de rastreo: 99887766\nMonto: Bs. 100,00', TODAY);
    expect(unknown.amount).toBe(100);
    expect(unknown.reference).toBeNull();
  });

  it('returns everything null for text that is not a receipt', () => {
    const nothing = parseReceiptText('hola, buenas tardes', TODAY);
    expect(nothing.amount).toBeNull();
    expect(nothing.reference).toBeNull();
    expect(nothing.date).toBeNull();
  });
});

describe('missingCriticalFields', () => {
  it('is empty for a receipt that can be registered', () => {
    expect(missingCriticalFields(parseReceiptText(BDV_RECEIPT, TODAY))).toEqual([]);
  });

  it('names what is missing so the escalation knows what to look for', () => {
    const missing = missingCriticalFields(parseReceiptText('Monto: Bs. 100,00', TODAY));
    expect(missing).toContain('reference');
    expect(missing).toContain('date');
    expect(missing).toContain('account');
    expect(missing).not.toContain('amount');
  });

  it('counts one account as enough — a receipt rarely prints both', () => {
    const oneSided = parseReceiptText(
      'Monto: Bs. 100,00\nOperación: 058712349065\nFecha: 20/05/2026\nDestino: 0102 **** 5678',
      TODAY,
    );
    expect(missingCriticalFields(oneSided)).toEqual([]);
  });
});
