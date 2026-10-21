import React from 'react';
import { Utensils, ChefHat, Package, BarChart3, Printer, Settings } from 'lucide-react';
import { ThemeMode } from '../types';

export type TabType = 'pos' | 'kitchen' | 'inventory' | 'accounting' | 'printer' | 'settings';

interface NavigationProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  kitchenBadgeCount?: number;
  lowStockCount?: number;
  theme?: ThemeMode;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onTabChange,
  kitchenBadgeCount = 0,
  lowStockCount = 0,
  theme = 'light'
}) => {
  const isDark = theme === 'dark';

  const tabs = [
    {
      id: 'pos' as TabType,
      label: 'Meals',
      icon: Utensils,
    },
    {
      id: 'kitchen' as TabType,
      label: 'Kitchen',
      icon: ChefHat,
      badge: kitchenBadgeCount > 0 ? kitchenBadgeCount : undefined,
      badgeColor: 'bg-[#F9812A]',
    },
    {
      id: 'inventory' as TabType,
      label: 'Inventory',
      icon: Package,
      badge: lowStockCount > 0 ? lowStockCount : undefined,
      badgeColor: 'bg-rose-500',
    },
    {
      id: 'accounting' as TabType,
      label: 'Accounts',
      icon: BarChart3,
    },
    {
      id: 'printer' as TabType,
      label: 'Printer',
      icon: Printer,
    },
    {
      id: 'settings' as TabType,
      label: 'Settings',
      icon: Settings,
    }
  ];

  return (
    <nav
      id="bottom-navigation-bar"
      className={`fixed bottom-0 left-0 right-0 z-40 px-2 py-1.5 safe-area-pb transition-colors duration-200 border-t ${
        isDark
          ? 'bg-slate-900/95 backdrop-blur-lg border-slate-800'
          : 'bg-white border-slate-200 shadow-xs'
      }`}
    >
      <div className="max-w-xl mx-auto grid grid-cols-6 gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`relative flex flex-col items-center justify-center py-1.5 px-0.5 rounded-xl transition-all duration-150 cursor-pointer ${
                isActive
                  ? isDark
                    ? 'text-[#6495ED] bg-[#6495ED]/15 font-bold shadow-xs'
                    : 'text-[#6495ED] bg-[#6495ED]/10 font-bold ring-1 ring-[#6495ED]/30 shadow-xs'
                  : isDark
                  ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  : 'text-slate-600 hover:text-[#6495ED] hover:bg-slate-50'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 ${isActive ? 'scale-105' : ''} transition-transform`} />
                {tab.badge !== undefined && (
                  <span
                    className={`absolute -top-1.5 -right-2 min-w-4 h-4 px-1 rounded-full text-[9px] font-bold text-white flex items-center justify-center shadow-xs ${
                      tab.badgeColor || 'bg-[#F9812A]'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] mt-1 tracking-tight truncate max-w-full">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

