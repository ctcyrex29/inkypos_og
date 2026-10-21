import { Order, PaymentRecord, PrinterDevice, ZReport, RestaurantSettings } from '../types';

// Standard ESC/POS command constants
const ESC = 0x1b;
const GS = 0x1d;

export interface ConnectionResult {
  success: boolean;
  deviceName?: string;
  error?: string;
  inIframe?: boolean;
  isGloballyDisabled?: boolean;
  isAndroid?: boolean;
  fallbackWarning?: string;
  suggestedAction?: 'direct_ble' | 'os_spooler' | 'android_rawbt' | 'open_new_tab';
}

export interface BluetoothEnvironmentStatus {
  isSupported: boolean;
  isAndroid: boolean;
  isIOS: boolean;
  isIframe: boolean;
  isSecureContext: boolean;
  browserName: string;
  status: 'ready' | 'android_ready' | 'iframe_blocked' | 'insecure' | 'unsupported_browser';
  title: string;
  message: string;
  recommendation: string;
  fallbackWarning: string;
  suggestedAction: 'direct_ble' | 'os_spooler' | 'android_rawbt' | 'open_new_tab';
}

// Comprehensive diagnostic check for Web Bluetooth API availability
export function getBluetoothEnvironmentStatus(): BluetoothEnvironmentStatus {
  const isNav = typeof navigator !== 'undefined';
  const isWin = typeof window !== 'undefined';
  const isSupported = isNav && 'bluetooth' in navigator;
  const isAndroid = isNav && /Android/i.test(navigator.userAgent);
  const isIOS = isNav && (/iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
  const isSecureContext = isWin ? Boolean(window.isSecureContext) : true;

  let isIframe = false;
  try {
    isIframe = isWin && window.self !== window.top;
  } catch {
    isIframe = true;
  }

  // Browser detection
  let browserName = 'Current Browser';
  if (isNav) {
    const ua = navigator.userAgent;
    if (/SamsungBrowser/i.test(ua)) browserName = 'Samsung Internet';
    else if (/OPR|Opera/i.test(ua)) browserName = 'Opera';
    else if (/Edg/i.test(ua)) browserName = 'Microsoft Edge';
    else if (/Chrome|CriOS/i.test(ua)) browserName = 'Google Chrome';
    else if (/Firefox|FxiOS/i.test(ua)) browserName = 'Mozilla Firefox';
    else if (/Safari/i.test(ua)) browserName = 'Apple Safari';
  }

  // Case 1: Sandboxed in an iframe (e.g. AI Studio preview)
  if (isIframe) {
    return {
      isSupported,
      isAndroid,
      isIOS,
      isIframe: true,
      isSecureContext,
      browserName,
      status: 'iframe_blocked',
      title: 'Sandboxed Preview Environment',
      message: 'Browser security blocks Web Bluetooth device pairing inside embedded preview frames.',
      recommendation: 'Open the app in a new tab for direct Bluetooth scanning, or click "Use OS Bluetooth / System Spooler" below.',
      fallbackWarning: 'Fallback Active: Use OS Bluetooth / System Thermal Spooler or the Android Print bridge to print immediately.',
      suggestedAction: 'open_new_tab'
    };
  }

  // Case 2: Insecure context (HTTP without HTTPS/localhost)
  if (!isSecureContext) {
    return {
      isSupported: false,
      isAndroid,
      isIOS,
      isIframe: false,
      isSecureContext: false,
      browserName,
      status: 'insecure',
      title: 'Insecure Context (HTTPS Required)',
      message: 'Web Bluetooth requires a secure HTTPS connection or localhost origin.',
      recommendation: 'Switch to the "OS Bluetooth / System Thermal Spooler" or access via HTTPS.',
      fallbackWarning: 'Fallback: Use the OS Bluetooth / System Spooler driver which does not require HTTPS.',
      suggestedAction: 'os_spooler'
    };
  }

  // Case 3: Web Bluetooth API not implemented in browser
  if (!isSupported) {
    const reason = isIOS
      ? 'iOS Safari and iOS browsers do not implement the Web Bluetooth API.'
      : `${browserName} does not support direct Web Bluetooth API scanning.`;

    return {
      isSupported: false,
      isAndroid,
      isIOS,
      isIframe: false,
      isSecureContext,
      browserName,
      status: 'unsupported_browser',
      title: 'Web Bluetooth Not Supported in this Browser',
      message: `${reason} Hardware printing is still 100% available via OS drivers and print bridges.`,
      recommendation: isAndroid
        ? 'On Android: Pair your printer in Android Settings, then use Android Default Print Service or the RawBT print bridge.'
        : 'Use "OS Bluetooth / System Thermal Spooler" to print through your system printer driver without browser restrictions.',
      fallbackWarning: isAndroid
        ? 'Android Fallback: Pair printer in Android Bluetooth Settings, then select "OS Bluetooth / System Spooler" or tap "Share / RawBT".'
        : 'Fallback Warning: Direct BLE scanning is unsupported. Use OS Bluetooth Spooler for guaranteed printing.',
      suggestedAction: isAndroid ? 'android_rawbt' : 'os_spooler'
    };
  }

  // Case 4: Android device with Web Bluetooth support
  if (isAndroid) {
    return {
      isSupported: true,
      isAndroid: true,
      isIOS: false,
      isIframe: false,
      isSecureContext: true,
      browserName,
      status: 'android_ready',
      title: 'Android Bluetooth Ready',
      message: `${browserName} on Android supports direct Web Bluetooth BLE thermal receipt printing!`,
      recommendation: 'Turn ON Bluetooth and Location on your phone, power on the thermal printer, and tap "Pair Bluetooth Printer". If your printer is Bluetooth Classic (SPP), use "Android RawBT" or "OS Spooler".',
      fallbackWarning: 'If the scanner cannot find your printer, it may use Bluetooth Classic (SPP). Use Android System Print Spooler or the RawBT app bridge.',
      suggestedAction: 'direct_ble'
    };
  }

  // Case 5: Supported desktop browser (Chrome/Edge/Opera)
  return {
    isSupported: true,
    isAndroid: false,
    isIOS: false,
    isIframe: false,
    isSecureContext: true,
    browserName,
    status: 'ready',
    title: 'Web Bluetooth Available',
    message: `${browserName} supports direct Web Bluetooth BLE thermal printing.`,
    recommendation: 'Power on your thermal printer and click "Pair Bluetooth Printer" to select it.',
    fallbackWarning: 'Fallback Available: If pairing times out, use "OS Bluetooth / System Spooler" to print via your system printer driver.',
    suggestedAction: 'direct_ble'
  };
}

// Android RawBT intent dispatch: sends receipt directly to Android RawBT ESC/POS print app
export function sendToAndroidRawBt(text: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const cleanText = text.replace(/[\r\n]+/g, '\r\n');
    const encoded = btoa(unescape(encodeURIComponent(cleanText)));
    const rawBtUrl = `rawbt:data:text/plain;base64,${encoded}`;
    window.location.href = rawBtUrl;
    return true;
  } catch (err) {
    console.warn('Failed to dispatch to RawBT intent:', err);
    return false;
  }
}

