import type { ExchangeRateInfo, PaymentMethodInfo } from '@inkypos/core';
import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Banner, Button, Card, ErrorText, Field, Heading, Muted } from '@/ui/components';
import { fontSize, useColors } from '@/ui/theme';
import { CategoriesTab } from './CategoriesTab';
import { CustomersTab } from './CustomersTab';
import { ProductsTab } from './ProductsTab';
import { PurchasesTab } from './PurchasesTab';
import { Chip, describeApiError, styles, useLoad, type BackOfficeApi } from './shared';
import { StockTab } from './StockTab';

export { describeApiError, type BackOfficeApi } from './shared';

type Tab = 'products' | 'categories' | 'stock' | 'purchases' | 'customers' | 'payments' | 'rates';

const TABS: { tab: Tab; label: string }[] = [
  { tab: 'products', label: 'Products' },
  { tab: 'categories', label: 'Categories' },
  { tab: 'stock', label: 'Stock' },
  { tab: 'purchases', label: 'Goods received' },
  { tab: 'customers', label: 'Customers' },
  { tab: 'payments', label: 'Payment types' },
  { tab: 'rates', label: 'Exchange rates' },
];

export function BackOfficeScreen({ api, businessName, onSignOut }: { api: BackOfficeApi; businessName: string; onSignOut: () => void }) {
  const colors = useColors();
  const [tab, setTab] = useState<Tab>('products');
  // Stock and deliveries are per branch; a single-branch business never has to choose.
  const branches = useLoad(useCallback(() => api.listBranches(), [api]));
  const [chosenBranch, setBranchId] = useState<string | null>(null);
  const branchId = chosenBranch ?? branches.data?.[0]?.id ?? null;
  const perBranch = tab === 'stock' || tab === 'purchases';

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Card>
        <Heading>Back office · {businessName}</Heading>
        <Muted>Changes reach every till on its next sync.</Muted>
        <View style={styles.chips}>
          {TABS.map((t) => (
            <Chip key={t.tab} label={t.label} selected={tab === t.tab} onPress={() => setTab(t.tab)} />
          ))}
        </View>
        {perBranch && (branches.data?.length ?? 0) > 1 ? (
          <>
            <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>Branch</Text>
            <View style={styles.chips}>
              {branches.data!.map((b) => (
                <Chip key={b.id} label={b.name} selected={branchId === b.id} onPress={() => setBranchId(b.id)} />
              ))}
            </View>
          </>
        ) : null}
        {perBranch && branches.error ? <ErrorText>{branches.error}</ErrorText> : null}
        <Button label="Sign out" tone="secondary" onPress={onSignOut} />
      </Card>
      {tab === 'products' ? (
        <ProductsTab api={api} />
      ) : tab === 'categories' ? (
        <CategoriesTab api={api} />
      ) : tab === 'stock' ? (
        <StockTab api={api} branchId={branchId} />
      ) : tab === 'purchases' ? (
        <PurchasesTab api={api} branchId={branchId} />
      ) : tab === 'customers' ? (
        <CustomersTab api={api} />
      ) : tab === 'payments' ? (
        <PaymentTypes api={api} />
      ) : (
        <Rates api={api} />
      )}
    </ScrollView>
  );
}

// ── Payment types ─────────────────────────────────────────────────────────

function PaymentTypes({ api }: { api: BackOfficeApi }) {
  const colors = useColors();
  const methods = useLoad(useCallback(() => api.listPaymentMethods(), [api]));
  const [error, setError] = useState<string | null>(null);

  const toggle = async (m: PaymentMethodInfo) => {
    try {
      const updated = await api.updatePaymentMethod(m.id, { active: !m.active });
      methods.setData((methods.data ?? []).map((x) => (x.id === m.id ? updated : x)));
    } catch (e) {
      setError(describeApiError(e));
    }
  };

  return (
    <Card>
      <Heading>Payment types</Heading>
      {methods.error || error ? <ErrorText>{methods.error ?? error}</ErrorText> : null}
      {methods.data?.map((m) => (
        <View key={m.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: '600' }}>{m.name}</Text>
            <Muted>
              {m.currencies.join(' / ')}
              {m.initial_status === 'pending_confirmation' ? ' · recorded as awaiting confirmation' : ''}
            </Muted>
          </View>
          <Chip label={m.active ? 'On' : 'Off'} selected={m.active} onPress={() => void toggle(m)} />
        </View>
      ))}
    </Card>
  );
}

// ── Exchange rates ────────────────────────────────────────────────────────

/** "1 USD = 27 ZWG" → the stored rate, USD per ZWG, to 8 decimals. */
export function rateFromQuotePerBase(text: string): string | null {
  const perBase = Number(text.replace(',', '.'));
  if (!Number.isFinite(perBase) || perBase <= 0) return null;
  const rate = (1 / perBase).toFixed(8);
  return Number(rate) > 0 ? rate : null;
}

function Rates({ api }: { api: BackOfficeApi }) {
  const rates = useLoad(useCallback(() => api.listExchangeRates(), [api]));
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const current: ExchangeRateInfo | undefined = rates.data?.find((r) => r.quote_currency === 'ZWG');
  const rate = rateFromQuotePerBase(text);

  const save = async () => {
    if (!rate) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.setExchangeRate('ZWG', rate);
      rates.setData([created, ...(rates.data ?? [])]);
      setSaved(`Saved: 1 ZWG = ${created.rate} USD (version ${created.version}).`);
      setText('');
    } catch (e) {
      setError(describeApiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Heading>ZWG exchange rate</Heading>
      {current ? (
        <Muted>
          Current: 1 USD = {(1 / Number(current.rate)).toFixed(2)} ZWG (stored as {current.rate} USD per ZWG, version {current.version})
        </Muted>
      ) : (
        <Banner tone="warning" title="No ZWG rate set" body="Tills cannot take ZWG until a rate is set." />
      )}
      <Field label="ZWG per 1 USD" value={text} onChangeText={setText} keyboardType="decimal-pad" inputMode="decimal" placeholder="e.g. 27" />
      {text && !rate ? <ErrorText>Enter a positive number, e.g. 27 or 26.95</ErrorText> : null}
      {rate ? <Muted>Will store 1 ZWG = {rate} USD.</Muted> : null}
      {rates.error || error ? <ErrorText>{rates.error ?? error}</ErrorText> : null}
      {saved ? <Muted>{saved}</Muted> : null}
      <Button label="Set new rate" onPress={() => void save()} busy={busy} disabled={!rate} />
    </Card>
  );
}
