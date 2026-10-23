import { presetPeriod } from '@inkypos/core';
import { useCallback, useState } from 'react';
import { useAuth } from '@/auth/session';
import { PageHeader, StatCard } from '@/components/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ActivityView, ProfitView, ShiftsView } from './ReportViews';
import { money } from '@/lib/api';
import { useLoad } from '@/lib/use-load';

type Preset = 'today' | 'yesterday' | 'last7' | 'month' | 'lastMonth';
const PRESETS: { value: Preset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7', label: 'Last 7 days' },
  { value: 'month', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
];

export function ReportsPage() {
  const { client } = useAuth();
  const [preset, setPreset] = useState<Preset>('last7');
  const [view, setView] = useState('sales');
  const sales = useLoad(useCallback(() => client.salesReport(presetPeriod(preset)), [client, preset]));
  const vat = useLoad(useCallback(() => client.vatReport(presetPeriod(preset)), [client, preset]));
  const r = sales.data;
  const c = r?.currency ?? 'USD';

  return (
    <>
      <PageHeader
        title="Reports"
        description={r ? `${r.from} to ${r.to} · days counted in ${r.timezone}` : 'Sales, payments, cashiers and VAT'}
        actions={
          <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
            <SelectTrigger className="w-44" aria-label="Period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
      <Tabs value={view} onValueChange={setView}>
        <TabsList>
          <TabsTrigger value="sales">Sales & VAT</TabsTrigger>
          <TabsTrigger value="shifts">Shifts</TabsTrigger>
          <TabsTrigger value="profit">Profit</TabsTrigger>
          <TabsTrigger value="activity">Activity log</TabsTrigger>
        </TabsList>
        <TabsContent value="sales" className="mt-4 space-y-6">
      {sales.error ? (
        <Alert variant="destructive">
          <AlertDescription>{sales.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Net sales" value={r ? money(r.totals.net_minor, c) : '…'} />
        <StatCard label="Number of sales" value={r?.totals.sales_count ?? '…'} />
        <StatCard label="Refunds" value={r ? money(r.totals.refunds_minor, c) : '…'} />
        <StatCard label="Change given" value={r ? money(r.change_given_minor, c) : '…'} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>By day</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Day</TableHead>
                <TableHead className="text-right">Sales</TableHead>
                <TableHead className="text-right">Takings</TableHead>
                <TableHead className="text-right">Refunds</TableHead>
                <TableHead className="text-right">Tax</TableHead>
                <TableHead className="text-right">Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {r?.days.map((d) => (
                <TableRow key={d.date}>
                  <TableCell>{new Date(`${d.date}T12:00:00`).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}</TableCell>
                  <TableCell className="text-right">{d.sales_count}</TableCell>
                  <TableCell className="text-right">{money(d.sales_minor, c)}</TableCell>
                  <TableCell className="text-right">{money(d.refunds_minor, c)}</TableCell>
                  <TableCell className="text-right">{money(d.tax_minor, c)}</TableCell>
                  <TableCell className="text-right font-medium">{money(d.net_minor, c)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <Breakdown title="Payment types" rows={(r?.payments ?? []).map((p) => ({ key: `${p.method_code}${p.currency}`, label: `${p.name} (${p.count})`, value: money(p.tendered_minor, p.currency) }))} />
        <Breakdown title="Cashiers" rows={(r?.by_cashier ?? []).map((p) => ({ key: p.user_id, label: `${p.name} (${p.sales_count})`, value: money(p.sales_minor, c) }))} />
        <Breakdown title="Tills" rows={(r?.by_register ?? []).map((p) => ({ key: p.register_id, label: `${p.name} (${p.sales_count})`, value: money(p.sales_minor, c) }))} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>VAT summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tax code</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Net taxable</TableHead>
                <TableHead className="text-right">Net tax</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vat.data?.lines.map((l) => (
                <TableRow key={`${l.tax_code}${l.rate_bp}`}>
                  <TableCell>{l.tax_code}</TableCell>
                  <TableCell className="text-right">{(l.rate_bp / 100).toFixed(2)}%</TableCell>
                  <TableCell className="text-right">{money(l.net_taxable_minor, vat.data!.currency)}</TableCell>
                  <TableCell className="text-right">{money(l.net_tax_minor, vat.data!.currency)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {vat.data ? <p className="text-xs text-muted-foreground">{vat.data.notice}</p> : null}
        </CardContent>
      </Card>
        </TabsContent>
        <TabsContent value="shifts" className="mt-4 space-y-6">
          <ShiftsView period={presetPeriod(preset)} />
        </TabsContent>
        <TabsContent value="profit" className="mt-4 space-y-6">
          <ProfitView period={presetPeriod(preset)} />
        </TabsContent>
        <TabsContent value="activity" className="mt-4 space-y-6">
          <ActivityView />
        </TabsContent>
      </Tabs>
    </>
  );
}

function Breakdown({ title, rows }: { title: string; rows: { key: string; label: string; value: string }[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">Nothing in this period.</p> : null}
        {rows.map((r) => (
          <div key={r.key} className="flex justify-between gap-2 text-sm">
            <span className="truncate">{r.label}</span>
            <span className="font-medium">{r.value}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
