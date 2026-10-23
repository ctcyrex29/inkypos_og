import {
  DEFAULT_PRINTER_SETTINGS,
  parsePrinterSettings,
  PRINTER_SETTINGS_KEY,
  rawBtLinks,
  renderReceiptHtml,
  type LocalStore,
  type PrinterSettings,
  type PrintJobKind,
  type ReceiptDocument,
} from '@inkypos/core';
import { printAsync } from 'expo-print';
import { Linking, Platform } from 'react-native';

/** Printer choices are per till (each till has its own printer), kept in local settings. */
export async function loadPrinterSettings(store: LocalStore): Promise<PrinterSettings> {
  return parsePrinterSettings(await store.settings.get(PRINTER_SETTINGS_KEY));
}

export async function savePrinterSettings(store: LocalStore, settings: PrinterSettings): Promise<void> {
  await store.settings.set(PRINTER_SETTINGS_KEY, JSON.stringify({ ...DEFAULT_PRINTER_SETTINGS, ...settings }));
}

export class PrintError extends Error {
  override readonly name = 'PrintError';
}

/** RawBT runs on Android: in the native app, or in Chrome on an Android phone or tablet. */
export function rawBtAvailable(): boolean {
  if (Platform.OS === 'android') return true;
  return Platform.OS === 'web' && typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
}

export interface PrintPorts {
  systemPrint: (html: string) => Promise<void>;
  openUrl: (url: string) => Promise<void>;
  /** Web only: navigate the page to a URL (Chrome hands intent: links to the app). */
  navigate: (url: string) => void;
  platform: typeof Platform.OS;
  rawBtAvailable: () => boolean;
}

const defaultPorts: PrintPorts = {
  systemPrint: (html) => printAsync({ html }),
  openUrl: (url) => Linking.openURL(url),
  navigate: (url) => {
    window.location.href = url;
  },
  platform: Platform.OS,
  rawBtAvailable,
};

/**
 * Prints a slip where this till sends that kind of slip. Returns where it went;
 * 'off' means the till is set not to print it. A failure is a PrintError with a
 * message for the cashier; nothing that was recorded is undone by it.
 */
export async function printDocument(
  store: LocalStore,
  kind: PrintJobKind,
  doc: ReceiptDocument,
  title: string,
  ports: PrintPorts = defaultPorts,
  /** Overrides the saved choice (the test print uses what is on screen). */
  override?: Partial<PrinterSettings>,
): Promise<'system' | 'rawbt' | 'off'> {
  const target = override?.[kind] ?? (await loadPrinterSettings(store))[kind];
  if (target === 'off') return 'off';
  if (target === 'system') {
    await ports.systemPrint(renderReceiptHtml(doc, title));
    return 'system';
  }
  if (!ports.rawBtAvailable()) throw new PrintError('RawBT printing works on Android only. Choose System print for this till in Printer settings.');
  const links = rawBtLinks(doc);
  if (ports.platform === 'web') {
    ports.navigate(links.browser);
    return 'rawbt';
  }
  try {
    await ports.openUrl(links.app);
  } catch {
    throw new PrintError('Could not reach RawBT. Install RawBT from the Play Store, pair the printer in it, and try again.');
  }
  return 'rawbt';
}
