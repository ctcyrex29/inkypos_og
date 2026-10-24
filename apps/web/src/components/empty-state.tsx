import type { LucideIcon } from 'lucide-react';
import { Button } from './ui/button';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className || ''}`}>
      {Icon && <Icon className="size-12 text-muted-foreground mb-4" />}
      <h3 className="text-lg font-semibold mb-1">{title}</h3>
      {description && <p className="text-sm text-muted-foreground mb-6 max-w-sm">{description}</p>}
      {action && (
        <Button onClick={action.onClick} variant="outline">
          {action.label}
        </Button>
      )}
    </div>
  );
}

/** Pre-built empty states for common scenarios */

import { Plus, Search, Inbox, AlertCircle } from 'lucide-react';

export function EmptyTableState({ onAdd }: { onAdd?: () => void }) {
  return (
    <EmptyState
      icon={Inbox}
      title="No items yet"
      description="Get started by adding your first item"
      action={onAdd ? { label: 'Add item', onClick: onAdd } : undefined}
      className="border rounded-lg bg-card/50"
    />
  );
}

export function EmptySearchState({ query }: { query: string }) {
  return (
    <EmptyState
      icon={Search}
      title="No results found"
      description={`No items match "${query}". Try adjusting your search.`}
      className="border rounded-lg bg-card/50"
    />
  );
}

export function EmptyListState({ title = 'No items', onAdd }: { title?: string; onAdd?: () => void }) {
  return (
    <EmptyState
      icon={Plus}
      title={title}
      action={onAdd ? { label: 'Create new', onClick: onAdd } : undefined}
      className="border rounded-lg bg-card/50"
    />
  );
}

export function ErrorState({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <EmptyState
      icon={AlertCircle}
      title="Something went wrong"
      description={error}
      action={onRetry ? { label: 'Try again', onClick: onRetry } : undefined}
      className="border border-destructive/50 rounded-lg bg-destructive/5"
    />
  );
}
