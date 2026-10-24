import { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { EmptyTableState } from './empty-state';
import { cn } from '@/lib/utils';

type SortDirection = 'asc' | 'desc' | null;

interface Column<T> {
  key: keyof T;
  label: string;
  sortable?: boolean;
  searchable?: boolean;
  render?: (value: any, row: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  pageSize?: number;
  searchableColumns?: (keyof T)[];
  onRowClick?: (row: T) => void;
  rowKey: keyof T;
  emptyState?: React.ReactNode;
  loading?: boolean;
}

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  pageSize = 10,
  searchableColumns,
  onRowClick,
  rowKey,
  emptyState,
  loading = false,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<keyof T | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);

  // Filter by search query
  const filtered = useMemo(() => {
    if (!searchQuery || !searchableColumns?.length) return data;

    return data.filter((row) => {
      return searchableColumns.some((col) => {
        const value = String(row[col] ?? '').toLowerCase();
        return value.includes(searchQuery.toLowerCase());
      });
    });
  }, [data, searchQuery, searchableColumns]);

  // Sort
  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return filtered;

    return [...filtered].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];

      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  // Paginate
  const totalPages = Math.ceil(sorted.length / pageSize);
  const start = page * pageSize;
  const paged = sorted.slice(start, start + pageSize);

  const handleSort = (col: keyof T) => {
    if (!columns.find((c) => c.key === col)?.sortable) return;

    if (sortKey === col) {
      if (sortDir === 'asc') {
        setSortDir('desc');
      } else {
        setSortKey(null);
        setSortDir(null);
      }
    } else {
      setSortKey(col);
      setSortDir('asc');
    }
  };

  const hasSearch = searchableColumns && searchableColumns.length > 0;

  if (loading) {
    return (
      <div className="space-y-4">
        {hasSearch && <Input placeholder="Search…" disabled />}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((col) => (
                  <TableHead key={String(col.key)}>{col.label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: pageSize }).map((_, i) => (
                <TableRow key={i}>
                  {columns.map((col) => (
                    <TableCell key={String(col.key)} className="h-12 bg-muted/50 animate-pulse" />
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  if (!paged.length) {
    return emptyState || <EmptyTableState />;
  }

  return (
    <div className="space-y-4">
      {hasSearch && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search…"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(0);
            }}
            className="pl-10"
          />
        </div>
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead
                  key={String(col.key)}
                  className={cn(
                    'sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60',
                    col.sortable && 'cursor-pointer hover:text-foreground',
                    col.className,
                  )}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <div className="flex items-center gap-2">
                    {col.label}
                    {col.sortable && sortKey === col.key && (
                      sortDir === 'asc' ? (
                        <ChevronUp className="size-4" />
                      ) : (
                        <ChevronDown className="size-4" />
                      )
                    )}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.map((row) => (
              <TableRow
                key={String(row[rowKey])}
                onClick={() => onRowClick?.(row)}
                className={onRowClick ? 'cursor-pointer hover:bg-muted/50' : undefined}
              >
                {columns.map((col) => (
                  <TableCell key={String(col.key)} className={col.className}>
                    {col.render ? col.render(row[col.key], row) : row[col.key]}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {start + 1} to {Math.min(start + pageSize, sorted.length)} of {sorted.length}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="outline" disabled>
              {page + 1} / {totalPages}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
