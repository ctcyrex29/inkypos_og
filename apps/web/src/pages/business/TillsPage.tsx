import type { Device } from '@inkypos/core';
import { Loader2, MonitorSmartphone, Plus, ShieldOff } from 'lucide-react';
import { useCallback, useState, type FormEvent } from 'react';
import { useAuth } from '@/auth/session';
import { PageHeader } from '@/components/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { describeError, formatDate } from '@/lib/api';
import { useLoad } from '@/lib/use-load';

/**
 * Registers (checkout points) and the tills set up on them. A till is set up
 * on the device itself (InkyPOS app → a manager signs in once and picks a
 * register); here managers add registers and switch off lost or stolen tills.
 */
export function TillsPage() {
  const { client } = useAuth();
  const data = useLoad(
    useCallback(async () => {
      const [branches, registers, devices] = await Promise.all([client.listBranches(), client.listRegisters(), client.listDevices()]);
      return { branches, registers, devices };
    }, [client]),
  );
  const [adding, setAdding] = useState(false);
  const [revoking, setRevoking] = useState<Device | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const registerName = (id: string) => data.data?.registers.find((r) => r.id === id)?.name ?? 'Unknown register';

  return (
    <>
      <PageHeader
        title="Tills"
        description="Add a register for each checkout point, then set up a phone, tablet or computer on it with the InkyPOS app."
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus /> Add register
          </Button>
        }
      />
      {data.error ? (
        <Alert variant="destructive">
          <AlertDescription>{data.error}</AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <Alert variant={notice.ok ? 'success' : 'destructive'}>
          <AlertDescription>{notice.text}</AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Registers</CardTitle>
          <CardDescription>Each register can have one till at a time.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.data?.registers.length === 0 ? <p className="text-sm text-muted-foreground">No registers yet. Add one to set up your first till.</p> : null}
          {data.data?.registers.map((r) => (
            <div key={r.id} className="flex items-center gap-3 rounded-lg border p-3">
              <MonitorSmartphone className="size-5 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{r.name}</div>
                <div className="text-xs text-muted-foreground">
                  {r.code} · {data.data?.branches.find((b) => b.id === r.branch_id)?.name}
                </div>
              </div>
              {r.active_device_id ? <Badge variant="success">Till set up</Badge> : <Badge variant="outline">Free</Badge>}
            </div>
          ))}
        </CardContent>
      </Card>
      <Card className="py-0">
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Till</TableHead>
                <TableHead>Register</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>Last seen</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data?.devices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No tills yet. Open the InkyPOS app on a device and sign in as a manager to set it up.
                  </TableCell>
                </TableRow>
              ) : null}
              {data.data?.devices.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="pl-4 font-medium">{d.name}</TableCell>
                  <TableCell>{registerName(d.register_id)}</TableCell>
                  <TableCell className="capitalize">{d.platform}</TableCell>
                  <TableCell>{formatDate(d.last_seen_at)}</TableCell>
                  <TableCell>{d.revoked_at ? <Badge variant="destructive">Switched off</Badge> : <Badge variant="success">Active</Badge>}</TableCell>
                  <TableCell className="pr-4 text-right">
                    {!d.revoked_at ? (
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setRevoking(d)}>
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

      {adding ? (
        <SimpleForm
          title="Add a register"
          description="A checkout point, e.g. Front counter. You then set up a till on it from the InkyPOS app."
          submit="Add register"
          fields={[
            { name: 'name', label: 'Name', placeholder: 'Front counter' },
            { name: 'code', label: 'Short code', placeholder: 'T1', hint: 'Letters, numbers and dashes; shown on receipts.' },
          ]}
          onClose={() => setAdding(false)}
          onSubmit={async (v) => {
            let branch = data.data?.branches[0];
            branch ??= await client.createBranch({ name: 'Main', code: 'MAIN' });
            await client.createRegister(branch.id, { name: v.name!, code: v.code! });
            setAdding(false);
            setNotice({ ok: true, text: `Register ${v.name} added.` });
            await data.reload();
          }}
        />
      ) : null}
      {revoking ? (
        <SimpleForm
          title={`Switch off ${revoking.name}?`}
          description="Use this for a lost, stolen or replaced device. It stops syncing and selling at once; sales it already made are kept."
          submit="Switch off till"
          destructive
          fields={[{ name: 'reason', label: 'Reason', placeholder: 'e.g. Phone stolen' }]}
          onClose={() => setRevoking(null)}
          onSubmit={async (v) => {
            await client.revokeDevice(revoking.id, v.reason);
            setRevoking(null);
            setNotice({ ok: true, text: `${revoking.name} is switched off.` });
            await data.reload();
          }}
        />
      ) : null}
    </>
  );
}

interface FieldSpec {
  name: string;
  label: string;
  placeholder?: string;
  hint?: string;
}

/** A small dialog form whose fields are all required text. */
export function SimpleForm({
  title,
  description,
  submit,
  fields,
  destructive,
  onClose,
  onSubmit,
}: {
  title: string;
  description: string;
  submit: string;
  fields: FieldSpec[];
  destructive?: boolean;
  onClose: () => void;
  onSubmit: (values: Record<string, string>) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const values = Object.fromEntries(fields.map((x) => [x.name, String(f.get(x.name) ?? '').trim()]));
    const missing = fields.find((x) => !values[x.name]);
    if (missing) return setError(`Fill in ${missing.label.toLowerCase()}.`);
    setBusy(true);
    setError(null);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={send} className="space-y-4" noValidate>
          {fields.map((x) => (
            <div key={x.name} className="space-y-2">
              <Label htmlFor={x.name}>{x.label}</Label>
              <Input id={x.name} name={x.name} placeholder={x.placeholder} />
              {x.hint ? <p className="text-xs text-muted-foreground">{x.hint}</p> : null}
            </div>
          ))}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant={destructive ? 'destructive' : 'default'} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null} {submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
