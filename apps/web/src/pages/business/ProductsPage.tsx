import type { BackOfficeProduct, ProductInput } from '@inkypos/core';
import { Loader2, Pencil, Plus, Search } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/auth/session';
import { PageHeader } from '@/components/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { describeError, money, parseMoney } from '@/lib/api';
import { useLoad } from '@/lib/use-load';

/** Products and prices; tills receive changes on their next sync. */
export function ProductsPage() {
  const { client } = useAuth();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<BackOfficeProduct | 'new' | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);
  const products = useLoad(useCallback(() => client.listProducts(query), [client, query]));

  return (
    <>
      <PageHeader
        title="Products"
        description="Prices are in your business currency, tax included unless you say otherwise."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus /> New product
          </Button>
        }
      />
      <div className="relative max-w-sm">
        <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search by name or SKU" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search products" />
      </div>
      {products.error ? (
        <Alert variant="destructive">
          <AlertDescription>{products.error}</AlertDescription>
        </Alert>
      ) : null}
      <Card className="py-0">
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Product</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Tax</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.data?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    {query ? 'No products match your search.' : 'No products yet. Add your first one.'}
                  </TableCell>
                </TableRow>
              ) : null}
              {products.data?.map((p) => (
                <TableRow key={p.product_id}>
                  <TableCell className="pl-4">
                    <div className="font-medium">{p.name}</div>
                    {p.barcodes.length ? <div className="text-xs text-muted-foreground">{p.barcodes.join(', ')}</div> : null}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                  <TableCell className="text-right">
                    {money(p.unit_price_minor)}
                    {p.unit !== 'each' ? <span className="text-muted-foreground"> / {p.unit}</span> : null}
                  </TableCell>
                  <TableCell>
                    {p.tax_code} {(p.tax_rate_bp / 100).toFixed(1)}%
                  </TableCell>
                  <TableCell>{p.active ? <Badge variant="success">For sale</Badge> : <Badge variant="secondary">Off</Badge>}</TableCell>
                  <TableCell className="pr-4 text-right">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(p)} aria-label={`Edit ${p.name}`}>
                      <Pencil /> Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {editing ? (
        <ProductDialog
          product={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            const saved = editing === 'new' ? await client.createProduct(input) : await client.updateProduct(editing.product_id, input);
            const list = products.data ?? [];
            products.setData(editing === 'new' ? [saved, ...list] : list.map((x) => (x.product_id === saved.product_id ? saved : x)));
            setEditing(null);
          }}
        />
      ) : null}
    </>
  );
}

function ProductDialog({ product, onClose, onSave }: { product: BackOfficeProduct | null; onClose: () => void; onSave: (input: ProductInput) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unit, setUnit] = useState(product?.unit ?? 'each');
  const [active, setActive] = useState(product?.active ?? true);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? '').trim();
    const price = parseMoney(text('price'));
    const rate = Number(text('tax_rate'));
    if (!text('name') || !text('sku')) return setError('Give the product a name and a SKU (your own short code).');
    if (price === null) return setError('Enter the price like 1.20.');
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) return setError('Enter the tax rate as a percentage, e.g. 15.');
    setBusy(true);
    setError(null);
    try {
      await onSave({
        name: text('name'),
        sku: text('sku'),
        unit_price_minor: price,
        unit,
        tax_code: text('tax_code') || (rate > 0 ? 'VAT15' : 'ZERO'),
        tax_rate_bp: Math.round(rate * 100),
        active,
        barcodes: text('barcodes').split(/[\s,]+/).filter(Boolean),
      });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{product ? `Edit ${product.name}` : 'New product'}</DialogTitle>
          <DialogDescription>Tills receive changes on their next sync.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" defaultValue={product?.name} placeholder="e.g. White bread 700g" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sku">SKU</Label>
              <Input id="sku" name="sku" defaultValue={product?.sku} placeholder="BREAD-700" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Price</Label>
              <Input id="price" name="price" inputMode="decimal" defaultValue={product ? (product.unit_price_minor / 100).toFixed(2) : ''} placeholder="1.20" />
            </div>
            <div className="space-y-2">
              <Label>Sold by</Label>
              <Select value={unit} onValueChange={(v) => setUnit(v as typeof unit)}>
                <SelectTrigger aria-label="Sold by">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="each">Each</SelectItem>
                  <SelectItem value="kg">Kilogram</SelectItem>
                  <SelectItem value="l">Litre</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={active ? 'on' : 'off'} onValueChange={(v) => setActive(v === 'on')}>
                <SelectTrigger aria-label="Status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="on">For sale</SelectItem>
                  <SelectItem value="off">Not for sale</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tax_code">Tax code</Label>
              <Input id="tax_code" name="tax_code" defaultValue={product?.tax_code ?? 'VAT15'} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tax_rate">Tax rate (%)</Label>
              <Input id="tax_rate" name="tax_rate" inputMode="decimal" defaultValue={product ? String(product.tax_rate_bp / 100) : '15'} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="barcodes">Barcodes</Label>
              <Input id="barcodes" name="barcodes" defaultValue={product?.barcodes.join(', ')} placeholder="Separate several with commas" />
            </div>
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null} Save product
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
