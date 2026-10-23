import { purchaseLineCost, type BackOfficeProduct, type Supplier } from '@inkypos/core';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useAuth } from '@/auth/session';
import { PageHeader } from '@/components/app-shell';
import { BranchPicker, useBranch } from '@/components/branch-picker';
import { FormDialog } from '@/components/form-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { describeError, money, parseMoney, parseQty, qty } from '@/lib/api';
import { useLoad } from '@/lib/use-load';

/** Deliveries from suppliers add stock and set each product's cost. Never edited; corrected with a stock adjustment. */
export function PurchasesPage() {
  const { client } = useAuth();
  const branch = useBranch();
  const [tab, setTab] = useState('deliveries');
  const purchases = useLoad(useCallback(() => client.listPurchases(), [client]));
  const suppliers = useLoad(useCallback(() => client.listSuppliers(), [client]));
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <>
      <PageHeader title="Goods received" description="Deliveries from suppliers add stock and set each product’s cost." actions={<BranchPicker branch={branch} />} />
      {notice ? (
        <Alert variant="success">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="deliveries">Deliveries</TabsTrigger>
          <TabsTrigger value="receive">Receive goods</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
        </TabsList>
        <TabsContent value="deliveries" className="mt-4">
          {purchases.error ? (
            <Alert variant="destructive">
              <AlertDescription>{purchases.error}</AlertDescription>
            </Alert>
          ) : null}
          <Card className="py-0">
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Supplier</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="pr-4 text-right">Total cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchases.data?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                        No deliveries recorded yet.
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {purchases.data?.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="pl-4 font-medium">{p.supplier_name ?? 'Supplier'}</TableCell>
                      <TableCell>{new Date(p.received_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-muted-foreground">{p.reference ?? '—'}</TableCell>
                      <TableCell className="pr-4 text-right">{money(p.total_cost_minor)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="receive" className="mt-4">
          <Receive
            branchId={branch.branchId}
            suppliers={(suppliers.data ?? []).filter((s) => s.active)}
            onAddSupplier={() => setTab('suppliers')}
            onDone={async (text) => {
              setNotice(text);
              await purchases.reload();
              setTab('deliveries');
            }}
          />
        </TabsContent>
        <TabsContent value="suppliers" className="mt-4">
          <Suppliers list={suppliers.data} error={suppliers.error} reload={suppliers.reload} />
        </TabsContent>
      </Tabs>
    </>
  );
}

type Line = { product: BackOfficeProduct; quantity: string; cost: string };

function Receive({
  branchId,
  suppliers,
  onAddSupplier,
  onDone,
}: {
  branchId: string | null;
  suppliers: Supplier[];
  onAddSupplier: () => void;
  onDone: (text: string) => Promise<void>;
}) {
  const { client } = useAuth();
  const [supplierId, setSupplierId] = useState<string | undefined>(undefined);
  const [reference, setReference] = useState('');
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<BackOfficeProduct[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const find = async (text: string) => {
    setSearch(text);
    if (text.trim().length < 2) return setFound([]);
    try {
      setFound((await client.listProducts(text.trim())).slice(0, 6));
    } catch (e) {
      setError(describeError(e));
    }
  };
  const add = (p: BackOfficeProduct) => {
    if (!lines.some((l) => l.product.product_id === p.product_id)) {
      setLines([...lines, { product: p, quantity: '', cost: p.cost_minor == null ? '' : (p.cost_minor / 100).toFixed(2) }]);
    }
    setSearch('');
    setFound([]);
  };
  const update = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const parsed = lines.map((l) => {
    const q = parseQty(l.quantity);
    const c = parseMoney(l.cost);
    return q && c !== null ? { quantity_milli: q, unit_cost_minor: c } : null;
  });
  const total = parsed.reduce((s, p) => s + (p ? purchaseLineCost(p.quantity_milli, p.unit_cost_minor) : 0), 0);

  const save = async () => {
    setError(null);
    if (!branchId) return setError('Add a branch first: goods are received into a branch.');
    if (!supplierId) return setError('Choose the supplier.');
    if (lines.length === 0) return setError('Add at least one product.');
    if (parsed.some((p) => p === null)) return setError('Enter a quantity and a unit cost (like 0.95) for every product.');
    setBusy(true);
    try {
      await client.recordPurchase({
        branch_id: branchId,
        supplier_id: supplierId,
        ...(reference.trim() ? { reference: reference.trim() } : {}),
        lines: lines.map((l, i) => ({ product_id: l.product.product_id, ...parsed[i]! })),
      });
      setLines([]);
      setReference('');
      await onDone(`Delivery recorded: ${money(total)} of stock added.`);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Receive goods</CardTitle>
        <CardDescription>Stock goes up and each product’s cost is set from the delivery.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {suppliers.length === 0 ? (
          <Alert variant="warning">
            <AlertDescription>
              Add the supplier first.{' '}
              <Button variant="link" className="h-auto p-0" onClick={onAddSupplier}>
                Add a supplier
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Supplier</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger aria-label="Supplier">
                <SelectValue placeholder="Choose the supplier" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reference">Invoice or delivery note number</Label>
            <Input id="reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="optional" />
          </div>
        </div>
        <div className="relative space-y-2">
          <Label htmlFor="find">Add a product</Label>
          <Input id="find" value={search} onChange={(e) => void find(e.target.value)} placeholder="Name or SKU" autoComplete="off" />
          {found.length ? (
            <div className="absolute z-10 w-full rounded-md border bg-popover p-1 shadow-md">
              {found.map((p) => (
                <button key={p.product_id} type="button" onClick={() => add(p)} className="block w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent">
                  {p.name} <span className="text-muted-foreground">· {p.sku}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {lines.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="w-32">Quantity</TableHead>
                <TableHead className="w-32">Unit cost</TableHead>
                <TableHead className="text-right">Line total</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l, i) => {
                const p = parsed[i];
                return (
                  <TableRow key={l.product.product_id}>
                    <TableCell className="font-medium">{l.product.name}</TableCell>
                    <TableCell>
                      <Input
                        value={l.quantity}
                        onChange={(e) => update(i, { quantity: e.target.value })}
                        inputMode="decimal"
                        placeholder={l.product.unit === 'each' ? 'items' : l.product.unit}
                        aria-label={`Quantity of ${l.product.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Input value={l.cost} onChange={(e) => update(i, { cost: e.target.value })} inputMode="decimal" placeholder="0.00" aria-label={`Unit cost of ${l.product.name}`} />
                    </TableCell>
                    <TableCell className="text-right">{p ? `${qty(p.quantity_milli, l.product.unit)} · ${money(purchaseLineCost(p.quantity_milli, p.unit_cost_minor))}` : '—'}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label={`Remove ${l.product.name}`}>
                        <Trash2 />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-lg font-semibold">Total {money(total)}</div>
          <Button onClick={() => void save()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : null} Record delivery
          </Button>
        </div>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Suppliers({ list, error, reload }: { list: Supplier[] | null; error: string | null; reload: () => Promise<void> }) {
  const { client } = useAuth();
  const [adding, setAdding] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Suppliers</CardTitle>
        <CardDescription>Who you buy from. Inactive suppliers keep their history but are not offered.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button onClick={() => setAdding(true)}>
          <Plus /> Add supplier
        </Button>
        {error || failed ? (
          <Alert variant="destructive">
            <AlertDescription>{error ?? failed}</AlertDescription>
          </Alert>
        ) : null}
        {list?.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
            <div>
              <div className={s.active ? 'font-medium' : 'text-muted-foreground'}>{s.name}</div>
              <div className="text-xs text-muted-foreground">{[s.contact_person, s.phone, s.email].filter(Boolean).join(' · ') || 'No contact details'}</div>
            </div>
            <div className="flex items-center gap-2">
              {s.active ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  setFailed(null);
                  try {
                    await client.updateSupplier(s.id, { active: !s.active });
                    await reload();
                  } catch (e) {
                    setFailed(describeError(e));
                  }
                }}
              >
                {s.active ? 'Make inactive' : 'Make active'}
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
      {adding ? (
        <FormDialog
          title="Add supplier"
          submitLabel="Add supplier"
          onClose={() => setAdding(false)}
          onSubmit={async (f) => {
            const v = (k: string) => String(f.get(k) ?? '').trim();
            if (!v('name')) throw new Error('Enter the supplier’s name.');
            await client.createSupplier({
              name: v('name'),
              ...(v('contact_person') ? { contact_person: v('contact_person') } : {}),
              ...(v('phone') ? { phone: v('phone') } : {}),
              ...(v('email') ? { email: v('email') } : {}),
            });
            setAdding(false);
            await reload();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="name">Supplier name</Label>
            <Input id="name" name="name" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contact_person">Contact person</Label>
              <Input id="contact_person" name="contact_person" placeholder="optional" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" type="tel" placeholder="optional" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" placeholder="optional" />
          </div>
        </FormDialog>
      ) : null}
    </Card>
  );
}
