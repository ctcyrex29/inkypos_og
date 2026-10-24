import { Eye } from 'lucide-react';
import { useCallback, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLoad } from '@/lib/use-load';

interface Invoice {
  id: string;
  business_id: string;
  business_name: string;
  invoice_number: string;
  amount_minor: number;
  currency: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'refunded';
  issued_at: string;
  due_at: string;
  paid_at: string | null;
  items_count: number;
  description: string;
}

const STATUS_COLORS = {
  draft: 'secondary',
  sent: 'outline',
  paid: 'success',
  overdue: 'destructive',
  refunded: 'secondary',
} as const;

/**
 * Billing invoices, payment tracking, and financial reporting for the platform.
 * Manage recurring billing, track overdue payments, process refunds.
 */
export function BillingPage() {
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');

  const invoices = useLoad(
    useCallback(
      () => {
        // TODO: Wire up to actual API once client methods are available
        return Promise.resolve([]);
      },
      [status, search, fromDate],
    ),
  );

  const data: Invoice[] = invoices.data ?? [];

  const totalAmount = data.reduce((sum: number, inv: Invoice) => sum + inv.amount_minor, 0);
  const paidAmount = data.filter((inv: Invoice) => inv.status === 'paid').reduce((sum: number, inv: Invoice) => sum + inv.amount_minor, 0);
  const overdueAmount = data.filter((inv: Invoice) => inv.status === 'overdue').reduce((sum: number, inv: Invoice) => sum + inv.amount_minor, 0);

  return (
    <>
      <PageHeader
        title="Billing"
        description="Manage invoices, track payments, and monitor financial health."
      />

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-sm text-muted-foreground">Total Invoiced</div>
          <div className="mt-2 text-2xl font-semibold">${(totalAmount / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-sm text-muted-foreground">Paid</div>
          <div className="mt-2 text-2xl font-semibold text-success">${(paidAmount / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-sm text-muted-foreground">Overdue</div>
          <div className="mt-2 text-2xl font-semibold text-destructive">${(overdueAmount / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Input
          placeholder="Search business or invoice number..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1"
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          placeholder="From date"
          aria-label="From date"
          className="w-40"
        />
      </div>

      {invoices.error ? (
        <Alert variant="destructive">
          <AlertDescription>{invoices.error}</AlertDescription>
        </Alert>
      ) : null}

      {/* Invoices Table */}
      <DataTable<Invoice>
        data={(invoices.data as Invoice[]) ?? []}
        loading={invoices.loading}
        columns={[
          {
            key: 'invoice_number',
            label: 'Invoice',
            searchable: true,
            sortable: true,
            render: (num) => <span className="font-mono text-sm">{num}</span>,
          },
          {
            key: 'business_name',
            label: 'Business',
            searchable: true,
            sortable: true,
          },
          {
            key: 'amount_minor',
            label: 'Amount',
            sortable: true,
            render: (amount, inv) =>
              `$${(amount / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${inv.currency}`,
          },
          {
            key: 'issued_at',
            label: 'Issued',
            sortable: true,
            render: (date) => new Date(date).toLocaleDateString(),
          },
          {
            key: 'due_at',
            label: 'Due',
            sortable: true,
            render: (date) => new Date(date).toLocaleDateString(),
          },
          {
            key: 'status',
            label: 'Status',
            sortable: true,
            render: (s) => (
              <Badge variant={STATUS_COLORS[s as keyof typeof STATUS_COLORS]}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Badge>
            ),
          },
          {
            key: 'id',
            label: 'Actions',
            render: (id) => (
              <Button variant="ghost" size="sm" aria-label="View invoice">
                <Eye className="size-4" />
              </Button>
            ),
          },
        ]}
        searchableColumns={['invoice_number', 'business_name']}
        rowKey="id"
        pageSize={20}
        emptyState={
          <div className="py-12 text-center text-muted-foreground">
            <p className="mb-3">No invoices found</p>
            <Button variant="outline" size="sm">
              Create invoice
            </Button>
          </div>
        }
      />
    </>
  );
}
