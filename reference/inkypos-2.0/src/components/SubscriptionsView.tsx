/**
 * InkyPOS 2.0 — Subscriptions & Offline Grace Period Management
 * Displays subscription tiers, feature entitlements, and interactive offline grace simulator.
 */

import React, { useState } from 'react';
import { usePos } from '../context/PosContext.tsx';
import { SUBSCRIPTION_TIERS } from '../core/subscription.ts';
import {
  CreditCard,
  ShieldCheck,
  Clock,
  AlertTriangle,
  Lock,
  CheckCircle,
  XCircle,
  Sliders,
} from 'lucide-react';

export const SubscriptionsView: React.FC = () => {
  const { tenant, graceStatus, simulateGraceOffsetDays } = usePos();
  const [selectedOffset, setSelectedOffset] = useState<number>(0);

  const currentEntitlements = SUBSCRIPTION_TIERS[tenant.subscriptionTier];

  const handleOffsetChange = (days: number) => {
    setSelectedOffset(days);
    simulateGraceOffsetDays(days);
  };

  return (
    <div className="flex-1 p-4 md:p-6 bg-slate-100 overflow-y-auto space-y-6">
      {/* Header */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-indigo-600" />
            <h1 className="text-base font-bold text-slate-900">Subscription Plans & Offline Grace</h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Multi-tenant tier entitlements with predictable offline grace period policies.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Current Plan:</span>
          <span className="text-xs font-bold uppercase bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full border border-indigo-200">
            {tenant.subscriptionTier}
          </span>
        </div>
      </div>

      {/* Interactive Offline Grace Simulator */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-indigo-600" />
          <h2 className="text-sm font-bold text-slate-800">
            Interactive Offline Grace Period Simulator
          </h2>
        </div>
        <p className="text-xs text-slate-500">
          Simulate offline duration to observe how the POS gracefully warns and transitions into lock-down mode when it cannot contact the central server:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={() => handleOffsetChange(0)}
            className={`p-3 rounded-xl border text-left transition-all ${
              selectedOffset === 0
                ? 'border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-500/20'
                : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-slate-800">Day 0 (Real-Time)</span>
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-[11px] text-slate-500">
              Terminal recently synced. Healthy state with full checkout capability.
            </p>
          </button>

          <button
            onClick={() => handleOffsetChange(12)}
            className={`p-3 rounded-xl border text-left transition-all ${
              selectedOffset === 12
                ? 'border-amber-500 bg-amber-50/50 ring-2 ring-amber-500/20'
                : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-slate-800">12 Days Offline</span>
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            </div>
            <p className="text-[11px] text-slate-500">
              Less than 48 hours remaining. Displays persistent warning badge in header.
            </p>
          </button>

          <button
            onClick={() => handleOffsetChange(16)}
            className={`p-3 rounded-xl border text-left transition-all ${
              selectedOffset === 16
                ? 'border-rose-500 bg-rose-50/50 ring-2 ring-rose-500/20'
                : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-slate-800">16 Days Offline</span>
              <Lock className="w-4 h-4 text-rose-600" />
            </div>
            <p className="text-[11px] text-slate-500">
              Grace window exceeded ({currentEntitlements.offlineGraceDays}d limit). Terminal checkout is locked.
            </p>
          </button>
        </div>

        {/* Current Grace Status Banner */}
        <div
          className={`p-4 rounded-xl border flex items-center justify-between ${
            graceStatus.status === 'HEALTHY'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : graceStatus.status === 'WARNING'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-3">
            {graceStatus.status === 'HEALTHY' && (
              <ShieldCheck className="w-6 h-6 text-emerald-600 shrink-0" />
            )}
            {graceStatus.status === 'WARNING' && (
              <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0" />
            )}
            {graceStatus.status === 'LOCKED' && (
              <Lock className="w-6 h-6 text-rose-600 shrink-0" />
            )}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider">
                Status: {graceStatus.status}
              </h4>
              <p className="text-xs mt-0.5">
                {graceStatus.reason ||
                  `${graceStatus.daysRemaining} days (${graceStatus.hoursRemaining} hours) remaining before terminal re-authentication is required.`}
              </p>
            </div>
          </div>
          <div className="text-right text-xs">
            <span className="text-[10px] uppercase font-bold block opacity-70">
              Grace Period Limit
            </span>
            <span className="font-bold text-sm">
              {currentEntitlements.offlineGraceDays} Days Allowed
            </span>
          </div>
        </div>
      </div>

      {/* Subscription Plans & Feature Matrix */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Subscription Tier Comparison Matrix
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="py-3 px-4">Feature / Entitlement</th>
                <th className="py-3 px-4">Starter</th>
                <th className="py-3 px-4">Growth (Current)</th>
                <th className="py-3 px-4">Enterprise</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="py-3 px-4 font-semibold text-slate-800">Max Branches</td>
                <td className="py-3 px-4">1 Branch</td>
                <td className="py-3 px-4 font-bold text-indigo-700">5 Branches</td>
                <td className="py-3 px-4">50 Branches</td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-semibold text-slate-800">Max POS Registers</td>
                <td className="py-3 px-4">2 Registers</td>
                <td className="py-3 px-4 font-bold text-indigo-700">10 Registers</td>
                <td className="py-3 px-4">100 Registers</td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-semibold text-slate-800">
                  Offline Grace Duration
                </td>
                <td className="py-3 px-4">7 Days</td>
                <td className="py-3 px-4 font-bold text-indigo-700">14 Days</td>
                <td className="py-3 px-4">30 Days</td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-semibold text-slate-800">
                  Multi-Currency (USD + ZiG)
                </td>
                <td className="py-3 px-4">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                </td>
                <td className="py-3 px-4">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                </td>
                <td className="py-3 px-4">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-semibold text-slate-800">
                  Fiscalisation Support (ZIMRA FDMS)
                </td>
                <td className="py-3 px-4">
                  <XCircle className="w-4 h-4 text-slate-400" />
                </td>
                <td className="py-3 px-4">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                </td>
                <td className="py-3 px-4">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-semibold text-slate-800">Direct API Access</td>
                <td className="py-3 px-4">
                  <XCircle className="w-4 h-4 text-slate-400" />
                </td>
                <td className="py-3 px-4">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                </td>
                <td className="py-3 px-4">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
