/**
 * InkyPOS 2.0 — Multi-Tenant & Register Management
 * Enforces tenant boundary isolation and device authorization / revocation.
 */

import React, { useState } from 'react';
import { usePos } from '../context/PosContext.tsx';
import { centralService } from '../api/central-service.ts';
import { Register } from '../core/types.ts';
import {
  Building2,
  Smartphone,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Check,
  Plus,
  RefreshCw,
  MapPin,
  Laptop,
} from 'lucide-react';

export const TenantsView: React.FC = () => {
  const { tenant, setTenant } = usePos();
  const allTenants = centralService.getAllTenants();
  const branches = centralService.getAllBranches(tenant.id);
  const [registers, setRegisters] = useState<Register[]>(
    centralService.getAllRegisters(tenant.id)
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleRevoke = async (regId: string) => {
    await centralService.revokeDevice(regId);
    setRegisters(centralService.getAllRegisters(tenant.id));
    setStatusMessage(
      `Register ${regId} has been REVOKED. Any sync requests from this device will be blocked as conflicts.`
    );
  };

  const handleAuthorize = async (regId: string) => {
    await centralService.authorizeDevice(regId);
    setRegisters(centralService.getAllRegisters(tenant.id));
    setStatusMessage(`Register ${regId} has been re-authorized.`);
  };

  return (
    <div className="flex-1 p-4 md:p-6 bg-slate-100 overflow-y-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-indigo-600" />
            <h1 className="text-base font-bold text-slate-900">Multi-Tenant & Device Administration</h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Strict tenant isolation, branch topology, and register device revocation controls.
          </p>
        </div>

        {/* Tenant Switcher */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-600">Active Tenant:</span>
          <select
            className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={tenant.id}
            onChange={(e) => {
              const selected = allTenants.find((t) => t.id === e.target.value);
              if (selected) {
                setTenant(selected);
                setRegisters(centralService.getAllRegisters(selected.id));
              }
            }}
          >
            {allTenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.slug})
              </option>
            ))}
          </select>
        </div>
      </div>

      {statusMessage && (
        <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-900 text-xs flex justify-between items-center">
          <span>{statusMessage}</span>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-900"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Tenant Profile Card */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest bg-indigo-50 px-2 py-0.5 rounded">
              TENANT PROFILE
            </span>
            <h2 className="text-lg font-black text-slate-900 mt-1">{tenant.name}</h2>
            <div className="flex flex-wrap gap-4 mt-2 text-xs text-slate-600">
              <div>
                <span className="text-slate-400">TIN:</span>{' '}
                <span className="font-mono font-semibold">{tenant.tin}</span>
              </div>
              <div>
                <span className="text-slate-400">VAT No:</span>{' '}
                <span className="font-mono font-semibold">{tenant.vatNumber || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-400">Subscription Tier:</span>{' '}
                <span className="font-semibold text-indigo-700 uppercase">
                  {tenant.subscriptionTier}
                </span>
              </div>
              <div>
                <span className="text-slate-400">Base Currency:</span>{' '}
                <span className="font-bold">{tenant.currency}</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-slate-400 block">Subscription Status</span>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 uppercase">
              {tenant.subscriptionStatus}
            </span>
          </div>
        </div>
      </div>

      {/* Branches & Registers Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Branches */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-indigo-600" />
              <span>Branches ({branches.length})</span>
            </h3>
          </div>
          <div className="divide-y divide-slate-100">
            {branches.map((b) => (
              <div key={b.id} className="p-3.5 flex items-start justify-between text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900">{b.name}</span>
                    <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                      {b.code}
                    </span>
                  </div>
                  <p className="text-slate-500 text-[11px] mt-0.5">
                    {b.address}, {b.city}
                  </p>
                </div>
                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                  ACTIVE
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Registers / Devices */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-indigo-600" />
              <span>Registered Devices ({registers.length})</span>
            </h3>
          </div>
          <div className="divide-y divide-slate-100">
            {registers.map((r) => (
              <div key={r.id} className="p-3.5 flex items-center justify-between text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    {r.platform === 'android' ? (
                      <Smartphone className="w-4 h-4 text-emerald-600" />
                    ) : r.platform === 'ios' ? (
                      <Smartphone className="w-4 h-4 text-slate-700" />
                    ) : (
                      <Laptop className="w-4 h-4 text-blue-600" />
                    )}
                    <span className="font-bold text-slate-900">{r.name}</span>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">
                      ({r.platform})
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                    Fingerprint: {r.deviceFingerprint}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {r.status === 'authorized' ? (
                    <>
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        <ShieldCheck className="w-3 h-3 text-emerald-600" />
                        AUTHORIZED
                      </span>
                      <button
                        onClick={() => handleRevoke(r.id)}
                        className="px-2 py-1 text-[10px] bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded border border-rose-200 transition-colors"
                        title="Revoke device access immediately"
                      >
                        Revoke
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                        <ShieldAlert className="w-3 h-3 text-rose-600" />
                        REVOKED
                      </span>
                      <button
                        onClick={() => handleAuthorize(r.id)}
                        className="px-2 py-1 text-[10px] bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded border border-emerald-200 transition-colors"
                      >
                        Re-Authorize
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
