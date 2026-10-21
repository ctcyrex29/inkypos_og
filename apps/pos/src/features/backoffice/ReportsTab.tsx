import { formatMajor, presetPeriod, type CurrencyCode, type Period, type ShiftZReport } from '@inkypos/core';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Banner, Card, ErrorText, Heading, Muted } from '@/ui/components';
import { fontSize, useColors } from '@/ui/theme';
import { Chip, describeApiError, qty, styles, useLoad, type BackOfficeApi } from './shared';

type Preset = Parameters<typeof presetPeriod>[0];
type View_ = 'sales' | 'vat' | 'shifts' | 'profit' | 'audit';

const PRESETS: { preset: Preset; label: string }[] = [
  { preset: 'today', label: 'Today' },
  { preset: 'yesterday', label: 'Yesterday' },
  { preset: 'last7', label: 'Last 7 days' },
  { preset: 'month', label: 'This month' },
  { preset: 'lastMonth', label: 'Last month' },
];

const VIEWS: { view: View_; label: string }[] = [
  { view: 'sales', label: 'Sales' },
  { view: 'vat', label: 'VAT' },
  { view: 'shifts', label: 'Shifts' },
  { view: 'profit', label: 'Profit' },
  { view: 'audit', label: 'Activity log' },
];

export const m = (minor: number, currency: string) => `${currency} ${formatMajor({ amount: minor, currency: currency as CurrencyCode })}`;

/** A label and an amount on one line. */
function Row({ label, value, strong, danger }: { label: string; value: string; strong?: boolean; danger?: boolean }) {
  const colors = useColors();
  const style = { color: danger ? colors.danger : colors.text, fontSize: fontSize.md, fontWeight: strong ? ('700' as const) : ('400' as const) };
  return (
    <View style={styles.row}>
      <Text style={[style, { flex: 1 }]}>{label}</Text>
      <Text style={style}>{value}</Text>
    </View>
  );
}

const realNow = () => new Date();

export function ReportsTab({ api, now = realNow }: { api: BackOfficeApi; now?: () => Date }) {
  const [preset, setPreset] = useState<Preset>('today');
  const [view, setView] = useState<View_>('sales');
  const period = useMemo(() => presetPeriod(preset, now()), [preset, now]);

  return (
    <>
      <Card>
        <Heading>Reports</Heading>
        <View style={styles.chips}>
          {VIEWS.map((v) => (
            <Chip key={v.view} label={v.label} selected={view === v.view} onPress={() => setView(v.view)} />
          ))}
        </View>
        {view !== 'audit' ? (
          <View style={styles.chips}>
            {PRESETS.map((p) => (
              <Chip key={p.preset} label={p.label} selected={preset === p.preset} onPress={() => setPreset(p.preset)} />
            ))}
          </View>
        ) : null}
        <Muted>Built from what tills have synced. A till that has not synced yet is not included.</Muted>
      </Card>
      {view === 'sales' ? (
        <Sales api={api} period={period} />
      ) : view === 'vat' ? (
        <Vat api={api} period={period} />
      ) : view === 'shifts' ? (
        <Shifts api={api} period={period} />
      ) : view === 'profit' ? (
        <Profit api={api} period={period} />
      ) : (
        <Audit api={api} />
      )}
    </>
  );
}

