import type { BusinessSummary, PlatformPermission } from '@inkypos/core';
import { usePlatformSession } from '@/auth/session';
import { Badge } from '@/components/ui/badge';

export function useCan(): (permission: PlatformPermission) => boolean {
  const { user } = usePlatformSession();
  return (permission) => user.permissions.includes(permission);
}

export const TYPE_LABEL: Record<BusinessSummary['business_type'], string> = { retail: 'Shop', restaurant: 'Restaurant', both: 'Shop & restaurant' };

export function StatusBadge({ status }: { status: BusinessSummary['status'] }) {
  if (status === 'active') return <Badge variant="success">Active</Badge>;
  if (status === 'pending') return <Badge variant="warning">Waiting for activation</Badge>;
  return <Badge variant="destructive">Suspended</Badge>;
}
