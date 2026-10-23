import { EXPENSE_CATEGORIES, PAID_FROM, presetPeriod, type ExpenseCategory, type PaidFrom, type Period } from '@inkypos/core';
import { Plus } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useAuth } from '@/auth/session';
import { PageHeader, StatCard } from '@/components/app-shell';
import { BranchPicker, useBranch } from '@/components/branch-picker';
import { ChoiceGroup, FormDialog } from '@/components/form-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { money, parseMoney } from '@/lib/api';
import { useLoad } from '@/lib/use-load';

type Preset = 'today' | 'last7' | 'month' | 'lastMonth';
const PRESETS: { value: Preset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'last7', label: 'Last 7 days' },
  { value: 'month', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
];

const PAID_FROM_LABEL: Record<PaidFrom, string> = { bank: 'Bank', mobile_money: 'Mobile money', cash_office: 'Office cash', other: 'Other' };
const title = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/**
 * Money in and out: the cash book, expenses paid outside the till drawer, and
 * what is owed to suppliers. Entries are never edited; reverse with an opposite entry.
 */
export function MoneyPage() {
  const branch = useBranch();
  const [tab, setTab] = useState('cashbook');
  const [preset, setPreset] = useState<Preset>('today');
  const period = useMemo(() => presetPeriod(preset), [preset]);

  return (
    <>
      <PageHeader
        title="Money"
        description="Cash paid out of a till drawer is recorded on the till (Shift → cash out). Record other spending here."
        actions={
          <>
            <BranchPicker branch={branch} />
            {tab !== 'owed' ? (
              <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
                <SelectTrigger className="w-40" aria-label="Period">
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
            ) : null}
          </>
        }
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="cashbook">Cash book</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="owed">Owed to suppliers</TabsTrigger>
        </TabsList>
        <TabsContent value="cashbook" className="mt-4 space-y-4">
          <CashBook period={period} />
        </TabsContent>
        <TabsContent value="expenses" className="mt-4 space-y-4">
          <Expenses period={period} branchId={branch.branchId} />
        </TabsContent>
        <TabsContent value="owed" className="mt-4 space-y-4">
          <Owed />
        </TabsContent>
      </Tabs>
    </>
  );
}