function Sales({ api, period }: { api: BackOfficeApi; period: Period }) {
  const report = useLoad(useCallback(() => api.salesReport(period), [api, period]));
  const r = report.data;
  if (report.error) return <Card><ErrorText>{report.error}</ErrorText></Card>;
  if (!r) return <Card><Muted>Loading…</Muted></Card>;
  const c = r.currency;
  const pending = r.payments.reduce((s, p) => s + p.pending_minor, 0);
  return (
    <>
      <Card>
        <Heading>Sales {r.from === r.to ? r.from : `${r.from} to ${r.to}`}</Heading>
        <Row label={`Sales (${r.totals.sales_count})`} value={m(r.totals.sales_minor, c)} />
        <Row label={`Refunds and voids (${r.totals.refunds_count})`} value={`-${m(r.totals.refunds_minor, c)}`} />
        <Row label="Net sales" value={m(r.totals.net_minor, c)} strong />
        <Row label="Tax included" value={m(r.totals.tax_minor - r.totals.refund_tax_minor, c)} />
        {r.totals.discount_minor > 0 ? <Row label="Discounts given" value={m(r.totals.discount_minor, c)} /> : null}
        <Row label="Average sale" value={m(r.totals.average_sale_minor, c)} />
      </Card>
      <Card>
        <Heading>By payment type</Heading>
        {r.payments.length === 0 ? <Muted>No payments.</Muted> : null}
        {r.payments.map((p) => (
          <Row key={`${p.method_code}${p.currency}`} label={`${p.name} (${p.currency})`} value={m(p.tendered_minor - p.refunded_minor, p.currency)} />
        ))}
        {r.change_given_minor > 0 ? <Row label="Change given (cash)" value={`-${m(r.change_given_minor, c)}`} /> : null}
        {pending > 0 ? (
          <Banner tone="warning" title="Some payments are not confirmed" body="EcoCash and transfers recorded as awaiting confirmation are included above; check they arrived." />
        ) : null}
      </Card>
      {r.by_cashier.length > 0 ? (
        <Card>
          <Heading>By cashier</Heading>
          {r.by_cashier.map((p) => (
            <Row key={p.user_id} label={`${p.name} (${p.sales_count})`} value={m(p.sales_minor, c)} />
          ))}
        </Card>
      ) : null}
      {r.top_products.length > 0 ? (
        <Card>
          <Heading>Best sellers</Heading>
          {r.top_products.map((p) => (
            <Row key={p.product_id} label={`${p.name} × ${qty(p.quantity_milli)}`} value={m(p.sales_minor, c)} />
          ))}
        </Card>
      ) : null}
    </>
  );
}

function Vat({ api, period }: { api: BackOfficeApi; period: Period }) {
  const report = useLoad(useCallback(() => api.vatReport(period), [api, period]));
  const r = report.data;
  if (report.error) return <Card><ErrorText>{report.error}</ErrorText></Card>;
  if (!r) return <Card><Muted>Loading…</Muted></Card>;
  return (
    <Card>
      <Heading>VAT</Heading>
      <Muted>{r.notice}</Muted>
      {r.lines.length === 0 ? <Muted>No taxed sales.</Muted> : null}
      {r.lines.map((l) => (
        <View key={`${l.tax_code}${l.rate_bp}`} style={{ gap: 2 }}>
          <Text style={{ fontWeight: '600', fontSize: fontSize.md }}>
            {l.tax_code} at {(l.rate_bp / 100).toFixed(2)}%
          </Text>
          <Row label="Taxable (after refunds)" value={m(l.net_taxable_minor, r.currency)} />
          <Row label="Tax (after refunds)" value={m(l.net_tax_minor, r.currency)} />
        </View>
      ))}
      <Row label="Total tax" value={m(r.net_tax_minor, r.currency)} strong />
    </Card>
  );
}

