import { fromDrafts, toDrafts, type BackOfficeProduct, type CategoryInfo, type GroupDraft, type ProductInput, type RecipeItemInput } from '@inkypos/core';
import { ChefHat, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useAuth, useBusinessSession } from '@/auth/session';
import { PageHeader } from '@/components/app-shell';
import { ChoiceGroup, FormDialog } from '@/components/form-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { describeError, money, parseMoney, parseQty, qty } from '@/lib/api';
import { useLoad } from '@/lib/use-load';

const NO_CATEGORY = 'none';

/** Products and prices; tills receive changes on their next sync. */
export function ProductsPage() {
  const { client } = useAuth();
  const session = useBusinessSession();
  const restaurant = session.businessType !== 'retail';
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [editing, setEditing] = useState<BackOfficeProduct | 'new' | null>(null);
  const [recipeFor, setRecipeFor] = useState<BackOfficeProduct | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);
  const products = useLoad(useCallback(() => client.listProducts(query, category === 'all' ? undefined : category), [client, query, category]));
  const categories = useLoad(useCallback(() => client.listCategories(), [client]));
  const categoryName = (id: string | null | undefined) => (id ? (categories.data?.find((c) => c.id === id)?.name ?? '—') : '—');

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
      <div className="flex flex-wrap gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by name or SKU" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search products" />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-48" aria-label="Category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {(categories.data ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead>Tax</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.data?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    {query || category !== 'all' ? 'No products match.' : 'No products yet. Add your first one.'}
                  </TableCell>
                </TableRow>
              ) : null}
              {products.data?.map((p) => (
                <TableRow key={p.product_id}>
                  <TableCell className="pl-4">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.sku}
                      {p.barcodes.length ? ` · ${p.barcodes.join(', ')}` : ''}
                      {p.option_groups?.length ? ` · ${p.option_groups.length} option group${p.option_groups.length === 1 ? '' : 's'}` : ''}
                    </div>
                  </TableCell>
                  <TableCell>{categoryName(p.category_id)}</TableCell>
                  <TableCell className="text-right">
                    {money(p.unit_price_minor)}
                    {p.unit !== 'each' ? <span className="text-muted-foreground"> / {p.unit}</span> : null}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">{p.cost_minor == null ? '—' : money(p.cost_minor)}</TableCell>
                  <TableCell>
                    {p.tax_code} {(p.tax_rate_bp / 100).toFixed(1)}%
                  </TableCell>
                  <TableCell>{p.active ? <Badge variant="success">For sale</Badge> : <Badge variant="secondary">Off</Badge>}</TableCell>
                  <TableCell className="pr-4 text-right whitespace-nowrap">
                    {restaurant ? (
                      <Button variant="ghost" size="sm" onClick={() => setRecipeFor(p)} aria-label={`Recipe for ${p.name}`}>
                        <ChefHat /> Recipe
                      </Button>
                    ) : null}
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
          categories={categories.data ?? []}
          showOptions={restaurant}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            const saved = editing === 'new' ? await client.createProduct(input) : await client.updateProduct(editing.product_id, input);
            const list = products.data ?? [];
            products.setData(editing === 'new' ? [saved, ...list] : list.map((x) => (x.product_id === saved.product_id ? saved : x)));
            setEditing(null);
          }}
        />
      ) : null}
      {recipeFor ? <RecipeDialog product={recipeFor} onClose={() => setRecipeFor(null)} /> : null}
    </>
  );
}

