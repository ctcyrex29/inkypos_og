import { pinWeakness, type StaffMember } from '@inkypos/core';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, ErrorText, Field, Heading, Muted } from '@/ui/components';
import { fontSize, useColors } from '@/ui/theme';
import { Chip, describeApiError, styles, useLoad, type BackOfficeApi } from './shared';

const ROLE: Record<StaffMember['role'], string> = { manager: 'Manager', cashier: 'Cashier' };

const digits = (text: string) => text.replace(/\D/g, '').slice(0, 6);

/** A PIN typed twice; `pin` is the value to send, or null while it is not acceptable. */
function usePinEntry(optional: boolean) {
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const weakness = pin.length >= 4 ? pinWeakness(pin) : null;
  const mismatch = again.length > 0 && again !== pin;
  const ok = (pin === '' && again === '' && optional) || (pin.length >= 4 && weakness === null && again === pin);
  return { pin, setPin, again, setAgain, weakness, mismatch, ok, reset: () => (setPin(''), setAgain('')) };
}

function PinFields({ entry, label }: { entry: ReturnType<typeof usePinEntry>; label: string }) {
  return (
    <>
      <Field label={label} value={entry.pin} onChangeText={(t) => entry.setPin(digits(t))} keyboardType="number-pad" secureTextEntry maxLength={6} />
      <Field label="Repeat the PIN" value={entry.again} onChangeText={(t) => entry.setAgain(digits(t))} keyboardType="number-pad" secureTextEntry maxLength={6} />
      {entry.weakness ? <ErrorText>{entry.weakness}</ErrorText> : null}
      {entry.mismatch ? <ErrorText>The two PINs are different.</ErrorText> : null}
    </>
  );
}

/**
 * Who may sign in on the tills, and their PINs. The server keeps only a slow
 * hash of each PIN; tills receive it on their next sync and check PINs offline.
 * Till-only staff have no email or password, so they never reach the back office.
 */
export function StaffTab({ api }: { api: BackOfficeApi }) {
  const staff = useLoad(useCallback(() => api.listStaff(), [api]));
  const [editing, setEditing] = useState<{ id: string; what: 'pin' | 'name' } | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const replace = (updated: StaffMember) => staff.setData((staff.data ?? []).map((s) => (s.id === updated.id ? updated : s)));

  const act = async (fn: () => Promise<StaffMember>, done: (s: StaffMember) => string) => {
    setError(null);
    setNotice(null);
    try {
      const updated = await fn();
      replace(updated);
      setNotice(done(updated));
      return true;
    } catch (e) {
      setError(describeApiError(e));
      return false;
    }
  };

  const start = (next: typeof editing) => {
    setEditing(next);
    setAdding(false);
    setError(null);
    setNotice(null);
  };

  return (
    <>
      <Card>
        <Heading>Staff</Heading>
        <Muted>Each person signs in on the tills with their own 4–6 digit PIN. Changes reach the tills on their next sync.</Muted>
        {staff.error || error ? <ErrorText>{staff.error ?? error}</ErrorText> : null}
        {notice ? <Muted>{notice}</Muted> : null}
        {staff.data?.map((s) => (
          <StaffRow
            key={s.id}
            member={s}
            editing={editing?.id === s.id ? editing.what : null}
            onEdit={(what) => start({ id: s.id, what })}
            onCancel={() => setEditing(null)}
            onSetPin={async (pin) => {
              if (await act(() => api.setStaffPin(s.id, pin), (u) => `PIN set for ${u.name}.`)) setEditing(null);
            }}
            onRename={async (name) => {
              if (await act(() => api.renameStaff(s.id, name), (u) => `Renamed to ${u.name}.`)) setEditing(null);
            }}
            onClearPin={() => void act(() => api.clearStaffPin(s.id), (u) => `${u.name} can no longer sign in on tills until a new PIN is set.`)}
            onToggleActive={() =>
              void act(
                () => api.setStaffActive(s.id, !s.active),
                (u) => (u.active ? `${u.name} can sign in again.` : `${u.name} is deactivated and can no longer sign in.`),
              )
            }
          />
        ))}
        {!adding ? <Button label="Add till-only staff" onPress={() => (start(null), setAdding(true))} /> : null}
      </Card>
      {adding ? (
        <AddTillStaff
          onCancel={() => setAdding(false)}
          onAdd={async (input) => {
            setError(null);
            try {
              const created = await api.createTillStaff(input);
              staff.setData([...(staff.data ?? []), created].sort((a, b) => a.name.localeCompare(b.name)));
              setNotice(created.has_pin ? `${created.name} added. They can sign in on the tills after the next sync.` : `${created.name} added. Set a PIN so they can sign in.`);
              setAdding(false);
              return null;
            } catch (e) {
              return describeApiError(e);
            }
          }}
        />
      ) : null}
    </>
  );
}

