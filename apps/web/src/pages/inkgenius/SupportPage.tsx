import { MessageCircle, Pencil } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useAuth } from '@/auth/session';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLoad } from '@/lib/use-load';

interface SupportTicket {
  id: string;
  ticket_number: string;
  business_id: string;
  business_name: string;
  subject: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed';
  created_at: string;
  updated_at: string;
  message_count: number;
  assigned_to: string | null;
}

const PRIORITY_COLORS = {
  low: 'secondary',
  medium: 'outline',
  high: 'warning',
  urgent: 'destructive',
} as const;

const STATUS_COLORS = {
  open: 'outline',
  in_progress: 'warning',
  waiting_customer: 'secondary',
  resolved: 'success',
  closed: 'secondary',
} as const;

/**
 * Support ticket management for handling business support requests.
 * Track issues, assign to agents, manage resolution workflow.
 */
export function SupportPage() {
  const { client } = useAuth();
  const [status, setStatus] = useState('all');
  const [priority, setPriority] = useState('all');
  const [search, setSearch] = useState('');

  const tickets = useLoad(
    useCallback(
      () => {
        // TODO: Wire up to actual API once client methods are available
        return Promise.resolve([]);
      },
      [client, status, priority, search],
    ),
  );

  const data: SupportTicket[] = tickets.data ?? [];
  const openCount = data.filter((t: SupportTicket) => t.status === 'open').length;
  const urgentCount = data.filter((t: SupportTicket) => t.priority === 'urgent').length;

  return (
    <>
      <PageHeader
        title="Support Tickets"
        description="Manage customer support requests and track resolution."
      />

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-sm text-muted-foreground">Open Tickets</div>
          <div className="mt-2 text-2xl font-semibold text-info">{openCount}</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-sm text-muted-foreground">Urgent</div>
          <div className="mt-2 text-2xl font-semibold text-destructive">{urgentCount}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Input
          placeholder="Search tickets or business..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1"
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="waiting_customer">Waiting</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {tickets.error ? (
        <Alert variant="destructive">
          <AlertDescription>{tickets.error}</AlertDescription>
        </Alert>
      ) : null}

      {/* Tickets Table */}
      <DataTable<SupportTicket>
        data={(tickets.data as SupportTicket[]) ?? []}
        loading={tickets.loading}
        columns={[
          {
            key: 'ticket_number',
            label: 'Ticket',
            searchable: true,
            sortable: true,
            render: (num) => <span className="font-mono text-sm">#{num}</span>,
          },
          {
            key: 'subject',
            label: 'Subject',
            searchable: true,
            sortable: true,
          },
          {
            key: 'business_name',
            label: 'Business',
            searchable: true,
            sortable: true,
          },
          {
            key: 'priority',
            label: 'Priority',
            sortable: true,
            render: (p) => (
              <Badge variant={PRIORITY_COLORS[p as keyof typeof PRIORITY_COLORS]}>
                {p.charAt(0).toUpperCase() + p.slice(1).replace('_', ' ')}
              </Badge>
            ),
          },
          {
            key: 'status',
            label: 'Status',
            sortable: true,
            render: (s) => (
              <Badge variant={STATUS_COLORS[s as keyof typeof STATUS_COLORS]}>
                {s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ')}
              </Badge>
            ),
          },
          {
            key: 'message_count',
            label: 'Messages',
            sortable: true,
            render: (count) => (
              <div className="flex items-center gap-1 text-sm">
                <MessageCircle className="size-4" />
                {count}
              </div>
            ),
          },
          {
            key: 'created_at',
            label: 'Created',
            sortable: true,
            render: (date) => new Date(date).toLocaleDateString(),
          },
          {
            key: 'id',
            label: 'Actions',
            render: () => (
              <Button variant="ghost" size="sm" aria-label="Open ticket">
                <Pencil className="size-4" />
              </Button>
            ),
          },
        ]}
        searchableColumns={['ticket_number', 'subject', 'business_name']}
        rowKey="id"
        pageSize={20}
        emptyState={
          <div className="py-12 text-center text-muted-foreground">
            <p className="mb-3">No support tickets found</p>
          </div>
        }
      />
    </>
  );
}
