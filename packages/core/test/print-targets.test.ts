import { describe, expect, it } from 'vitest';
import {
  base64Encode,
  buildTestPage,
  DEFAULT_PRINTER_SETTINGS,
  encodeEscPos,
  parsePrinterSettings,
  rawBtLinks,
  renderReceiptText,
} from '../src';

describe('base64Encode', () => {
  it('matches standard padded base64', () => {
    const enc = (s: string) => base64Encode(new TextEncoder().encode(s));
    expect([enc(''), enc('f'), enc('fo'), enc('foo'), enc('foob')]).toEqual(['', 'Zg==', 'Zm8=', 'Zm9v', 'Zm9vYg==']);
    expect(base64Encode(Uint8Array.from([0xfb, 0xff, 0xbf]))).toBe('+/+/');
  });
});

describe('printer settings', () => {
  it('falls back to the default for anything missing, unknown or corrupt', () => {
    expect(parsePrinterSettings(null)).toEqual(DEFAULT_PRINTER_SETTINGS);
    expect(parsePrinterSettings('{not json')).toEqual(DEFAULT_PRINTER_SETTINGS);
    expect(parsePrinterSettings(JSON.stringify({ receipt: 'rawbt', kitchen: 'off', report: 'fax' }))).toEqual({ receipt: 'rawbt', kitchen: 'off', report: 'system' });
    // Only kitchen tickets can be switched off.
    expect(parsePrinterSettings(JSON.stringify({ receipt: 'off', report: 'off' }))).toEqual(DEFAULT_PRINTER_SETTINGS);
  });
});

describe('RawBT links', () => {
  it('carry the exact ESC/POS bytes, for a native app and for Chrome on Android', () => {
    const doc = buildTestPage(32, 'rawbt', '23/10/2026 14:00');
    const { app, browser } = rawBtLinks(doc);
    const data = base64Encode(encodeEscPos(doc));
    expect(app).toBe(`rawbt:base64,${data}`);
    expect(browser).toBe(`intent:base64,${data}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`);
    expect(atob(data).startsWith('\x1b@')).toBe(true); // ESC @ initialises the printer
  });
});

describe('test page', () => {
  it('has a ruler exactly as wide as the paper', () => {
    for (const width of [32, 42, 48] as const) {
      const lines = renderReceiptText(buildTestPage(width, 'system', 'now')).split('\n');
      expect(lines).toContain('1234567890'.repeat(5).slice(0, width));
      expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(width);
    }
  });
});
