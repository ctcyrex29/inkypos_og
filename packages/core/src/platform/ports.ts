/**
 * Platform ports. Shared code depends only on these interfaces; each platform
 * (native via Expo modules, web via browser APIs) supplies its own adapter.
 * Adapters are implemented from Phase 3 onward.
 */

export type PlatformKind = 'android' | 'ios' | 'web' | 'windows' | 'macos';

/**
 * Secrets and tamper-sensitive device state. Never used for business data.
 * `device.last_server_time` lives here because lowering it would defeat clock-rollback detection.
 */
export type SecretKey =
  | 'auth.refresh_token'
  | 'auth.access_token'
  | 'device.signing_key'
  | 'device.record'
  | 'device.entitlement'
  | 'device.last_server_time'
  | 'device.revoked';

export interface SecureStore {
  /**
   * Native: Keychain / Android Keystore via expo-secure-store.
   * Web: no equivalent exists. The web adapter keeps device credentials in a
   * non-extractable WebCrypto key in IndexedDB and refresh tokens in an
   * HttpOnly cookie, and reports `hardwareBacked: false`.
   */
  readonly hardwareBacked: boolean;
  get(key: SecretKey): Promise<string | null>;
  set(key: SecretKey, value: string): Promise<void>;
  delete(key: SecretKey): Promise<void>;
}

export interface ConnectivityState {
  /** What the OS or browser reports. Not proof the API is reachable. */
  networkAvailable: boolean;
  /** Result of the most recent real API call, if any. */
  apiReachable: boolean | 'unknown';
  checkedAt: string;
}

export interface Connectivity {
  current(): ConnectivityState;
  subscribe(listener: (state: ConnectivityState) => void): () => void;
  /** Record the outcome of a real request so sync can react to it. */
  reportApiResult(reachable: boolean): void;
}

export interface BarcodeScanResult {
  value: string;
  format: string;
  source: 'camera' | 'hid_wedge' | 'manual';
}

export interface BarcodeScanner {
  /** Camera scanning (expo-camera on native, BarcodeDetector or a JS decoder on web). */
  cameraAvailable(): Promise<boolean>;
  scanWithCamera(signal?: AbortSignal): Promise<BarcodeScanResult | null>;
  /** USB/Bluetooth scanners that type like a keyboard; works on every platform. */
  onHidScan(listener: (result: BarcodeScanResult) => void): () => void;
}

/** Platform-neutral receipt description; printers render it in their own language (ESC/POS, HTML, PDF). */
export type ReceiptBlock =
  | { kind: 'text'; text: string; align?: 'left' | 'center' | 'right'; bold?: boolean; size?: 'normal' | 'large' }
  | { kind: 'columns'; left: string; right: string }
  | { kind: 'divider' }
  | { kind: 'qr'; data: string }
  | { kind: 'barcode'; data: string; format: 'code128' | 'ean13' }
  | { kind: 'feed'; lines: number }
  | { kind: 'cut' };

export interface ReceiptDocument {
  widthChars: 32 | 42 | 48;
  blocks: ReceiptBlock[];
}

export interface PrinterInfo {
  id: string;
  name: string;
  transport: 'bluetooth' | 'usb' | 'network' | 'system_dialog';
}

export interface ReceiptPrinter {
  discover(): Promise<PrinterInfo[]>;
  print(printerId: string, receipt: ReceiptDocument): Promise<void>;
}

export interface DeviceCapabilities {
  platform: PlatformKind;
  camera: boolean;
  secureHardware: boolean;
  /** Web only: whether the browser granted persistent storage. */
  persistentStorage: boolean | 'not_applicable';
}

export type PermissionName = 'camera' | 'bluetooth' | 'notifications';
export type PermissionStatus = 'granted' | 'denied' | 'undetermined' | 'unavailable';

export interface Permissions {
  status(name: PermissionName): Promise<PermissionStatus>;
  request(name: PermissionName): Promise<PermissionStatus>;
}