// Share receipt to Android Print App or WhatsApp via Web Share API
export async function shareToAndroidPrint(text: string, title: string = 'Restaurant Receipt'): Promise<boolean> {
  if (typeof navigator !== 'undefined' && (navigator as any).share) {
    try {
      await (navigator as any).share({
        title,
        text
      });
      return true;
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.warn('Share error:', err);
      }
      return false;
    }
  }
  return false;
}

export class BluetoothPrinterService {
  private device: any = null;
  private server: any = null;
  private writeCharacteristic: any = null;

  public isSupported: boolean = typeof navigator !== 'undefined' && 'bluetooth' in navigator;

  public isIframe(): boolean {
    try {
      return typeof window !== 'undefined' && window.self !== window.top;
    } catch {
      return true;
    }
  }

  // Connect to a physical Bluetooth ESC/POS printer with extensive UUID fallbacks & Android support
  async connect(): Promise<ConnectionResult> {
    const envStatus = getBluetoothEnvironmentStatus();

    if (!envStatus.isSupported) {
      return {
        success: false,
        error: envStatus.message,
        isAndroid: envStatus.isAndroid,
        fallbackWarning: envStatus.fallbackWarning,
        suggestedAction: envStatus.suggestedAction
      };
    }

    if (envStatus.isIframe) {
      return {
        success: false,
        inIframe: true,
        isAndroid: envStatus.isAndroid,
        error: envStatus.message,
        fallbackWarning: envStatus.fallbackWarning,
        suggestedAction: 'open_new_tab'
      };
    }

    try {
      // Extensive list of 16-bit and 128-bit BLE service UUIDs used by POS thermal printers on Android and desktop
      // (Xprinter, Milestone, Goojprt, Netum, Rongta, Epson, Zebra, ZJiang, POS-58, MPT-II, etc.)
      const commonServices = [
        '000018f0-0000-1000-8000-00805f9b34fb', // Standard Print Service
        '0000ffe0-0000-1000-8000-00805f9b34fb', // Universal Chinese POS transparent UART
        '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC transparent UART (Android printers)
        'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Android BLE POS
        '0000ae00-0000-1000-8000-00805f9b34fb',
        '0000ff00-0000-1000-8000-00805f9b34fb',
        '0000fee7-0000-1000-8000-00805f9b34fb',
        '000018f1-0000-1000-8000-00805f9b34fb',
        '0000ffe5-0000-1000-8000-00805f9b34fb',
        '0000af30-0000-1000-8000-00805f9b34fb',
        0x18f0,
        0xffe0
      ];

      const nav = navigator as any;
      this.device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: commonServices
      });

