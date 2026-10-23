import type { StockAdjustmentInput, StockAdjustmentReason, StockLevel } from '@inkypos/core';
import { AlertTriangle } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useAuth } from '@/auth/session';
import { PageHeader, StatCard } from '@/components/app-shell';
import { BranchPicker, useBranch } from '@/components/branch-picker';
import { ExportMenu } from '@/components/export-menu';
import { ChoiceGroup, FormDialog } from '@/components/form-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { money, parseQty, qty } from '@/lib/api';
import { stockDocument } from '@/lib/report-exports';
import { useLoad } from '@/lib/use-load';

const REASONS: { value: StockAdjustmentReason; label: string; hint: string }[] = [
  { value: 'intake', label: 'Stock intake', hint: 'Received without a supplier delivery' },
  { value: 'damage', label: 'Damaged or expired', hint: 'Can no longer be sold' },
  { value: 'correction', label: 'Correction', hint: 'Fix a known mistake' },
  { value: 'count', label: 'Stock count', hint: 'What is on the shelf' },
];

const LEDGER_LABEL: Record<string, string> = {
  sale: 'Sold', refund: 'Returned', purchase: 'Received', intake: 'Intake', damage: 'Damaged', correction: 'Correction', count: 'Stock count', recipe: 'Used in a dish',
};

