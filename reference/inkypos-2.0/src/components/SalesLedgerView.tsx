/**
 * InkyPOS 2.0 — Local Sales Ledger
 * Visualizes completed sales stored in local SQLite / IndexedDB
 */

import React, { useState } from 'react';
import { usePos } from '../context/PosContext.tsx';
import { SaleTransaction } from '../core/types.ts';
import { formatCurrency } from '../core/currency.ts';
import { Receipt, CheckCircle, Clock, Eye, Printer, X } from 'lucide-react';

export const SalesLedgerView: React.FC = () => {
  const { localSales, outboxItems, tenant } = usePos();
  const [selectedSale, setSelectedSale] = useState<SaleTransaction | null>(null);

  // Map outbox item status by sale ID
  const saleStatusMap = new Map<string, string>();
  for (const item of outboxItems) {
    if (item.syncEvent.payload && (item.syncEvent.payload as SaleTransaction).id) {
      saleStatusMap.set(
        (item.syncEvent.payload as SaleTransaction).id,
        item.status
      );
    }
  }

  return (
    <div className="flex-1 p-4 md:p-6 bg-slate-100 overflow-y-auto space-y-4">
      <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-indigo-600" />
            <h1 className="text-base font-bold text-slate-900">Local Sales Ledger</h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Durable financial records committed in terminal storage for {tenant.name}.
          </p>
        </div>
        <span className="text-xs font-semibold bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full border border-indigo-200">
          {localSales.length} Total Sales Recorded
        </span>
      </div>

      {localSales.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
          <Receipt className="w-10 h-10 mx-auto mb-2 text-slate-300" />
          <p className="text-sm font-semibold text-slate-700">No Sales Recorded Yet</p>
          <p className="text-xs text-slate-400 mt-1">
            Complete a transaction in the Point of Sale register to see records appear here.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-2.5 px-3">Receipt No</th>
                  <th className="py-2.5 px-3">Date & Time</th>
                  <th className="py-2.5 px-3">Cashier</th>
                  <th className="py-2.5 px-3">Items</th>
                  <th className="py-2.5 px-3">Total (USD)</th>
                  <th className="py-2.5 px-3">Total (ZiG)</th>
                  <th className="py-2.5 px-3">Sync Status</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {localSales.map((sale) => {
                  const syncStatus = saleStatusMap.get(sale.id) || 'ACKNOWLEDGED';
                  return (
                    <tr key={sale.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                        {sale.localReceiptNumber}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500">
                        {new Date(sale.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">{sale.cashierName}</td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {sale.items.reduce((a, b) => a + b.quantity, 0)} items
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">
                        ${sale.totalUSD.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-amber-700">
                        ZiG {sale.totalInDisplayCurrency.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3">
                        {syncStatus === 'ACKNOWLEDGED' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            <CheckCircle className="w-3 h-3 text-emerald-600" />
                            SYNCED
                          </span>
                        ) : syncStatus === 'PENDING' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                            <Clock className="w-3 h-3 text-amber-600" />
                            OUTBOX PENDING
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                            {syncStatus}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => setSelectedSale(sale)}
                          className="px-2.5 py-1 text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-medium inline-flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" />
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sale Details Modal */}
      {selectedSale && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-150">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">Sale {selectedSale.localReceiptNumber}</h3>
                <p className="text-[10px] text-slate-400 font-mono">ID: {selectedSale.id}</p>
              </div>
              <button
                onClick={() => setSelectedSale(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs max-h-[70vh] overflow-y-auto">
              <div className="space-y-1">
                <span className="font-bold text-slate-700 block">Items:</span>
                {selectedSale.items.map((i) => (
                  <div
                    key={i.product.id}
                    className="flex justify-between p-2 bg-slate-50 rounded border border-slate-100"
                  >
                    <span>
                      {i.quantity}x {i.product.name}
                    </span>
                    <span className="font-bold">${i.totalUSD.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-200 pt-2 space-y-1">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>${selectedSale.subtotalUSD.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tax (Standard 15% VAT):</span>
                  <span>${selectedSale.taxTotalUSD.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-sm text-slate-900 pt-1 border-t border-slate-100">
                  <span>Total:</span>
                  <span>${selectedSale.totalUSD.toFixed(2)} USD</span>
                </div>
                <div className="flex justify-between font-bold text-amber-700">
                  <span>Total (ZiG @ rate {selectedSale.exchangeRateUsed}):</span>
                  <span>ZiG {selectedSale.totalInDisplayCurrency.toFixed(2)}</span>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-2">
                <span className="font-bold text-slate-700 block mb-1">Tender Breakdown:</span>
                {selectedSale.payments.map((p) => (
                  <div key={p.id} className="flex justify-between text-slate-600">
                    <span>{p.paymentMethod}</span>
                    <span>
                      {p.currency === 'ZIG' ? `ZiG ${p.amount}` : `$${p.amount}`}
                    </span>
                  </div>
                ))}
                {selectedSale.changeDueUSD > 0 && (
                  <div className="flex justify-between text-emerald-600 font-bold mt-1">
                    <span>Change Returned:</span>
                    <span>${selectedSale.changeDueUSD.toFixed(2)} USD</span>
                  </div>
                )}
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setSelectedSale(null)}
                className="px-4 py-1.5 bg-slate-800 text-white text-xs font-semibold rounded-lg hover:bg-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
