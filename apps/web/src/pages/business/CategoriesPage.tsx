import type { CategoryInfo } from '@inkypos/core';
import { ArrowDown, ArrowUp, Eye, EyeOff, Loader2, Plus } from 'lucide-react';
import { useCallback, useState, type FormEvent } from 'react';
import { useAuth } from '@/auth/session';
import { PageHeader } from '@/components/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { describeError } from '@/lib/api';
import { useLoad } from '@/lib/use-load';

/** Categories group products on the till's browse screen, in this order. */
export function CategoriesPage() {
  const { client } = useAuth();
  const categories = useLoad(useCallback(() => client.listCategories(), [client]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = [...(categories.data ?? [])].sort((a, b) => a.position - b.position);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await categories.reload();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const add = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const name = String(new FormData(form).get('name') ?? '').trim();
    if (!name) return setError('Type a name for the category, e.g. Drinks.');
    void run(async () => {
      await client.createCategory({ name, position: list.length });
      form.reset();
    });
  };

  /** Swaps a category with its neighbour; both positions are rewritten. */
  const move = (c: CategoryInfo, by: -1 | 1) => {
    const i = list.findIndex((x) => x.id === c.id);
    const other = list[i + by];
    if (!other) return;
    void run(() => Promise.all([client.updateCategory(c.id, { position: i + by }), client.updateCategory(other.id, { position: i })]));
  };

  return (
    <>
      <PageHeader title="Categories" description="Tills show these in this order for browsing products. Hidden categories stay on their products but are not shown." />
      <Card>
        <CardHeader>
          <CardTitle>Add a category</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={add} className="flex max-w-md gap-2">
            <Input name="name" placeholder="e.g. Drinks" aria-label="New category name" />
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Plus />} Add
            </Button>
          </form>
        </CardContent>
      </Card>
      {error || categories.error ? (
        <Alert variant="destructive">
          <AlertDescription>{error ?? categories.error}</AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Order on the tills</CardTitle>
          <CardDescription>{list.length === 0 ? 'No categories yet.' : 'Use the arrows to change the order.'}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {list.map((c, i) => (
            <div key={c.id} className="flex items-center gap-3 rounded-lg border p-3">
              <span className="w-6 text-right text-sm text-muted-foreground">{i + 1}</span>
              <span className={c.active ? 'flex-1 font-medium' : 'flex-1 text-muted-foreground'}>{c.name}</span>
              {c.active ? null : <Badge variant="secondary">Hidden</Badge>}
              <Button variant="ghost" size="icon" disabled={i === 0 || busy} onClick={() => move(c, -1)} aria-label={`Move ${c.name} up`}>
                <ArrowUp />
              </Button>
              <Button variant="ghost" size="icon" disabled={i === list.length - 1 || busy} onClick={() => move(c, 1)} aria-label={`Move ${c.name} down`}>
                <ArrowDown />
              </Button>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void run(() => client.updateCategory(c.id, { active: !c.active }))}>
                {c.active ? <EyeOff /> : <Eye />} {c.active ? 'Hide' : 'Show'}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
