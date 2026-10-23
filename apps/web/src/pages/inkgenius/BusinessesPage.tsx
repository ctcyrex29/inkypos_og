import type { BusinessType } from '@inkypos/core';
import { Copy, Loader2, Plus, Search } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/session';
import { PageHeader } from '@/components/app-shell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { describeError, formatDate } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { StatusBadge, TYPE_LABEL, useCan } from './shared';

/** Every business on InkyPOS, with filters. */
export function BusinessesPage() {
  const { client } = useAuth();
  const can = useCan();
  const navigate = useNavigate();
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ name: string; email: string; password: string; id: string } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);
  const list = useLoad(
    useCallback(
      () => client.platform.businesses({ ...(status !== 'all' ? { status } : {}), ...(type !== 'all' ? { type } : {}), ...(query ? { search: query } : {}) }),
      [client, status, type, query],
    ),
  );

  return (
    <>
      <PageHeader
        title="Businesses"
        description="Shops and restaurants using InkyPOS."
        actions={
          can('businesses.create') ? (
            <Button onClick={() => setCreating(true)}>
              <Plus /> New business
            </Button>
          ) : undefined
        }
      />
      {created ? (
        <Alert variant="success">
          <AlertTitle>{created.name} is ready</AlertTitle>
          <AlertDescription>
            <p>
              Give the manager their sign-in securely (not by public chat). They should change the password after signing in.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-sm text-foreground">
              {created.email} · {created.password}
              <Button variant="outline" size="sm" onClick={() => void navigator.clipboard?.writeText(`${created.email}\n${created.password}`)}>
                <Copy /> Copy
              </Button>
              <Button variant="link" size="sm" asChild>
                <Link to={`/inkgenius/businesses/${created.id}`}>Open business</Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by name" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search businesses" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Waiting for activation</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-48" aria-label="Type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="retail">Shop</SelectItem>
            <SelectItem value="restaurant">Restaurant</SelectItem>
            <SelectItem value="both">Shop & restaurant</SelectItem>
          </SelectContent>
        </Select>
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
                <TableHead className="pl-4">Business</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">Tills</TableHead>
                <TableHead className="text-right">Staff</TableHead>
                <TableHead>Registered</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    No businesses match.
                  </TableCell>
                </TableRow>
              ) : null}
              {list.data?.map((b) => (
                <TableRow key={b.id} className="cursor-pointer" onClick={() => navigate(`/inkgenius/businesses/${b.id}`)}>
                  <TableCell className="pl-4 font-medium">{b.name}</TableCell>
                  <TableCell>{TYPE_LABEL[b.business_type]}</TableCell>
                  <TableCell>
                    <StatusBadge status={b.status} />
                  </TableCell>
                  <TableCell>
                    {b.subscription?.plan_name ?? '—'}
                    {b.subscription ? <span className="text-xs text-muted-foreground"> · {b.subscription.status}</span> : null}
                  </TableCell>
                  <TableCell className="text-right">{b.tills ?? 0}</TableCell>
                  <TableCell className="text-right">{b.staff ?? 0}</TableCell>
                  <TableCell>{formatDate(b.created_at).split(',')[0]}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {creating ? (
        <NewBusinessDialog
          onClose={() => setCreating(false)}
          onCreated={(c) => {
            setCreating(false);
            setCreated(c);
            void list.reload();
          }}
        />
      ) : null}
    </>
  );
}

function NewBusinessDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (c: { name: string; email: string; password: string; id: string }) => void }) {
  const { client } = useAuth();
  const [type, setType] = useState<BusinessType>('retail');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (k: string) => String(f.get(k) ?? '').trim();
    if (!v('business_name') || !v('manager_name') || !v('manager_email')) return setError('Fill in every field.');
    setBusy(true);
    setError(null);
    try {
      const r = await client.platform.createBusiness({ business_name: v('business_name'), business_type: type, manager_name: v('manager_name'), manager_email: v('manager_email') });
      onCreated({ name: r.business.name, email: v('manager_email').toLowerCase(), password: r.temporary_password, id: r.business.id });
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
          <DialogTitle>New business</DialogTitle>
          <DialogDescription>It is active at once. The manager gets a temporary password, shown once.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="business_name">Business name</Label>
            <Input id="business_name" name="business_name" />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as BusinessType)}>
              <SelectTrigger aria-label="Type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="retail">Shop</SelectItem>
                <SelectItem value="restaurant">Restaurant</SelectItem>
                <SelectItem value="both">Shop & restaurant</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="manager_name">Manager’s name</Label>
              <Input id="manager_name" name="manager_name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="manager_email">Manager’s email</Label>
              <Input id="manager_email" name="manager_email" type="email" />
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
              {busy ? <Loader2 className="animate-spin" /> : null} Create business
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
