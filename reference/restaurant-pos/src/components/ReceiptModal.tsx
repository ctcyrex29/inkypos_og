import React, { useState, useEffect } from 'react';
import { Order, PaymentRecord, PrinterDevice, ZReport, RestaurantSettings, ThemeMode } from '../types';
import {
  Printer,
  Copy,
  Check,
  X,
  Usb,
  Laptop,
  Share2,
  Download,
  UtensilsCrossed,
  Receipt,
  FileText,
  Sliders
} from 'lucide-react';
import {
  formatReceiptText,
  formatKitchenTicketText,
  formatZReportText,
  sendPrintJob,
  updatePrintTargetDOM
} from '../utils/bluetoothPrinter';

export type ReceiptViewType = 'customer' | 'kitchen' | 'bill';

interface ReceiptModalProps {
  order?: Order;
  payment?: PaymentRecord;
  zReport?: ZReport;
  printer: PrinterDevice;
  onClose: () => void;
  onOpenPrinterSetup: () => void;
  settings?: RestaurantSettings;
  theme?: ThemeMode;
  initialType?: ReceiptViewType;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  order,
  payment,
  zReport,
  printer,
  onClose,
  onOpenPrinterSetup,
  settings,
  theme = 'light',
  initialType = 'customer'
}) => {
  const isDark = theme === 'dark';
  const [copied, setCopied] = useState<boolean>(false);
  const [printStatus, setPrintStatus] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<ReceiptViewType>(initialType);
  const [activeWidth, setActiveWidth] = useState<'58mm' | '80mm'>(printer.paperWidth || '58mm');

  // Compute thermal text based on active type
  let receiptText = '';
  if (zReport) {
    receiptText = formatZReportText(zReport, activeWidth, settings);
  } else if (order) {
    if (activeType === 'kitchen') {
      receiptText = formatKitchenTicketText(order, activeWidth, settings);
    } else if (activeType === 'bill') {
      // Bill format: order without payment confirmed
      receiptText = formatReceiptText(order, undefined, activeWidth, settings, { includeAsciiLogo: true });
    } else {
      // Customer receipt: with payment if available
      const effPayment = payment || order.payments?.[0];
      receiptText = formatReceiptText(order, effPayment, activeWidth, settings, { includeAsciiLogo: true });
    }
  }

  // Pre-sync dedicated print target container so browser/system spoolers find it instantly
  useEffect(() => {
    if (receiptText) {
      updatePrintTargetDOM(receiptText, settings);
    }
  }, [receiptText, settings]);

  const handleCopy = () => {
    if (!receiptText) return;
    navigator.clipboard.writeText(receiptText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = async () => {
    if (!receiptText) return;

    setPrintStatus('Processing print job...');
    const res = await sendPrintJob(receiptText, { ...printer, paperWidth: activeWidth }, settings);
    setPrintStatus(res.message);
    setTimeout(() => setPrintStatus(null), 3500);
  };

  const handleSystemPrint = () => {
    if (!receiptText) return;
    updatePrintTargetDOM(receiptText, settings);
    setTimeout(() => {
      window.print();
    }, 120);
  };

  const handleMobileShare = async () => {
    if (!receiptText) return;
    const title = zReport
      ? `Z-Report ${zReport.date}`
      : `Order #${order?.orderNumber || 'Receipt'} (${activeType.toUpperCase()})`;

    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      try {
        await (navigator as any).share({
          title,
          text: receiptText,
        });
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          handleCopy();
        }
      }
    } else {
      handleCopy();
    }
  };

  const handleDownloadTxt = () => {
    if (!receiptText) return;
    const filename = zReport
      ? `z-report-${zReport.date}.txt`
      : `order-${order?.orderNumber || 'receipt'}-${activeType}.txt`;

    const blob = new Blob([receiptText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className={`border rounded-2xl w-full max-w-md shadow-xl overflow-hidden flex flex-col max-h-[94vh] transition-colors ${
        isDark
          ? 'bg-slate-900 border-slate-800 text-white'
          : 'bg-white border-slate-200 text-slate-900'
      }`}>
        {/* Header */}
        <div className={`p-3.5 border-b flex items-center justify-between ${
          isDark ? 'bg-slate-850 border-slate-800' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#6495ED] text-white shadow-xs">
              {activeType === 'kitchen' ? (
                <UtensilsCrossed className="w-4 h-4" />
              ) : activeType === 'bill' ? (
                <FileText className="w-4 h-4" />
              ) : (
                <Printer className="w-4 h-4" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black tracking-tight">
                  {zReport
                    ? 'Z-Report Audit Slip'
                    : `Order #${order?.orderNumber || 'POS'} Receipt`}
                </h3>
                {order && (
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-[#F9812A]/15 text-[#F9812A] border border-[#F9812A]/30">
                    {order.serviceType === 'sit_in' ? 'Sit-In' : 'Takeaway'}
                  </span>
                )}
              </div>
              <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {printer.connected ? `Printer: ${printer.name}` : 'Thermal Preview Ready'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className={`p-1.5 rounded-xl cursor-pointer transition-colors ${
              isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-400 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="Close Receipt Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Toast */}
        {printStatus && (
          <div className="bg-[#F9812A] text-white px-4 py-2 text-xs font-bold text-center">
            {printStatus}
          </div>
        )}

        {/* Sub-controls: Mode Switcher & Paper Width */}
        {!zReport && order && (
          <div className={`px-3 py-2 border-b flex items-center justify-between gap-2 text-xs ${
            isDark ? 'bg-slate-850/60 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}>
            {/* View Mode Tabs */}
            <div className="flex items-center gap-1 bg-slate-200/80 dark:bg-slate-800 p-0.5 rounded-lg">
              <button
                onClick={() => setActiveType('customer')}
                className={`px-2.5 py-1 rounded-md font-bold text-[11px] transition-colors cursor-pointer flex items-center gap-1 ${
                  activeType === 'customer'
                    ? 'bg-white dark:bg-slate-700 text-[#6495ED] shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Receipt className="w-3 h-3" />
                <span>Customer</span>
              </button>

              <button
                onClick={() => setActiveType('kitchen')}
                className={`px-2.5 py-1 rounded-md font-bold text-[11px] transition-colors cursor-pointer flex items-center gap-1 ${
                  activeType === 'kitchen'
                    ? 'bg-white dark:bg-slate-700 text-[#6495ED] shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <UtensilsCrossed className="w-3 h-3" />
                <span>Kitchen</span>
              </button>

              <button
                onClick={() => setActiveType('bill')}
                className={`px-2.5 py-1 rounded-md font-bold text-[11px] transition-colors cursor-pointer flex items-center gap-1 ${
                  activeType === 'bill'
                    ? 'bg-white dark:bg-slate-700 text-[#6495ED] shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <FileText className="w-3 h-3" />
                <span>Bill</span>
              </button>
            </div>

            {/* Paper Width Toggle */}
            <div className="flex items-center gap-1">
              <span className={`text-[10px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Width:</span>
              <button
                onClick={() => setActiveWidth('58mm')}
                className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border transition-colors cursor-pointer ${
                  activeWidth === '58mm'
                    ? 'bg-[#6495ED] text-white border-[#6495ED]'
                    : isDark
                    ? 'bg-slate-800 text-slate-400 border-slate-700'
                    : 'bg-white text-slate-600 border-slate-300'
                }`}
              >
                58mm
              </button>
              <button
                onClick={() => setActiveWidth('80mm')}
                className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border transition-colors cursor-pointer ${
                  activeWidth === '80mm'
                    ? 'bg-[#6495ED] text-white border-[#6495ED]'
                    : isDark
                    ? 'bg-slate-800 text-slate-400 border-slate-700'
                    : 'bg-white text-slate-600 border-slate-300'
                }`}
              >
                80mm
              </button>
            </div>
          </div>
        )}

        {/* Paper Receipt Display (Clean, simple, non-crowded thermal preview) */}
        <div className={`p-4 flex-1 overflow-y-auto flex flex-col items-center ${
          isDark ? 'bg-slate-950' : 'bg-slate-100'
        }`}>
          {order && (
            <div className="mb-2.5 px-3 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full shadow-xs flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500">Order Ref:</span>
              <span className="text-xs font-black text-[#F9812A]">#{order.orderNumber}</span>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                {order.serviceType === 'sit_in' ? (order.tableNumber ? `Table ${order.tableNumber}` : 'Sit-In') : 'Takeaway'}
              </span>
            </div>
          )}

          <div
            id="printable-receipt"
            className="w-full max-w-[340px] bg-white text-black p-5 rounded-md shadow-md font-mono text-[11px] leading-normal select-text border border-slate-200 relative"
          >
            {/* Monospace simple receipt */}
            <div className="whitespace-pre font-mono text-[10px] leading-snug text-slate-900 font-semibold">
              {receiptText}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className={`p-3.5 border-t space-y-2.5 ${
          isDark ? 'bg-slate-850 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          {/* Primary Print button */}
          <button
            onClick={handlePrint}
            className="w-full py-2.5 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-xs bg-[#F9812A] hover:bg-[#e0701a] text-white active:scale-98 cursor-pointer"
          >
            {printer.type === 'usb_serial' ? (
              <Usb className="w-4 h-4 text-white" />
            ) : printer.type === 'browser' ? (
              <Laptop className="w-4 h-4 text-white" />
            ) : (
              <Printer className="w-4 h-4 text-white" />
            )}
            <span>
              {activeType === 'kitchen'
                ? 'Print Kitchen Docket'
                : activeType === 'bill'
                ? 'Print Bill'
                : 'Print Receipt'}
            </span>
          </button>

          <div className="flex items-center justify-between pt-0.5 text-xs flex-wrap gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={handleCopy}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-medium cursor-pointer transition-colors ${
                  isDark
                    ? 'border-slate-750 text-slate-300 hover:text-white hover:bg-slate-800'
                    : 'border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>

              <button
                onClick={handleMobileShare}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-medium cursor-pointer transition-colors ${
                  isDark
                    ? 'border-slate-750 text-slate-300 hover:text-white hover:bg-slate-800'
                    : 'border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                }`}
                title="Send text to mobile printer app"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share</span>
              </button>

              <button
                onClick={handleDownloadTxt}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-medium cursor-pointer transition-colors ${
                  isDark
                    ? 'border-slate-750 text-slate-300 hover:text-white hover:bg-slate-800'
                    : 'border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                }`}
                title="Download receipt text file"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Save</span>
              </button>

              <button
                onClick={handleSystemPrint}
                className="text-[#6495ED] hover:underline text-[11px] font-bold cursor-pointer px-1 py-1"
                title="Direct OS print dialog"
              >
                System Print
              </button>
            </div>

            <button
              onClick={onOpenPrinterSetup}
              className="text-[#F9812A] hover:underline font-bold text-[11px] cursor-pointer shrink-0 flex items-center gap-1"
            >
              <Sliders className="w-3 h-3" />
              <span>{printer.connected ? 'Printer Setup' : 'Connect Printer'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