function Shifts({ api, period }: { api: BackOfficeApi; period: Period }) {
  const colors = useColors();
  const list = useLoad(useCallback(() => api.shiftReports(period), [api, period]));
  const [open, setOpen] = useState<ShiftZReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (open) {
    return (
      <Card>
        <Heading>
          {open.register ?? 'Till'} · {new Date(open.opened_at).toLocaleString()}
        </Heading>
        <Muted>
          Opened by {open.opened_by}
          {open.closed_by ? `, closed by ${open.closed_by} ${new Date(open.closed_at!).toLocaleTimeString()}` : ' · still open'}
        </Muted>
        <Row label={`Sales (${open.sales_count})`} value={m(open.sales_minor, open.currency)} />
        <Row label={`Refunds ${open.refunds_count - open.voids_count}, voids ${open.voids_count}`} value={`-${m(open.refunds_minor, open.currency)}`} />
        {open.payments.map((p) => (
          <Row key={`${p.method_code}${p.currency}`} label={p.name} value={m(p.tendered_minor - p.refunded_minor, p.currency)} />
        ))}
        {open.cash_movements.map((c, i) => (
          <Row key={i} label={`${c.direction === 'in' ? 'Cash in' : 'Cash out'}: ${c.reason.replace('_', ' ')}${c.note ? ` (${c.note})` : ''}`} value={`${c.direction === 'in' ? '' : '-'}${m(c.amount_minor, c.currency)}`} />
        ))}
        {open.expected_cash?.map((e) => <Row key={`e${e.currency}`} label="Cash expected" value={m(e.amount_minor, e.currency)} />)}
        {open.counted_cash?.map((e) => <Row key={`c${e.currency}`} label="Cash counted" value={m(e.amount_minor, e.currency)} />)}
        {open.variance?.map((v) => (
          <Row
            key={`v${v.currency}`}
            label={v.amount_minor === 0 ? `${v.currency} balances` : v.amount_minor > 0 ? `${v.currency} over` : `${v.currency} short`}
            value={m(Math.abs(v.amount_minor), v.currency)}
            strong
            danger={v.amount_minor < 0}
          />
        ))}
        {open.note ? <Muted>Note: {open.note}</Muted> : null}
        <Chip label="Back to shifts" selected={false} onPress={() => setOpen(null)} />
      </Card>
    );
  }

  return (
    <Card>
      <Heading>Shifts</Heading>
      {list.error || error ? <ErrorText>{list.error ?? error}</ErrorText> : null}
      {list.data === null ? <Muted>Loading…</Muted> : list.data.length === 0 ? <Muted>No shifts in this period.</Muted> : null}
      {list.data?.map((s) => {
        const short = s.variance?.find((v) => v.amount_minor < 0);
        return (
          <Pressable
            key={s.shift_id}
            accessibilityRole="button"
            accessibilityLabel={`Shift on ${s.register} opened by ${s.opened_by}`}
            onPress={() => api.shiftReport(s.shift_id).then(setOpen, (e) => setError(describeApiError(e)))}
            style={[styles.item, { borderColor: colors.border }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: fontSize.md }}>
                {s.register} · {s.opened_by}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>
                {new Date(s.opened_at).toLocaleString()}
                {s.closed_at ? '' : ' · open'}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: colors.text }}>{m(s.sales_minor, s.currency)}</Text>
              {short ? <Text style={{ color: colors.danger, fontWeight: '700' }}>short {m(-short.amount_minor, short.currency)}</Text> : null}
            </View>
          </Pressable>
        );
      })}
    </Card>
  );
}

function Profit({ api, period }: { api: BackOfficeApi; period: Period }) {
  const report = useLoad(useCallback(() => api.profitReport(period), [api, period]));
  const r = report.data;
  if (report.error) return <Card><ErrorText>{report.error}</ErrorText></Card>;
  if (!r) return <Card><Muted>Loading…</Muted></Card>;
  const c = r.currency;
  return (
    <Card>
      <Heading>Profit (estimate)</Heading>
      <Row label="Net sales (excluding tax)" value={m(r.net_sales_minor, c)} />
      <Row label="Cost of goods sold" value={`-${m(r.cost_of_goods_minor, c)}`} />
      <Row label="Gross profit" value={m(r.gross_profit_minor, c)} strong />
      <Row label="Expenses" value={`-${m(r.expenses_minor, c)}`} />
      <Row label="Net profit" value={m(r.net_profit_minor, c)} strong danger={r.net_profit_minor < 0} />
      <Muted>{r.notice}</Muted>
      {r.uncosted_lines > 0 ? (
        <Banner
          tone="warning"
          title={`${r.uncosted_lines} sold lines have no cost`}
          body={`${m(r.uncosted_sales_minor, c)} of sales are not in the cost of goods. Add costs to products, or record deliveries, to include them.`}
        />
      ) : null}
      {r.expenses_in_other_currencies.map((e) => (
        <Muted key={e.currency}>Also spent {m(e.amount_minor, e.currency)} (not converted, not included above).</Muted>
      ))}
    </Card>
  );
}

function Audit({ api }: { api: BackOfficeApi }) {
  const colors = useColors();
  const log = useLoad(useCallback(() => api.auditLog(), [api]));
  return (
    <Card>
      <Heading>Activity log</Heading>
      <Muted>The latest changes made in the back office and to devices and staff.</Muted>
      {log.error ? <ErrorText>{log.error}</ErrorText> : null}
      {log.data === null ? <Muted>Loading…</Muted> : null}
      {log.data?.map((e) => (
        <View key={e.id} style={[styles.item, { borderColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text }}>{e.action.replace(/[._]/g, ' ')}</Text>
            <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>
              {e.actor ?? e.actor_type} · {new Date(e.created_at).toLocaleString()}
            </Text>
          </View>
        </View>
      ))}
    </Card>
  );
}
