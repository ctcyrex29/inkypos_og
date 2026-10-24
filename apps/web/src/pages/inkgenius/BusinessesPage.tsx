import type { BusinessType } from '@inkypos/core';
import { Copy, Loader2 } from 'lucide-react';
import { useCallback, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/session';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import { EmptyTableState } from '@/components/empty-state';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ name: string; email: string; password: string; id: string } | null>(null);

  const list = useLoad(
    useCallback(
      () => client.platform.businesses({ ...(status !== 'all' ? { status } : {}), ...(type !== 'all' ? { type } : {}) }),
      [client, status, type],
    ),
  );

  return (
    <>
      <PageHeader
        title="Businesses"
        description="Shops and restaurants using InkyPOS."
        action={
          can('businesses.create')
            ? {
                label: 'New business',
                onClick: () => setCreating(true),
                variant: 'default',
              }
            : undefined
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
        <div className="flex-1 min-w-56">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Waiting for activation</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-56">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger aria-label="Type">
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
      </div>
      {list.error ? (
        <Alert variant="destructive">
          <AlertDescription>{list.error}</AlertDescription>
        </Alert>
      ) : null}
      <DataTable
        data={list.data ?? []}
        loading={list.loading}
        columns={[
          {
            key: 'name',
            label: 'Business',
            searchable: true,
            sortable: true,
          },
          {
            key: 'business_type',
            label: 'Type',
            sortable: true,
            render: (type) => TYPE_LABEL[type as keyof typeof TYPE_LABEL],
          },
          {
            key: 'status',
            label: 'Status',
            sortable: true,
            render: (status) => <StatusBadge status={status as 'pending' | 'active' | 'suspended'} />,
          },
          {
            key: 'subscription',
            label: 'Plan',
            render: (sub) => (
              <div>
                {sub?.plan_name ?? '—'}
                {sub ? <span className="text-xs text-muted-foreground"> · {sub.status}</span> : null}
              </div>
            ),
          },
          {
            key: 'tills',
            label: 'Tills',
            sortable: true,
            className: 'text-right',
            render: (count) => count ?? 0,
          },
          {
            key: 'staff',
            label: 'Staff',
            sortable: true,
            className: 'text-right',
            render: (count) => count ?? 0,
          },
          {
            key: 'created_at',
            label: 'Registered',
            sortable: true,
            render: (date) => formatDate(date).split(',')[0],
          },
        ]}
        searchableColumns={['name']}
        rowKey="id"
        pageSize={20}
        onRowClick={(b) => navigate(`/inkgenius/businesses/${b.id}`)}
        emptyState={<EmptyTableState onAdd={can('businesses.create') ? () => setCreating(true) : undefined} />}
      />
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
