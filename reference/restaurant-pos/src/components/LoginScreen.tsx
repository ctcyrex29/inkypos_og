import React, { useState, useEffect } from 'react';
import { Lock, User, ShieldCheck, Sun, Moon, Delete, CheckCircle2, AlertCircle, UtensilsCrossed } from 'lucide-react';
import { PosUser, ThemeMode, RestaurantSettings } from '../types';

export const INITIAL_STAFF_USERS: PosUser[] = [
  {
    id: 'user-chipo',
    name: 'Chipo Moyo',
    role: 'cashier',
    pin: '1234',
    avatarInitials: 'CM',
    color: 'bg-[#6495ED]'
  },
  {
    id: 'user-tinashe',
    name: 'Tinashe Sithole',
    role: 'cashier',
    pin: '2222',
    avatarInitials: 'TS',
    color: 'bg-[#507ecf]'
  },
  {
    id: 'user-farai',
    name: 'Farai Takawira',
    role: 'manager',
    pin: '9999',
    avatarInitials: 'FT',
    color: 'bg-[#F9812A]'
  },
  {
    id: 'user-tatenda',
    name: 'Tatenda Ncube',
    role: 'kitchen',
    pin: '5555',
    avatarInitials: 'TN',
    color: 'bg-slate-700'
  }
];

