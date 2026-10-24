import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Button } from './ui/button';

interface Breadcrumb {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: Breadcrumb[];
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
    variant?: 'default' | 'outline' | 'destructive' | 'secondary' | 'ghost';
  };
  secondary?: ReactNode;
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  action,
  secondary,
}: PageHeaderProps) {
  return (
    <div className="space-y-4 border-b pb-4 mb-6">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          {breadcrumbs.map((bc, i) => (
            <div key={i} className="flex items-center gap-1">
              {bc.href ? (
                <Link to={bc.href} className="hover:text-foreground">
                  {bc.label}
                </Link>
              ) : (
                <span>{bc.label}</span>
              )}
              {i < breadcrumbs.length - 1 && <ChevronRight className="size-4" />}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
          {description && <p className="text-muted-foreground mt-1">{description}</p>}
        </div>

        {(action || secondary) && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {secondary && <div className="text-sm">{secondary}</div>}
            {action && (
              <Button
                variant={action.variant || 'default'}
                onClick={action.onClick}
                asChild={!!action.href}
              >
                {action.href ? <Link to={action.href}>{action.label}</Link> : action.label}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Variant for section headings within a page */

interface SectionHeaderProps {
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: 'default' | 'outline' | 'destructive' | 'secondary' | 'ghost';
  };
}

export function SectionHeader({ title, description, action }: SectionHeaderProps) {
  return (
    <div className="space-y-4 mb-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
          {description && <p className="text-muted-foreground text-sm mt-1">{description}</p>}
        </div>
        {action && (
          <Button variant={action.variant || 'default'} onClick={action.onClick} size="sm">
            {action.label}
          </Button>
        )}
      </div>
    </div>
  );
}
