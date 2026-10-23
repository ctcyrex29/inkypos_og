import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Shown while a page's code downloads (pages are split into their own files). */
export function PageLoading({ fullScreen }: { fullScreen?: boolean }) {
  return (
    <div className={cn('flex items-center justify-center text-muted-foreground', fullScreen ? 'min-h-svh' : 'min-h-64')} role="status" aria-label="Loading">
      <Loader2 className="size-6 animate-spin" />
    </div>
  );
}