interface LoginScreenProps {
  onLoginSuccess: (user: PosUser) => void;
  settings: RestaurantSettings;
  theme: ThemeMode;
  onToggleTheme: () => void;
  initialSelectedUserId?: string;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onLoginSuccess,
  settings,
  theme,
  onToggleTheme,
  initialSelectedUserId
}) => {
  const [selectedUser, setSelectedUser] = useState<PosUser>(() => {
    if (initialSelectedUserId) {
      const found = INITIAL_STAFF_USERS.find((u) => u.id === initialSelectedUserId);
      if (found) return found;
    }
    return INITIAL_STAFF_USERS[0];
  });

  const [pin, setPin] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Keyboard handler for typing PIN
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Escape') {
        handleClear();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pin, selectedUser]);

  const handleDigit = (digit: string) => {
    if (pin.length >= 4) return;
    const newPin = pin + digit;
    setPin(newPin);
    setErrorMsg(null);

    if (newPin.length === 4) {
      verifyPin(newPin);
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
    setErrorMsg(null);
  };

  const handleClear = () => {
    setPin('');
    setErrorMsg(null);
  };

  const verifyPin = (candidatePin: string) => {
    setTimeout(() => {
      if (candidatePin === selectedUser.pin) {
        onLoginSuccess(selectedUser);
      } else {
        setErrorMsg(`Incorrect PIN. Default is ${selectedUser.pin}`);
        setPin('');
      }
    }, 150);
  };

  const handleQuickLogin = (user: PosUser) => {
    setSelectedUser(user);
    setPin(user.pin);
    onLoginSuccess(user);
  };

  const isDark = theme === 'dark';

  return (
    <div
      id="login-screen-root"
      className={`min-h-screen w-full flex flex-col justify-between transition-colors ${
        isDark ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'
      }`}
    >
      {/* Top Bar */}
      <header className={`px-4 sm:px-6 py-3.5 flex items-center justify-between border-b ${
        isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'
      }`}>
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-[#6495ED] flex items-center justify-center text-white font-bold shadow-xs">
            <UtensilsCrossed className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight">{settings.restaurantName}</h1>
              <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-[#F9812A] text-white">
                POS
              </span>
            </div>
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Authentic Zimbabwean Dining
            </p>
          </div>
        </div>

        {/* Theme Switcher */}
        <button
          onClick={onToggleTheme}
          type="button"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
            isDark
              ? 'bg-slate-800 border-slate-700 text-[#F9812A] hover:bg-slate-750'
              : 'bg-[#6495ED]/10 border-[#6495ED]/30 text-[#6495ED] hover:bg-[#6495ED]/15'
          }`}
          title="Toggle White, Blue & Orange Theme"
        >
          {isDark ? <Sun className="w-4 h-4 text-[#F9812A]" /> : <Moon className="w-4 h-4 text-[#6495ED]" />}
          <span className="hidden sm:inline">
            {isDark ? 'Dark Theme' : 'White & Blue Theme'}
          </span>
        </button>
      </header>

      {/* Main Login Card */}
      <main className="flex-1 max-w-lg mx-auto w-full p-4 sm:p-6 flex flex-col items-center justify-center">
        <div className={`w-full rounded-2xl border p-6 sm:p-8 shadow-xs transition-colors ${
          isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          {/* Lock Icon & Title */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#6495ED] text-white shadow-xs mb-3">
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Staff Sign In</h2>
            <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Select your name and enter your 4-digit PIN
            </p>
          </div>

          {/* Staff Member Buttons */}
          <div className="mb-6">
            <label className={`block text-[11px] font-bold uppercase tracking-wider mb-2 ${
              isDark ? 'text-slate-400' : 'text-slate-500'
            }`}>
              Select User
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {INITIAL_STAFF_USERS.map((user) => {
                const isSelected = selectedUser.id === user.id;
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => {
                      setSelectedUser(user);
                      setPin('');
                      setErrorMsg(null);
                    }}
                    className={`p-3 rounded-xl border text-left transition-colors relative flex flex-col justify-between cursor-pointer ${
                      isSelected
                        ? isDark
                          ? 'border-[#6495ED] bg-[#6495ED]/15 text-white ring-1 ring-[#6495ED]'
                          : 'border-[#6495ED] bg-[#6495ED]/10 text-slate-900 ring-1 ring-[#6495ED] shadow-xs'
                        : isDark
                        ? 'border-slate-800 bg-slate-850 text-slate-300 hover:border-slate-700'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className={`w-8 h-8 rounded-lg ${user.color} text-white font-bold text-xs flex items-center justify-center`}>
                        {user.avatarInitials}
                      </div>
                      {isSelected && (
                        <CheckCircle2 className="w-4 h-4 text-[#6495ED]" />
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-bold truncate">{user.name}</p>
                      <span className={`inline-block text-[10px] font-bold uppercase mt-0.5 px-1.5 py-0.2 rounded ${
                        user.role === 'manager'
                          ? 'bg-[#F9812A]/15 text-[#F9812A]'
                          : 'bg-[#6495ED]/15 text-[#6495ED]'
                      }`}>
                        {user.role}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* PIN Input Dots */}
          <div className="mb-5 flex flex-col items-center">
            <div className="flex items-center gap-3 mb-2">
              {[0, 1, 2, 3].map((index) => {
                const filled = pin.length > index;
                return (
                  <div
                    key={index}
                    className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                      filled
                        ? isDark
                          ? 'bg-[#F9812A] border-[#F9812A] scale-110'
                          : 'bg-[#6495ED] border-[#6495ED] scale-110'
                        : isDark
                        ? 'bg-slate-800 border-slate-700'
                        : 'bg-slate-100 border-slate-300'
                    }`}
                  />
                );
              })}
            </div>

            {errorMsg ? (
              <div className="flex items-center gap-1.5 text-xs text-rose-500 font-bold mt-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            ) : (
              <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {selectedUser.name} • Default PIN: <span className="font-mono font-bold">{selectedUser.pin}</span>
              </p>
            )}
          </div>

          {/* Numeric Touch Keypad (3x4 Grid) */}
          <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto mb-5">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => handleDigit(digit)}
                className={`h-12 rounded-xl text-base font-bold transition-colors cursor-pointer flex items-center justify-center ${
                  isDark
                    ? 'bg-slate-800 hover:bg-slate-750 text-white border border-slate-700 active:bg-[#6495ED]'
                    : 'bg-slate-50 hover:bg-[#6495ED]/10 text-slate-900 border border-slate-200 active:bg-[#6495ED] active:text-white'
                }`}
              >
                {digit}
              </button>
            ))}
            <button
              type="button"
              onClick={handleClear}
              className={`h-12 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center ${
                isDark
                  ? 'bg-slate-850 hover:bg-slate-800 text-slate-400 border border-slate-800'
                  : 'bg-slate-50 hover:bg-slate-200 text-slate-600 border border-slate-200'
              }`}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => handleDigit('0')}
              className={`h-12 rounded-xl text-base font-bold transition-colors cursor-pointer flex items-center justify-center ${
                isDark
                  ? 'bg-slate-800 hover:bg-slate-750 text-white border border-slate-700 active:bg-[#6495ED]'
                  : 'bg-slate-50 hover:bg-[#6495ED]/10 text-slate-900 border border-slate-200 active:bg-[#6495ED] active:text-white'
              }`}
            >
              0
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              className={`h-12 rounded-xl font-bold transition-colors cursor-pointer flex items-center justify-center ${
                isDark
                  ? 'bg-slate-850 hover:bg-slate-800 text-rose-400 border border-slate-800'
                  : 'bg-slate-50 hover:bg-rose-50 text-rose-600 border border-slate-200'
              }`}
            >
              <Delete className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Demo 1-Click Access Buttons */}
          <div className={`pt-4 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
            <p className={`text-[10px] uppercase tracking-wider font-bold text-center mb-2 ${
              isDark ? 'text-slate-400' : 'text-slate-500'
            }`}>
              Quick 1-Click Access
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleQuickLogin(INITIAL_STAFF_USERS[0])}
                className="py-2.5 px-3 rounded-xl bg-[#6495ED] hover:bg-[#507ecf] text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs active:scale-98 transition-transform cursor-pointer"
              >
                <User className="w-3.5 h-3.5" />
                <span>Enter as Cashier</span>
              </button>
              <button
                type="button"
                onClick={() => handleQuickLogin(INITIAL_STAFF_USERS[2])}
                className="py-2.5 px-3 rounded-xl bg-[#F9812A] hover:bg-[#e0701a] text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs active:scale-98 transition-transform cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Enter as Manager</span>
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className={`py-3 px-4 text-center text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
        USD & ZiG Multi-Currency POS • Thermal Printing Hub
      </footer>
    </div>
  );
};
