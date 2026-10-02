import { describe, expect, it } from 'vitest';
import { isAiFallbackAvailable } from './receipt-reader.service';

function config(values: Record<string, string | undefined>) {
  return { get: (key: string) => values[key] };
}

describe('isAiFallbackAvailable', () => {
  it('stays off without an API key, so nothing is attempted or billed', () => {
    expect(isAiFallbackAvailable(config({}))).toBe(false);
  });

  it('treats an empty or blank key as no key', () => {
    expect(isAiFallbackAvailable(config({ ANTHROPIC_API_KEY: '' }))).toBe(false);
    expect(isAiFallbackAvailable(config({ ANTHROPIC_API_KEY: '   ' }))).toBe(false);
  });

  it('turns on by itself once a key is set', () => {
    expect(isAiFallbackAvailable(config({ ANTHROPIC_API_KEY: 'sk-ant-test' }))).toBe(true);
    expect(isAiFallbackAvailable(config({ ANTHROPIC_API_KEY: 'sk-ant-test', OCR_FALLBACK_ENABLED: '' }))).toBe(true);
    expect(isAiFallbackAvailable(config({ ANTHROPIC_API_KEY: 'sk-ant-test', OCR_FALLBACK_ENABLED: 'true' }))).toBe(true);
  });

  it('can still be switched off on purpose with a key present', () => {
    expect(isAiFallbackAvailable(config({ ANTHROPIC_API_KEY: 'sk-ant-test', OCR_FALLBACK_ENABLED: 'false' }))).toBe(false);
  });
});
