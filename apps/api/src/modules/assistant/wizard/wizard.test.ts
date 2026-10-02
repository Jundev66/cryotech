import { describe, expect, it } from 'vitest';
import { NUMBER_WORDS } from './wizard.service';
import { rankByName, normalize } from '../../../common/search/fuzzy.util';
import { parseLocalNumber } from '../formatting/number.format';

describe('Wizard Logic & Validation QA Tests', () => {
  describe('NUMBER_WORDS recognition', () => {
    it('recognizes zero mortality phrases', () => {
      expect(NUMBER_WORDS['cero']).toBe(0);
      expect(NUMBER_WORDS['ningun']).toBe(0);
      expect(NUMBER_WORDS['ninguno']).toBe(0);
      expect(NUMBER_WORDS['ninguna']).toBe(0);
      expect(NUMBER_WORDS['nada']).toBe(0);
      expect(NUMBER_WORDS['sin bajas']).toBe(0);
      expect(NUMBER_WORDS['sin novedad']).toBe(0);
    });

    it('recognizes small numbers in letters', () => {
      expect(NUMBER_WORDS['un']).toBe(1);
      expect(NUMBER_WORDS['uno']).toBe(1);
      expect(NUMBER_WORDS['una']).toBe(1);
      expect(NUMBER_WORDS['dos']).toBe(2);
      expect(NUMBER_WORDS['tres']).toBe(3);
      expect(NUMBER_WORDS['diez']).toBe(10);
      expect(NUMBER_WORDS['quince']).toBe(15);
    });
  });

  describe('Scale 3-decimal & Unit Corrections', () => {
    function normalizeWizardNumber(stepKey: string, raw: string): number | null {
      const clean = raw.trim().toLowerCase();
      let value = NUMBER_WORDS[clean] ?? parseLocalNumber(raw);
      if (value === null || value < 0) return null;

      const digitsOnly = raw.trim().replace(/[^\d.]/g, '');
      if (
        (stepKey === 'weight_kg' || stepKey === 'feed_consumed_kg' || stepKey === 'price_per_kg') &&
        value >= 1000 &&
        /^\d+\.\d{3}$/.test(digitsOnly)
      ) {
        value = value / 1000;
      }

      if (stepKey === 'average_weight_g' && value > 0 && value < 20) {
        value = Math.round(value * 1000);
      }

      return value;
    }

    it('corrects 3-decimal scale weights from 2700 to 2.7', () => {
      expect(normalizeWizardNumber('weight_kg', '2.700')).toBe(2.7);
      expect(normalizeWizardNumber('weight_kg', '2.700 kg')).toBe(2.7);
      expect(normalizeWizardNumber('weight_kg', '2,7')).toBe(2.7);
      expect(normalizeWizardNumber('weight_kg', '2.7')).toBe(2.7);
    });

    it('corrects 3-decimal scale prices from 4000 to 4.0', () => {
      expect(normalizeWizardNumber('price_per_kg', '4.000')).toBe(4);
      expect(normalizeWizardNumber('price_per_kg', '4.250')).toBe(4.25);
      expect(normalizeWizardNumber('price_per_kg', '4.00')).toBe(4);
    });

    it('converts average weights entered in kilograms into grams', () => {
      expect(normalizeWizardNumber('average_weight_g', '2.4')).toBe(2400);
      expect(normalizeWizardNumber('average_weight_g', '2,7')).toBe(2700);
      expect(normalizeWizardNumber('average_weight_g', '2400')).toBe(2400);
    });

    it('understands word zero for mortality', () => {
      expect(normalizeWizardNumber('mortality', 'ninguna')).toBe(0);
      expect(normalizeWizardNumber('mortality', 'sin bajas')).toBe(0);
      expect(normalizeWizardNumber('mortality', 'cero')).toBe(0);
      expect(normalizeWizardNumber('mortality', '0')).toBe(0);
    });
  });

  describe('Fuzzy Client Name Matching in Wizard', () => {
    const clients = [
      { id: 'cli-mercedes', name: 'Mercedes' },
      { id: 'cli-abuela', name: 'Abuela María' },
      { id: 'cli-carlos', name: 'Carlos Pérez' },
      { id: 'cli-maria', name: 'María Rodríguez' },
    ];

    it('matches "mercedez" with "Mercedes" with high confidence', () => {
      const ranked = rankByName('mercedez', clients, (c) => c.name);
      expect(ranked[0].item.name).toBe('Mercedes');
      expect(ranked[0].score).toBeGreaterThanOrEqual(0.85);
    });

    it('matches "abuela maria" with "Abuela María"', () => {
      const ranked = rankByName('abuela maria', clients, (c) => c.name);
      expect(ranked[0].item.name).toBe('Abuela María');
      expect(ranked[0].score).toBeGreaterThanOrEqual(0.85);
    });

    it('matches "carlos" with "Carlos Pérez"', () => {
      const ranked = rankByName('carlos', clients, (c) => c.name);
      expect(ranked[0].item.name).toBe('Carlos Pérez');
      expect(ranked[0].score).toBeGreaterThanOrEqual(0.7);
    });

    it('matches substring prefixes like "merce" with "Mercedes"', () => {
      const query = normalize('merce');
      const contained = clients.filter((c) => normalize(c.name).includes(query));
      expect(contained.length).toBe(1);
      expect(contained[0].name).toBe('Mercedes');
    });
  });
});
