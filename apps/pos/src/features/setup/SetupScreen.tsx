import { ApiError, type Register } from '@inkypos/core';
import { useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { DeviceSession, ManagerSession } from '@/services/device-session';
import { Button, Card, ErrorText, Field, fieldValue, Heading, Muted, type FieldRef } from '@/ui/components';
import { fontSize, radius, spacing, useColors } from '@/ui/theme';

type Step =
  | { kind: 'signin' }
  | { kind: 'choose'; manager: ManagerSession; tenantId: string; registers: Register[] };

export function describeError(e: unknown): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case 'unauthenticated':
        return 'Email or password is incorrect.';
      case 'conflict':
        return 'That register already has a till. Revoke the old device first.';
      case 'subscription_inactive':
        return 'The subscription for this business is not active.';
      case 'forbidden':
        return 'Only a manager can set up a till.';
      case 'business_pending':
        return 'This business is waiting for Inkgenius Technologies to activate it. You can set up tills once it is active.';
      case 'rate_limited':
        return 'Too many attempts. Wait a minute and try again.';
      case 'network_error':
      case 'timeout':
        return 'Cannot reach the InkyPOS server. Check the connection.';
    }
    return e.message;
  }
  return e instanceof Error ? e.message : 'Something went wrong.';
}

const platform = (Platform.OS === 'android' || Platform.OS === 'ios' || Platform.OS === 'web' ? Platform.OS : 'web') as
  | 'android'
  | 'ios'
  | 'web';

/** A manager signs in once on the till to bind it to a register. */
export function SetupScreen({ session, onEnrolled }: { session: DeviceSession; onEnrolled: () => void }) {
  const colors = useColors();
  const [step, setStep] = useState<Step>({ kind: 'signin' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [deviceName, setDeviceName] = useState(`Till (${platform})`);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function attempt(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  const loadRegisters = (manager: ManagerSession, tenantId: string) =>
    attempt(async () => {
      const registers = await session.listRegisters(manager, tenantId);
      setSelected(registers.find((r) => !r.active_device_id)?.id ?? null);
      setStep({ kind: 'choose', manager, tenantId, registers });
    });

  const emailRef = useRef<FieldRef>(null);
  const passwordRef = useRef<FieldRef>(null);

  const signIn = () =>
    attempt(async () => {
      const typedEmail = fieldValue(emailRef, email).trim();
      const typedPassword = fieldValue(passwordRef, password);
      if (!typedEmail || !typedPassword) throw new Error('Enter the manager’s email and password.');
      const manager = await session.signInManager(typedEmail, typedPassword, deviceName.trim() || 'Till');
      setPassword('');
      const first = manager.tenants[0];
      if (!first) throw new Error('Only a manager can set up a till.');
      await loadRegisters(manager, first.id);
    });

  const enroll = (current: Extract<Step, { kind: 'choose' }>) =>
    attempt(async () => {
      if (!selected) throw new Error('Choose a register.');
      await session.enroll(current.manager, {
        tenantId: current.tenantId,
        registerId: selected,
        name: deviceName.trim() || 'Till',
        platform,
      });
      onEnrolled();
    });

  return (
    <ScrollView keyboardShouldPersistTaps="handled" style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container}>
      <Text style={[styles.title, { color: colors.text }]}>Set up this till</Text>
      <Muted>A manager signs in once to connect this device to a register. Their sign-in is not kept on the till.</Muted>

      {step.kind === 'signin' ? (
        <Card>
          <Heading>Manager sign-in</Heading>
          <Field ref={emailRef} label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" inputMode="email" />
          <Field ref={passwordRef} label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" onSubmitEditing={() => void signIn()} />
          <Field label="Name for this till" value={deviceName} onChangeText={setDeviceName} />
          {error ? <ErrorText>{error}</ErrorText> : null}
          <Button label="Continue" onPress={() => void signIn()} busy={busy} />
        </Card>
      ) : (
        <Card>
          {step.manager.tenants.length > 1 ? (
            <View style={styles.list}>
              <Heading>Business</Heading>
              {step.manager.tenants.map((t) => (
                <Option key={t.id} label={t.name} selected={t.id === step.tenantId} onPress={() => void loadRegisters(step.manager, t.id)} />
              ))}
            </View>
          ) : null}
          <Heading>Register</Heading>
          {step.registers.length === 0 ? <Muted>This business has no registers yet. Create one in the back office.</Muted> : null}
          <View style={styles.list}>
            {step.registers.map((r) => (
              <Option
                key={r.id}
                label={`${r.name} · ${r.code}`}
                detail={r.active_device_id ? 'Already has a till' : undefined}
                disabled={r.active_device_id !== null}
                selected={r.id === selected}
                onPress={() => setSelected(r.id)}
              />
            ))}
          </View>
          {error ? <ErrorText>{error}</ErrorText> : null}
          <Button label="Register this till" onPress={() => void enroll(step)} busy={busy} disabled={!selected} />
          <Button label="Back" tone="secondary" onPress={() => setStep({ kind: 'signin' })} disabled={busy} />
        </Card>
      )}
    </ScrollView>
  );
}

function Option({
  label,
  detail,
  selected,
  disabled = false,
  onPress,
}: {
  label: string;
  detail?: string | undefined;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.option,
        { borderColor: selected ? colors.primary : colors.border, opacity: disabled ? 0.5 : 1 },
      ]}
    >
      <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: selected ? '600' : '400' }}>{label}</Text>
      {detail ? <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>{detail}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.xl, gap: spacing.lg, maxWidth: 520, width: '100%', alignSelf: 'center' },
  title: { fontSize: fontSize.xl, fontWeight: '700' },
  list: { gap: spacing.sm },
  option: { borderWidth: 1.5, borderRadius: radius.md, padding: spacing.md, gap: 2 },
});
