import { useCallback, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLoad } from '@/lib/use-load';

interface AuditLog {
  id: string;
  timestamp: string;
  user_id: string;
  user_name: string;
  action: string;
  resource_type: string;
  resource_id: string;
  resource_name: string;
  changes: string;
  ip_address: string;
  status: 'success' | 'failed';
}

const ACTION_TYPES = [
  'all',
  'create',
  'update',
  'delete',
  'activate',
  'suspend',
  'reset_password',
  'change_plan',
] as const;

const RESOURCE_TYPES = [
  'all',
  'business',
  'user',
  'subscription',
  'device',
  'staff',
] as const;

/**
 * Audit log of all platform admin actions for compliance and troubleshooting.
 * Tracks who did what, when, and the outcome.
 */
export function AuditLogPage() {
  const [action, setAction] = useState('all');
  const [resourceType, setResourceType] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const logs = useLoad(
    useCallback(
      () => {
        // TODO: Wire up to actual API once client methods are available
        return Promise.resolve([]);
      },
      [action, resourceType, fromDate, toDate],
    ),
  );

  return (
    <>
      <PageHeader
        title="Audit Log"
        description="All platform admin actions tracked for compliance, security, and troubleshooting."
      />

      {/* Filters */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Select value={action} onValueChange={setAction}>
          <SelectTrigger>
            <SelectValue placeholder="Action" />
          </SelectTrigger>
          <SelectContent>
            {ACTION_TYPES.map((a) => (
              <SelectItem key={a} value={a}>
                {a === 'all' ? 'All actions' : a.replace('_', ' ').charAt(0).toUpperCase() + a.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={resourceType} onValueChange={setResourceType}>
          <SelectTrigger>
            <SelectValue placeholder="Resource" />
          </SelectTrigger>
          <SelectContent>
            {RESOURCE_TYPES.map((r) => (
              <SelectItem key={r} value={r}>
                {r === 'all' ? 'All resources' : r.charAt(0).toUpperCase() + r.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          placeholder="From date"
          aria-label="From date"
        />

        <Input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          placeholder="To date"
          aria-label="To date"
        />
      </div>

      {logs.error ? (
        <Alert variant="destructive">
          <AlertDescription>{logs.error}</AlertDescription>
        </Alert>
      ) : null}

      {/* Data Table */}
      <DataTable<AuditLog>
        data={(logs.data as AuditLog[]) ?? []}
        loading={logs.loading}
        columns={[
          {
            key: 'timestamp',
            label: 'Time',
            sortable: true,
            render: (ts) => new Date(ts).toLocaleString(),
          },
          {
            key: 'user_name',
            label: 'User',
            searchable: true,
            sortable: true,
          },
          {
            key: 'action',
            label: 'Action',
            searchable: true,
            sortable: true,
            render: (a) => a.replace('_', ' '),
          },
          {
            key: 'resource_type',
            label: 'Resource',
            sortable: true,
            render: (r) => r.charAt(0).toUpperCase() + r.slice(1),
          },
          {
            key: 'resource_name',
            label: 'Resource Name',
            searchable: true,
          },
          {
            key: 'status',
            label: 'Status',
            sortable: true,
            render: (s) =>
              s === 'success' ? (
                <span className="text-success">✓ Success</span>
              ) : (
                <span className="text-destructive">✗ Failed</span>
              ),
          },
          {
            key: 'ip_address',
            label: 'IP Address',
            render: (ip) => <span className="font-mono text-sm">{ip}</span>,
          },
        ]}
        searchableColumns={['user_name', 'resource_name', 'action']}
        rowKey="id"
        pageSize={25}
        emptyState={
          <div className="py-12 text-center text-muted-foreground">
            No audit logs found for the selected filters.
          </div>
        }
      />
    </>
  );
}