      if (!this.device) {
        throw new Error('No Bluetooth device selected.');
      }

      this.server = await this.device.gatt.connect();

      // Locate a writable characteristic
      for (const serviceUuid of commonServices) {
        try {
          const service = await this.server.getPrimaryService(serviceUuid);
          const characteristics = await service.getCharacteristics();
          const writable = characteristics.find(
            (c: any) => c.properties.write || c.properties.writeWithoutResponse
          );
          if (writable) {
            this.writeCharacteristic = writable;
            break;
          }
        } catch {
          // Probe next service
        }
      }

      if (!this.writeCharacteristic) {
        throw new Error('Connected to Bluetooth device, but no writable printer characteristic was found.');
      }

      return {
        success: true,
        deviceName: this.device.name || 'ESC/POS Thermal Printer'
      };
    } catch (err: any) {
      console.warn('Bluetooth connection error:', err);
      const rawMsg = err.message || '';
      let friendlyError = rawMsg || 'Could not pair Bluetooth printer';
      let isGloballyDisabled = false;
      let fallbackWarning = 'Fallback Warning: Direct Bluetooth handshake failed. Use "OS Bluetooth / System Spooler" or the Android Print bridge to print without pairing restrictions.';

      if (rawMsg.toLowerCase().includes('globally disabled')) {
        isGloballyDisabled = true;
        friendlyError = 'Web Bluetooth API is globally disabled in this browser.';
        fallbackWarning = 'Enable chrome://flags/#enable-web-bluetooth or click "Use OS Bluetooth / System Spooler" for instant 1-click fix.';
      } else if (rawMsg.includes('User cancelled')) {
        friendlyError = 'Pairing prompt was cancelled.';
        fallbackWarning = 'To print, tap "Pair Bluetooth Printer" again or switch to "OS Bluetooth / System Thermal Spooler".';
      } else if (rawMsg.includes('SecurityError') || rawMsg.includes('not allowed')) {
        friendlyError = 'Security restriction: Open the app in a new tab or window to grant hardware Bluetooth access.';
        fallbackWarning = 'Preview frames restrict hardware access. Switch to OS Bluetooth Spooler for immediate print.';
      } else if (rawMsg.includes('Bluetooth adapter not available')) {
        friendlyError = 'Bluetooth is turned OFF. Please turn ON Bluetooth in your device settings.';
        fallbackWarning = 'Turn on Bluetooth and Location (on Android) to discover nearby thermal printers.';
      } else if (rawMsg.includes('no writable printer characteristic')) {
        friendlyError = 'Device found, but it may be Bluetooth Classic (SPP) instead of BLE.';
        fallbackWarning = 'Android printers using Bluetooth Classic (SPP) work best via "Android RawBT" or "OS Bluetooth / System Thermal Spooler".';
      }

      return {
        success: false,
        error: friendlyError,
        isGloballyDisabled,
        isAndroid: envStatus.isAndroid,
        fallbackWarning,
        suggestedAction: envStatus.isAndroid ? 'android_rawbt' : 'os_spooler'
      };
    }
  }

  disconnect() {
    if (this.server && this.server.connected) {
      try {
        this.server.disconnect();
      } catch {}
    }
    this.device = null;
    this.server = null;
    this.writeCharacteristic = null;
  }

  isConnected(): boolean {
    return !!(this.server && this.server.connected && this.writeCharacteristic);
  }

  // Binary ESC/POS buffer with initialization, bold emphasis mode, and tear-off line feed.
  // Uses strictly standard ESC/POS commands compatible with 100% of portable Bluetooth & USB thermal printers.
  public createEscPosBuffer(text: string, darkness: 'normal' | 'dark' | 'deep_black' = 'deep_black'): Uint8Array {
    const encoder = new TextEncoder();
    
    // Standard ESC/POS commands:
    // ESC @ (0x1B, 0x40): Initialize / reset printer
    // ESC 2 (0x1B, 0x32): Standard 1/6-inch line feed pitch
    const initCmd: number[] = [ESC, 0x40, ESC, 0x32];

    if (darkness === 'deep_black') {
      initCmd.push(ESC, 0x45, 0x01); // ESC E 1: Emphasized / Bold ON
      initCmd.push(ESC, 0x47, 0x01); // ESC G 1: Double-strike ON (deep thermal black)
    } else if (darkness === 'dark') {
      initCmd.push(ESC, 0x45, 0x01); // ESC E 1: Emphasized / Bold ON
    }

    const initBytes = new Uint8Array(initCmd);
    const textBytes = encoder.encode(text);

    // End sequence: Turn off bold/double-strike, feed 4 lines to clear manual tear bar.
    // NOTE: We deliberately do NOT send GS V 1 (auto-cutter) because 58mm portable printers
    // have no automatic cutter, and sending GS V 1 triggers hardware error on cutless printers!
    const endCmd: number[] = [
      ESC, 0x45, 0x00, // ESC E 0: Bold OFF
      ESC, 0x47, 0x00, // ESC G 0: Double strike OFF
      0x0A, 0x0A, 0x0A, 0x0A // 4 Line Feeds (0x0A) for clean tear off
    ];
    const endBytes = new Uint8Array(endCmd);

    const fullBuffer = new Uint8Array(initBytes.length + textBytes.length + endBytes.length);
    fullBuffer.set(initBytes, 0);
    fullBuffer.set(textBytes, initBytes.length);
    fullBuffer.set(endBytes, initBytes.length + textBytes.length);
    return fullBuffer;
  }

  // Send raw text to the physical printer with safe BLE chunking & pacing
  async printRaw(text: string, darkness: 'normal' | 'dark' | 'deep_black' = 'deep_black'): Promise<boolean> {
    if (!this.writeCharacteristic) {
      return false;
    }

    try {
      const buffer = this.createEscPosBuffer(text, darkness);
      // Safe BLE chunk size: 20 bytes is the universal standard for Bluetooth Low Energy ATT MTU (23 bytes - 3 bytes header)
      // Writing more than 20 bytes causes MTU size errors on mobile browsers!
      const chunkSize = 20;
      for (let i = 0; i < buffer.length; i += chunkSize) {
        const chunk = buffer.slice(i, i + chunkSize);
        if (this.writeCharacteristic.writeValueWithoutResponse) {
          await this.writeCharacteristic.writeValueWithoutResponse(chunk);
        } else {
          await this.writeCharacteristic.writeValue(chunk);
        }
        // Essential 20ms throttle delay: prevents mobile BLE hardware FIFO buffer overrun
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return true;
    } catch (err) {
      console.error('Physical Bluetooth write error:', err);
      return false;
    }
  }
}