function AddTillStaff({ onAdd, onCancel }: { onAdd: (input: { name: string; role: 'cashier' | 'manager'; pin?: string }) => Promise<string | null>; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState<'cashier' | 'manager'>('cashier');
  const entry = usePinEntry(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const problem = await onAdd({ name: name.trim(), role, ...(entry.pin ? { pin: entry.pin } : {}) });
    setBusy(false);
    if (problem) setError(problem);
  };

  return (
    <Card>
      <Heading>Add till-only staff</Heading>
      <Muted>For people who only use the tills. They get no email or password and can never open the back office.</Muted>
      <Field label="Name" value={name} onChangeText={setName} autoCapitalize="words" placeholder="e.g. Tendai M." />
      <View style={styles.chips}>
        <Chip label="Cashier" selected={role === 'cashier'} onPress={() => setRole('cashier')} />
        <Chip label="Manager (on tills)" selected={role === 'manager'} onPress={() => setRole('manager')} />
      </View>
      {role === 'manager' ? <Muted>Till managers can open printer settings and diagnostics. Only an owner can add one.</Muted> : null}
      <PinFields entry={entry} label="PIN (optional, can be set later)" />
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button label="Add" busy={busy} disabled={name.trim() === '' || !entry.ok} onPress={() => void submit()} />
      <Button label="Cancel" tone="secondary" onPress={onCancel} />
    </Card>
  );
}

function StaffRow({
  member: s,
  editing,
  onEdit,
  onCancel,
  onSetPin,
  onRename,
  onClearPin,
  onToggleActive,
}: {
  member: StaffMember;
  editing: 'pin' | 'name' | null;
  onEdit: (what: 'pin' | 'name') => void;
  onCancel: () => void;
  onSetPin: (pin: string) => Promise<void>;
  onRename: (name: string) => Promise<void>;
  onClearPin: () => void;
  onToggleActive: () => void;
}) {
  const colors = useColors();
  const entry = usePinEntry(false);
  const [newName, setNewName] = useState(s.name);
  const [busy, setBusy] = useState(false);
  const run = (fn: () => Promise<void>) => {
    setBusy(true);
    void fn().finally(() => setBusy(false));
  };

  const status = !s.active ? 'Deactivated' : s.has_pin ? `PIN set${s.pin_set_at ? ` ${new Date(s.pin_set_at).toLocaleDateString()}` : ''}` : 'No PIN: cannot sign in on tills';

  return (
    <View style={{ gap: 8, paddingTop: 8, borderTopWidth: 1, borderColor: colors.border }}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: '600' }}>
            {s.name} · {ROLE[s.role]}
          </Text>
          <Muted>{s.till_only ? 'Till only (no back-office login)' : (s.email ?? '')}</Muted>
          <Text style={{ color: !s.active || !s.has_pin ? colors.warning : colors.textMuted, fontSize: fontSize.sm }}>{status}</Text>
        </View>
      </View>
      {editing === 'pin' ? (
        <>
          <PinFields entry={entry} label={`New PIN for ${s.name}`} />
          <Button label="Save PIN" busy={busy} disabled={!entry.ok} onPress={() => run(() => onSetPin(entry.pin))} />
          <Button label="Cancel" tone="secondary" onPress={onCancel} />
        </>
      ) : editing === 'name' ? (
        <>
          <Field label={`New name for ${s.name}`} value={newName} onChangeText={setNewName} autoCapitalize="words" />
          <Button label="Save name" busy={busy} disabled={newName.trim() === '' || newName.trim() === s.name} onPress={() => run(() => onRename(newName.trim()))} />
          <Button label="Cancel" tone="secondary" onPress={onCancel} />
        </>
      ) : (
        <View style={styles.chips}>
          {s.active ? <Button label={s.has_pin ? `Change PIN for ${s.name}` : `Set PIN for ${s.name}`} tone="secondary" onPress={() => onEdit('pin')} /> : null}
          {s.active && s.has_pin ? <Button label={`Remove PIN for ${s.name}`} tone="secondary" onPress={onClearPin} /> : null}
          {s.till_only ? <Button label={`Rename ${s.name}`} tone="secondary" onPress={() => onEdit('name')} /> : null}
          <Button label={s.active ? `Deactivate ${s.name}` : `Reactivate ${s.name}`} tone="secondary" onPress={onToggleActive} />
        </View>
      )}
    </View>
  );
}
