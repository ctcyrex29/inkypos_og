import React, { useState } from 'react';
import { PrinterDevice, RestaurantSettings, ThemeMode } from '../types';
import {
  Bluetooth,
  Printer,
  AlertCircle,
  Sliders,
  ExternalLink,
  HelpCircle,
  Unplug,
  Usb,
  Copy,
  Check,
  CheckCircle2,
  Sparkles,
  Laptop,
  Smartphone,
  Share2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import {
  bluetoothService,
  serialService,
  getBluetoothEnvironmentStatus,
  sendToAndroidRawBt,
  shareToAndroidPrint
} from '../utils/bluetoothPrinter';

interface PrinterModalProps {
  printer: PrinterDevice;
  onUpdatePrinter: (updates: Partial<PrinterDevice>) => void;
  onClose: () => void;
  onPrintTestReceipt: () => void;
  settings?: RestaurantSettings;
  theme?: ThemeMode;
}

export const PrinterModal: React.FC<PrinterModalProps> = ({
  printer,
  onUpdatePrinter,
  onClose,
  onPrintTestReceipt,
  settings,
  theme = 'light'
}) => {
  const [connecting, setConnecting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fallbackWarning, setFallbackWarning] = useState<string | null>(null);
  const [copiedFlag, setCopiedFlag] = useState<boolean>(false);
  const [showTroubleshooting, setShowTroubleshooting] = useState<boolean>(false);
  const [serialConnecting, setSerialConnecting] = useState<boolean>(false);
  const [androidRawBtTestSuccess, setAndroidRawBtTestSuccess] = useState<boolean>(false);

  const envStatus = getBluetoothEnvironmentStatus();
  const isDark = theme === 'dark';

  // Mode 1: Pair directly via Web Bluetooth BLE
  const handlePairRealBluetooth = async () => {
    setConnecting(true);
    setErrorMsg(null);
    setFallbackWarning(null);

    const result = await bluetoothService.connect();
    setConnecting(false);

    if (result.success) {
      onUpdatePrinter({
        connected: true,
        name: result.deviceName || 'ESC/POS Thermal BT Printer',
        type: 'bluetooth',
        isConnecting: false,
      });
    } else {
      setErrorMsg(result.error || 'Pairing failed.');
      setFallbackWarning(
        result.fallbackWarning ||
        'Fallback Notice: Switch to "OS Bluetooth / System Thermal Spooler" below to print without Web Bluetooth handshake restrictions.'
      );
    }
  };

  // Mode 2: Connect via Web Serial / USB
  const handlePairSerial = async () => {
    setSerialConnecting(true);
    setErrorMsg(null);
    setFallbackWarning(null);

    const result = await serialService.connect();
    setSerialConnecting(false);

    if (result.success) {
      onUpdatePrinter({
        connected: true,
        name: result.deviceName || 'USB / Serial Thermal Printer',
        type: 'usb_serial',
        isConnecting: false,
      });
    } else {
      setErrorMsg(result.error || 'Could not connect via USB / Serial.');
      setFallbackWarning('Ensure your USB cable is plugged in firmly and you selected the correct COM/Serial port.');
    }
  };

  // Mode 3: Instant 1-Click Fix using OS Bluetooth / System Thermal Spooler
  const handleSelectSystemBluetooth = () => {
    setErrorMsg(null);
    setFallbackWarning(null);
    onUpdatePrinter({
      connected: true,
      name: 'OS Bluetooth / System Thermal Printer',
      type: 'browser',
      isConnecting: false,
    });
  };

  // Mode 4: Android RawBT / ESC-POS Print App Bridge
  const handleSelectAndroidRawBt = () => {
    setErrorMsg(null);
    setFallbackWarning(null);
    onUpdatePrinter({
      connected: true,
      name: 'Android RawBT Print App Bridge',
      type: 'android_intent',
      isConnecting: false,
    });
  };

  // Android direct test dispatch
  const handleTestAndroidRawBt = () => {
    const sampleReceipt = `
================================
     ZIMBABWEAN RESTAURANT POS  
================================
Order: #TEST
Service: Takeaway
Date: ${new Date().toLocaleTimeString()}
--------------------------------
1x Sadza with T-Bone Steak
   Side: Fresh Covo Veg
   Price: $6.50
--------------------------------
TOTAL USD: $6.50
Rate: $1 = ${settings?.zigExchangeRate || 27.5} ZiG
Total ZiG: ${((settings?.zigExchangeRate || 27.5) * 6.5).toFixed(2)} ZiG
================================
  Maita Basa! Thank You!
================================
    `;
    const dispatched = sendToAndroidRawBt(sampleReceipt);
    if (dispatched) {
      setAndroidRawBtTestSuccess(true);
      setTimeout(() => setAndroidRawBtTestSuccess(false), 3000);
    } else {
      setErrorMsg('Could not dispatch to RawBT. Ensure RawBT app is installed on your Android device.');
    }
  };

  // Android Web Share test
  const handleShareToAndroidApp = async () => {
    const sampleReceipt = `
================================
  ZIMBABWEAN RESTAURANT POS
  Sample Receipt
  TOTAL: $6.50 (USD)
================================
    `;
    await shareToAndroidPrint(sampleReceipt, 'Zim POS Receipt');
  };

  const handleDisconnect = () => {
    bluetoothService.disconnect();
    serialService.disconnect();
    onUpdatePrinter({
      connected: false,
      name: 'Disconnected',
      type: 'bluetooth',
    });
  };

  const handleOpenInNewTab = () => {
    if (typeof window !== 'undefined') {
      window.open(window.location.href, '_blank');
    }
  };

  const handleCopyChromeFlag = () => {
    navigator.clipboard.writeText('chrome://flags/#enable-web-bluetooth');
    setCopiedFlag(true);
    setTimeout(() => setCopiedFlag(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className={`border rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[92vh] transition-colors ${
        isDark
          ? 'bg-slate-900 border-slate-750 text-slate-100'
          : 'bg-white border-blue-100 text-slate-900'
      }`}>
        {/* Header */}
        <div className={`p-4 border-b flex items-center justify-between ${
          isDark ? 'bg-slate-850 border-slate-800' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#6495ED] text-white shadow-xs">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight">Receipt Printer Hub</h3>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Bluetooth, USB & Android Mobile Thermal Hardware
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1 rounded-lg cursor-pointer ${
              isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto space-y-4 text-xs">
          {/* ANDROID DEVICE DETECTED PROMINENT BANNER */}
          {envStatus.isAndroid && (
            <div className={`p-3.5 rounded-2xl border space-y-2.5 ${
              isDark
                ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-100'
                : 'bg-emerald-50 border-emerald-300 text-emerald-900'
            }`}>
              <div className="flex items-start gap-2.5">
                <div className="p-1.5 rounded-xl bg-emerald-500 text-slate-950 shrink-0 mt-0.5">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-black text-xs sm:text-sm flex items-center gap-1.5">
                    <span>Android Device Detected ({envStatus.browserName})</span>
                    <span className="text-[10px] bg-emerald-500 text-slate-950 font-black px-1.5 py-0.2 rounded uppercase">
                      Supported
                    </span>
                  </h4>
                  <p className="text-[11px] opacity-90 mt-0.5 leading-relaxed">
                    Android supports printing to 58mm/80mm Bluetooth printers via Web Bluetooth BLE,
                    the Android Print Spooler, or the popular <strong>RawBT</strong> thermal print app.
                  </p>
                </div>
              </div>

              {/* Android Fast Action Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleSelectAndroidRawBt}
                  className={`py-2 px-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm ${
                    printer.type === 'android_intent'
                      ? 'bg-orange-500 text-white ring-2 ring-orange-500/50'
                      : isDark
                      ? 'bg-slate-800 hover:bg-slate-750 text-white border border-slate-700'
                      : 'bg-white hover:bg-slate-50 text-slate-800 border border-slate-300'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5 text-orange-500" />
                  <span>Use RawBT App</span>
                </button>

                <button
                  type="button"
                  onClick={handleSelectSystemBluetooth}
                  className={`py-2 px-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm ${
                    printer.type === 'browser'
                      ? 'bg-blue-600 text-white ring-2 ring-blue-500/50'
                      : isDark
                      ? 'bg-slate-800 hover:bg-slate-750 text-white border border-slate-700'
                      : 'bg-white hover:bg-slate-50 text-slate-800 border border-slate-300'
                  }`}
                >
                  <Laptop className="w-3.5 h-3.5 text-blue-500" />
                  <span>OS Print Spooler</span>
                </button>
              </div>

              {/* Quick Android test dispatch */}
              <div className="flex items-center gap-2 pt-1 border-t border-emerald-500/20">
                <button
                  type="button"
                  onClick={handleTestAndroidRawBt}
                  className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-[11px] flex items-center justify-center gap-1 shadow-sm cursor-pointer"
                >
                  <Printer className="w-3 h-3" />
                  <span>{androidRawBtTestSuccess ? 'Dispatched to RawBT!' : 'Test RawBT Dispatch'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleShareToAndroidApp}
                  className="py-1.5 px-3 bg-slate-700/80 hover:bg-slate-700 text-white font-bold rounded-lg text-[11px] flex items-center gap-1 cursor-pointer"
                  title="Share receipt text to Android Bluetooth Print or WhatsApp"
                >
                  <Share2 className="w-3 h-3" />
                  <span>Share</span>
                </button>
              </div>
            </div>
          )}

          {/* ENVIRONMENT STATUS: If Web Bluetooth is unsupported in browser or blocked in iframe */}
          {!envStatus.isSupported && (
            <div className={`p-3.5 rounded-2xl border space-y-2 ${
              isDark
                ? 'bg-amber-950/40 border-orange-500/40 text-orange-200'
                : 'bg-orange-50 border-orange-200 text-orange-900'
            }`}>
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-xs">{envStatus.title}</h4>
                  <p className="text-[11px] opacity-90 mt-0.5 leading-relaxed">
                    {envStatus.message}
                  </p>
                </div>
              </div>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={handleSelectSystemBluetooth}
                  className="w-full py-2 bg-orange-500 hover:bg-orange-600 text-white font-black rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md shadow-orange-500/20 cursor-pointer"
                >
                  <Laptop className="w-3.5 h-3.5" />
                  <span>Use OS Bluetooth / System Thermal Spooler (Instant Fix)</span>
                </button>
              </div>
            </div>
          )}

          {/* IFRAME NOTICE: If preview frame blocks Web Bluetooth */}
          {envStatus.isIframe && (
            <div className={`p-3.5 rounded-2xl border space-y-2 ${
              isDark
                ? 'bg-blue-950/40 border-blue-500/40 text-blue-200'
                : 'bg-blue-50 border-blue-200 text-blue-900'
            }`}>
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-xs">Preview Frame Security Policy</h4>
                  <p className="text-[11px] opacity-90 mt-0.5 leading-relaxed">
                    Browser sandboxes disable hardware Bluetooth scanning inside embedded frames.
                    Open in a new tab or use the <strong>OS Bluetooth / System Spooler</strong>.
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleOpenInNewTab}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/20 cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open in New Tab</span>
                </button>
                <button
                  type="button"
                  onClick={handleSelectSystemBluetooth}
                  className={`flex-1 py-2 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 border cursor-pointer ${
                    isDark
                      ? 'bg-slate-800 hover:bg-slate-750 text-white border-slate-700'
                      : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-300'
                  }`}
                >
                  <Laptop className="w-3.5 h-3.5 text-blue-600" />
                  <span>Use OS Bluetooth</span>
                </button>
              </div>
            </div>
          )}

          {/* Active Status Card */}
          <div className={`p-4 rounded-2xl border transition-all ${
            printer.connected
              ? isDark
                ? 'bg-emerald-950/40 border-emerald-500/40'
                : 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : isDark
              ? 'bg-slate-850 border-slate-800'
              : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  printer.connected
                    ? 'bg-emerald-500 text-white'
                    : isDark
                    ? 'bg-slate-800 text-slate-400'
                    : 'bg-slate-200 text-slate-500'
                }`}>
                  {printer.type === 'usb_serial' ? (
                    <Usb className="w-5 h-5" />
                  ) : printer.type === 'browser' ? (
                    <Laptop className="w-5 h-5" />
                  ) : printer.type === 'android_intent' ? (
                    <Smartphone className="w-5 h-5" />
                  ) : (
                    <Bluetooth className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h4 className={`font-black text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {printer.connected ? printer.name : 'No Thermal Printer Connected'}
                  </h4>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`w-2 h-2 rounded-full ${
                      printer.connected ? 'bg-emerald-400 animate-pulse' : 'bg-orange-500'
                    }`} />
                    <span className={`text-[11px] font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                      {printer.connected
                        ? printer.type === 'browser'
                          ? 'Ready • Connected via OS Bluetooth / System Spooler'
                          : printer.type === 'android_intent'
                          ? 'Ready • Connected via Android RawBT Print App'
                          : printer.type === 'usb_serial'
                          ? 'Ready • Connected via USB/Serial Cable'
                          : 'Ready • Direct Web Bluetooth BLE Hardware Active'
                        : 'Select a printing pipeline below'}
                    </span>
                  </div>
                </div>
              </div>

              {printer.connected && (
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="flex items-center gap-1 text-xs text-rose-500 hover:text-rose-600 font-bold px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-800/40 cursor-pointer"
                >
                  <Unplug className="w-3 h-3" />
                  <span>Disconnect</span>
                </button>
              )}
            </div>
          </div>

          {/* Connection Error & Fallback Warning Notice */}
          {errorMsg && (
            <div className="bg-rose-50 border border-rose-300 dark:bg-rose-950/50 dark:border-rose-500/40 rounded-xl p-3 text-rose-800 dark:text-rose-200 space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-rose-700 dark:text-rose-300">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                <span>Pairing Issue Detected</span>
              </div>
              <p className="text-[11px] leading-relaxed">{errorMsg}</p>
              {fallbackWarning && (
                <div className="p-2 rounded-lg bg-white/60 dark:bg-slate-900/60 border border-rose-200 dark:border-rose-900/60 text-[10px] font-medium">
                  <span className="font-bold">Recommendation: </span>
                  {fallbackWarning}
                </div>
              )}
            </div>
          )}

          {/* CONNECTION OPTIONS LIST */}
          <div className="space-y-2">
            <span className={`text-xs font-bold uppercase tracking-wider block ${
              isDark ? 'text-slate-400' : 'text-slate-500'
            }`}>
              Available Hardware Pipelines:
            </span>

            {/* Option 1: OS Bluetooth / System Thermal (Universal Fix) */}
            <div
              onClick={handleSelectSystemBluetooth}
              className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                printer.connected && printer.type === 'browser'
                  ? 'bg-orange-500/10 border-orange-500 ring-2 ring-orange-500/30'
                  : isDark
                  ? 'bg-slate-850 hover:bg-slate-800 border-slate-800'
                  : 'bg-slate-50 hover:bg-blue-50/60 border-slate-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 text-blue-600 rounded-xl">
                  <Laptop className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-xs">OS Bluetooth / System Thermal Spooler</p>
                    <span className="text-[9px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold px-1.5 py-0.2 rounded border border-emerald-500/30">
                      100% Reliable
                    </span>
                  </div>
                  <p className={`text-[10px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Prints to your paired thermal printer via OS driver. Zero browser flag requirements!
                  </p>
                </div>
              </div>

              {printer.connected && printer.type === 'browser' ? (
                <CheckCircle2 className="w-5 h-5 text-orange-500 shrink-0" />
              ) : (
                <button
                  type="button"
                  className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-xs shrink-0 cursor-pointer shadow-sm"
                >
                  Select
                </button>
              )}
            </div>

            {/* Option 2: Android RawBT / ESC-POS App Bridge */}
            <div
              onClick={handleSelectAndroidRawBt}
              className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                printer.connected && printer.type === 'android_intent'
                  ? 'bg-orange-500/10 border-orange-500 ring-2 ring-orange-500/30'
                  : isDark
                  ? 'bg-slate-850 hover:bg-slate-800 border-slate-800'
                  : 'bg-slate-50 hover:bg-blue-50/60 border-slate-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-500/10 text-orange-500 rounded-xl">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-xs">Android RawBT Print App Bridge</p>
                    <span className="text-[9px] bg-blue-500/15 text-blue-600 dark:text-blue-400 font-bold px-1.5 py-0.2 rounded border border-blue-500/30">
                      Android Classic & BLE
                    </span>
                  </div>
                  <p className={`text-[10px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Dispatches print commands directly into RawBT, supporting all Bluetooth SPP & BLE thermal printers.
                  </p>
                </div>
              </div>

              {printer.connected && printer.type === 'android_intent' ? (
                <CheckCircle2 className="w-5 h-5 text-orange-500 shrink-0" />
              ) : (
                <button
                  type="button"
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs shrink-0 cursor-pointer shadow-sm"
                >
                  Select
                </button>
              )}
            </div>

            {/* Option 3: Direct Web Bluetooth BLE */}
            <div
              className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                printer.connected && printer.type === 'bluetooth'
                  ? 'bg-orange-500/10 border-orange-500 ring-2 ring-orange-500/30'
                  : isDark
                  ? 'bg-slate-850 border-slate-800'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-600/10 text-blue-600 rounded-xl">
                  <Bluetooth className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-bold text-xs">Direct Web Bluetooth (BLE)</p>
                  <p className={`text-[10px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Direct browser BLE communication with POS-58, MPT-II & Xprinter hardware.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handlePairRealBluetooth}
                disabled={connecting}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs shrink-0 flex items-center gap-1 cursor-pointer disabled:opacity-50 shadow-sm"
              >
                <Bluetooth className="w-3 h-3" />
                <span>{connecting ? 'Scanning...' : 'Pair BLE'}</span>
              </button>
            </div>

            {/* Option 4: USB / Web Serial Cable */}
            <div
              className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                printer.connected && printer.type === 'usb_serial'
                  ? 'bg-orange-500/10 border-orange-500 ring-2 ring-orange-500/30'
                  : isDark
                  ? 'bg-slate-850 border-slate-800'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/10 text-emerald-600 rounded-xl">
                  <Usb className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-bold text-xs">USB / Serial Cable</p>
                  <p className={`text-[10px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    For POS printers connected via USB cable or USB-OTG adapter.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handlePairSerial}
                disabled={serialConnecting}
                className={`px-3 py-1.5 font-bold rounded-xl text-xs shrink-0 flex items-center gap-1 cursor-pointer disabled:opacity-50 ${
                  isDark ? 'bg-slate-750 hover:bg-slate-700 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                }`}
              >
                <Usb className="w-3 h-3" />
                <span>{serialConnecting ? 'Connecting...' : 'Connect USB'}</span>
              </button>
            </div>
          </div>

          {/* Test Thermal Print Action */}
          <div className="pt-2">
            <button
              type="button"
              onClick={onPrintTestReceipt}
              className="w-full py-2.5 px-4 bg-orange-500 hover:bg-orange-600 text-white font-black rounded-2xl text-xs flex items-center justify-center gap-2 cursor-pointer transition-all shadow-md shadow-orange-500/20 active:scale-98"
            >
              <Printer className="w-4 h-4" />
              <span>Print Test Receipt (1 Single Copy)</span>
            </button>
          </div>

          {/* Thermal Preferences */}
          <div className={`p-4 rounded-2xl border space-y-3 ${
            isDark ? 'bg-slate-850 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center gap-2 font-bold">
              <Sliders className="w-4 h-4 text-orange-500" />
              <span>Thermal Receipt Preferences</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onUpdatePrinter({ paperWidth: '58mm' })}
                className={`py-2 px-3 rounded-xl border font-bold text-xs transition-all ${
                  printer.paperWidth === '58mm'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : isDark
                    ? 'bg-slate-800 text-slate-400 border-slate-700'
                    : 'bg-white text-slate-700 border-slate-300'
                }`}
              >
                58mm Portable Roll
              </button>
              <button
                type="button"
                onClick={() => onUpdatePrinter({ paperWidth: '80mm' })}
                className={`py-2 px-3 rounded-xl border font-bold text-xs transition-all ${
                  printer.paperWidth === '80mm'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : isDark
                    ? 'bg-slate-800 text-slate-400 border-slate-700'
                    : 'bg-white text-slate-700 border-slate-300'
                }`}
              >
                80mm Countertop Roll
              </button>
            </div>

            {/* Darkness */}
            <div className="space-y-1">
              <label className={`text-[10px] font-bold uppercase tracking-wider block ${
                isDark ? 'text-slate-400' : 'text-slate-500'
              }`}>
                Thermal Density / Darkness
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['normal', 'dark', 'deep_black'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => onUpdatePrinter({ printDarkness: d })}
                    className={`py-1.5 rounded-lg border text-[11px] font-bold capitalize transition-all ${
                      (printer.printDarkness || 'deep_black') === d
                        ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                        : isDark
                        ? 'bg-slate-800 text-slate-400 border-slate-700'
                        : 'bg-white text-slate-700 border-slate-300'
                    }`}
                  >
                    {d.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Strictly 1 Single Receipt Setting */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="font-semibold">Receipt Copies</p>
                  <span className="text-[10px] bg-orange-500/20 text-orange-600 dark:text-orange-400 font-bold px-1.5 py-0.2 rounded border border-orange-500/30">
                    Strictly 1 Copy
                  </span>
                </div>
                <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Produces exactly 1 physical ticket (no duplicate pages)
                </p>
              </div>
              <span className={`text-xs font-black px-3 py-1 rounded-xl border ${
                isDark
                  ? 'text-orange-400 bg-slate-800 border-slate-700'
                  : 'text-orange-600 bg-white border-slate-300'
              }`}>
                1 Copy
              </span>
            </div>
          </div>

          {/* Collapsible Android & Troubleshooting Guide */}
          <div className={`rounded-2xl border p-3.5 space-y-2 ${
            isDark ? 'bg-slate-850 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}>
            <button
              type="button"
              onClick={() => setShowTroubleshooting(!showTroubleshooting)}
              className="w-full flex items-center justify-between text-left font-bold cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-blue-500" />
                <span>Android & Hardware Setup Guide</span>
              </div>
              {showTroubleshooting ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showTroubleshooting && (
              <div className="pt-2 space-y-2 text-[11px] leading-relaxed border-t border-slate-200 dark:border-slate-800">
                <div className="space-y-1">
                  <p className="font-bold text-orange-500">Android Setup (Step-by-Step):</p>
                  <ol className="list-decimal pl-4 space-y-1 opacity-90">
                    <li>Open <strong>Android Settings &gt; Connected devices &gt; Bluetooth</strong>.</li>
                    <li>Turn ON Bluetooth and pair with your printer (e.g. <em>MPT-II</em>, <em>POS-58</em>, PIN is usually <code>0000</code> or <code>1234</code>).</li>
                    <li>Return to this POS and choose <strong>OS Bluetooth / System Thermal Spooler</strong> or tap <strong>Use RawBT App</strong>.</li>
                  </ol>
                </div>

                <div className="space-y-1 pt-1">
                  <p className="font-bold text-blue-500">Bluetooth Classic vs BLE:</p>
                  <p className="opacity-90">
                    Many low-cost portable printers use Bluetooth Classic (SPP). The Web Bluetooth API only talks to BLE devices. If direct BLE pairing cannot find your printer, select <strong>OS Bluetooth</strong> or <strong>RawBT</strong> for instant printing.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className={`p-4 border-t flex items-center justify-between ${
          isDark ? 'bg-slate-850 border-slate-800' : 'bg-slate-50 border-slate-200'
        }`}>
          <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Thermal ESC/POS • 20-byte MTU Pacing Active
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs cursor-pointer shadow-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