export const bluetoothService = new BluetoothPrinterService();

// Web Serial / USB Printer Service (Bypasses Web Bluetooth Restrictions)
export class SerialPrinterService {
  private port: any = null;
  private writer: any = null;

  public isSupported: boolean = typeof navigator !== 'undefined' && 'serial' in navigator;

  async connect(): Promise<{ success: boolean; deviceName?: string; error?: string }> {
    if (!this.isSupported) {
      return {
        success: false,
        error: 'Web Serial API is not available in this browser. Please use Chrome/Edge or select System Thermal Print.'
      };
    }

    try {
      const nav = navigator as any;
      this.port = await nav.serial.requestPort();
      await this.port.open({ baudRate: 9600 });
      this.writer = this.port.writable.getWriter();
      return {
        success: true,
        deviceName: 'USB / Serial ESC/POS Printer'
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Could not connect via USB / Serial.'
      };
    }
  }

  async printRaw(text: string, darkness: 'normal' | 'dark' | 'deep_black' = 'deep_black'): Promise<boolean> {
    if (!this.writer) return false;
    try {
      const buffer = bluetoothService.createEscPosBuffer(text, darkness);
      await this.writer.write(buffer);
      return true;
    } catch (err) {
      console.error('Serial write error:', err);
      return false;
    }
  }

  disconnect() {
    try {
      if (this.writer) {
        this.writer.releaseLock();
        this.writer = null;
      }
      if (this.port) {
        this.port.close();
        this.port = null;
      }
    } catch {}
  }

  isConnected(): boolean {
    return !!(this.port && this.writer);
  }
}

export const serialService = new SerialPrinterService();

