import { describe, expect, it } from 'vitest';
import { encodeEscPos, toPrinterText, type ReceiptDocument } from '../src';

const doc: ReceiptDocument = {
  widthChars: 32,
  blocks: [
    { kind: 'text', text: 'Mbare Grocer & Café', align: 'center', bold: true, size: 'large' },
    { kind: 'columns', left: 'White bread 700g', right: '2.40' },
    { kind: 'divider' },
    { kind: 'text', text: 'Not a fiscal tax invoice', align: 'center' },
    { kind: 'feed', lines: 3 },
    { kind: 'cut' },
  ],
};

const indexOf = (bytes: Uint8Array, seq: number[]) => {
  outer: for (let i = 0; i <= bytes.length - seq.length; i++) {
    for (let j = 0; j < seq.length; j++) if (bytes[i + j] !== seq[j]) continue outer;
    return i;
  }
  return -1;
};

describe('ESC/POS', () => {
  const bytes = encodeEscPos(doc);
  const text = new TextDecoder('ascii').decode(bytes);

  it('initialises, formats, feeds and cuts', () => {
    expect([...bytes.slice(0, 2)]).toEqual([0x1b, 0x40]);
    expect(indexOf(bytes, [0x1b, 0x61, 1])).toBeGreaterThan(0); // centre
    expect(indexOf(bytes, [0x1b, 0x45, 1])).toBeGreaterThan(0); // bold on
    expect(indexOf(bytes, [0x1d, 0x21, 0x11])).toBeGreaterThan(0); // double size
    expect(indexOf(bytes, [0x1d, 0x21, 0x00])).toBeGreaterThan(0); // and back
    expect(indexOf(bytes, [0x1b, 0x64, 3])).toBeGreaterThan(0); // feed 3
    expect([...bytes.slice(-4)]).toEqual([0x1d, 0x56, 66, 0]); // cut last
  });

  it('wraps double-size text at half the width and keeps other lines within the paper', () => {
    expect(text).toContain('Mbare Grocer &\n');
    // Remove each command by its exact length: ESC @ | ESC a/E/d n | GS ! n | GS V m n.
    const printable = text.replace(/\x1b@|\x1b[aEd][\s\S]|\x1d![\s\S]|\x1dV[\s\S]{2}/g, '').split('\n');
    expect(Math.max(...printable.map((l) => l.length))).toBeLessThanOrEqual(32);
    expect(text).toMatch(/White bread 700g {12}2\.40\n/);
  });

  it('sends only printable ASCII text', () => {
    expect(String.fromCharCode(...toPrinterText('Café ’quoted’ ZiG™'))).toBe("Cafe 'quoted' ZiG?");
    expect(text).toContain('Cafe');
  });
});
