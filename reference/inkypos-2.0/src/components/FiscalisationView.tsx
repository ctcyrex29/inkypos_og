/**
 * InkyPOS 2.0 — Fiscalisation (ZIMRA FDMS Ready)
 * Provider-neutral fiscalisation architecture maintaining strict non-active
 * status until official regulatory and certificate verification.
 */

import React, { useState } from 'react';
import { usePos } from '../context/PosContext.tsx';
import { NeutralFiscalAdapter } from '../core/fiscal.ts';
import {
  FileText,
  ShieldCheck,
  AlertOctagon,
  CheckCircle2,
  Lock,
  QrCode,
  Calendar,
  Layers,
  ArrowRight,
} from 'lucide-react';

export const FiscalisationView: React.FC = () => {
  const { tenant } = usePos();
  const [adapterMode, setAdapterMode] = useState<'INACTIVE' | 'STAGING'>('INACTIVE');
  const [zReportStatus, setZReportStatus] = useState<string | null>(null);

  const fiscalAdapter = new NeutralFiscalAdapter(
    adapterMode === 'INACTIVE'
      ? 'INACTIVE_PENDING_VERIFICATION'
      : 'STAGING_SIMULATION'
  );

  const handleGenerateZReport = async () => {
    if (adapterMode === 'INACTIVE') {
      setZReportStatus(
        'Action Blocked: Adapter is INACTIVE pending official ZIMRA FDMS certificate enrollment.'
      );
      return;
    }
    const res = await fiscalAdapter.closeFiscalDay(1);
    if (res.success) {
      setZReportStatus(`Z-Report generated successfully: ${res.zReportNumber}`);
    }
  };

  return (
    <div className="flex-1 p-4 md:p-6 bg-slate-100 overflow-y-auto space-y-6">
      {/* Header */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-600" />
            <h1 className="text-base font-bold text-slate-900">
              Provider-Neutral Fiscalisation Engine
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Architected for Zimbabwean ZIMRA FDMS / Virtual Fiscal Device integration.
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg border border-slate-300 text-xs font-semibold">
          <button
            onClick={() => setAdapterMode('INACTIVE')}
            className={`px-3 py-1 rounded transition-colors ${
              adapterMode === 'INACTIVE'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-950'
            }`}
          >
            INACTIVE (Production Default)
          </button>
          <button
            onClick={() => setAdapterMode('STAGING')}
            className={`px-3 py-1 rounded transition-colors ${
              adapterMode === 'STAGING'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-950'
            }`}
          >
            Staging Simulation Stub
          </button>
        </div>
      </div>

      {/* Regulatory Compliance & Safety Banner */}
      <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs flex items-start gap-3">
        <AlertOctagon className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h4 className="font-bold uppercase tracking-wider text-amber-950">
            Compliance & Verification Boundary
          </h4>
          <p className="leading-relaxed">
            As mandated by Section 8 of the InkyPOS 2.0 system specification, this interface is
            provider-neutral and strictly avoids inventing fake endpoints, mock certificates, or
            unauthorized compliance claims. Production integration remains dormant until official
            ZIMRA FDMS technical verification, cryptographic device keys, and public root
            certificates are provisioned.
          </p>
        </div>
      </div>

      {/* Adapter Status Card */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
                adapterMode === 'INACTIVE'
                  ? 'bg-slate-100 text-slate-600'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">{fiscalAdapter.name}</h3>
              <p className="text-xs text-slate-500">Adapter ID: {fiscalAdapter.id}</p>
            </div>
          </div>

          <div>
            <span
              className={`text-xs font-bold px-3 py-1 rounded-full border uppercase ${
                adapterMode === 'INACTIVE'
                  ? 'bg-slate-100 text-slate-700 border-slate-300'
                  : 'bg-amber-50 text-amber-800 border-amber-300'
              }`}
            >
              {adapterMode === 'INACTIVE' ? 'INACTIVE (LOCKED)' : 'STAGING SIMULATION'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
            <span className="text-[10px] text-slate-400 font-bold uppercase">
              Taxpayer Identification
            </span>
            <div className="font-mono font-bold text-slate-800">{tenant.tin}</div>
            <span className="text-[10px] text-slate-500">VAT Registered: {tenant.vatNumber || 'Yes'}</span>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
            <span className="text-[10px] text-slate-400 font-bold uppercase">
              Virtual Device Serial
            </span>
            <div className="font-mono font-bold text-slate-800">
              {adapterMode === 'INACTIVE' ? 'UNENROLLED' : 'VFD-ZW-2026-9901'}
            </div>
            <span className="text-[10px] text-slate-500">Hardware Security Module / TPM</span>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
            <span className="text-[10px] text-slate-400 font-bold uppercase">
              Fiscal Day Status
            </span>
            <div className="font-bold text-emerald-700 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              <span>Day #1 Open</span>
            </div>
            <span className="text-[10px] text-slate-500">Requires daily Z-Report closure</span>
          </div>
        </div>

        {/* Z-Report Closure Controls */}
        <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-600">
            End of Day Reconciliation: Generates fiscal day Z-Report and rolls over fiscal counters.
          </div>
          <button
            onClick={handleGenerateZReport}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg shadow-xs flex items-center gap-1.5 transition-colors"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Generate Fiscal Day Z-Report</span>
          </button>
        </div>

        {zReportStatus && (
          <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-900 text-xs">
            {zReportStatus}
          </div>
        )}
      </div>

      {/* Code Architecture Schema Preview */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
          Provider-Neutral TypeScript Interface Specification (`IFiscalAdapter`)
        </h3>
        <p className="text-xs text-slate-500">
          Enables seamless plug-and-play integration with certified fiscal hardware vendors or direct
          ZIMRA REST/SOAP gateways without modifying checkout or receipt core business logic:
        </p>
        <pre className="p-3 bg-slate-900 text-slate-100 rounded-xl text-[11px] font-mono overflow-x-auto leading-relaxed">
{`export interface IFiscalAdapter {
  id: string;
  name: string;
  mode: 'INACTIVE_PENDING_VERIFICATION' | 'STAGING_SIMULATION' | 'PRODUCTION_ACTIVE';
  isEnabled(): boolean;
  verifyReadiness(): Promise<{ ready: boolean; reason: string }>;
  processSale(sale: SaleTransaction): Promise<{
    success: boolean;
    metadata?: FiscalReceiptMetadata;
    error?: string;
  }>;
  closeFiscalDay(dayNumber: number): Promise<{ success: boolean; zReportNumber?: string }>;
}`}
        </pre>
      </div>
    </div>
  );
};
