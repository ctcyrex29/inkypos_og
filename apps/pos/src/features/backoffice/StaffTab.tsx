import { pinWeakness, type StaffMember } from '@inkypos/core';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, ErrorText, Field, Heading, Muted } from '@/ui/components';
import { fontSize, useColors } from '@/ui/theme';
import { describeApiError, styles, useLoad, type BackOfficeApi } from './shared';

const ROLE: Record<StaffMember['role'], string> = { owner: 'Owner', manager: 'Manager', cashier: 'Cashier' };

/**
 * Till sign-in PINs and who may sign in. The server keeps only a slow hash of
 * each PIN; tills receive it on their next sync and check PINs offline.
 */
export function StaffTab({ api }: { api: BackOfficeApi }) {
  const staff = useLoad(useCallback(() => api.listStaff(), [api]));
  const [editing, setEditing] = useState<string | null>(null);
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

  return (
    <Card>
      <Heading>Staff</Heading>
      <Muted>Each person signs in on the tills with their own 4–6 digit PIN. Changes reach the tills on their next sync.</Muted>
      {staff.error || error ? <ErrorText>{staff.error ?? error}</ErrorText> : null}
      {notice ? <Muted>{notice}</Muted> : null}
      {staff.data?.map((s) => (
        <StaffRow
          key={s.id}
          member={s}
          editing={editing === s.id}
          onEdit={() => {
            setEditing(s.id);
            setError(null);
            setNotice(null);
          }}
          onCancel={() => setEditing(null)}
          onSetPin={async (pin) => {
            if (await act(() => api.setStaffPin(s.id, pin), (u) => `PIN set for ${u.name}.`)) setEditing(null);
          }}
          onClearPin={() => void act(() => api.clearStaffPin(s.id), (u) => `${u.name} can no longer sign in on tills until a new PIN is set.`)}
          onToggleActive={() =>
            void act(
              () => api.setStaffActive(s.id, !s.active),
              (u) => (u.active ? `${u.name} can sign in again.` : `${u.name} is deactivated: no till sign-in and no back office for this business.`),
            )
          }
        />
      ))}
      <Muted>Adding new staff is not available yet; everyone listed here already has an account in this business.</Muted>
    </Card>
  );
}

function StaffRow({
  member: s,
  editing,
  onEdit,
  onCancel,
  onSetPin,
  onClearPin,
  onToggleActive,
}: {
  member: StaffMember;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSetPin: (pin: string) => Promise<void>;
  onClearPin: () => void;
  onToggleActive: () => void;
}) {
  const colors = useColors();
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const weakness = pin.length >= 4 ? pinWeakness(pin) : null;
  const mismatch = again.length > 0 && again !== pin;
  const digits = (text: string) => text.replace(/\D/g, '').slice(0, 6);

  const status = !s.active ? 'Deactivated' : s.has_pin ? `PIN set${s.pin_set_at ? ` ${new Date(s.pin_set_at).toLocaleDateString()}` : ''}` : 'No PIN: cannot sign in on tills';

  return (
    <View style={{ gap: 8, paddingTop: 8, borderTopWidth: 1, borderColor: colors.border }}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: '600' }}>
            {s.name} · {ROLE[s.role]}
          </Text>
          <Muted>{s.email}</Muted>
          <Text style={{ color: !s.active || !s.has_pin ? colors.warning : colors.textMuted, fontSize: fontSize.sm }}>{status}</Text>
        </View>
      </View>
      {editing ? (
        <>
          <Field label={`New PIN for ${s.name}`} value={pin} onChangeText={(t) => setPin(digits(t))} keyboardType="number-pad" secureTextEntry maxLength={6} />
          <Field label="Repeat the PIN" value={again} onChangeText={(t) => setAgain(digits(t))} keyboardType="number-pad" secureTextEntry maxLength={6} />
          {weakness ? <ErrorText>{weakness}</ErrorText> : null}
          {mismatch ? <ErrorText>The two PINs are different.</ErrorText> : null}
          <Button
            label="Save PIN"
            busy={busy}
            disabled={pin.length < 4 || weakness !== null || again !== pin}
            onPress={() => {
              setBusy(true);
              void onSetPin(pin).finally(() => setBusy(false));
            }}
          />
          <Button label="Cancel" tone="secondary" onPress={onCancel} />
        </>
      ) : (
        <View style={styles.chips}>
          {s.active ? <Button label={s.has_pin ? `Change PIN for ${s.name}` : `Set PIN for ${s.name}`} tone="secondary" onPress={onEdit} /> : null}
          {s.active && s.has_pin ? <Button label={`Remove PIN for ${s.name}`} tone="secondary" onPress={onClearPin} /> : null}
          <Button label={s.active ? `Deactivate ${s.name}` : `Reactivate ${s.name}`} tone="secondary" onPress={onToggleActive} />
        </View>
      )}
    </View>
  );
}
