import { Building2, CheckCircle2, Clock, PauseCircle } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, usePlatformSession } from '@/auth/session';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { describeError, formatDate } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { TYPE_LABEL, useCan } from './shared';

/** Inkgenius at a glance, with the queue of businesses waiting for activation. */
export function OverviewPage() {
  const { client } = useAuth();
  const { user } = usePlatformSession();
  const can = useCan();
  const all = useLoad(useCallback(() => client.platform.businesses(), [client]));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const count = (s: string) => all.data?.filter((b) => b.status === s).length ?? 0;
  const pending = all.data?.filter((b) => b.status === 'pending') ?? [];

  return (
    <>
      <PageHeader title={`Welcome, ${user.name.split(' ')[0]}`} description={`Signed in as ${user.role_label}`} />
      {all.error ? (
        <Alert variant="destructive">
          <AlertDescription>{all.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Businesses" value={all.data?.length ?? '…'} icon={Building2} />
        <StatCard label="Active" value={count('active')} icon={CheckCircle2} />
        <StatCard label="Waiting for activation" value={count('pending')} icon={Clock} />
        <StatCard label="Suspended" value={count('suspended')} icon={PauseCircle} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Waiting for activation</CardTitle>
          <CardDescription>Businesses that registered themselves. Check their details, then activate them.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {message ? (
            <Alert variant={message.ok ? 'success' : 'destructive'}>
              <AlertDescription>{message.text}</AlertDescription>
            </Alert>
          ) : null}
          {pending.length === 0 ? <p className="text-sm text-muted-foreground">Nobody is waiting. 🎉</p> : null}
          {pending.map((b) => (
            <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <Link to={`/inkgenius/businesses/${b.id}`} className="font-medium hover:underline">
                  {b.name}
                </Link>
                <div className="text-xs text-muted-foreground">
                  {TYPE_LABEL[b.business_type]} · registered {formatDate(b.created_at)}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/inkgenius/businesses/${b.id}`}>Details</Link>
                </Button>
                {can('businesses.activate') ? (
                  <Button
                    size="sm"
                    onClick={async () => {
                      setMessage(null);
                      try {
                        const updated = await client.platform.activate(b.id);
                        all.setData((all.data ?? []).map((x) => (x.id === b.id ? { ...x, ...updated } : x)));
                        setMessage({ ok: true, text: `${b.name} is active. Its manager can sign in now.` });
                      } catch (e) {
                        setMessage({ ok: false, text: describeError(e) });
                      }
                    }}
                  >
                    Activate
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
          {!can('businesses.activate') && pending.length > 0 ? (
            <p className="text-xs text-muted-foreground">Activation is done by Administrators and the Accounts Department.</p>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}
