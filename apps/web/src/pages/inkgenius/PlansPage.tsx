import { Check } from 'lucide-react';
import { useCallback } from 'react';
import { useAuth } from '@/auth/session';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useLoad } from '@/lib/use-load';

const LIMIT_LABEL: Record<string, string> = { max_branches: 'branches', max_registers: 'tills (registers)' };

/** The subscription plans businesses can be on. Change a business's plan from its page. */
export function PlansPage() {
  const { client } = useAuth();
  const plans = useLoad(useCallback(() => client.platform.plans(), [client]));
  return (
    <>
      <PageHeader title="Plans" description="What each subscription allows. Plans are set per business by the Accounts Department." />
      {plans.error ? (
        <Alert variant="destructive">
          <AlertDescription>{plans.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {plans.data?.map((p) => (
          <Card key={p.code}>
            <CardHeader>
              <CardTitle>{p.name}</CardTitle>
              <CardDescription className="font-mono text-xs">{p.code}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {Object.entries(p.limits).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2">
                  <Check className="size-4 text-success" /> Up to {v} {LIMIT_LABEL[k] ?? k.replace(/_/g, ' ')}
                </div>
              ))}
              {Array.isArray(p.features)
                ? (p.features as string[]).map((f) => (
                    <div key={f} className="flex items-center gap-2">
                      <Check className="size-4 text-success" /> {f.replace(/_/g, ' ')}
                    </div>
                  ))
                : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
