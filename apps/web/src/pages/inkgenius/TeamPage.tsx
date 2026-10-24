import { PLATFORM_ROLE_LABEL, type PlatformRole, type PlatformUser } from '@inkypos/core';
import { Copy, KeyRound, Loader2, MoreHorizontal, Plus, Smartphone, UserCheck, UserX } from 'lucide-react';
import { useCallback, useState, type FormEvent } from 'react';
import { useAuth, usePlatformSession } from '@/auth/session';
import { PageHeader } from '@/components/app-shell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { describeError, formatDate } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { cn } from '@/lib/utils';

const ROLES = Object.keys(PLATFORM_ROLE_LABEL) as PlatformRole[];

const ROLE_DUTIES: Record<PlatformRole, string> = {
  administrator: 'Everything, including Inkgenius staff accounts',
  support: 'Helps businesses: views them, resets manager passwords',
  technician: 'Tills: views businesses and switches off lost or stolen tills',
  accounts: 'Activates businesses and manages plans and payments',
};

/** Inkgenius Technologies staff accounts (administrators only). */
export function TeamPage() {
  const { client } = useAuth();
  const { user: me } = usePlatformSession();
  const users = useLoad(useCallback(() => client.platform.users(), [client]));
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; title?: string; text: string; secret?: string } | null>(null);

  const replace = (u: PlatformUser) => users.setData((users.data ?? []).map((x) => (x.id === u.id ? u : x)));
  const act = async (fn: () => Promise<PlatformUser>, ok: string) => {
    setMessage(null);
    try {
      replace(await fn());
      setMessage({ ok: true, text: ok });
    } catch (e) {
      setMessage({ ok: false, text: describeError(e) });
    }
  };

  return (
    <>
      <PageHeader
        title="Inkgenius team"
        description="Staff accounts for the platform portal."
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus /> Add staff member
          </Button>
        }
      />
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ROLES.map((r) => (
          <Card key={r} className="gap-2 py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-sm">{PLATFORM_ROLE_LABEL[r]}</CardTitle>
              <CardDescription className="text-xs">{ROLE_DUTIES[r]}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
      <Card className="py-0">
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Last sign-in</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.data?.map((u) => (
                <TableRow key={u.id} className={cn(!u.active && 'opacity-60')}>
                  <TableCell className="pl-4 font-medium">
                    {u.name} {u.id === me.id ? <span className="text-xs text-muted-foreground">(you)</span> : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>{u.role_label}</TableCell>
                  <TableCell>{formatDate(u.last_login_at)}</TableCell>
                  <TableCell className="space-x-1">
                    {u.active ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Deactivated</Badge>}
                    {u.active && !u.two_factor_enabled ? <Badge variant="outline">No authenticator yet</Badge> : null}
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Actions for ${u.name}`}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Change role</DropdownMenuLabel>
                        {ROLES.filter((r) => r !== u.role).map((r) => (
                          <DropdownMenuItem key={r} onSelect={() => void act(() => client.platform.updateUser(u.id, { role: r }), `${u.name} is now ${PLATFORM_ROLE_LABEL[r]}.`)}>
                            {PLATFORM_ROLE_LABEL[r]}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={async () => {
                            setMessage(null);
                            try {
                              const r = await client.platform.resetUserPassword(u.id);
                              setMessage({ ok: true, title: `New temporary password for ${u.name}`, text: 'Pass it on securely; their sessions have been ended.', secret: r.temporary_password });
                            } catch (e) {
                              setMessage({ ok: false, text: describeError(e) });
                            }
                          }}
                        >
                          <KeyRound /> Reset password
                        </DropdownMenuItem>
                        {u.two_factor_enabled ? (
                          <DropdownMenuItem
                            onSelect={() =>
                              void act(() => client.platform.resetUserTwoFactor(u.id), `${u.name} sets up a new authenticator at their next sign-in; their sessions have been ended.`)
                            }
                          >
                            <Smartphone /> Reset authenticator (lost phone)
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem
                          variant={u.active ? 'destructive' : 'default'}
                          onSelect={() => void act(() => client.platform.updateUser(u.id, { active: !u.active }), u.active ? `${u.name} is deactivated.` : `${u.name} can sign in again.`)}
                        >
                          {u.active ? <UserX /> : <UserCheck />} {u.active ? 'Deactivate' : 'Reactivate'}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {adding ? (
        <AddStaffDialog
          onClose={() => setAdding(false)}
          onCreated={(u, password) => {
            setAdding(false);
            users.setData([...(users.data ?? []), u].sort((a, b) => a.name.localeCompare(b.name)));
            setMessage({ ok: true, title: `${u.name} added as ${u.role_label}`, text: `Their sign-in is ${u.email} with this temporary password:`, secret: password });
          }}
        />
      ) : null}
    </>
  );
}

function AddStaffDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (u: PlatformUser, password: string) => void }) {
  const { client } = useAuth();
  const [role, setRole] = useState<PlatformRole>('support');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get('name') ?? '').trim();
    const email = String(f.get('email') ?? '').trim();
    if (!name || !email) return setError('Enter a name and an email.');
    setBusy(true);
    setError(null);
    try {
      const r = await client.platform.createUser({ name, email, role });
      onCreated(r.user, r.temporary_password);
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
          <DialogTitle>Add Inkgenius staff member</DialogTitle>
          <DialogDescription>They get a temporary password, shown once.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Work email</Label>
            <Input id="email" name="email" type="email" />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as PlatformRole)}>
              <SelectTrigger aria-label="Role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {PLATFORM_ROLE_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{ROLE_DUTIES[role]}</p>
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null} Add
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
