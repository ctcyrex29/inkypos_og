import React from 'react';
import { Bluetooth, Printer, User, UtensilsCrossed, AlertTriangle, Usb, Laptop, Lock, Sun, Moon } from 'lucide-react';
import { PrinterDevice, RestaurantSettings, ThemeMode, PosUser } from '../types';

interface HeaderProps {
  currentCashier: string;
  onCashierChange: (cashier: string) => void;
  printer: PrinterDevice;
  onOpenPrinterModal: () => void;
  settings: RestaurantSettings;
  lowStockCount?: number;
  onNavigateToInventory?: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  currentUser: PosUser | null;
  onLockPos: () => void;
}

const CASHIERS = ['Chipo M.', 'Farai T.', 'Tafadzwa K.', 'Ruvimbo N.'];

export const Header: React.FC<HeaderProps> = ({
  currentCashier,
  onCashierChange,
  printer,
  onOpenPrinterModal,
  settings,
  lowStockCount = 0,
  onNavigateToInventory,
  theme,
  onToggleTheme,
  currentUser,
  onLockPos
}) => {
  const isDark = theme === 'dark';

  return (
    <header
      id="app-main-header"
      className={`sticky top-0 z-30 px-3 sm:px-4 py-2.5 flex items-center justify-between transition-colors duration-200 border-b ${
        isDark
          ? 'bg-slate-900/95 border-slate-800 text-white backdrop-blur-md'
          : 'bg-white border-slate-200 text-slate-900 shadow-xs'
      }`}
    >
      {/* Brand & Slogan */}
      <div className="flex items-center space-x-2.5">
        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#6495ED] flex items-center justify-center text-white font-bold shadow-xs">
          <UtensilsCrossed className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className={`text-sm sm:text-base font-bold tracking-tight line-clamp-1 ${
              isDark ? 'text-white' : 'text-slate-900'
            }`}>
              {settings.restaurantName}
            </h1>
            <span className="text-[10px] font-bold bg-[#F9812A] text-white px-1.5 py-0.5 rounded uppercase">
              POS
            </span>
          </div>
          <div className={`flex items-center gap-2 text-[11px] ${
            isDark ? 'text-slate-400' : 'text-slate-500'
          }`}>
            <span className="line-clamp-1 hidden sm:inline">{settings.tagline}</span>
            <span className={`font-semibold px-1.5 py-0.2 rounded border ${
              isDark
                ? 'text-[#F9812A] bg-[#F9812A]/10 border-[#F9812A]/30'
                : 'text-[#6495ED] bg-[#6495ED]/10 border-[#6495ED]/30'
            }`}>
              $1 = {settings.zigExchangeRate.toFixed(2)} ZiG
            </span>
          </div>
        </div>
      </div>

      {/* Right controls: Low Stock Alert + Theme Toggle + Cashier/User + Bluetooth Printer Status */}
      <div className="flex items-center space-x-1.5 sm:space-x-2">
        {/* Theme Switcher Button */}
        <button
          onClick={onToggleTheme}
          type="button"
          className={`p-2 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
            isDark
              ? 'bg-slate-800 border-slate-700 text-[#F9812A] hover:bg-slate-750'
              : 'bg-slate-50 border-slate-200 text-[#6495ED] hover:bg-slate-100'
          }`}
          title={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
        >
          {isDark ? <Sun className="w-4 h-4 text-[#F9812A]" /> : <Moon className="w-4 h-4 text-[#6495ED]" />}
        </button>

        {/* Low stock badge */}
        {lowStockCount > 0 && (
          <button
            onClick={onNavigateToInventory}
            className={`flex items-center gap-1 text-xs px-2 py-1.5 rounded-xl font-medium border transition-all ${
              isDark
                ? 'bg-[#F9812A]/15 border-[#F9812A]/40 text-[#F9812A] hover:bg-[#F9812A]/25'
                : 'bg-[#F9812A]/10 border-[#F9812A]/30 text-[#F9812A] hover:bg-[#F9812A]/20'
            }`}
            title="View low stock ingredients in inventory"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-[#F9812A]" />
            <span className="hidden sm:inline">{lowStockCount} Low Stock</span>
            <span className="sm:hidden">{lowStockCount}</span>
          </button>
        )}

        {/* User Identity & Lock Screen Trigger */}
        <button
          onClick={onLockPos}
          type="button"
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
            isDark
              ? 'bg-slate-800 border-slate-700 text-slate-200 hover:border-[#6495ED]/50'
              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-white hover:border-slate-300'
          }`}
          title="Lock POS / Switch Cashier"
        >
          <div className="w-4 h-4 rounded-full bg-[#6495ED] text-white text-[9px] font-bold flex items-center justify-center">
            {currentUser?.avatarInitials || 'CM'}
          </div>
          <span className="hidden sm:inline truncate max-w-[90px]">
            {currentUser?.name || currentCashier}
          </span>
          <Lock className="w-3 h-3 text-[#F9812A]" />
        </button>

        {/* Receipt Printer Status Indicator Button */}
        <button
          onClick={onOpenPrinterModal}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
            printer.connected
              ? isDark
                ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-400 hover:bg-emerald-900/50'
                : 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100'
              : isDark
              ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750'
              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-white'
          }`}
          title="Receipt Printer Hub"
        >
          <div className="relative">
            <Printer className="w-3.5 h-3.5" />
            <span
              className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${
                printer.connected ? 'bg-emerald-400 animate-ping' : 'bg-[#F9812A]'
              }`}
            />
          </div>
          <span className="hidden md:inline font-semibold">
            {printer.connected
              ? printer.name || 'Printer Active'
              : 'Printer Setup'}
          </span>
          {printer.type === 'usb_serial' ? (
            <Usb className={`w-3 h-3 ${printer.connected ? 'text-emerald-500' : 'text-slate-400'}`} />
          ) : printer.type === 'browser' ? (
            <Laptop className={`w-3 h-3 ${printer.connected ? 'text-emerald-500' : 'text-slate-400'}`} />
          ) : (
            <Bluetooth className={`w-3 h-3 ${printer.connected ? 'text-emerald-500' : 'text-[#6495ED]'}`} />
          )}
        </button>
      </div>
    </header>
  );
};

