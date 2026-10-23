import { base64Encode } from '../encoding/base64url';
import type { ReceiptDocument } from '../platform/ports';
import { encodeEscPos } from './escpos';

/**
 * Where each kind of slip goes, chosen per till:
 *   system: the operating system's print dialog (any printer it knows; on the web, the browser's)
 *   rawbt:  ESC/POS bytes handed to the RawBT app on Android, which talks to a paired
 *           Bluetooth, USB or network thermal printer; no development build needed
 *   off:    not printed; kitchen tickets only, for a kitchen that uses the kitchen screen
 * Direct Bluetooth from the app itself needs a development build and is not here yet.
 */
export type PrintTarget = 'system' | 'rawbt' | 'off';
export type PrintJobKind = 'receipt' | 'kitchen' | 'report';

export type PrinterSettings = Record<PrintJobKind, PrintTarget>;

export const PRINTER_SETTINGS_KEY = 'printer_targets';
export const DEFAULT_PRINTER_SETTINGS: PrinterSettings = { receipt: 'system', kitchen: 'system', report: 'system' };

const TARGETS: readonly PrintTarget[] = ['system', 'rawbt', 'off'];

/** Reads the stored settings; anything missing or unknown falls back to the default. */
export function parsePrinterSettings(stored: string | null): PrinterSettings {
  let raw: Record<string, unknown> = {};
  try {
    const parsed: unknown = stored ? JSON.parse(stored) : {};
    if (parsed && typeof parsed === 'object') raw = parsed as Record<string, unknown>;
  } catch {
    // Corrupt settings must never stop a till from printing.
  }
  const pick = (kind: PrintJobKind): PrintTarget => {
    const value = raw[kind] as PrintTarget;
    // Receipts and reports are printed when someone asks, so they can never be "off".
    const allowed = TARGETS.includes(value) && (value !== 'off' || kind === 'kitchen');
    return allowed ? value : DEFAULT_PRINTER_SETTINGS[kind];
  };
  return { receipt: pick('receipt'), kitchen: pick('kitchen'), report: pick('report') };
}

const RAWBT_PACKAGE = 'ru.a402d.rawbtprinter';

/**
 * Links that hand ESC/POS bytes to RawBT. `app` is opened by a native app
 * (an ACTION_VIEW intent); `browser` is the Chrome intent form a web page navigates to,
 * which Chrome turns into the same `rawbt:` link (as escpos-php's RawbtPrintConnector does).
 */
export function rawBtLinks(doc: ReceiptDocument): { app: string; browser: string } {
  const data = base64Encode(encodeEscPos(doc));
  return {
    app: `rawbt:base64,${data}`,
    browser: `intent:base64,${data}#Intent;scheme=rawbt;package=${RAWBT_PACKAGE};end;`,
  };
}

/** A short slip to check the printer, its paper width and the cutter. */
export function buildTestPage(widthChars: ReceiptDocument['widthChars'], target: PrintTarget, printedAt: string): ReceiptDocument {
  const ruler = '1234567890'.repeat(5).slice(0, widthChars);
  return {
    widthChars,
    blocks: [
      { kind: 'text', text: 'InkyPOS test print', align: 'center', bold: true, size: 'large' },
      { kind: 'text', text: printedAt, align: 'center' },
      { kind: 'divider' },
      { kind: 'columns', left: 'Paper width', right: `${widthChars} characters` },
      { kind: 'columns', left: 'Sent through', right: target === 'rawbt' ? 'RawBT' : 'System print' },
      { kind: 'text', text: ruler },
      { kind: 'text', text: 'The line above should fit on one line.' },
      { kind: 'divider' },
      { kind: 'feed', lines: 3 },
      { kind: 'cut' },
    ],
  };
}
