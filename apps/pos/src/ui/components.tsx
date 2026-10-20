import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { fontSize, radius, spacing, useColors } from './theme';

export function Card({ children }: { children: ReactNode }) {
  const colors = useColors();
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>{children}</View>;
}

export function Heading({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>
      {children}
    </Text>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  const colors = useColors();
  return <Text style={[styles.muted, { color: colors.textMuted }]}>{children}</Text>;
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const colors = useColors();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
        {...props}
      />
    </View>
  );
}

export function Button({
  label,
  onPress,
  busy = false,
  disabled = false,
  tone = 'primary',
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  tone?: 'primary' | 'secondary';
}) {
  const colors = useColors();
  const primary = tone === 'primary';
  const inactive = busy || disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary
          ? { backgroundColor: colors.primary }
          : { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
        { opacity: pressed || inactive ? 0.6 : 1 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={primary ? colors.onPrimary : colors.text} />
      ) : (
        <Text style={[styles.buttonLabel, { color: primary ? colors.onPrimary : colors.text }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Banner({ tone, title, body }: { tone: 'success' | 'warning' | 'danger'; title: string; body?: string }) {
  const colors = useColors();
  const color = colors[tone];
  return (
    <View accessibilityRole="alert" style={[styles.banner, { borderColor: color }]}>
      <Text style={[styles.bannerTitle, { color }]}>{title}</Text>
      {body ? <Text style={[styles.muted, { color: colors.text }]}>{body}</Text> : null}
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <Text accessibilityRole="alert" style={[styles.muted, { color: colors.danger }]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  heading: { fontSize: fontSize.lg, fontWeight: '600' },
  muted: { fontSize: fontSize.md },
  field: { gap: spacing.xs },
  label: { fontSize: fontSize.sm },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: fontSize.md },
  button: { borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', minHeight: 46, justifyContent: 'center' },
  buttonLabel: { fontSize: fontSize.md, fontWeight: '600' },
  banner: { borderWidth: 1, borderLeftWidth: 4, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  bannerTitle: { fontSize: fontSize.md, fontWeight: '700' },
});