function CashBook({ period }: { period: Period }) {
  const { client } = useAuth();
  const book = useLoad(useCallback(() => client.cashbook(period), [client, period]));
  const b = book.data;
  if (book.error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{book.error}</AlertDescription>
      </Alert>
    );
  }
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(b?.totals ?? []).map((t) => (
          <StatCard key={t.currency} label={`${t.currency} net`} value={money(t.net_minor, t.currency)} hint={`In ${money(t.in_minor, t.currency)} · out ${money(t.out_minor, t.currency)}`} />
        ))}
      </div>
      <Card className="py-0">
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Date</TableHead>
                <TableHead>What</TableHead>
                <TableHead>How</TableHead>
                <TableHead className="pr-4 text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {b && b.entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    Nothing recorded in this period.
                  </TableCell>
                </TableRow>
              ) : null}
              {b?.entries.map((e, i) => (
                <TableRow key={i}>
                  <TableCell className="pl-4">{e.date}</TableCell>
                  <TableCell>
                    {e.description}
                    {e.pending_minor > 0 ? <div className="text-xs text-warning">{money(e.pending_minor, e.currency)} not yet confirmed</div> : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{e.method}</TableCell>
                  <TableCell className={e.out_minor > 0 ? 'pr-4 text-right text-destructive' : 'pr-4 text-right'}>
                    {e.in_minor > 0 ? `+${money(e.in_minor, e.currency)}` : `-${money(e.out_minor, e.currency)}`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

function Expenses({ period, branchId }: { period: Period; branchId: string | null }) {
  const { client } = useAuth();
  const list = useLoad(useCallback(() => client.listExpenses(period), [client, period]));
  const [adding, setAdding] = useState(false);
  const [category, setCategory] = useState<ExpenseCategory>('supplies');
  const [paidFrom, setPaidFrom] = useState<PaidFrom>('bank');
  const total = (list.data ?? []).filter((e) => e.currency === 'USD').reduce((s, e) => s + e.amount_minor, 0);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">Total in this period: {money(total)}</div>
        <Button onClick={() => setAdding(true)}>
          <Plus /> Record an expense
        </Button>
      </div>
      {list.error ? (
        <Alert variant="destructive">
          <AlertDescription>{list.error}</AlertDescription>
        </Alert>
      ) : null}
      <Card className="py-0">
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Date</TableHead>
                <TableHead>What</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Paid from</TableHead>
                <TableHead className="pr-4 text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No expenses in this period.
                  </TableCell>
                </TableRow>
              ) : null}
              {list.data?.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="pl-4">{new Date(e.spent_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    {e.description}
                    {e.reference ? <span className="text-muted-foreground"> · {e.reference}</span> : null}
                  </TableCell>
                  <TableCell>{title(e.category)}</TableCell>
                  <TableCell>{PAID_FROM_LABEL[e.paid_from]}</TableCell>
                  <TableCell className="pr-4 text-right">{money(e.amount_minor, e.currency)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {adding ? (
        <FormDialog
          title="Record an expense"
          description="Spending that did not come out of a till drawer, e.g. rent paid from the bank."
          submitLabel="Record expense"
          wide
          onClose={() => setAdding(false)}
          onSubmit={async (f) => {
            const description = String(f.get('description') ?? '').trim();
            const amount = parseMoney(String(f.get('amount') ?? ''));
            const reference = String(f.get('reference') ?? '').trim();
            if (!description) throw new Error('Say what the money was for.');
            if (!amount) throw new Error('Enter an amount above zero, like 12.50.');
            await client.recordExpense({
              category,
              description,
              currency: 'USD',
              amount_minor: amount,
              paid_from: paidFrom,
              ...(branchId ? { branch_id: branchId } : {}),
              ...(reference ? { reference } : {}),
            });
            setAdding(false);
            await list.reload();
          }}
        >
          <ChoiceGroup label="Category" value={category} onChange={setCategory} options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: title(c) }))} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="description">What was it for?</Label>
              <Input id="description" name="description" placeholder="e.g. ZESA tokens" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (USD)</Label>
              <Input id="amount" name="amount" inputMode="decimal" placeholder="0.00" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Paid from</Label>
            <ChoiceGroup label="Paid from" value={paidFrom} onChange={setPaidFrom} options={PAID_FROM.map((p) => ({ value: p, label: PAID_FROM_LABEL[p] }))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reference">Reference (optional)</Label>
            <Input id="reference" name="reference" />
          </div>
        </FormDialog>
      ) : null}
    </>
  );
}

function Owed() {
  const { client } = useAuth();
  const balances = useLoad(useCallback(() => client.supplierBalances(), [client]));
  const [paying, setPaying] = useState<{ id: string; name: string } | null>(null);
  const [paidFrom, setPaidFrom] = useState<PaidFrom>('bank');
  const b = balances.data;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Owed to suppliers</CardTitle>
          <CardDescription>Deliveries recorded under Goods received, less payments recorded here.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {balances.error ? (
            <Alert variant="destructive">
              <AlertDescription>{balances.error}</AlertDescription>
            </Alert>
          ) : null}
          {b?.suppliers.length === 0 ? <p className="text-sm text-muted-foreground">No suppliers yet.</p> : null}
          {b?.suppliers.map((s) => (
            <div key={s.supplier_id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <div className="font-medium">{s.name}</div>
                <div className="text-xs text-muted-foreground">
                  Delivered {money(s.deliveries_minor, b.currency)} · paid {money(s.paid_minor, b.currency)}
                  {s.paid_in_other_currencies.map((o) => ` + ${money(o.amount_minor, o.currency)}`).join('')}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={s.balance_minor > 0 ? 'font-semibold text-destructive' : 'font-semibold'}>{money(s.balance_minor, b.currency)}</span>
                <Button variant="outline" size="sm" onClick={() => setPaying({ id: s.supplier_id, name: s.name })}>
                  Record payment
                </Button>
              </div>
            </div>
          ))}
          {b?.suppliers.some((s) => s.paid_in_other_currencies.length > 0) ? (
            <Alert variant="warning">
              <AlertDescription>Some payments were in another currency. They are shown beside the supplier but not taken off the balance.</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>
      {paying && b ? (
        <FormDialog
          title={`Pay ${paying.name}`}
          submitLabel="Record payment"
          onClose={() => setPaying(null)}
          onSubmit={async (f) => {
            const amount = parseMoney(String(f.get('amount') ?? ''));
            const reference = String(f.get('reference') ?? '').trim();
            if (!amount) throw new Error('Enter an amount above zero.');
            await client.paySupplier({ supplier_id: paying.id, currency: b.currency, amount_minor: amount, paid_from: paidFrom, ...(reference ? { reference } : {}) });
            setPaying(null);
            await balances.reload();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="amount">Amount ({b.currency})</Label>
            <Input id="amount" name="amount" inputMode="decimal" autoFocus />
          </div>
          <div className="space-y-2">
            <Label>Paid from</Label>
            <ChoiceGroup label="Paid from" value={paidFrom} onChange={setPaidFrom} options={PAID_FROM.map((p) => ({ value: p, label: PAID_FROM_LABEL[p] }))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reference">Reference (optional)</Label>
            <Input id="reference" name="reference" placeholder="e.g. ZIPIT reference" />
          </div>
        </FormDialog>
      ) : null}
    </>
  );
}
