import type { BusinessDetail } from '@inkypos/core';
import { ArrowLeft, Copy, KeyRound, Loader2, ShieldOff } from 'lucide-react';
import { useCallback, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '@/auth/session';
import { PageHeader, StatCard } from '@/components/app-shell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { describeError, formatDate } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { SimpleForm } from '../business/TillsPage';
import { StatusBadge, TYPE_LABEL, useCan } from './shared';

export function BusinessDetailPage() {
  const { tenantId = '' } = useParams();
  const { client } = useAuth();
  const can = useCan();
  const detail = useLoad(useCallback(() => client.platform.business(tenantId), [client, tenantId]));
  const [message, setMessage] = useState<{ ok: boolean; title?: string; text: string; secret?: string } | null>(null);
  const [suspending, setSuspending] = useState(false);
  const [revoking, setRevoking] = useState<{ id: string; name: string } | null>(null);
  const b = detail.data;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMessage(null);
    try {
      await fn();
      setMessage({ ok: true, text: ok });
      await detail.reload();
    } catch (e) {
      setMessage({ ok: false, text: describeError(e) });
    }
  };

  if (!b) {
    return detail.error ? (
      <Alert variant="destructive">
        <AlertDescription>{detail.error}</AlertDescription>
      </Alert>
    ) : (
      <p className="text-sm text-muted-foreground">Loading…</p>
    );
  }

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="-ml-2 w-fit">
        <Link to="/inkgenius/businesses">
          <ArrowLeft /> All businesses
        </Link>
      </Button>
      <PageHeader
        title={b.name}
        description={`${TYPE_LABEL[b.business_type]} · registered ${formatDate(b.created_at)}${b.activated_at ? ` · active since ${formatDate(b.activated_at)}` : ''}`}
        actions={
          can('businesses.activate') ? (
            b.status === 'active' ? (
              <Button variant="destructive" onClick={() => setSuspending(true)}>
                Suspend
              </Button>
            ) : (
              <Button onClick={() => void run(() => client.platform.activate(b.id), `${b.name} is active.`)}>Activate</Button>
            )
          ) : undefined
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={b.status} />
        {b.status_reason ? <span className="text-sm text-muted-foreground">Reason: {b.status_reason}</span> : null}
      </div>
      {message ? (
        <Alert variant={message.ok ? 'success' : 'destructive'}>
          {message.title ? <AlertTitle>{message.title}</AlertTitle> : null}
          <AlertDescription>
            {message.text}
            {message.secret ? (
              <div className="mt-2 flex items-center gap-2 font-mono text-sm text-foreground">
                {message.secret}
                <Button variant="outline" size="sm" onClick={() => void navigator.clipboard?.writeText(message.secret!)}>
                  <Copy /> Copy
                </Button>
              </div>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Staff" value={b.staff.length} hint={`${b.staff.filter((s) => s.role === 'manager').length} managers`} />
        <StatCard label="Tills" value={b.tills.filter((t) => !t.revoked_at).length} hint={`${b.branches} branch${b.branches === 1 ? '' : 'es'}`} />
        <StatCard label="Plan" value={b.subscription?.plan_name ?? '—'} hint={b.subscription ? `${b.subscription.status}, until ${formatDate(b.subscription.current_period_ends_at).split(',')[0]}` : undefined} />
      </div>

      {can('subscriptions.manage') ? <SubscriptionCard business={b} onSaved={() => void detail.reload()} /> : null}

      <Card className="py-0">
        <CardHeader className="pt-6">
          <CardTitle>Staff</CardTitle>
          <CardDescription>Managers can sign in to the back office; everyone signs in on tills with a PIN.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Till PIN</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {b.staff.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="pl-6 font-medium">{s.name}</TableCell>
                  <TableCell>{s.role === 'manager' ? 'Manager' : 'Cashier'}</TableCell>
                  <TableCell className="text-muted-foreground">{s.email ?? 'Till only'}</TableCell>
                  <TableCell>{s.has_pin ? 'Set' : 'Not set'}</TableCell>
                  <TableCell>{s.active ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Deactivated</Badge>}</TableCell>
                  <TableCell className="pr-6 text-right">
                    {can('businesses.support') && s.role === 'manager' && s.email ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          setMessage(null);
                          try {
                            const r = await client.platform.resetManagerPassword(b.id, s.id);
                            setMessage({ ok: true, title: `New temporary password for ${s.name}`, text: `Pass it on securely; their old sign-ins have been ended.`, secret: r.temporary_password });
                          } catch (e) {
                            setMessage({ ok: false, text: describeError(e) });
                          }
                        }}
                      >
                        <KeyRound /> Reset password
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="py-0">
        <CardHeader className="pt-6">
          <CardTitle>Tills</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Till</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>Set up</TableHead>
                <TableHead>Last seen</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {b.tills.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                    No tills set up yet.
                  </TableCell>
                </TableRow>
              ) : null}
              {b.tills.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="pl-6 font-medium">{t.name}</TableCell>
                  <TableCell className="capitalize">{t.platform}</TableCell>
                  <TableCell>{formatDate(t.registered_at)}</TableCell>
                  <TableCell>{formatDate(t.last_seen_at)}</TableCell>
                  <TableCell>{t.revoked_at ? <Badge variant="destructive">Switched off</Badge> : <Badge variant="success">Active</Badge>}</TableCell>
                  <TableCell className="pr-6 text-right">
                    {can('devices.manage') && !t.revoked_at ? (
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setRevoking({ id: t.id, name: t.name })}>
                        <ShieldOff /> Switch off
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {can('audit.view') ? (
        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {b.activity.length === 0 ? <p className="text-sm text-muted-foreground">Nothing recorded yet.</p> : null}
            {b.activity.map((a, i) => (
              <div key={i} className="flex justify-between gap-3 text-sm">
                <span className="font-mono text-xs">{a.action}</span>
                <span className="text-muted-foreground">
                  {a.actor_type === 'platform' ? 'Inkgenius' : a.actor_type} · {formatDate(a.created_at.replace(' ', 'T') + (a.created_at.includes('T') ? '' : 'Z'))}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {suspending ? (
        <SimpleForm
          title={`Suspend ${b.name}?`}
          description="Its managers lose back-office access and tills stop starting new sales. Sales already made still sync."
          submit="Suspend business"
          destructive
          fields={[{ name: 'reason', label: 'Reason', placeholder: 'e.g. Subscription unpaid since June' }]}
          onClose={() => setSuspending(false)}
          onSubmit={async (v) => {
            await client.platform.suspend(b.id, v.reason!);
            setSuspending(false);
            setMessage({ ok: true, text: `${b.name} is suspended.` });
            await detail.reload();
          }}
        />
      ) : null}
      {revoking ? (
        <SimpleForm
          title={`Switch off ${revoking.name}?`}
          description="The till stops syncing and selling at once. Sales it already made are kept."
          submit="Switch off till"
          destructive
          fields={[{ name: 'reason', label: 'Reason', placeholder: 'e.g. Reported stolen by the manager' }]}
          onClose={() => setRevoking(null)}
          onSubmit={async (v) => {
            await client.platform.revokeTill(b.id, revoking.id, v.reason!);
            setRevoking(null);
            setMessage({ ok: true, text: `${revoking.name} is switched off.` });
            await detail.reload();
          }}
        />
      ) : null}
    </>
  );
}

function SubscriptionCard({ business, onSaved }: { business: BusinessDetail; onSaved: () => void }) {
  const { client } = useAuth();
  const plans = useLoad(useCallback(() => client.platform.plans(), [client]));
  const s = business.subscription;
  const [plan, setPlan] = useState(s?.plan ?? 'starter');
  const [status, setStatus] = useState(s?.status ?? 'active');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const until = String(new FormData(e.currentTarget).get('until') ?? '');
    setBusy(true);
    setMessage(null);
    try {
      const changedUntil = until && until !== s?.current_period_ends_at?.slice(0, 10);
      await client.platform.updateSubscription(business.id, { plan, status: status as never, ...(changedUntil ? { current_period_ends_at: until } : {}) });
      setMessage({ ok: true, text: 'Subscription saved.' });
      onSaved();
    } catch (err) {
      setMessage({ ok: false, text: describeError(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Subscription</CardTitle>
        <CardDescription>Accounts Department: plan, status and paid-until date.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-4 sm:items-end">
          <div className="space-y-2">
            <Label>Plan</Label>
            <Select value={plan} onValueChange={setPlan}>
              <SelectTrigger aria-label="Plan">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(plans.data ?? []).map((p) => (
                  <SelectItem key={p.code} value={p.code}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger aria-label="Subscription status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="trialing">Trial</SelectItem>
                <SelectItem value="active">Paid up</SelectItem>
                <SelectItem value="past_due">Payment overdue</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="canceled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="until">Paid until</Label>
            <Input id="until" name="until" type="date" defaultValue={s?.current_period_ends_at?.slice(0, 10)} />
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : null} Save subscription
          </Button>
          {message ? (
            <Alert variant={message.ok ? 'success' : 'destructive'} className="sm:col-span-4">
              <AlertDescription>{message.text}</AlertDescription>
            </Alert>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
