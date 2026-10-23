import { pinWeakness, type StaffMember } from '@inkypos/core';
import { KeyRound, MoreHorizontal, Pencil, Plus, UserCheck, UserX, XCircle } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useAuth } from '@/auth/session';
import { PageHeader } from '@/components/app-shell';
import { FormDialog } from '@/components/form-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { describeError, formatDate } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { cn } from '@/lib/utils';

type Dialogs = { kind: 'pin'; member: StaffMember } | { kind: 'rename'; member: StaffMember } | { kind: 'add' } | null;

/**
 * Who works in the business. Managers can do everything, selling included;
 * cashiers sell. Everyone signs in on the tills with a PIN; till-only staff
 * have no email and never reach this back office.
 */
export function StaffPage() {
  const { client } = useAuth();
  const staff = useLoad(useCallback(() => client.listStaff(), [client]));
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const replace = (m: StaffMember) => staff.setData((staff.data ?? []).map((s) => (s.id === m.id ? m : s)));
  const act = async (fn: () => Promise<StaffMember>, done: (m: StaffMember) => string) => {
    setNotice(null);
    try {
      const m = await fn();
      replace(m);
      setNotice({ ok: true, text: done(m) });
    } catch (e) {
      setNotice({ ok: false, text: describeError(e) });
    }
  };

  return (
    <>
      <PageHeader
        title="Staff"
        description="Managers run the business and can also sell. Cashiers sell. Everyone signs in on the tills with their own PIN."
        actions={
          <Button onClick={() => setDialog({ kind: 'add' })}>
            <Plus /> Add staff
          </Button>
        }
      />
      {staff.error ? (
        <Alert variant="destructive">
          <AlertDescription>{staff.error}</AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <Alert variant={notice.ok ? 'success' : 'destructive'}>
          <AlertDescription>{notice.text}</AlertDescription>
        </Alert>
      ) : null}
      <Card className="py-0">
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Sign-in</TableHead>
                <TableHead>Till PIN</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.data?.map((s) => (
                <TableRow key={s.id} className={cn(!s.active && 'opacity-60')}>
                  <TableCell className="pl-4 font-medium">{s.name}</TableCell>
                  <TableCell>
                    <Badge variant={s.role === 'manager' ? 'default' : 'secondary'}>{s.role === 'manager' ? 'Manager' : 'Cashier'}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{s.till_only ? 'Till only' : s.email}</TableCell>
                  <TableCell className="text-sm">{s.has_pin ? `Set ${formatDate(s.pin_set_at).split(',')[0]}` : <span className="text-warning">Not set</span>}</TableCell>
                  <TableCell>{s.active ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Deactivated</Badge>}</TableCell>
                  <TableCell className="pr-4 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Actions for ${s.name}`}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {s.active ? (
                          <DropdownMenuItem onSelect={() => setDialog({ kind: 'pin', member: s })}>
                            <KeyRound /> {s.has_pin ? 'Change PIN' : 'Set PIN'}
                          </DropdownMenuItem>
                        ) : null}
                        {s.active && s.has_pin ? (
                          <DropdownMenuItem onSelect={() => void act(() => client.clearStaffPin(s.id), (m) => `${m.name} can no longer sign in on the tills until a new PIN is set.`)}>
                            <XCircle /> Remove PIN
                          </DropdownMenuItem>
                        ) : null}
                        {s.till_only ? (
                          <DropdownMenuItem onSelect={() => setDialog({ kind: 'rename', member: s })}>
                            <Pencil /> Rename
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem
                          variant={s.active ? 'destructive' : 'default'}
                          onSelect={() =>
                            void act(
                              () => client.setStaffActive(s.id, !s.active),
                              (m) => (m.active ? `${m.name} can sign in again.` : `${m.name} is deactivated and can no longer sign in.`),
                            )
                          }
                        >
                          {s.active ? <UserX /> : <UserCheck />} {s.active ? 'Deactivate' : 'Reactivate'}
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
      {dialog?.kind === 'pin' ? (
        <PinDialog
          member={dialog.member}
          onClose={() => setDialog(null)}
          onSave={async (pin) => {
            await act(() => client.setStaffPin(dialog.member.id, pin), (m) => `PIN set for ${m.name}. Tills pick it up on their next sync.`);
            setDialog(null);
          }}
        />
      ) : null}
      {dialog?.kind === 'rename' ? (
        <RenameDialog
          member={dialog.member}
          onClose={() => setDialog(null)}
          onSave={async (name) => {
            const m = await client.renameStaff(dialog.member.id, name);
            replace(m);
            setNotice({ ok: true, text: `Renamed to ${m.name}.` });
            setDialog(null);
          }}
        />
      ) : null}
      {dialog?.kind === 'add' ? (
        <AddDialog
          onClose={() => setDialog(null)}
          onSave={async (input) => {
            const m = await client.createTillStaff(input);
            staff.setData([...(staff.data ?? []), m].sort((a, b) => a.name.localeCompare(b.name)));
            setNotice({ ok: true, text: m.has_pin ? `${m.name} added. They can sign in on the tills after the next sync.` : `${m.name} added. Set a PIN so they can sign in.` });
            setDialog(null);
          }}
        />
      ) : null}
    </>
  );
}

/** Reads the two PIN boxes; returns the PIN or a reason it is not acceptable. */
function readPin(f: FormData, optional: boolean): { pin?: string; error?: string } {
  const pin = String(f.get('pin') ?? '').trim();
  const again = String(f.get('again') ?? '').trim();
  if (!pin && !again && optional) return {};
  const weak = pinWeakness(pin);
  if (weak) return { error: weak };
  if (pin !== again) return { error: 'The two PINs are different.' };
  return { pin };
}

function PinFields({ optional }: { optional?: boolean }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="pin">PIN{optional ? ' (optional)' : ''}</Label>
        <Input id="pin" name="pin" type="password" inputMode="numeric" maxLength={6} autoComplete="off" placeholder="4 to 6 digits" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="again">Repeat the PIN</Label>
        <Input id="again" name="again" type="password" inputMode="numeric" maxLength={6} autoComplete="off" />
      </div>
    </div>
  );
}

function PinDialog({ member, onClose, onSave }: { member: StaffMember; onClose: () => void; onSave: (pin: string) => Promise<void> }) {
  return (
    <FormDialog
      title={`${member.has_pin ? 'Change' : 'Set'} PIN for ${member.name}`}
      description="Repeated digits (1111) and runs (1234) are not allowed."
      submitLabel="Save PIN"
      onClose={onClose}
      onSubmit={async (f) => {
        const { pin, error } = readPin(f, false);
        if (error || !pin) throw new Error(error ?? 'Enter a PIN.');
        await onSave(pin);
      }}
    >
      <PinFields />
    </FormDialog>
  );
}

function RenameDialog({ member, onClose, onSave }: { member: StaffMember; onClose: () => void; onSave: (name: string) => Promise<void> }) {
  return (
    <FormDialog
      title={`Rename ${member.name}`}
      description="Only till-only staff can be renamed here; people with a login own their name."
      submitLabel="Save name"
      onClose={onClose}
      onSubmit={async (f) => {
        const name = String(f.get('name') ?? '').trim();
        if (!name) throw new Error('Enter a name.');
        await onSave(name);
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={member.name} />
      </div>
    </FormDialog>
  );
}

function AddDialog({ onClose, onSave }: { onClose: () => void; onSave: (input: { name: string; role: 'cashier' | 'manager'; pin?: string }) => Promise<void> }) {
  const [role, setRole] = useState<'cashier' | 'manager'>('cashier');
  return (
    <FormDialog
      title="Add staff"
      description="For people who work the tills. They get no email or password and never open the back office."
      submitLabel="Add"
      onClose={onClose}
      onSubmit={async (f) => {
        const name = String(f.get('name') ?? '').trim();
        if (!name) throw new Error('Enter a name.');
        const { pin, error } = readPin(f, true);
        if (error) throw new Error(error);
        await onSave({ name, role, ...(pin ? { pin } : {}) });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" placeholder="e.g. Tendai M." />
      </div>
      <div className="space-y-2">
        <Label>Role</Label>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Role">
          {(['cashier', 'manager'] as const).map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={role === r}
              onClick={() => setRole(r)}
              className={cn('rounded-lg border p-3 text-left text-sm', role === r ? 'border-primary bg-accent' : 'hover:bg-muted')}
            >
              <div className="font-medium">{r === 'cashier' ? 'Cashier' : 'Manager'}</div>
              <div className="text-xs text-muted-foreground">{r === 'cashier' ? 'Sells on the tills' : 'Sells, and opens till settings'}</div>
            </button>
          ))}
        </div>
      </div>
      <PinFields optional />
    </FormDialog>
  );
}
