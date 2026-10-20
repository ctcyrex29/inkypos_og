import type { ReceiptDocument } from '../platform/ports';
import { blockLines } from '../sales/receipt';

/**
 * ESC/POS bytes for a receipt, for 58 mm / 80 mm thermal printers. Transport
 * (Bluetooth, USB, network) is separate and needs a development build.
 *
 * Text is sent as plain ASCII: accents are stripped and anything else becomes
 * "?", because code pages differ between printer models.
 */

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

export function toPrinterText(text: string): number[] {
  const ascii = text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘]/g, "'").replace(/[“”]/g, '"');
  return Array.from(ascii, (ch) => {
    const code = ch.charCodeAt(0);
    return code >= 0x20 && code <= 0x7e ? code : 0x3f; // '?'
  });
}

export function encodeEscPos(doc: ReceiptDocument): Uint8Array {
  const out: number[] = [ESC, 0x40]; // initialise
  const line = (text: string) => out.push(...toPrinterText(text), LF);

  for (const b of doc.blocks) {
    switch (b.kind) {
      case 'text': {
        const large = b.size === 'large';
        out.push(ESC, 0x61, b.align === 'center' ? 1 : b.align === 'right' ? 2 : 0);
        if (b.bold) out.push(ESC, 0x45, 1);
        if (large) out.push(GS, 0x21, 0x11); // double width and height
        // Double-width characters take two columns, so wrap at half the width.
        for (const l of blockLines(b, large ? Math.floor(doc.widthChars / 2) : doc.widthChars, false)) line(l);
        if (large) out.push(GS, 0x21, 0x00);
        if (b.bold) out.push(ESC, 0x45, 0);
        out.push(ESC, 0x61, 0);
        break;
      }
      case 'columns':
      case 'divider':
        for (const l of blockLines(b, doc.widthChars)) line(l);
        break;
      case 'feed':
        out.push(ESC, 0x64, Math.min(255, b.lines));
        break;
      case 'qr': {
        const data = toPrinterText(b.data);
        const len = data.length + 3;
        out.push(ESC, 0x61, 1);
        out.push(GS, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32, 0x00); // model 2
        out.push(GS, 0x28, 0x6b, 3, 0, 0x31, 0x43, 0x06); // module size
        out.push(GS, 0x28, 0x6b, 3, 0, 0x31, 0x45, 0x31); // error correction M
        out.push(GS, 0x28, 0x6b, len % 256, Math.floor(len / 256), 0x31, 0x50, 0x30, ...data);
        out.push(GS, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30); // print
        out.push(LF, ESC, 0x61, 0);
        break;
      }
      case 'barcode': {
        const data = toPrinterText(b.data).slice(0, 255);
        out.push(ESC, 0x61, 1, GS, 0x48, 2); // centred, human-readable text below
        if (b.format === 'ean13') out.push(GS, 0x6b, 67, data.length, ...data);
        else out.push(GS, 0x6b, 73, data.length + 2, 0x7b, 0x42, ...data); // CODE128, code set B
        out.push(LF, ESC, 0x61, 0);
        break;
      }
      case 'cut':
        out.push(GS, 0x56, 66, 0); // feed to the cutter and cut (partial)
        break;
    }
  }
  return Uint8Array.from(out);
}
