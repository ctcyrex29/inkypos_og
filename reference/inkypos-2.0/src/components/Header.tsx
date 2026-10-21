/**
 * InkyPOS 2.0 — App Header
 * Displays tenant context, active register, network mode toggle,
 * sync outbox status pill, and offline grace badge.
 */

import React from 'react';
import { usePos } from '../context/PosContext.tsx';
import { centralService } from '../api/central-service.ts';
import {
  Store,
  Wifi,
  WifiOff,
  RefreshCw,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Lock,
  User,
  DollarSign,
  Coins,
} from 'lucide-react';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, setActiveTab }) => {
  const {
    tenant,
    setTenant,
    branch,
    register,
    cashier,
    isOnline,
    setIsOnline,
    outboxItems,
    triggerSync,
    graceStatus,
    currency,
    setCurrency,
    exchangeRate,
  } = usePos();

  const allTenants = centralService.getAllTenants();
  const pendingCount = outboxItems.filter((i) => i.status === 'PENDING').length;
  const conflictCount = outboxItems.filter((i) => i.status === 'CONFLICT').length;

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-30 shadow-md">
      {/* Top Banner & Control Bar */}
      <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        {/* Brand & Multi-Tenant Selector */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center font-black text-lg tracking-wider text-white shadow-inner">
              IN
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-base tracking-tight text-white">InkyPOS</span>
                <span className="text-xs bg-indigo-500/20 text-indigo-300 font-semibold px-1.5 py-0.5 rounded border border-indigo-400/30">
                  2.0
                </span>
              </div>
              <span className="text-[10px] text-slate-400 block -mt-0.5">InkGenius Technologies</span>
            </div>
          </div>

          <div className="h-6 w-px bg-slate-700 hidden sm:block" />

          {/* Tenant Switcher */}
          <div className="flex items-center gap-2 bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700">
            <Store className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <select
              aria-label="Select Tenant"
              className="bg-transparent text-xs font-medium text-slate-200 focus:outline-none cursor-pointer"
              value={tenant.id}
              onChange={(e) => {
                const found = allTenants.find((t) => t.id === e.target.value);
                if (found) setTenant(found);
              }}
            >
              {allTenants.map((t) => (
                <option key={t.id} value={t.id} className="bg-slate-900 text-white">
                  {t.name} ({t.subscriptionTier.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          {/* Branch & Register Pill */}
          <div className="hidden lg:flex items-center gap-2 text-xs text-slate-300 bg-slate-800/50 px-2.5 py-1 rounded-md border border-slate-700/60">
            <span className="font-medium text-indigo-300">{branch.name}</span>
            <span className="text-slate-500">|</span>
            <span className="text-slate-400">{register.name}</span>
          </div>
        </div>

        {/* System Status: Offline Grace, Currency, Network & Outbox Sync */}
        <div className="flex items-center flex-wrap gap-2.5">
          {/* Currency Switcher */}
          <div className="flex items-center bg-slate-800 rounded-md p-0.5 border border-slate-700 text-xs font-semibold">
            <button
              onClick={() => setCurrency('USD')}
              className={`px-2 py-1 rounded flex items-center gap-1 transition-colors ${
                currency === 'USD'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Base Currency USD"
            >
              <DollarSign className="w-3 h-3" />
              <span>USD</span>
            </button>
            <button
              onClick={() => setCurrency('ZIG')}
              className={`px-2 py-1 rounded flex items-center gap-1 transition-colors ${
                currency === 'ZIG'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title={`Zimbabwe Gold (ZiG @ rate 1:${exchangeRate})`}
            >
              <Coins className="w-3 h-3" />
              <span>ZiG</span>
            </button>
          </div>

          {/* Offline Grace Badge */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${
              graceStatus.status === 'HEALTHY'
                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60'
                : graceStatus.status === 'WARNING'
                ? 'bg-amber-950/60 text-amber-300 border-amber-800/60 animate-pulse'
                : 'bg-rose-950/70 text-rose-300 border-rose-800/70'
            }`}
            title={graceStatus.reason || `Offline grace: ${graceStatus.daysRemaining} days remaining`}
          >
            {graceStatus.status === 'HEALTHY' && <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />}
            {graceStatus.status === 'WARNING' && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
            {graceStatus.status === 'LOCKED' && <Lock className="w-3.5 h-3.5 text-rose-400" />}
            <span className="hidden sm:inline">Grace:</span>
            <span>{graceStatus.status === 'LOCKED' ? 'EXPIRED' : `${graceStatus.daysRemaining}d`}</span>
          </div>

          {/* Network Simulator Toggle */}
          <button
            onClick={() => setIsOnline(!isOnline)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all border ${
              isOnline
                ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-600/30'
                : 'bg-amber-600/20 text-amber-300 border-amber-500/40 hover:bg-amber-600/30'
            }`}
            title="Click to toggle Network Online / Offline simulation"
          >
            {isOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                <span>ONLINE</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                <span>OFFLINE MODE</span>
              </>
            )}
          </button>

          {/* Outbox Sync Pill */}
          <button
            onClick={() => {
              setActiveTab('outbox');
              if (isOnline) triggerSync();
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
              conflictCount > 0
                ? 'bg-rose-900/40 text-rose-200 border-rose-700'
                : pendingCount > 0
                ? 'bg-blue-900/40 text-blue-200 border-blue-700 hover:bg-blue-900/60'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
            title="Outbox Synchronization Status"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${pendingCount > 0 && isOnline ? 'animate-spin' : ''}`} />
            <span>Outbox:</span>
            <span className="font-bold">{pendingCount}</span>
            {conflictCount > 0 && (
              <span className="bg-rose-500 text-white text-[10px] px-1 rounded font-bold">
                {conflictCount} conflict
              </span>
            )}
          </button>

          {/* Cashier Badge */}
          <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-400 bg-slate-800/60 px-2 py-1 rounded border border-slate-700/50">
            <User className="w-3 h-3 text-slate-400" />
            <span>{cashier.name}</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <nav className="flex items-center gap-1 px-4 bg-slate-950/70 border-t border-slate-800/80 overflow-x-auto text-xs font-medium">
        <button
          onClick={() => setActiveTab('pos')}
          className={`px-3 py-2 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'pos'
              ? 'border-indigo-500 text-indigo-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Point of Sale
        </button>

        <button
          onClick={() => setActiveTab('catalog')}
          className={`px-3 py-2 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'catalog'
              ? 'border-indigo-500 text-indigo-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Product Catalog & Snapshots
        </button>

        <button
          onClick={() => setActiveTab('outbox')}
          className={`px-3 py-2 border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'outbox'
              ? 'border-indigo-500 text-indigo-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>Sync Outbox</span>
          {pendingCount > 0 && (
            <span className="bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
              {pendingCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('sales')}
          className={`px-3 py-2 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'sales'
              ? 'border-indigo-500 text-indigo-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Sales Ledger
        </button>

        <button
          onClick={() => setActiveTab('tenants')}
          className={`px-3 py-2 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'tenants'
              ? 'border-indigo-500 text-indigo-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Tenants & Devices
        </button>

        <button
          onClick={() => setActiveTab('subscriptions')}
          className={`px-3 py-2 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'subscriptions'
              ? 'border-indigo-500 text-indigo-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Subscriptions & Grace
        </button>

        <button
          onClick={() => setActiveTab('fiscal')}
          className={`px-3 py-2 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'fiscal'
              ? 'border-indigo-500 text-indigo-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Fiscalisation (ZIMRA)
        </button>

        <button
          onClick={() => setActiveTab('architecture')}
          className={`px-3 py-2 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'architecture'
              ? 'border-indigo-500 text-indigo-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Architecture & Backlog
        </button>
      </nav>
    </header>
  );
};
