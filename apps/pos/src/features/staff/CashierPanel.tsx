import type { StaffInfo } from '@inkypos/core';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Heading, Muted } from '@/ui/components';
import { spacing } from '@/ui/theme';

interface Props {
  cashier: StaffInfo | null;
  onSignIn: () => void;
  onSwitch: () => void;
  onSignOut: () => void;
}

/** Who is selling, with sign-out and switch. */
export function CashierPanel({ cashier, onSignIn, onSwitch, onSignOut }: Props) {
  if (!cashier) {
    return (
      <Card>
        <Heading>Nobody signed in</Heading>
        <Muted>Sign in with your PIN to sell. You are signed out after 5 minutes without activity.</Muted>
        <Button label="Sign in" onPress={onSignIn} />
      </Card>
    );
  }
  return (
    <Card>
      <Heading>{`Signed in: ${cashier.name}`}</Heading>
      <Muted>{cashier.role === 'cashier' ? 'Cashier' : cashier.role === 'manager' ? 'Manager' : 'Owner'}</Muted>
      <View style={styles.row}>
        <View style={styles.grow}>
          <Button tone="secondary" label="Switch cashier" onPress={onSwitch} />
        </View>
        <View style={styles.grow}>
          <Button tone="secondary" label="Sign out" onPress={onSignOut} />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md },
  grow: { flex: 1 },
});
