import type { Period, ShiftZReport } from '@inkypos/core';
import { useCallback, useState } from 'react';
import { useAuth } from '@/auth/session';
import { StatCard } from '@/components/app-shell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { describeError, formatDate, money } from '@/lib/api';
import { useLoad } from '@/lib/use-load';

function Row({ label, value, strong, danger }: { label: string; value: string; strong?: boolean; danger?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 text-sm ${strong ? 'font-semibold' : ''} ${danger ? 'text-destructive' : ''}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

/** Shifts in the period, with over/short; click one for its Z report. */
export function ShiftsView({ period }: { period: Period }) {
  const { client } = useAuth();
  const list = useLoad(useCallback(() => client.shiftReports(period), [client, period]));
  const [open, setOpen] = useState<ShiftZReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      {list.error || error ? (
        <Alert variant="destructive">
          <AlertDescription>{list.error ?? error}</AlertDescription>
        </Alert>
      ) : null}
      <Card className="py-0">
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Till</TableHead>
                <TableHead>Opened by</TableHead>
                <TableHead>Opened</TableHead>
                <TableHead>Closed</TableHead>
                <TableHead className="text-right">Sales</TableHead>
                <TableHead className="pr-4 text-right">Cash count</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No shifts in this period.
                  </TableCell>
                </TableRow>
              ) : null}
              {list.data?.map((s) => {
                const short = s.variance?.find((v) => v.amount_minor < 0);
                const over = s.variance?.find((v) => v.amount_minor > 0);
                return (
                  <TableRow
                    key={s.shift_id}
                    className="cursor-pointer"
                    onClick={() => client.shiftReport(s.shift_id).then(setOpen, (e) => setError(describeError(e)))}
                  >
                    <TableCell className="pl-4 font-medium">{s.register}</TableCell>
                    <TableCell>{s.opened_by}</TableCell>
                    <TableCell>{formatDate(s.opened_at)}</TableCell>
                    <TableCell>{s.closed_at ? formatDate(s.closed_at) : <Badge variant="warning">Open</Badge>}</TableCell>
                    <TableCell className="text-right">
                      {money(s.sales_minor, s.currency)} <span className="text-muted-foreground">({s.sales_count})</span>
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      {!s.closed_at ? '—' : short ? <Badge variant="destructive">Short {money(-short.amount_minor, short.currency)}</Badge> : over ? <Badge variant="warning">Over {money(over.amount_minor, over.currency)}</Badge> : <Badge variant="success">Balanced</Badge>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {open ? (
        <Dialog open onOpenChange={(o) => !o && setOpen(null)}>
          <DialogContent className="max-h-[90svh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {open.closed_at ? 'Z report' : 'Shift so far'} · {open.register ?? 'Till'}
              </DialogTitle>
              <DialogDescription>
                Opened by {open.opened_by} {formatDate(open.opened_at)}
                {open.closed_by ? `, closed by ${open.closed_by} ${formatDate(open.closed_at)}` : ' · still open'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              {open.opening_float.map((f) => (
                <Row key={`f${f.currency}`} label={`Opening float`} value={money(f.amount_minor, f.currency)} />
              ))}
              <Row label={`Sales (${open.sales_count})`} value={money(open.sales_minor, open.currency)} />
              <Row label="Tax" value={money(open.tax_minor, open.currency)} />
              <Row label={`Refunds ${open.refunds_count - open.voids_count}, voids ${open.voids_count}`} value={`-${money(open.refunds_minor, open.currency)}`} />
              <Row label="Change given" value={money(open.change_given_minor, open.currency)} />
              <div className="border-t pt-2" />
              {open.payments.map((p) => (
                <Row key={`${p.method_code}${p.currency}`} label={p.name} value={money(p.tendered_minor - p.refunded_minor, p.currency)} />
              ))}
              {open.cash_movements.map((c, i) => (
                <Row
                  key={i}
                  label={`${c.direction === 'in' ? 'Cash in' : 'Cash out'}: ${c.reason.replace(/_/g, ' ')}${c.note ? ` (${c.note})` : ''}`}
                  value={`${c.direction === 'in' ? '' : '-'}${money(c.amount_minor, c.currency)}`}
                />
              ))}
              <div className="border-t pt-2" />
              {open.expected_cash?.map((e) => <Row key={`e${e.currency}`} label="Cash expected" value={money(e.amount_minor, e.currency)} />)}
              {open.counted_cash?.map((e) => <Row key={`c${e.currency}`} label="Cash counted" value={money(e.amount_minor, e.currency)} />)}
              {open.variance?.map((v) => (
                <Row
                  key={`v${v.currency}`}
                  label={v.amount_minor === 0 ? `${v.currency} balances` : v.amount_minor > 0 ? `${v.currency} over` : `${v.currency} short`}
                  value={money(Math.abs(v.amount_minor), v.currency)}
                  strong
                  danger={v.amount_minor < 0}
                />
              ))}
              {open.note ? <p className="text-sm text-muted-foreground">Note: {open.note}</p> : null}
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

/** Net sales less cost of goods (at last cost) and expenses. */
export function ProfitView({ period }: { period: Period }) {
  const { client } = useAuth();
  const report = useLoad(useCallback(() => client.profitReport(period), [client, period]));
  const r = report.data;
  if (report.error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{report.error}</AlertDescription>
      </Alert>
    );
  }
  if (!r) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const c = r.currency;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Net sales (excl. tax)" value={money(r.net_sales_minor, c)} />
        <StatCard label="Gross profit" value={money(r.gross_profit_minor, c)} hint={`after ${money(r.cost_of_goods_minor, c)} cost of goods`} />
        <StatCard label="Net profit" value={money(r.net_profit_minor, c)} hint={`after ${money(r.expenses_minor, c)} expenses`} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Profit (estimate)</CardTitle>
          <CardDescription>{r.notice}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Row label="Net sales (excluding tax)" value={money(r.net_sales_minor, c)} />
          <Row label="Cost of goods sold" value={`-${money(r.cost_of_goods_minor, c)}`} />
          <Row label="Gross profit" value={money(r.gross_profit_minor, c)} strong />
          <Row label="Expenses" value={`-${money(r.expenses_minor, c)}`} />
          <Row label="Net profit" value={money(r.net_profit_minor, c)} strong danger={r.net_profit_minor < 0} />
        </CardContent>
      </Card>
      {r.uncosted_lines > 0 ? (
        <Alert variant="warning">
          <AlertTitle>{r.uncosted_lines} sold lines have no cost</AlertTitle>
          <AlertDescription>
            {money(r.uncosted_sales_minor, c)} of sales are not in the cost of goods. Add costs to products, or record deliveries, to include them.
          </AlertDescription>
        </Alert>
      ) : null}
      {r.expenses_in_other_currencies.map((e) => (
        <p key={e.currency} className="text-sm text-muted-foreground">
          Also spent {money(e.amount_minor, e.currency)} (not converted, not included above).
        </p>
      ))}
    </>
  );
}

/** The latest changes in the back office and to tills and staff. */
export function ActivityView() {
  const { client } = useAuth();
  const log = useLoad(useCallback(() => client.auditLog(), [client]));
  return (
    <Card className="py-0">
      <CardContent className="px-0">
        {log.error ? (
          <Alert variant="destructive" className="m-4 w-auto">
            <AlertDescription>{log.error}</AlertDescription>
          </Alert>
        ) : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">When</TableHead>
              <TableHead>What</TableHead>
              <TableHead className="pr-4">Who</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {log.data?.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="pl-4 whitespace-nowrap">{formatDate(e.created_at)}</TableCell>
                <TableCell className="capitalize">{e.action.replace(/[._]/g, ' ')}</TableCell>
                <TableCell className="pr-4 text-muted-foreground">{e.actor ?? (e.actor_type === 'platform' ? 'Inkgenius Technologies' : e.actor_type)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
