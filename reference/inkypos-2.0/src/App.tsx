/**
 * InkyPOS 2.0 — Main App Shell
 * InkGenius Technologies
 */

import React, { useState } from 'react';
import { PosProvider, usePos } from './context/PosContext.tsx';
import { Header } from './components/Header.tsx';
import { PosRegister } from './components/PosRegister.tsx';
import { SyncOutboxView } from './components/SyncOutboxView.tsx';
import { SalesLedgerView } from './components/SalesLedgerView.tsx';
import { TenantsView } from './components/TenantsView.tsx';
import { SubscriptionsView } from './components/SubscriptionsView.tsx';
import { FiscalisationView } from './components/FiscalisationView.tsx';
import { ArchitectureDocsView } from './components/ArchitectureDocsView.tsx';
import { ProductCatalog } from './components/ProductCatalog.tsx';

function MainLayout() {
  const [activeTab, setActiveTab] = useState<string>('pos');
  const { isInitialized } = usePos();

  if (!isInitialized) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-900 text-white space-y-3">
        <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center font-black text-xl animate-pulse">
          IN
        </div>
        <div className="text-sm font-semibold tracking-wide">Initializing InkyPOS 2.0 Engine...</div>
        <div className="text-xs text-slate-400">Loading local SQLite / IndexedDB storage snapshot</div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-slate-100 font-sans antialiased text-slate-800">
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="flex-1 flex overflow-hidden">
        {activeTab === 'pos' && <PosRegister />}
        {activeTab === 'catalog' && <ProductCatalog />}
        {activeTab === 'outbox' && <SyncOutboxView />}
        {activeTab === 'sales' && <SalesLedgerView />}
        {activeTab === 'tenants' && <TenantsView />}
        {activeTab === 'subscriptions' && <SubscriptionsView />}
        {activeTab === 'fiscal' && <FiscalisationView />}
        {activeTab === 'architecture' && <ArchitectureDocsView />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <PosProvider>
      <MainLayout />
    </PosProvider>
  );
}
