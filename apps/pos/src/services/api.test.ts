import { isUuidV7 } from '@inkypos/core';
import { defaultApiBaseUrl, newId } from './api';

describe('app api service', () => {
  it('generates UUIDv7 identifiers from the platform CSPRNG', () => {
    const a = newId();
    const b = newId();
    expect(isUuidV7(a)).toBe(true);
    expect(a).not.toBe(b);
  });

  it('prefers EXPO_PUBLIC_API_URL when set', () => {
    const previous = process.env.EXPO_PUBLIC_API_URL;
    process.env.EXPO_PUBLIC_API_URL = 'https://staging.example.test';
    try {
      expect(defaultApiBaseUrl()).toBe('https://staging.example.test');
    } finally {
      if (previous === undefined) delete process.env.EXPO_PUBLIC_API_URL;
      else process.env.EXPO_PUBLIC_API_URL = previous;
    }
  });
});
