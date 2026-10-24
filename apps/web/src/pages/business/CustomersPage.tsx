import type { BackOfficeCustomer, CustomerHistory } from '@inkypos/core';
import { Pencil } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useAuth } from '@/auth/session';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import { EmptyTableState } from '@/components/empty-state';
import { ChoiceGroup, FormDialog } from '@/components/form-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { money } from '@/lib/api';
import { useLoad } from '@/lib/use-load';

const orNull = (v: FormDataEntryValue | null) => {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
};

/** Customers, found at checkout by name or phone; tills only receive the name and phone. */
export function CustomersPage() {
  const { client } = useAuth();
  const [editing, setEditing] = useState<BackOfficeCustomer | 'new' | null>(null);

  const customers = useLoad(useCallback(() => client.listCustomers(''), [client]));

  return (
    <>
      <PageHeader
        title="Customers"
        description="Name a customer on a sale at the till to keep their purchase history."
        action={{
          label: 'New customer',
          onClick: () => setEditing('new'),
          variant: 'default',
        }}
      />
      {customers.error ? (
        <Alert variant="destructive">
          <AlertDescription>{customers.error}</AlertDescription>
        </Alert>
      ) : null}
      <DataTable<BackOfficeCustomer>
        data={customers.data ?? []}
        loading={customers.loading}
        columns={[
          {
            key: 'name',
            label: 'Name',
            searchable: true,
            sortable: true,
          },
          {
            key: 'phone',
            label: 'Phone',
            sortable: true,
            render: (phone) => phone ?? '—',
          },
          {
            key: 'email',
            label: 'Email',
            sortable: true,
            render: (email) => <span className="text-muted-foreground">{email ?? '—'}</span>,
          },
          {
            key: 'active',
            label: 'Status',
            sortable: true,
            render: (active) => active ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>,
          },
          {
            key: 'id',
            label: 'Actions',
            render: (_, c) => (
              <Button variant="ghost" size="sm" onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`}>
                <Pencil />
              </Button>
            ),
          },
        ]}
        searchableColumns={['name', 'phone', 'email']}
        rowKey="id"
        pageSize={20}
        onRowClick={(c) => setEditing(c)}
        emptyState={<EmptyTableState onAdd={() => setEditing('new')} />}
      />
      {editing ? (
        <CustomerDialog
          customer={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await customers.reload();
          }}
        />
      ) : null}
    </>
  );
}

function CustomerDialog({ customer, onClose, onSaved }: { customer: BackOfficeCustomer | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const { client } = useAuth();
  const [active, setActive] = useState(customer?.active ?? true);
  const history = useLoad(useCallback(async (): Promise<CustomerHistory | null> => (customer ? client.customerHistory(customer.id) : null), [client, customer]));

  return (
    <FormDialog
      title={customer ? customer.name : 'New customer'}
      submitLabel="Save customer"
      wide
      onClose={onClose}
      onSubmit={async (f) => {
        const name = String(f.get('name') ?? '').trim();
        if (!name) throw new Error('Enter the customer’s name.');
        const input = { name, phone: orNull(f.get('phone')), email: orNull(f.get('email')), notes: orNull(f.get('notes')), active };
        if (customer) await client.updateCustomer(customer.id, input);
        else await client.createCustomer(input);
        await onSaved();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" defaultValue={customer?.name} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" type="tel" defaultValue={customer?.phone ?? ''} placeholder="+263 77 123 4567" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" defaultValue={customer?.email ?? ''} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" name="notes" defaultValue={customer?.notes ?? ''} />
        </div>
      </div>
      <ChoiceGroup
        label="Status"
        value={active ? 'on' : 'off'}
        onChange={(v) => setActive(v === 'on')}
        options={[
          { value: 'on', label: 'Active', hint: 'Can be chosen at the till' },
          { value: 'off', label: 'Inactive', hint: 'Kept with their history, not offered' },
        ]}
      />
      {history.data ? (
        <div className="space-y-2 rounded-lg border p-3">
          <div className="text-sm font-medium">
            Purchases: {history.data.sales_count} {history.data.sales_count === 1 ? 'sale' : 'sales'} · {money(history.data.sales_total_minor)} in total
          </div>
          {history.data.recent_sales.map((s) => (
            <div key={s.sale_id} className="flex justify-between text-sm">
              <span>
                {s.receipt_number} <span className="text-muted-foreground">· {new Date(s.completed_at).toLocaleDateString()}</span>
              </span>
              <span>{money(s.total_minor, s.currency)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </FormDialog>
  );
}