// Updates the dedicated, pure-white DOM element for system print
// This guarantees receipts NEVER print as a solid black block, faint text, or multiple duplicates
export function updatePrintTargetDOM(text: string, settings?: RestaurantSettings) {
  if (typeof document === 'undefined') return;

  let target = document.getElementById('pos-print-area') || document.getElementById('printable-receipt-target');
  if (!target) {
    target = document.createElement('div');
    target.id = 'pos-print-area';
    target.setAttribute('aria-hidden', 'true');
    document.body.appendChild(target);
  }

  let logoHtml = '';
  if (settings?.showLogoOnReceipt !== false && settings?.receiptLogo) {
    logoHtml = `
      <div style="text-align: center; margin-bottom: 2px; padding-bottom: 2px;">
        <img src="${settings.receiptLogo}" alt="Logo" style="max-height: 20mm; max-width: 38mm; margin: 0 auto; display: block; filter: grayscale(100%) contrast(160%); background: #ffffff;" />
        <div style="font-weight: 900; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #000000; font-family: sans-serif;">
          ${settings.receiptLogoTitle || settings.restaurantName || ''}
        </div>
      </div>
    `;
  }

  // Trim extraneous leading/trailing whitespace so content doesn't push past page boundaries
  const trimmedText = text.trim();
  const safeText = trimmedText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  target.innerHTML = `
    ${logoHtml}
    <pre style="margin: 0; padding: 0; font-family: 'Courier New', Courier, 'Lucida Console', Monaco, monospace; font-weight: 800; font-size: 11px; line-height: 1.22; color: #000000; background: #ffffff; white-space: pre;">${safeText}</pre>
  `;
}

// Universal printing handler that routes appropriately
export async function sendPrintJob(
  text: string,
  printer: PrinterDevice,
  settings?: RestaurantSettings
): Promise<{ success: boolean; message: string }> {
  const darkness = printer.printDarkness || settings?.printDarkness || 'deep_black';

  // 1. Android RawBT / ESC-POS Print App route
  if (printer.type === 'android_intent') {
    const ok = sendToAndroidRawBt(text);
    return {
      success: ok,
      message: ok ? 'Dispatched to Android RawBT Thermal Print App!' : 'Failed to launch Android RawBT app. Ensure RawBT is installed from Play Store.'
    };
  }

  // 2. Direct Web Bluetooth (if paired)
  if (printer.type === 'bluetooth' && bluetoothService.isConnected()) {
    const ok = await bluetoothService.printRaw(text, darkness);
    return {
      success: ok,
      message: ok ? 'Receipt printed via Bluetooth ESC/POS printer!' : 'Bluetooth transmission failed. Check if printer is turned on.'
    };
  }

  // 3. Direct USB / Serial (if connected)
  if (printer.type === 'usb_serial' && serialService.isConnected()) {
    const ok = await serialService.printRaw(text, darkness);
    return {
      success: ok,
      message: ok ? 'Receipt printed via USB / Serial ESC/POS printer!' : 'USB / Serial transmission failed.'
    };
  }

  // 4. System Spooler / OS Bluetooth Printer mode
  if (typeof window !== 'undefined') {
    // Populate the single pure-white print node first
    updatePrintTargetDOM(text, settings);

    // Yield 120ms so browser paints the white container before opening the print spooler
    await new Promise((resolve) => setTimeout(resolve, 120));
    window.print();
    return {
      success: true,
      message: 'Printed 1 receipt via System Thermal Spooler!'
    };
  }

  return {
    success: false,
    message: 'No print pipeline available.'
  };
}

