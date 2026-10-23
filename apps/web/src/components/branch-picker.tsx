import { useCallback, useState } from 'react';
import { useAuth } from '@/auth/session';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLoad } from '@/lib/use-load';

/** The branch stock, deliveries and money are recorded against; a single-branch business never chooses. */
export function useBranch() {
  const { client } = useAuth();
  const branches = useLoad(useCallback(() => client.listBranches(), [client]));
  const [chosen, setChosen] = useState<string | null>(null);
  const branchId = chosen ?? branches.data?.[0]?.id ?? null;
  return { branches: branches.data ?? [], branchId, setBranchId: setChosen, loading: branches.loading };
}

export function BranchPicker({ branch }: { branch: ReturnType<typeof useBranch> }) {
  if (branch.branches.length < 2) return null;
  return (
    <Select value={branch.branchId ?? undefined} onValueChange={branch.setBranchId}>
      <SelectTrigger className="w-48" aria-label="Branch">
        <SelectValue placeholder="Branch" />
      </SelectTrigger>
      <SelectContent>
        {branch.branches.map((b) => (
          <SelectItem key={b.id} value={b.id}>
            {b.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
