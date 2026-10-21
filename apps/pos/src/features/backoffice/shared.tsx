import { ApiError, formatMajor, type ApiClient } from '@inkypos/core';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { radius, spacing, useColors } from '@/ui/theme';

/** The back-office calls the screens use; a manager-token ApiClient satisfies it. */
export type BackOfficeApi = Pick<
  ApiClient,
  | 'listProducts'
  | 'createProduct'
  | 'updateProduct'
  | 'listPaymentMethods'
  | 'updatePaymentMethod'
  | 'listExchangeRates'
  | 'setExchangeRate'
  | 'listBranches'
  | 'listCategories'
  | 'createCategory'
  | 'updateCategory'
  | 'listCustomers'
  | 'customerHistory'
  | 'createCustomer'
  | 'updateCustomer'
  | 'listSuppliers'
  | 'createSupplier'
  | 'updateSupplier'
  | 'stockLevels'
  | 'stockMovements'
  | 'adjustStock'
  | 'listPurchases'
  | 'recordPurchase'
  | 'salesReport'
  | 'vatReport'
  | 'profitReport'
  | 'shiftReports'
  | 'shiftReport'
  | 'auditLog'
  | 'listExpenses'
  | 'recordExpense'
  | 'paySupplier'
  | 'supplierBalances'
  | 'cashbook'
  | 'getBusiness'
  | 'updateBusiness'
  | 'getRecipe'
  | 'setRecipe'
>;

export function describeApiError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'network_error' || e.code === 'timeout') return 'Cannot reach the InkyPOS server. Back office changes need a connection.';
    if (e.code === 'forbidden') return 'Only an owner or manager can change this.';
    const first = e.details ? Object.values(e.details)[0]?.[0] : undefined;
    return first ?? e.message;
  }
  return (e as Error).message;
}

/** Loads once and on reload(); errors become a readable message. */
export function useLoad<T>(load: () => Promise<T>): { data: T | null; error: string | null; reload: () => Promise<void>; setData: (d: T) => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      setData(await load());
      setError(null);
    } catch (e) {
      setError(describeApiError(e));
    }
  }, [load]);
  useEffect(() => {
    let cancelled = false;
    load().then(
      (d) => !cancelled && setData(d),
      (e) => !cancelled && setError(describeApiError(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [load]);
  return { data, error, reload, setData };
}

export const usd = (minor: number) => `USD ${formatMajor({ amount: minor, currency: 'USD' })}`;

/** 12500 thousandths → "12.5"; units other than items get their unit. */
export function qty(milli: number, unit = 'each'): string {
  const text = milli % 1000 === 0 ? String(milli / 1000) : (milli / 1000).toFixed(3).replace(/0+$/, '');
  return unit === 'each' ? text : `${text} ${unit}`;
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : 'transparent' }]}
    >
      <Text style={{ color: selected ? colors.onPrimary : colors.text, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg, maxWidth: 720, width: '100%', alignSelf: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderWidth: 1.5, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderTopWidth: 1, paddingTop: spacing.sm },
});