// Text wrapping utility for narrow thermal paper (58mm / 80mm)
function wrapText(text: string, maxWidth: number): string[] {
  if (!text) return [];
  if (text.length <= maxWidth) return [text];
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const w of words) {
    if (!current) {
      current = w;
    } else if ((current + ' ' + w).length <= maxWidth) {
      current += ' ' + w;
    } else {
      lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// Helper to generate an optional simple header line if needed
function getAsciiLogoHeader(settings?: RestaurantSettings, cols: number = 32): string[] {
  const center = (str: string) => {
    const pad = Math.max(0, Math.floor((cols - str.length) / 2));
    return ' '.repeat(pad) + str;
  };
  const logoTitle = settings?.receiptLogoTitle || settings?.restaurantName || "GAVA'S";
  return [center(`~ ${logoTitle.toUpperCase()} ~`)];
}

// Format Plain Text Thermal Customer Receipt for Zimbabwean Restaurant POS
// Clean, simple, un-crowded layout with prominently clear ORDER NUMBER
export function formatReceiptText(
  order: Order,
  payment?: PaymentRecord,
  width: '58mm' | '80mm' = '58mm',
  settings?: RestaurantSettings,
  options?: { includeAsciiLogo?: boolean }
): string {
  const cols = width === '80mm' ? 42 : 32;
  const line = '-'.repeat(cols);
  const doubleLine = '='.repeat(cols);

  const center = (str: string) => {
    const pad = Math.max(0, Math.floor((cols - str.length) / 2));
    return ' '.repeat(pad) + str;
  };

  const justify = (left: string, right: string) => {
    const available = cols - right.length - 1;
    let safeLeft = left;
    if (safeLeft.length > available) {
      safeLeft = safeLeft.slice(0, Math.max(0, available));
    }
    const spaces = Math.max(1, cols - safeLeft.length - right.length);
    return safeLeft + ' '.repeat(spaces) + right;
  };

  const restName = settings?.restaurantName || "Gava's Traditional Kitchen";
  const restPhone = settings?.phone || '+263 77 212 3456';
  const zigRate = settings?.zigExchangeRate || 27.50;

  const rows: string[] = [];

  // 1. ORDER NUMBER - PROMINENT & CRYSTAL CLEAR AT TOP
  rows.push(doubleLine);
  rows.push(center(`ORDER #${order.orderNumber}`));
  const serviceLabel = order.serviceType === 'sit_in'
    ? (order.tableNumber ? `SIT-IN • Table ${order.tableNumber}` : 'SIT-IN')
    : 'TAKEAWAY';
  rows.push(center(`[ ${serviceLabel} ]`));
  rows.push(doubleLine);

  // 2. STORE HEADER (Simple, subtle, not crowded)
  rows.push(center(restName));
  if (settings?.address) rows.push(center(settings.address));
  rows.push(center(`Tel: ${restPhone}`));
  rows.push(line);

  // 3. DATE & CASHIER INFO
  const dateStr = new Date(order.createdAt).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
  const timeStr = new Date(order.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
  rows.push(justify(`${dateStr} ${timeStr}`, order.cashierName ? `By: ${order.cashierName.slice(0, 10)}` : ''));
  if (order.customerName) {
    rows.push(`Cust: ${order.customerName.slice(0, cols - 7)}`);
  }
  rows.push(line);

  // 4. ITEMS (Clean, legible, without excess decoration)
  let hasItems = false;
  if (order.meals && order.meals.length > 0) {
    hasItems = true;
    order.meals.forEach((m) => {
      const priceStr = `$${m.totalPrice.toFixed(2)}`;
      const title = `${m.quantity}x ${m.baseStapleName} + ${m.relishName}`;
      const maxLeft = cols - priceStr.length - 1;
      if (title.length <= maxLeft) {
        rows.push(justify(title, priceStr));
      } else {
        rows.push(justify(title.slice(0, maxLeft), priceStr));
        rows.push('  ' + title.slice(maxLeft));
      }
      if (m.vegetableName) {
        rows.push(`  + ${m.vegetableName}`);
      }
      if (m.extraRelishName) {
        rows.push(`  + Extra: ${m.extraRelishName}`);
      }
      if (m.notes) {
        rows.push(`  * ${m.notes}`);
      }
    });
  }

  if (order.drinks && order.drinks.length > 0) {
    hasItems = true;
    order.drinks.forEach((d) => {
      const priceStr = `$${d.totalPrice.toFixed(2)}`;
      const title = `${d.quantity}x ${d.name}`;
      rows.push(justify(title.slice(0, cols - priceStr.length - 1), priceStr));
    });
  }

  if (order.items && order.items.length > 0 && (!order.meals || order.meals.length === 0)) {
    hasItems = true;
    order.items.forEach((it) => {
      const priceStr = `$${(it.price * it.quantity).toFixed(2)}`;
      const title = `${it.quantity}x ${it.name}`;
      rows.push(justify(title.slice(0, cols - priceStr.length - 1), priceStr));
    });
  }

  if (!hasItems) {
    rows.push(center('(No items recorded)'));
  }
  rows.push(line);

  // 5. TOTALS (USD & ZiG)
  const usdTotal = order.totalAmount ?? order.totalUsd ?? order.subtotal ?? 0;
  const zigTotal = order.totalZig ?? (usdTotal * zigRate);

  if (order.taxAmount && order.taxAmount > 0) {
    rows.push(justify('Subtotal:', `$${((order.subtotal ?? (usdTotal - order.taxAmount))).toFixed(2)}`));
    rows.push(justify('VAT (15%):', `$${order.taxAmount.toFixed(2)}`));
  }

  rows.push(justify('TOTAL USD:', `$${usdTotal.toFixed(2)}`));
  rows.push(justify(`ZiG Equiv (@${zigRate.toFixed(2)}):`, `${zigTotal.toFixed(2)} ZiG`));

  // 6. PAYMENT DETAILS (Simplified)
  const effectivePayments: PaymentRecord[] =
    order.payments && order.payments.length > 0
      ? order.payments
      : payment
      ? [payment]
      : [];

  if (effectivePayments.length > 0) {
    rows.push(line);
    effectivePayments.forEach((p) => {
      const rawMethod = (p.method || 'cash').toUpperCase().replace('_', ' ');
      const isZig = p.currency === 'ZiG' || p.method === 'zig_cash' || p.method === 'zig_swipe';
      const pUsd = p.amountUsd ?? p.total ?? p.amount ?? 0;
      const pZig = p.amountZig ?? p.zigAmount ?? (pUsd * zigRate);

      rows.push(justify(`Paid (${rawMethod}):`, isZig ? `${pZig.toFixed(2)} ZiG` : `$${pUsd.toFixed(2)}`));

      const change = p.changeGiven ?? p.changeUsd;
      if (change !== undefined && change > 0) {
        rows.push(justify('Change:', isZig ? `${change.toFixed(2)} ZiG` : `$${change.toFixed(2)}`));
      }
      const ecRef = p.ecocashRef ?? p.ecocashReference;
      if (ecRef) {
        rows.push(`EcoCash Ref: ${ecRef}`);
      }
    });
  }

  // 7. FOOTER
  rows.push(doubleLine);
  rows.push(center(`ORDER #${order.orderNumber}`));
  rows.push(center('Thank You! • Maita Basa'));
  rows.push(doubleLine);

  return rows.join('\n').trim();
}

// Format Kitchen Order Ticket (KOT) for kitchen chef & platers
export function formatKitchenTicketText(
  order: Order,
  width: '58mm' | '80mm' = '58mm',
  settings?: RestaurantSettings
): string {
  const cols = width === '80mm' ? 42 : 32;
  const line = '-'.repeat(cols);
  const doubleLine = '='.repeat(cols);

  const center = (str: string) => {
    const pad = Math.max(0, Math.floor((cols - str.length) / 2));
    return ' '.repeat(pad) + str;
  };

  const justify = (left: string, right: string) => {
    const available = cols - right.length - 1;
    let safeLeft = left;
    if (safeLeft.length > available) {
      safeLeft = safeLeft.slice(0, Math.max(0, available));
    }
    const spaces = Math.max(1, cols - safeLeft.length - right.length);
    return safeLeft + ' '.repeat(spaces) + right;
  };

  const rows: string[] = [];

  rows.push(doubleLine);
  rows.push(center('*** KITCHEN ORDER ***'));
  rows.push(center(`ORDER #${order.orderNumber}`));
  const serviceLabel = order.serviceType === 'sit_in'
    ? (order.tableNumber ? `SIT-IN • Table ${order.tableNumber}` : 'SIT-IN')
    : 'TAKEAWAY (PARCEL)';
  rows.push(center(`[ ${serviceLabel} ]`));
  rows.push(doubleLine);

  const orderTime = new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  rows.push(justify(`Time: ${orderTime}`, order.customerName ? `Cust: ${order.customerName.slice(0, 10)}` : ''));
  rows.push(line);

  let totalPortions = 0;
  if (order.meals && order.meals.length > 0) {
    order.meals.forEach((m) => {
      totalPortions += m.quantity;
      rows.push(`[ ] ${m.quantity}x ${m.baseStapleName}`);
      rows.push(`    Relish: ${m.relishName}`);
      if (m.vegetableName) {
        rows.push(`    Veg: ${m.vegetableName}`);
      }
      if (m.extraRelishName) {
        rows.push(`    Extra: ${m.extraRelishName}`);
      }
      if (m.notes) {
        rows.push(`    * Note: ${m.notes}`);
      }
    });
  }

  if (order.drinks && order.drinks.length > 0) {
    rows.push(line);
    order.drinks.forEach((d) => {
      totalPortions += d.quantity;
      rows.push(`[ ] ${d.quantity}x ${d.name}`);
    });
  }

  if (order.items && order.items.length > 0 && (!order.meals || order.meals.length === 0)) {
    rows.push(line);
    order.items.forEach((it) => {
      totalPortions += it.quantity;
      rows.push(`[ ] ${it.quantity}x ${it.name}`);
    });
  }

  rows.push(doubleLine);
  rows.push(justify('Total Portions:', `${totalPortions}`));
  rows.push(center(`ORDER #${order.orderNumber}`));
  rows.push(doubleLine);

  return rows.join('\n').trim();
}

// Format End-of-Day Z-Report Receipt
export function formatZReportText(
  report: ZReport,
  width: '58mm' | '80mm' = '58mm',
  settings?: RestaurantSettings
): string {
  const cols = width === '80mm' ? 42 : 32;
  const line = '-'.repeat(cols);
  const doubleLine = '='.repeat(cols);

  const center = (str: string) => {
    const pad = Math.max(0, Math.floor((cols - str.length) / 2));
    return ' '.repeat(pad) + str;
  };

  const justify = (left: string, right: string) => {
    const available = cols - right.length - 1;
    let safeLeft = left;
    if (safeLeft.length > available) {
      safeLeft = safeLeft.slice(0, Math.max(0, available));
    }
    const spaces = Math.max(1, cols - safeLeft.length - right.length);
    return safeLeft + ' '.repeat(spaces) + right;
  };

  const restName = settings?.restaurantName || "Gava's Traditional Kitchen";
  const rows: string[] = [];

  if (settings?.showLogoOnReceipt !== false) {
    rows.push(...getAsciiLogoHeader(settings, cols));
    rows.push('');
  }

  rows.push(center('*** END OF DAY Z-REPORT ***'));
  rows.push(center(restName.toUpperCase()));
  rows.push(doubleLine);
  rows.push(justify('Report ID:', report.id));
  rows.push(justify('Date:', report.date));
  rows.push(justify('Closed At:', new Date(report.generatedAt).toLocaleTimeString()));
  rows.push(justify('Manager / Staff:', (report.closedBy || 'Staff').slice(0, cols - 17)));
  rows.push(justify('ZiG Rate Used:', `${(report.zigExchangeRateUsed || 27.5).toFixed(2)} ZiG/$1`));
  rows.push(line);

  const grossSales = report.grossSales || 0;
  const netSales = report.netSales || grossSales;
  const zigRate = report.zigExchangeRateUsed || 27.5;

  rows.push(justify('TOTAL ORDERS:', `${report.totalOrders || 0}`));
  rows.push(justify('GROSS SALES (USD):', `$${grossSales.toFixed(2)}`));
  rows.push(justify('EQUIV. SALES (ZiG):', `${(grossSales * zigRate).toFixed(2)} ZiG`));
  rows.push(justify('NET SALES (USD):', `$${netSales.toFixed(2)}`));
  rows.push(line);

  const pb = report.paymentBreakdown || {
    usd_cash: 0,
    ecocash: 0,
    innbucks: 0,
    zig_cash: 0,
    zig_swipe: 0,
    card: 0,
  };

  rows.push(center('-- TENDER BREAKDOWN (USD) --'));
  rows.push(justify('USD Cash:', `$${(pb.usd_cash || 0).toFixed(2)}`));
  rows.push(justify('EcoCash / Mobile:', `$${((pb.ecocash || 0) + (pb.innbucks || 0)).toFixed(2)}`));
  rows.push(justify('ZiG Cash/Swipe:', `$${((pb.zig_cash || 0) + (pb.zig_swipe || 0)).toFixed(2)}`));
  rows.push(justify('Card / USD Swipe:', `$${(pb.card || 0).toFixed(2)}`));
  rows.push(line);

  rows.push(center('-- CASH DRAWER AUDIT (USD) --'));
  rows.push(justify('Opening Float:', `$${(report.openingFloat || 0).toFixed(2)}`));
  rows.push(justify('(+) Cash Sales:', `$${(report.cashSales || 0).toFixed(2)}`));
  rows.push(justify('(-) Petty Payouts:', `$${(report.cashPayouts || 0).toFixed(2)}`));
  rows.push(justify('Expected Drawer:', `$${(report.expectedDrawerCash || 0).toFixed(2)}`));
  rows.push(justify('Counted Drawer:', `$${(report.countedCash || 0).toFixed(2)}`));
  const variance = report.cashVariance || 0;
  const varPrefix = variance >= 0 ? '+' : '';
  rows.push(justify('VARIANCE (Over/Short):', `${varPrefix}$${variance.toFixed(2)}`));

  rows.push(doubleLine);
  rows.push(center('*** AUDIT SIGN-OFF ***'));
  rows.push('');
  rows.push('Manager Signature: __________________');

  return rows.join('\n').trim();
}