/** On-hand stock per branch, derived from the movement ledger; adjustments are recorded, never overwritten. */
export function StockPage() {
  const { client } = useAuth();
  const branch = useBranch();
  const [lowOnly, setLowOnly] = useState(false);
  const levels = useLoad(
    useCallback(() => client.stockLevels({ ...(branch.branchId ? { branchId: branch.branchId } : {}), lowOnly }), [client, branch.branchId, lowOnly]),
  );
  const [open, setOpen] = useState<StockLevel | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const items = levels.data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Stock"
        description="Click a product to record intake, damage, a correction or a stock count, and to see its history."
        actions={
          <>
            <BranchPicker branch={branch} />
            <ExportMenu
              name={lowOnly ? 'low-stock' : 'stock'}
              build={() => (levels.data ? stockDocument(levels.data, branch.branches.length > 1 ? (branch.branches.find((b) => b.id === branch.branchId)?.name ?? null) : null) : null)}
            />
          </>
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Stock value at last cost" value={levels.data ? money(levels.data.total_value_minor, levels.data.currency) : '…'} />
        <StatCard label="Products" value={levels.data ? items.length : '…'} />
        <StatCard label="Low on stock" value={levels.data ? items.filter((i) => i.low).length : '…'} icon={AlertTriangle} />
      </div>
      <Tabs value={lowOnly ? 'low' : 'all'} onValueChange={(v) => setLowOnly(v === 'low')}>
        <TabsList>
          <TabsTrigger value="all">All products</TabsTrigger>
          <TabsTrigger value="low">Low stock</TabsTrigger>
        </TabsList>
      </Tabs>
      {notice ? (
        <Alert variant="success">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}
      {levels.error ? (
        <Alert variant="destructive">
          <AlertDescription>{levels.error}</AlertDescription>
        </Alert>
      ) : null}
      <Card className="py-0">
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Product</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">On hand</TableHead>
                <TableHead className="text-right">Low at</TableHead>
                <TableHead className="text-right">Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {levels.data && items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    {lowOnly ? 'Nothing is low.' : 'No products.'}
                  </TableCell>
                </TableRow>
              ) : null}
              {items.map((i) => (
                <TableRow key={i.product_id} className="cursor-pointer" onClick={() => setOpen(i)}>
                  <TableCell className={i.active ? 'pl-4 font-medium' : 'pl-4 text-muted-foreground'}>{i.name}</TableCell>
                  <TableCell className="font-mono text-xs">{i.sku}</TableCell>
                  <TableCell className="text-right">
                    {i.low ? <Badge variant="destructive">{qty(i.on_hand_milli, i.unit)} · low</Badge> : qty(i.on_hand_milli, i.unit)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">{i.reorder_level_milli === null ? '—' : qty(i.reorder_level_milli, i.unit)}</TableCell>
                  <TableCell className="text-right">{i.value_minor === null ? '—' : money(i.value_minor, levels.data!.currency)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {open ? (
        <AdjustDialog
          item={open}
          branchId={branch.branchId}
          onClose={() => setOpen(null)}
          onDone={async (text) => {
            setOpen(null);
            setNotice(text);
            await levels.reload();
          }}
        />
      ) : null}
    </>
  );
}

function AdjustDialog({ item, branchId, onClose, onDone }: { item: StockLevel; branchId: string | null; onClose: () => void; onDone: (text: string) => Promise<void> }) {
  const { client } = useAuth();
  const [reason, setReason] = useState<StockAdjustmentReason>('intake');
  const [direction, setDirection] = useState<'add' | 'remove'>('add');
  const ledger = useLoad(useCallback(() => client.stockMovements(item.product_id), [client, item.product_id]));
  const unit = item.unit === 'each' ? 'items' : item.unit;

  return (
    <FormDialog
      title={item.name}
      description={`${qty(item.on_hand_milli, item.unit)} on hand${item.reorder_level_milli !== null ? ` · low at ${qty(item.reorder_level_milli, item.unit)}` : ''}`}
      submitLabel="Record"
      wide
      onClose={onClose}
      onSubmit={async (f) => {
        if (!branchId) throw new Error('Add a branch first: stock is recorded per branch.');
        const milli = parseQty(String(f.get('amount') ?? ''));
        if (milli === null || (milli === 0 && reason !== 'count')) throw new Error('Enter a quantity, e.g. 12 or 2.5');
        const note = String(f.get('note') ?? '').trim();
        const body: StockAdjustmentInput =
          reason === 'count'
            ? { branch_id: branchId, product_id: item.product_id, reason, counted_milli: milli, ...(note ? { note } : {}) }
            : {
                branch_id: branchId,
                product_id: item.product_id,
                reason,
                quantity_delta_milli: reason === 'intake' ? milli : reason === 'damage' ? -milli : direction === 'add' ? milli : -milli,
                ...(note ? { note } : {}),
              };
        const result = await client.adjustStock(body);
        await onDone(`Recorded. ${item.name} now has ${qty(result.on_hand_milli, item.unit)} on hand.`);
      }}
    >
      <ChoiceGroup label="Reason" value={reason} onChange={setReason} options={REASONS} />
      {reason === 'correction' ? (
        <ChoiceGroup
          label="Direction"
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'add', label: 'Add stock' },
            { value: 'remove', label: 'Remove stock' },
          ]}
        />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="amount">{reason === 'count' ? `Counted (${unit})` : `Quantity (${unit})`}</Label>
          <Input id="amount" name="amount" inputMode="decimal" autoFocus />
        </div>
        <div className="space-y-2">
          <Label htmlFor="note">Note (optional)</Label>
          <Input id="note" name="note" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="text-sm font-medium">History</div>
        <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-2">
          {ledger.data?.length === 0 ? <p className="text-sm text-muted-foreground">No movements yet.</p> : null}
          {ledger.data?.map((m) => (
            <div key={m.id} className="flex justify-between gap-3 text-sm">
              <span>
                {LEDGER_LABEL[m.reason] ?? m.reason}
                <span className="text-muted-foreground"> · {new Date(m.occurred_at).toLocaleDateString()}{m.note ? ` · ${m.note}` : ''}</span>
              </span>
              <span className={m.quantity_delta_milli < 0 ? 'text-destructive' : ''}>
                {m.quantity_delta_milli > 0 ? '+' : ''}
                {qty(m.quantity_delta_milli, item.unit)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </FormDialog>
  );
}
