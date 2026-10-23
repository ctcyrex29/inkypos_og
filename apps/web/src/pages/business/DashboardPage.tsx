import { presetPeriod } from '@inkypos/core';
import { Banknote, Receipt, ShoppingBag, TrendingUp } from 'lucide-react';
import { useCallback } from 'react';
import { useAuth, useBusinessSession } from '@/auth/session';
import { PageHeader, StatCard } from '@/components/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { money } from '@/lib/api';
import { useLoad } from '@/lib/use-load';

/** Today at a glance, and the last seven days. */
export function DashboardPage() {
  const { client } = useAuth();
  const session = useBusinessSession();
  const today = useLoad(useCallback(() => client.salesReport(presetPeriod('today')), [client]));
  const week = useLoad(useCallback(() => client.salesReport(presetPeriod('last7')), [client]));
  const t = today.data;
  const c = t?.currency ?? 'USD';
  const max = Math.max(1, ...(week.data?.days.map((d) => d.net_minor) ?? [1]));

  return (
    <>
      <PageHeader title={`Good day, ${session.userName.split(' ')[0]}`} description={`${session.businessName} · today's trading`} />
      {today.error ? (
        <Alert variant="destructive">
          <AlertDescription>{today.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Net sales today" value={t ? money(t.totals.net_minor, c) : '…'} icon={TrendingUp} hint="After refunds" />
        <StatCard label="Sales" value={t ? t.totals.sales_count : '…'} icon={ShoppingBag} hint={t ? `Average ${money(t.totals.average_sale_minor, c)}` : undefined} />
        <StatCard label="Refunds" value={t ? money(t.totals.refunds_minor, c) : '…'} icon={Receipt} hint={t ? `${t.totals.refunds_count} refunds` : undefined} />
        <StatCard label="Tax collected" value={t ? money(t.totals.tax_minor, c) : '…'} icon={Banknote} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Last 7 days</CardTitle>
            <CardDescription>Net sales per day</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-48 items-end gap-2">
              {(week.data?.days ?? []).map((d) => (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                  <div className="text-[10px] text-muted-foreground">{d.net_minor ? money(d.net_minor, c).replace(`${c} `, '') : ''}</div>
                  <div className="w-full rounded-t-md bg-primary/80" style={{ height: `${Math.max(2, (d.net_minor / max) * 150)}px` }} title={money(d.net_minor, c)} />
                  <div className="text-xs text-muted-foreground">{new Date(`${d.date}T12:00:00`).toLocaleDateString([], { weekday: 'short' })}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Best sellers today</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {t && t.top_products.length === 0 ? <p className="text-sm text-muted-foreground">No sales yet today.</p> : null}
            {t?.top_products.slice(0, 6).map((p) => (
              <div key={p.product_id} className="flex justify-between text-sm">
                <span className="truncate">{p.name}</span>
                <span className="font-medium">{money(p.sales_minor, c)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Payments today</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {t?.payments.length === 0 ? <p className="text-sm text-muted-foreground">No payments yet today.</p> : null}
            {t?.payments.map((p) => (
              <div key={`${p.method_code}-${p.currency}`} className="flex justify-between text-sm">
                <span>
                  {p.name} <span className="text-muted-foreground">({p.count})</span>
                  {p.pending_minor > 0 ? <span className="ml-2 text-xs text-warning">{money(p.pending_minor, p.currency)} awaiting confirmation</span> : null}
                </span>
                <span className="font-medium">{money(p.tendered_minor, p.currency)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Cashiers today</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {t?.by_cashier.length === 0 ? <p className="text-sm text-muted-foreground">No sales yet today.</p> : null}
            {t?.by_cashier.map((r) => (
              <div key={r.user_id} className="flex justify-between text-sm">
                <span>
                  {r.name} <span className="text-muted-foreground">({r.sales_count})</span>
                </span>
                <span className="font-medium">{money(r.sales_minor, c)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