function ProductDialog({
  product,
  categories,
  showOptions,
  onClose,
  onSave,
}: {
  product: BackOfficeProduct | null;
  categories: CategoryInfo[];
  showOptions: boolean;
  onClose: () => void;
  onSave: (input: ProductInput) => Promise<void>;
}) {
  const [unit, setUnit] = useState(product?.unit ?? 'each');
  const [active, setActive] = useState(product?.active ?? true);
  const [taxInclusive, setTaxInclusive] = useState(product?.tax_inclusive ?? true);
  const [trackStock, setTrackStock] = useState(product?.track_stock ?? true);
  const [categoryId, setCategoryId] = useState(product?.category_id ?? NO_CATEGORY);
  const [groups, setGroups] = useState<GroupDraft[]>(() => toDrafts(product?.option_groups));
  const setGroup = (i: number, patch: Partial<GroupDraft>) => setGroups(groups.map((g, j) => (j === i ? { ...g, ...patch } : g)));

  return (
    <FormDialog
      title={product ? `Edit ${product.name}` : 'New product'}
      description="Tills receive changes on their next sync. Cost and low-stock level stay in the back office."
      submitLabel="Save product"
      wide
      onClose={onClose}
      onSubmit={async (f) => {
        const text = (k: string) => String(f.get(k) ?? '').trim();
        const price = parseMoney(text('price'));
        const rate = Number(text('tax_rate'));
        if (!text('name') || !text('sku')) throw new Error('Give the product a name and a SKU (your own short code).');
        if (price === null) throw new Error('Enter the price like 1.20.');
        if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error('Enter the tax rate as a percentage, e.g. 15.');
        const cost = text('cost') === '' ? null : parseMoney(text('cost'));
        if (cost === null && text('cost') !== '') throw new Error('Enter the cost like 0.95, or leave it empty.');
        const reorder = text('reorder') === '' ? null : parseQty(text('reorder'));
        if (reorder === null && text('reorder') !== '') throw new Error('Enter the low-stock level as a quantity, e.g. 5 or 2.5.');
        const optionGroups = showOptions ? fromDrafts(groups, product?.option_groups) : undefined;
        if (typeof optionGroups === 'string') throw new Error(optionGroups);
        await onSave({
          name: text('name'),
          sku: text('sku'),
          unit_price_minor: price,
          unit,
          tax_code: text('tax_code') || (rate > 0 ? 'VAT15' : 'ZERO'),
          tax_rate_bp: Math.round(rate * 100),
          tax_inclusive: taxInclusive,
          active,
          barcodes: text('barcodes').split(/[\s,]+/).filter(Boolean),
          category_id: categoryId === NO_CATEGORY ? null : categoryId,
          cost_minor: cost,
          reorder_level_milli: reorder,
          track_stock: trackStock,
          ...(optionGroups ? { option_groups: optionGroups } : {}),
        });
      }}
    >
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
          <Label>Category</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger aria-label="Product category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CATEGORY}>No category</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          <Label htmlFor="tax_code">Tax code</Label>
          <Input id="tax_code" name="tax_code" defaultValue={product?.tax_code ?? 'VAT15'} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tax_rate">Tax rate (%)</Label>
          <Input id="tax_rate" name="tax_rate" inputMode="decimal" defaultValue={product ? String(product.tax_rate_bp / 100) : '15'} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cost">Cost (optional)</Label>
          <Input id="cost" name="cost" inputMode="decimal" defaultValue={product?.cost_minor == null ? '' : (product.cost_minor / 100).toFixed(2)} placeholder="Set by deliveries too" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="reorder">Low-stock level (optional)</Label>
          <Input id="reorder" name="reorder" inputMode="decimal" defaultValue={product?.reorder_level_milli == null ? '' : qty(product.reorder_level_milli)} placeholder="e.g. 10" />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="barcodes">Barcodes</Label>
          <Input id="barcodes" name="barcodes" defaultValue={product?.barcodes.join(', ')} placeholder="Separate several with commas" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <ChoiceGroup label="Status" value={active ? 'on' : 'off'} onChange={(v) => setActive(v === 'on')} options={[{ value: 'on', label: 'For sale' }, { value: 'off', label: 'Not for sale' }]} />
        <ChoiceGroup label="Tax" value={taxInclusive ? 'in' : 'ex'} onChange={(v) => setTaxInclusive(v === 'in')} options={[{ value: 'in', label: 'Tax included' }, { value: 'ex', label: 'Tax added' }]} />
        <ChoiceGroup label="Stock" value={trackStock ? 'yes' : 'no'} onChange={(v) => setTrackStock(v === 'yes')} options={[{ value: 'yes', label: 'Counted as stock' }, { value: 'no', label: 'Made to order' }]} />
      </div>
      {showOptions ? (
        <div className="space-y-3 rounded-lg border p-3">
          <div>
            <div className="text-sm font-medium">Options</div>
            <p className="text-xs text-muted-foreground">Choices made when ordering, such as the relish with sadza. One choice per line; add “+0.50” to a choice that costs more.</p>
          </div>
          {groups.map((g, i) => (
            <div key={g.id ?? `new-${i}`} className="space-y-2 rounded-md border p-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-40 flex-1 space-y-1">
                  <Label htmlFor={`group-${i}`}>Option group {i + 1}</Label>
                  <Input id={`group-${i}`} value={g.name} onChange={(e) => setGroup(i, { name: e.target.value })} placeholder="e.g. Relish" />
                </div>
                <Button type="button" variant={g.required ? 'default' : 'outline'} size="sm" onClick={() => setGroup(i, { required: !g.required })}>
                  {g.required ? 'Must choose' : 'Optional'}
                </Button>
                <Button type="button" variant={g.multiple ? 'default' : 'outline'} size="sm" onClick={() => setGroup(i, { multiple: !g.multiple })}>
                  {g.multiple ? 'Several allowed' : 'Only one'}
                </Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => setGroups(groups.filter((_, j) => j !== i))} aria-label={`Remove group ${i + 1}`}>
                  <Trash2 />
                </Button>
              </div>
              <Textarea value={g.text} onChange={(e) => setGroup(i, { text: e.target.value })} placeholder={'Beef stew +2.00\nRoad-runner chicken +2.50'} aria-label={`Choices for group ${i + 1}`} />
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setGroups([...groups, { name: '', required: true, multiple: false, text: '' }])}>
            <Plus /> Add option group
          </Button>
        </div>
      ) : null}
    </FormDialog>
  );
}

type RecipeLine = RecipeItemInput & { name: string; unit: string };

/**
 * What one portion uses. Lines for "every portion" always apply; lines tied to
 * an option apply only when it is chosen. Ingredients come off stock when the sale reaches the server.
 */
function RecipeDialog({ product, onClose }: { product: BackOfficeProduct; onClose: () => void }) {
  const { client } = useAuth();
  const recipe = useLoad(useCallback(() => client.getRecipe(product.product_id), [client, product.product_id]));
  const [lines, setLines] = useState<RecipeLine[] | null>(null);
  const [optionId, setOptionId] = useState('every');
  const [amount, setAmount] = useState('');
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<BackOfficeProduct[]>([]);
  const [error, setError] = useState<string | null>(null);
  const options = (product.option_groups ?? []).flatMap((g) => g.options.map((o) => ({ id: o.id, label: `${g.name}: ${o.name}` })));
  const list: RecipeLine[] =
    lines ?? (recipe.data?.items ?? []).map((i) => ({ option_id: i.option_id, ingredient_id: i.ingredient_id, quantity_milli: i.quantity_milli, name: i.ingredient_name, unit: i.unit }));
  const appliesTo = (id: string | null) => (id ? (options.find((o) => o.id === id)?.label ?? 'a removed option') : 'Every portion');

  const find = async (text: string) => {
    setSearch(text);
    if (text.trim().length < 2) return setFound([]);
    try {
      setFound((await client.listProducts(text.trim())).filter((p) => p.product_id !== product.product_id).slice(0, 6));
    } catch (e) {
      setError(describeError(e));
    }
  };
  const add = (ingredient: BackOfficeProduct) => {
    const milli = parseQty(amount);
    if (!milli) return setError(`First enter how much one portion uses, in ${ingredient.unit === 'each' ? 'items' : ingredient.unit}, e.g. 0.25.`);
    setLines([...list, { option_id: optionId === 'every' ? null : optionId, ingredient_id: ingredient.product_id, quantity_milli: milli, name: ingredient.name, unit: ingredient.unit }]);
    setSearch('');
    setFound([]);
    setAmount('');
    setError(null);
  };

  return (
    <FormDialog
      title={`Recipe for ${product.name}`}
      description="What one portion uses. Ingredients come off stock when the sale reaches the server."
      submitLabel="Save recipe"
      wide
      onClose={onClose}
      onSubmit={async () => {
        await client.setRecipe(product.product_id, list.map(({ option_id, ingredient_id, quantity_milli }) => ({ option_id, ingredient_id, quantity_milli })));
        onClose();
      }}
    >
      {recipe.error ? (
        <Alert variant="destructive">
          <AlertDescription>{recipe.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="space-y-2 rounded-lg border p-3">
        {list.length === 0 ? <p className="text-sm text-muted-foreground">No ingredients yet.</p> : null}
        {list.map((item, i) => (
          <div key={`${item.ingredient_id}${item.option_id ?? ''}${i}`} className="flex items-center justify-between gap-3 text-sm">
            <span>
              <span className="font-medium">
                {qty(item.quantity_milli, item.unit)} {item.name}
              </span>
              <span className="text-muted-foreground"> · {appliesTo(item.option_id)}</span>
            </span>
            <Button type="button" variant="ghost" size="icon" onClick={() => setLines(list.filter((_, j) => j !== i))} aria-label={`Remove ${item.name}`}>
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>
      <div className="space-y-3">
        <div className="text-sm font-medium">Add an ingredient</div>
        {options.length > 0 ? (
          <Select value={optionId} onValueChange={setOptionId}>
            <SelectTrigger aria-label="Applies to">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="every">Every portion</SelectItem>
              {options.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  Only with {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="e.g. 0.25" aria-label="Amount per portion" />
          <div className="relative">
            <Input value={search} onChange={(e) => void find(e.target.value)} placeholder="Search products, e.g. Beef" aria-label="Ingredient" autoComplete="off" />
            {found.length ? (
              <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover p-1 shadow-md">
                {found.map((p) => (
                  <button key={p.product_id} type="button" onClick={() => add(p)} className="block w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent">
                    {p.name} <span className="text-muted-foreground">({p.unit === 'each' ? 'items' : p.unit})</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    </FormDialog>
  );
}
