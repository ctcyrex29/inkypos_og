import type { BackOfficeCustomer, CustomerHistory } from '@inkypos/core';
import { Plus, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/auth/session';
import { PageHeader } from '@/components/app-shell';
import { ChoiceGroup, FormDialog } from '@/components/form-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<BackOfficeCustomer | 'new' | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);
  const customers = useLoad(useCallback(() => client.listCustomers(query), [client, query]));

  return (
    <>
      <PageHeader
        title="Customers"
        description="Name a customer on a sale at the till to keep their purchase history."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus /> New customer
          </Button>
        }
      />
      <div className="relative max-w-sm">
        <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Name or phone" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search customers" />
      </div>
      {customers.error ? (
        <Alert variant="destructive">
          <AlertDescription>{customers.error}</AlertDescription>
        </Alert>
      ) : null}
      <Card className="py-0">
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.data?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    {query ? 'No customers match.' : 'No customers yet.'}
                  </TableCell>
                </TableRow>
              ) : null}
              {customers.data?.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => setEditing(c)}>
                  <TableCell className="pl-4 font-medium">{c.name}</TableCell>
                  <TableCell>{c.phone ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{c.email ?? '—'}</TableCell>
                  <TableCell>{c.active ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
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
