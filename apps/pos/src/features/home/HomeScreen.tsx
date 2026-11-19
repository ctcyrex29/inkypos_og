import { formatMajor, type EntitlementState, type LocalSale, type StaffInfo } from '@inkypos/core';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { entitlementMessage } from '@/features/status/DevicePanel';
import type { SyncSummary } from '@/features/sync/sync-status';
import { SYNC_LABELS } from '@/features/sync/SyncPanel';
import { Avatar, Banner, Button, Card, Icon, IconButton, ListRow, Pill, SectionLabel, Tile } from '@/ui/components';
import { elevation, fontSize, radius, spacing, useColors } from '@/ui/theme';

export interface HomeActions {
  newSale: () => void;
  orders: (() => void) | null;
  kitchen: (() => void) | null;
  shift: () => void;
  sales: () => void;
  sync: () => void;
  backOffice: () => void;
  printer: (() => void) | null;
  diagnostics: (() => void) | null;
  openSale: (saleId: string) => void;
  lock: () => void;
  switchUser: () => void;
}

interface Props {
  /** Height of the phone status bar / notch: the navy header runs underneath it. */
  topInset?: number;
  cashier: StaffInfo | null;
  businessName: string | null;
  deviceName: string;
  entitlement: EntitlementState;
  canSell: boolean;
  restaurant: boolean;
  sync: SyncSummary;
  recent: LocalSale[];
  appVersion: string;
  actions: HomeActions;
}

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** The till's main screen: who is selling, one big button to sell, everything else one tap away. */
export function HomeScreen({ topInset = 0, cashier, businessName, deviceName, entitlement, canSell, restaurant, sync, recent, appVersion, actions }: Props) {
  const colors = useColors();
  const status = entitlementMessage(entitlement);
  const firstName = cashier?.name.split(' ')[0] ?? '';

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.scroll}>
      <View style={[styles.hero, { backgroundColor: colors.hero, paddingTop: topInset + spacing.lg }]}>
        <View style={styles.heroTop}>
          <View style={styles.brand}>
            <Image source={require('../../../assets/inkypos-logo.png')} style={styles.logo} accessibilityLabel="InkyPOS logo" />
            <View style={{ flexShrink: 1 }}>
              <Text style={[styles.business, { color: colors.onHero }]} numberOfLines={1}>
                {businessName ?? 'InkyPOS'}
              </Text>
              <Text style={{ color: colors.onHeroMuted, fontSize: fontSize.xs }} numberOfLines={1}>
                {deviceName}
              </Text>
            </View>
          </View>
          <IconButton icon="lock-closed" label="Lock till" onPress={actions.lock} tone="secondary" size={40} />
        </View>

        <View style={styles.greetRow}>
          {cashier ? <Avatar name={cashier.name} size={48} tone="accent" /> : null}
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.onHeroMuted, fontSize: fontSize.sm }}>{greeting(new Date().getHours())},</Text>
            <Text style={[styles.name, { color: colors.onHero }]} numberOfLines={1}>
              {firstName}
            </Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Sync: ${sync.label}`} onPress={actions.sync} hitSlop={8}>
            <View style={[styles.syncPill, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
              <Icon name={sync.icon} size={16} color={sync.online === false ? colors.accent : colors.onHero} />
              <Text style={{ color: colors.onHero, fontWeight: '700', fontSize: fontSize.xs }}>{sync.label}</Text>
            </View>
          </Pressable>
        </View>

        <Button
          label={restaurant ? 'Quick sale' : 'New sale'}
          icon="cart"
          tone="accent"
          size="lg"
          onPress={actions.newSale}
          disabled={!canSell}
        />
      </View>

      <View style={styles.body}>
        {status.tone !== 'success' ? <Banner tone={status.tone} title={status.title} body={status.body} /> : null}

        <SectionLabel>Shortcuts</SectionLabel>
        <View style={styles.grid}>
          {actions.orders ? <Tile icon="restaurant" label="Orders" detail="Tables and tabs" onPress={actions.orders} disabled={!canSell} /> : null}
          {actions.kitchen ? <Tile icon="flame" label="Kitchen" detail="Tickets to cook" onPress={actions.kitchen} tint={colors.warning} /> : null}
          <Tile icon="cash" label="Shift and cash" detail="Open, count, close" onPress={actions.shift} tint={colors.success} />
          <Tile icon="receipt" label="Sales" detail="Receipts and refunds" onPress={actions.sales} />
          <Tile icon={sync.icon} label="Sync" detail={sync.label} onPress={actions.sync} tint={sync.color} />
          <Tile icon="desktop" label="Back office" detail="Opens in browser" onPress={actions.backOffice} />
          {actions.printer ? <Tile icon="print" label="Printer" detail="Receipt printer" onPress={actions.printer} /> : null}
          {actions.diagnostics ? <Tile icon="pulse" label="Diagnostics" detail="Health checks" onPress={actions.diagnostics} /> : null}
        </View>

        <View style={styles.sectionHead}>
          <SectionLabel>Recent sales</SectionLabel>
          {recent.length > 0 ? (
            <Pressable accessibilityRole="button" accessibilityLabel="See all sales" onPress={actions.sales} hitSlop={8}>
              <Text style={{ color: colors.primary, fontWeight: '700', fontSize: fontSize.sm }}>See all</Text>
            </Pressable>
          ) : null}
        </View>
        <Card style={{ paddingVertical: spacing.sm }}>
          {recent.length === 0 ? (
            <View style={styles.empty}>
              <Icon name="receipt-outline" size={28} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted }}>No sales yet. Tap New sale to start.</Text>
            </View>
          ) : (
            recent.slice(0, 5).map((s) => (
              <ListRow
                key={s.sale.sale_id}
                icon="receipt-outline"
                title={`${s.sale.currency} ${formatMajor({ amount: s.sale.totals.total_minor, currency: s.sale.currency })}`}
                subtitle={`${s.sale.receipt_number} · ${time(s.sale.completed_at)}`}
                right={<Pill label={SYNC_LABELS[s.sync_state]} color={s.sync_state === 'synced' ? colors.success : s.sync_state === 'needs_review' ? colors.danger : colors.warning} />}
                onPress={() => actions.openSale(s.sale.sale_id)}
              />
            ))
          )}
        </Card>

        <Button label="Switch user" icon="people" tone="secondary" onPress={actions.switchUser} />
        <Text style={[styles.version, { color: colors.textMuted }]}>InkyPOS v{appVersion} · by Inkgenius Technologies</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xxxl },
  hero: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.lg, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl, ...elevation },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexShrink: 1 },
  logo: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: '#FFFFFF' },
  business: { fontSize: fontSize.lg, fontWeight: '800' },
  greetRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { fontSize: fontSize.xxl, fontWeight: '800' },
  syncPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full },
  body: { padding: spacing.lg, gap: spacing.md, maxWidth: 720, width: '100%', alignSelf: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  version: { textAlign: 'center', fontSize: fontSize.xs, marginTop: spacing.sm },
});
