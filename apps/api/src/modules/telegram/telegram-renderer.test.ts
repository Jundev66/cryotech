import { describe, expect, it } from 'vitest';
import { splitMessage, toTelegramHtml } from './telegram-renderer';

describe('toTelegramHtml', () => {
  it('turns WhatsApp bold and italics into HTML', () => {
    expect(toTelegramHtml('*Resumen* de hoy\n_Por ejemplo 1.250,50 o 20$_')).toBe(
      '<b>Resumen</b> de hoy\n<i>Por ejemplo 1.250,50 o 20$</i>',
    );
  });

  it('leaves underscores inside words alone', () => {
    expect(toTelegramHtml('categoría owner_draw del cliente ZZ_QE_x')).toBe(
      'categoría owner_draw del cliente ZZ_QE_x',
    );
  });

  it('escapes what Telegram would read as markup', () => {
    expect(toTelegramHtml('Pollos & Cía <mayor>')).toBe('Pollos &amp; Cía &lt;mayor&gt;');
  });

  it('keeps italics next to punctuation', () => {
    expect(toTelegramHtml('(_sin cuenta_), listo')).toBe('(<i>sin cuenta</i>), listo');
  });
});

describe('splitMessage', () => {
  it('leaves a short message whole', () => {
    expect(splitMessage('hola\nmundo', 50)).toEqual(['hola\nmundo']);
  });

  it('splits on line breaks without losing any line', () => {
    const lines = Array.from({ length: 10 }, (_, index) => `línea ${index} ${'x'.repeat(20)}`);
    const chunks = splitMessage(lines.join('\n'), 80);
    expect(chunks.every((chunk) => chunk.length <= 80)).toBe(true);
    expect(chunks.join('\n')).toBe(lines.join('\n'));
  });

  it('cuts a single line that is longer than the limit', () => {
    const chunks = splitMessage('y'.repeat(25), 10);
    expect(chunks).toEqual(['y'.repeat(10), 'y'.repeat(10), 'y'.repeat(5)]);
  });
});
