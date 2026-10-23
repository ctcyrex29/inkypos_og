import { useMemo, useRef, useState } from 'react';
import { ScrollView } from 'react-native';
import { BackOfficeScreen, describeApiError } from '@/features/backoffice/BackOfficeScreen';
import { createAppApiClient, defaultApiBaseUrl } from '@/services/api';
import { Button, Card, ErrorText, Field, fieldValue, Heading, Muted, type FieldRef } from '@/ui/components';
import { spacing, useColors } from '@/ui/theme';

type Manager = { token: string; tenantId: string; businessName: string };

/**
 * Back office: a manager signs in for this visit only. The sign-in is held in
 * memory, never stored on the till, and is dropped on sign out.
 */
export default function Admin() {
  const colors = useColors();
  const baseUrl = defaultApiBaseUrl();
  const [manager, setManager] = useState<Manager | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailRef = useRef<FieldRef>(null);
  const passwordRef = useRef<FieldRef>(null);

  const api = useMemo(
    () => (manager ? createAppApiClient(baseUrl, { token: () => manager.token, tenantId: () => manager.tenantId }) : null),
    [manager, baseUrl],
  );

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      const typedEmail = fieldValue(emailRef, email).trim();
      const typedPassword = fieldValue(passwordRef, password);
      if (!typedEmail || !typedPassword) throw new Error('Enter your email and password.');
      const session = await createAppApiClient(baseUrl).login({ email: typedEmail, password: typedPassword, device_name: 'Back office' });
      const membership = session.memberships.find((m) => m.role === 'owner' || m.role === 'manager');
      if (!membership) throw new Error('Only an owner or manager can use the back office.');
      setManager({ token: session.tokens.access_token, tenantId: membership.tenant_id, businessName: membership.tenant_name });
      setPassword('');
    } catch (e) {
      setError(describeApiError(e));
    } finally {
      setBusy(false);
    }
  };

  if (api && manager) {
    return (
      <BackOfficeScreen
        api={api}
        businessName={manager.businessName}
        onSignOut={() => {
          void api.logout().catch(() => undefined);
          setManager(null);
        }}
      />
    );
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled" style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg, maxWidth: 520, width: '100%', alignSelf: 'center' }}>
      <Card>
        <Heading>Back office</Heading>
        <Muted>Managers edit products, prices, payment types and exchange rates here. Needs a connection.</Muted>
        <Field ref={emailRef} label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" inputMode="email" autoComplete="email" />
        <Field ref={passwordRef} label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" onSubmitEditing={() => void signIn()} />
        {error ? <ErrorText>{error}</ErrorText> : null}
        <Button label="Sign in" onPress={() => void signIn()} busy={busy} />
      </Card>
    </ScrollView>
  );
}
