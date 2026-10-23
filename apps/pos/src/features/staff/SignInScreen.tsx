import type { SignInResult, StaffInfo } from '@inkypos/core';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Banner, Button, Card, ErrorText, Field, Heading, Muted } from '@/ui/components';
import { spacing } from '@/ui/theme';

interface Props {
  /** Active staff on this till; null while loading. */
  staff: StaffInfo[] | null;
  signIn: (userId: string, pin: string) => Promise<SignInResult>;
  onSignedIn: (staff: StaffInfo) => void;
  formatTime?: (iso: string) => string;
}

const ROLE_LABEL: Record<StaffInfo['role'], string> = { manager: 'Manager', cashier: 'Cashier' };

const defaultFormatTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function failureMessage(result: Exclude<SignInResult, { ok: true }>, formatTime: (iso: string) => string): string {
  switch (result.reason) {
    case 'wrong_pin':
      if (result.lockedUntil) return `Wrong PIN. Too many attempts: try again at ${formatTime(result.lockedUntil)}.`;
      return result.attemptsBeforeLock > 0
        ? `Wrong PIN. ${result.attemptsBeforeLock} more ${result.attemptsBeforeLock === 1 ? 'try' : 'tries'} before a short lockout.`
        : 'Wrong PIN.';
    case 'locked':
      return `Too many wrong PINs. Try again at ${formatTime(result.lockedUntil)}.`;
    case 'no_pin':
      return 'No PIN has been set for you yet. Ask a manager to set one.';
    case 'inactive':
    case 'unknown':
      return 'You can no longer sign in on this till. Ask a manager.';
  }
}

/** Pick your name, enter your PIN. Works offline against the hashes pulled from the server. */
export function SignInScreen({ staff, signIn, onSignedIn, formatTime = defaultFormatTime }: Props) {
  const [selected, setSelected] = useState<StaffInfo | null>(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = (person: StaffInfo | null) => {
    setSelected(person);
    setPin('');
    setError(null);
  };

  const submit = async () => {
    if (!selected || busy) return;
    if (pin.length < 4) {
      setError('Enter your 4 to 6 digit PIN.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await signIn(selected.id, pin);
      if (result.ok) {
        onSignedIn(result.staff);
        return;
      }
      setPin('');
      setError(failureMessage(result, formatTime));
    } catch (e) {
      setPin('');
      setError(`Sign-in failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  if (staff && staff.length === 0) {
    return (
      <View style={styles.container}>
        <Banner
          tone="warning"
          title="No staff on this till yet"
          body="Connect to the internet and tap Sync now on the main screen. A manager sets staff PINs in the back office."
        />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {!selected ? (
        <Card>
          <Heading>Who is selling?</Heading>
          {(staff ?? []).map((person) => (
            <Button key={person.id} tone="secondary" label={`${person.name} · ${ROLE_LABEL[person.role]}`} onPress={() => choose(person)} />
          ))}
        </Card>
      ) : (
        <Card>
          <Heading>{selected.name}</Heading>
          {selected.pin ? (
            <>
              <Field
                label="PIN"
                value={pin}
                onChangeText={(text) => setPin(text.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                secureTextEntry
                // A PIN is not a site password: keep browsers and password managers from filling one in.
                autoComplete="off"
                importantForAutofill="no"
                maxLength={6}
                autoFocus
                onSubmitEditing={() => void submit()}
              />
              {error ? <ErrorText>{error}</ErrorText> : null}
              <Button label="Sign in" busy={busy} onPress={() => void submit()} />
            </>
          ) : (
            <Muted>No PIN has been set for you yet. Ask a manager to set one.</Muted>
          )}
          <Button tone="secondary" label="Someone else" onPress={() => choose(null)} />
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg, maxWidth: 520, width: '100%', alignSelf: 'center' },
});
