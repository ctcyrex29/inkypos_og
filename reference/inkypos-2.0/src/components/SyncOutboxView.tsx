/**
 * InkyPOS 2.0 — Sync Outbox & Central Reconciler View
 * Displays durable event outbox, ACK status, idempotency inspection,
 * lost-ACK simulation, conflict resolution queue, and financial reconciliation.
 */

import React, { useState } from 'react';
import { usePos } from '../context/PosContext.tsx';
import { centralService } from '../api/central-service.ts';
import { OutboxItem, SaleTransaction } from '../core/types.ts';
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowRight,
  ShieldAlert,
  Repeat,
  FileCheck,
  Database,
  ArrowDownCircle,
  Eye,
  Trash2,
} from 'lucide-react';

export const SyncOutboxView: React.FC = () => {
  const {
    outboxItems,
    refreshOutbox,
    triggerSync,
    simulateLostAck,
    simulateConflict,
    localSales,
    isOnline,
    tenant,
  } = usePos();

  const [selectedItem, setSelectedItem] = useState<OutboxItem | null>(null);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Central sales for reconciliation
  const centralSales = centralService.getCentralSales(tenant.id);

  // Calculate local vs central volume
  const localVolumeUSD = localSales.reduce((acc, s) => acc + s.totalUSD, 0);
  const centralVolumeUSD = centralSales.reduce((acc, s) => acc + s.totalUSD, 0);
  const volumeDiff = localVolumeUSD - centralVolumeUSD;

  const handleManualSync = async () => {
    setIsSyncing(true);
    setSyncStatusMsg('Initiating authenticated batch sync with Laravel central API...');
    const res = await triggerSync();
    setSyncStatusMsg(res.message);
    setIsSyncing(false);
  };

  const getStatusBadge = (status: OutboxItem['status']) => {
    switch (status) {
      case 'ACKNOWLEDGED':
        return (
          <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            SYNCHRONIZED
          </span>
        );
      case 'PENDING':
        return (
          <span className="flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
            <Clock className="w-3 h-3 text-amber-600" />
            PENDING SYNC
          </span>
        );
      case 'SYNCING':
        return (
          <span className="flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
            <RefreshCw className="w-3 h-3 text-blue-600 animate-spin" />
            IN TRANSIT
          </span>
        );
      case 'CONFLICT':
        return (
          <span className="flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
            <AlertTriangle className="w-3 h-3 text-rose-600" />
            CONFLICT (REVIEW)
          </span>
        );
      case 'REVIEW_NEEDED':
        return (
          <span className="flex items-center gap-1 text-[11px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full">
            <ShieldAlert className="w-3 h-3 text-purple-600" />
            MAX RETRIES EXCEEDED
          </span>
        );
    }
  };

  return (
    <div className="flex-1 p-4 md:p-6 bg-slate-100 overflow-y-auto space-y-6">
      {/* Page Title & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-indigo-600" />
            <h1 className="text-base font-bold text-slate-900">Durable Synchronization Outbox</h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Offline-first transactional queue with idempotency keys, exponential retry backoff, and lost-ACK recovery.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Lost ACK Simulation Button */}
          {localSales.length > 0 && (
            <button
              onClick={() => {
                simulateLostAck(localSales[0]);
                setSyncStatusMsg(
                  `Simulated lost ACK for sale #${localSales[0].localReceiptNumber}. Status reset to PENDING. Resending will trigger safe idempotency handling.`
                );
              }}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 flex items-center gap-1.5 transition-colors"
              title="Re-enqueue an already synchronized sale to test that the server re-acknowledges safely without creating duplicates"
            >
              <Repeat className="w-3.5 h-3.5 text-indigo-600" />
              <span>Simulate Lost ACK</span>
            </button>
          )}

          {/* Conflict Simulator */}
          <button
            onClick={() => {
              simulateConflict();
              setSyncStatusMsg('Injected cross-tenant conflict test event into outbox.');
            }}
            className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold rounded-lg border border-rose-300 flex items-center gap-1.5 transition-colors"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
            <span>Simulate Conflict</span>
          </button>

          {/* Sync Trigger */}
          <button
            onClick={handleManualSync}
            disabled={isSyncing || !isOnline}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow flex items-center gap-2 transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>Sync Outbox Now</span>
          </button>
        </div>
      </div>

      {syncStatusMsg && (
        <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-900 text-xs flex items-center justify-between">
          <span>{syncStatusMsg}</span>
          <button
            onClick={() => setSyncStatusMsg(null)}
            className="text-indigo-500 hover:text-indigo-800 text-xs font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Financial Reconciliation Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
            Local Terminal Volume
          </span>
          <div className="text-xl font-black text-slate-900">${localVolumeUSD.toFixed(2)} USD</div>
          <span className="text-xs text-slate-500 mt-1 block">
            {localSales.length} local transactions in SQLite/IndexedDB
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
            Central Laravel Server Volume
          </span>
          <div className="text-xl font-black text-indigo-600">${centralVolumeUSD.toFixed(2)} USD</div>
          <span className="text-xs text-slate-500 mt-1 block">
            {centralSales.length} committed central sales
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
            Reconciliation Balance Delta
          </span>
          <div
            className={`text-xl font-black ${
              volumeDiff === 0 ? 'text-emerald-600' : 'text-amber-600'
            }`}
          >
            {volumeDiff === 0 ? 'RECONCILED ($0.00)' : `$${volumeDiff.toFixed(2)} USD Pending Sync`}
          </div>
          <span className="text-xs text-slate-500 mt-1 block">
            {volumeDiff === 0
              ? 'Local terminal & central server financial totals 100% matched.'
              : 'Differences reflect offline sales awaiting upload.'}
          </span>
        </div>
      </div>

      {/* Outbox Items Queue Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Outbox Events Queue ({outboxItems.length} records)
          </h3>
          <span className="text-[11px] text-slate-500">
            Ordered chronologically by local generation time
          </span>
        </div>

        {outboxItems.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <FileCheck className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-xs font-medium">Outbox is empty.</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Complete sales in the Point of Sale tab to generate persistent synchronization events.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-2.5 px-3">Event Type</th>
                  <th className="py-2.5 px-3">Receipt / ID</th>
                  <th className="py-2.5 px-3">Idempotency Key</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Retries</th>
                  <th className="py-2.5 px-3">Occurred At</th>
                  <th className="py-2.5 px-3 text-right">Payload</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {outboxItems.map((item) => {
                  const sale =
                    item.syncEvent.eventType === 'SALE_CREATED'
                      ? (item.syncEvent.payload as SaleTransaction)
                      : null;

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                      onClick={() => setSelectedItem(item)}
                    >
                      <td className="py-2.5 px-3 font-mono font-bold text-indigo-700">
                        {item.syncEvent.eventType} (v{item.syncEvent.eventVersion})
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-800">
                        {sale ? sale.localReceiptNumber : item.syncEvent.eventId.slice(0, 8)}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[10px] text-slate-500 truncate max-w-[180px]">
                        {item.syncEvent.idempotencyKey}
                      </td>
                      <td className="py-2.5 px-3">{getStatusBadge(item.status)}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">{item.retryCount}</td>
                      <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                        {new Date(item.syncEvent.occurredAt).toLocaleTimeString()}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedItem(item);
                          }}
                          className="px-2 py-1 text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-medium flex items-center gap-1 ml-auto"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Inspect</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Event Details Drawer Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-150">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">Sync Outbox Event Inspector</h3>
                <p className="text-[10px] font-mono text-slate-400">
                  Event ID: {selectedItem.syncEvent.eventId}
                </p>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="text-slate-400 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div>
                  <span className="text-[10px] text-slate-500 font-bold uppercase">Status:</span>
                  <div className="mt-0.5">{getStatusBadge(selectedItem.status)}</div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-bold uppercase">
                    Idempotency Key:
                  </span>
                  <div className="mt-0.5 font-mono text-slate-800 text-[11px] break-all">
                    {selectedItem.syncEvent.idempotencyKey}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-bold uppercase">
                    Tenant & Register:
                  </span>
                  <div className="mt-0.5 text-slate-800">
                    {selectedItem.syncEvent.tenantId} / {selectedItem.syncEvent.registerId}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-bold uppercase">
                    Retry Count:
                  </span>
                  <div className="mt-0.5 text-slate-800 font-mono">
                    {selectedItem.retryCount} (Next retry: {new Date(selectedItem.nextRetryAt).toLocaleTimeString()})
                  </div>
                </div>
              </div>

              {selectedItem.conflictDetails && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800">
                  <div className="font-bold flex items-center gap-1.5 text-rose-900">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    <span>Conflict Reason: {selectedItem.conflictDetails.reason}</span>
                  </div>
                  <p className="text-[11px] mt-1">
                    Strategy: {selectedItem.conflictDetails.resolutionStrategy}
                  </p>
                  <pre className="bg-rose-100/70 p-2 rounded mt-2 text-[10px] overflow-x-auto">
                    {JSON.stringify(selectedItem.conflictDetails, null, 2)}
                  </pre>
                </div>
              )}

              <div>
                <span className="text-xs font-bold text-slate-800 block mb-1">
                  Full Event Payload (JSON):
                </span>
                <pre className="bg-slate-900 text-emerald-400 p-3 rounded-xl text-[10px] font-mono overflow-x-auto max-h-60">
                  {JSON.stringify(selectedItem.syncEvent, null, 2)}
                </pre>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setSelectedItem(null)}
                className="px-4 py-1.5 bg-slate-800 text-white text-xs font-semibold rounded-lg hover:bg-slate-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
